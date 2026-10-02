import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  PROJECT_STATUSES,
  idSchema,
  labelOf,
  pairLabel,
  projectInputSchema,
  projectUpdateSchema,
  type Project,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError } from '../../lib/errors';
import {
  assertExists,
  columns,
  decodeRow,
  insertRow,
  placeholders,
  selectList,
  updateRow,
} from '../../lib/sql';
import { parse } from '../../lib/validate';
import { logActivity } from '../../services/activity';
import { indexEntity } from '../../services/search';
import { moveToTrash, registerTrashable } from '../../services/trash';
import { OPEN_JOB_STATUSES } from './clients';
import { applyTemplate } from './templates';

export const PROJECT_COLUMNS = columns({
  id: 'id',
  name: 'name',
  clientId: 'client_id',
  gameId: 'game_id',
  contactId: 'contact_id',
  sourceLang: 'source_lang',
  targetLang: 'target_lang',
  status: 'status',
  catTool: 'cat_tool',
  startDate: 'start_date',
  endDate: 'end_date',
  localFolder: 'local_folder',
  color: 'color',
  notes: 'notes',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

const PROJECT_SELECT = `SELECT ${selectList(PROJECT_COLUMNS, 'p')}, c.name AS "clientName", g.title AS "gameTitle",
  (SELECT COUNT(*) FROM jobs j WHERE j.project_id = p.id AND j.deleted_at IS NULL) AS "jobCount",
  (SELECT COUNT(*) FROM jobs j WHERE j.project_id = p.id AND j.deleted_at IS NULL AND j.status IN ${OPEN_JOB_STATUSES}) AS "openJobCount",
  (SELECT COUNT(*) FROM tasks t JOIN task_statuses s ON s.id = t.status_id
     WHERE t.project_id = p.id AND t.deleted_at IS NULL AND s.category != 'done') AS "openTaskCount",
  (SELECT COALESCE(SUM(j.amount_cents), 0) FROM jobs j WHERE j.project_id = p.id AND j.deleted_at IS NULL
     AND j.status != 'cancelled') AS "totalCents",
  (SELECT MIN(j.due_date) FROM jobs j WHERE j.project_id = p.id AND j.deleted_at IS NULL
     AND j.status IN ${OPEN_JOB_STATUSES}) AS "nextDueDate"
  FROM projects p
  LEFT JOIN clients c ON c.id = p.client_id
  LEFT JOIN games g ON g.id = p.game_id`;

function indexProject(ctx: AppContext, p: Project) {
  indexEntity(ctx, {
    entityType: 'project',
    entityId: p.id,
    title: p.name,
    subtitle: [p.clientName, p.gameTitle, pairLabel(p.sourceLang, p.targetLang)]
      .filter(Boolean)
      .join(' · '),
    text: [labelOf(PROJECT_STATUSES, p.status), p.catTool, p.notes].filter(Boolean).join(' '),
  });
}

export function getProject(ctx: AppContext, id: string): Project {
  const row = ctx.sqlite
    .prepare(`${PROJECT_SELECT} WHERE p.id = ? AND p.deleted_at IS NULL`)
    .get(id);
  if (!row) throw new NotFoundError('El proyecto');
  return decodeRow<Project>(PROJECT_COLUMNS, row as Record<string, unknown>);
}

export function listProjects(
  ctx: AppContext,
  filters: { status?: string[]; clientId?: string; gameId?: string } = {},
): Project[] {
  const where = ['p.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (filters.status?.length) {
    where.push(`p.status IN (${placeholders(filters.status)})`);
    params.push(...filters.status);
  }
  if (filters.clientId) {
    where.push('p.client_id = ?');
    params.push(filters.clientId);
  }
  if (filters.gameId) {
    where.push('p.game_id = ?');
    params.push(filters.gameId);
  }
  const rows = ctx.sqlite
    .prepare(
      `${PROJECT_SELECT} WHERE ${where.join(' AND ')}
       ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'prospect' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,
       p.updated_at DESC`,
    )
    .all(...params) as Record<string, unknown>[];
  return rows.map((r) => decodeRow<Project>(PROJECT_COLUMNS, r));
}

export function registerProjectEntity(): void {
  registerTrashable({
    type: 'project',
    table: 'projects',
    titleSql: 'name',
    onRestore: (ctx, id) => indexProject(ctx, getProject(ctx, id)),
    // Al borrar definitivamente un proyecto se borran sus tareas (los encargos y consultas, en cascada).
    onPurge: (ctx, id) => {
      ctx.sqlite
        .prepare('DELETE FROM tasks WHERE parent_id IN (SELECT id FROM tasks WHERE project_id = ?)')
        .run(id);
      ctx.sqlite.prepare('DELETE FROM tasks WHERE project_id = ?').run(id);
    },
  });
}

export async function projectRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });

  app.get('/api/projects', async (req) => {
    const q = parse(
      z.object({
        status: z.string().optional(),
        clientId: z.string().optional(),
        gameId: z.string().optional(),
      }),
      req.query,
    );
    return listProjects(ctx, { ...q, status: q.status?.split(',').filter(Boolean) });
  });

  app.get('/api/projects/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return getProject(ctx, id);
  });

  app.post('/api/projects', async (req, reply) => {
    const { templateId, ...input } = parse(projectInputSchema, req.body);
    assertExists(ctx, 'clients', input.clientId, 'El cliente');
    assertExists(ctx, 'games', input.gameId, 'El juego');
    const tx = ctx.sqlite.transaction(() => {
      const id = insertRow(ctx, 'projects', PROJECT_COLUMNS, input);
      if (templateId) {
        applyTemplate(
          ctx,
          templateId,
          { projectId: id, gameId: input.gameId },
          input.startDate,
          'project',
        );
      }
      return id;
    });
    const id = tx();
    const project = getProject(ctx, id);
    indexProject(ctx, project);
    logActivity(ctx, {
      entityType: 'project',
      entityId: id,
      action: 'crear',
      summary: `Proyecto «${project.name}» creado`,
    });
    reply.code(201);
    return project;
  });

  app.patch('/api/projects/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(projectUpdateSchema, req.body);
    assertExists(ctx, 'clients', patch.clientId, 'El cliente');
    assertExists(ctx, 'games', patch.gameId, 'El juego');
    const before = getProject(ctx, id);
    updateRow(ctx, 'projects', PROJECT_COLUMNS, id, patch, { what: 'El proyecto' });
    const project = getProject(ctx, id);
    indexProject(ctx, project);
    if (patch.status && patch.status !== before.status) {
      logActivity(ctx, {
        entityType: 'project',
        entityId: id,
        action: 'estado',
        summary: `Proyecto «${project.name}»: ${labelOf(PROJECT_STATUSES, project.status)}`,
      });
    }
    return project;
  });

  app.delete('/api/projects/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    moveToTrash(ctx, 'project', id);
    return { ok: true };
  });
}
