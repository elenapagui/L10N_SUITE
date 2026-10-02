import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addDaysISO,
  idSchema,
  templateInputSchema,
  templateUpdateSchema,
  todayISO,
  type Template,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { columns, decodeRow, insertRow, selectList, updateRow } from '../../lib/sql';
import { parse } from '../../lib/validate';
import { moveToTrash, registerTrashable } from '../../services/trash';
import { createTask } from './tasks';

const TEMPLATE_COLUMNS = columns({
  id: 'id',
  name: 'name',
  kind: 'kind',
  tasks: { col: 'tasks', json: true },
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

export function getTemplate(ctx: AppContext, id: string): Template {
  const row = ctx.sqlite
    .prepare(
      `SELECT ${selectList(TEMPLATE_COLUMNS, 't')} FROM templates t WHERE t.id = ? AND t.deleted_at IS NULL`,
    )
    .get(id);
  if (!row) throw new NotFoundError('La plantilla');
  return decodeRow<Template>(TEMPLATE_COLUMNS, row as Record<string, unknown>);
}

/**
 * Crea las tareas de una plantilla. Las fechas se calculan a partir de la fecha de referencia
 * (entrega del encargo o inicio del proyecto); sin referencia, a partir de hoy.
 */
export function applyTemplate(
  ctx: AppContext,
  templateId: string,
  links: { projectId?: string | null; jobId?: string | null; gameId?: string | null },
  referenceDate: string | null,
  expectedKind: 'project' | 'job',
): number {
  const template = getTemplate(ctx, templateId);
  if (template.kind !== expectedKind) {
    throw new ValidationError('La plantilla no corresponde a este tipo de ficha.');
  }
  const base = referenceDate ?? todayISO(ctx.now());
  for (const t of template.tasks) {
    createTask(ctx, {
      title: t.title,
      priority: t.priority,
      areaId: 'area-work',
      projectId: links.projectId ?? null,
      jobId: links.jobId ?? null,
      gameId: links.gameId ?? null,
      dueDate: t.offsetDays == null ? null : addDaysISO(base, t.offsetDays),
      checklist: t.checklist,
    });
  }
  return template.tasks.length;
}

export function registerTemplateEntity(): void {
  registerTrashable({ type: 'template', table: 'templates', titleSql: 'name' });
}

export async function templateRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });

  app.get('/api/templates', async (req) => {
    const q = parse(z.object({ kind: z.enum(['project', 'job']).optional() }), req.query);
    const rows = ctx.sqlite
      .prepare(
        `SELECT ${selectList(TEMPLATE_COLUMNS, 't')} FROM templates t WHERE t.deleted_at IS NULL
         ${q.kind ? 'AND t.kind = ?' : ''} ORDER BY lower(t.name)`,
      )
      .all(...(q.kind ? [q.kind] : [])) as Record<string, unknown>[];
    return rows.map((r) => decodeRow<Template>(TEMPLATE_COLUMNS, r));
  });

  app.post('/api/templates', async (req, reply) => {
    const input = parse(templateInputSchema, req.body);
    const id = insertRow(ctx, 'templates', TEMPLATE_COLUMNS, input);
    reply.code(201);
    return getTemplate(ctx, id);
  });

  app.patch('/api/templates/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(templateUpdateSchema, req.body);
    updateRow(ctx, 'templates', TEMPLATE_COLUMNS, id, patch, { what: 'La plantilla' });
    return getTemplate(ctx, id);
  });

  app.delete('/api/templates/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    moveToTrash(ctx, 'template', id);
    return { ok: true };
  });
}
