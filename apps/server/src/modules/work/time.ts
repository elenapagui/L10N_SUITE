import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  idSchema,
  timeEntryInputSchema,
  timeEntryUpdateSchema,
  timerStartSchema,
  type TimeEntry,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { columns, decodeRow, insertRow, selectList, updateRow } from '../../lib/sql';
import { parse } from '../../lib/validate';
import { moveToTrash, registerTrashable } from '../../services/trash';

const TIME_COLUMNS = columns({
  id: 'id',
  taskId: 'task_id',
  jobId: 'job_id',
  projectId: 'project_id',
  startedAt: 'started_at',
  endedAt: 'ended_at',
  note: 'note',
  billable: { col: 'billable', bool: true },
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

const TIME_SELECT = `SELECT ${selectList(TIME_COLUMNS, 'e')}, t.title AS "taskTitle", j.title AS "jobTitle",
  p.name AS "projectName", c.name AS "clientName"
  FROM time_entries e
  LEFT JOIN tasks t ON t.id = e.task_id
  LEFT JOIN jobs j ON j.id = e.job_id
  LEFT JOIN projects p ON p.id = e.project_id
  LEFT JOIN clients c ON c.id = p.client_id`;

function withDuration(ctx: AppContext, row: Record<string, unknown>): TimeEntry {
  const e = decodeRow<TimeEntry>(TIME_COLUMNS, row);
  const end = e.endedAt ? Date.parse(e.endedAt) : ctx.now().getTime();
  e.durationSeconds = Math.max(0, Math.round((end - Date.parse(e.startedAt)) / 1000));
  return e;
}

export function getTimeEntry(ctx: AppContext, id: string): TimeEntry {
  const row = ctx.sqlite.prepare(`${TIME_SELECT} WHERE e.id = ? AND e.deleted_at IS NULL`).get(id);
  if (!row) throw new NotFoundError('El registro de tiempo');
  return withDuration(ctx, row as Record<string, unknown>);
}

export function runningEntry(ctx: AppContext): TimeEntry | null {
  const row = ctx.sqlite
    .prepare(
      `${TIME_SELECT} WHERE e.ended_at IS NULL AND e.deleted_at IS NULL ORDER BY e.started_at DESC LIMIT 1`,
    )
    .get();
  return row ? withDuration(ctx, row as Record<string, unknown>) : null;
}

/** Completa proyecto y encargo a partir de la tarea o del encargo. */
function resolveLinks(
  ctx: AppContext,
  input: { taskId?: string | null; jobId?: string | null; projectId?: string | null },
) {
  if (input.taskId) {
    const t = ctx.sqlite
      .prepare(
        'SELECT job_id AS jobId, project_id AS projectId FROM tasks WHERE id = ? AND deleted_at IS NULL',
      )
      .get(input.taskId) as { jobId: string | null; projectId: string | null } | undefined;
    if (!t) throw new NotFoundError('La tarea');
    input.jobId = input.jobId ?? t.jobId;
    input.projectId = input.projectId ?? t.projectId;
  }
  if (input.jobId) {
    const j = ctx.sqlite
      .prepare('SELECT project_id AS projectId FROM jobs WHERE id = ? AND deleted_at IS NULL')
      .get(input.jobId) as { projectId: string } | undefined;
    if (!j) throw new NotFoundError('El encargo');
    input.projectId = j.projectId;
  }
}

export function stopTimer(ctx: AppContext): TimeEntry | null {
  const running = runningEntry(ctx);
  if (!running) return null;
  ctx.sqlite
    .prepare('UPDATE time_entries SET ended_at = ?, updated_at = ? WHERE id = ?')
    .run(ctx.nowISO(), ctx.nowISO(), running.id);
  return getTimeEntry(ctx, running.id);
}

export function listTimeEntries(
  ctx: AppContext,
  f: {
    from?: string;
    to?: string;
    projectId?: string;
    jobId?: string;
    taskId?: string;
    clientId?: string;
  } = {},
): TimeEntry[] {
  const where = ['e.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (f.from) {
    where.push('e.started_at >= ?');
    params.push(f.from);
  }
  if (f.to) {
    where.push('e.started_at < ?');
    params.push(f.to);
  }
  for (const [col, v] of [
    ['e.project_id', f.projectId],
    ['e.job_id', f.jobId],
    ['e.task_id', f.taskId],
    ['p.client_id', f.clientId],
  ] as const) {
    if (v) {
      where.push(`${col} = ?`);
      params.push(v);
    }
  }
  const rows = ctx.sqlite
    .prepare(`${TIME_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.started_at DESC LIMIT 5000`)
    .all(...params) as Record<string, unknown>[];
  return rows.map((r) => withDuration(ctx, r));
}

export function registerTimeEntity(): void {
  registerTrashable({
    type: 'time_entry',
    table: 'time_entries',
    titleSql: "'Tiempo del ' || substr(started_at, 1, 10)",
  });
}

export async function timeRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });

  app.get('/api/time-entries', async (req) => {
    const q = parse(
      z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        projectId: z.string().optional(),
        jobId: z.string().optional(),
        taskId: z.string().optional(),
        clientId: z.string().optional(),
      }),
      req.query,
    );
    return listTimeEntries(ctx, q);
  });

  app.post('/api/time-entries', async (req, reply) => {
    const input = parse(timeEntryInputSchema, req.body);
    if (!input.endedAt) throw new ValidationError('Indica la hora de fin (o usa el cronómetro).');
    if (Date.parse(input.endedAt) <= Date.parse(input.startedAt)) {
      throw new ValidationError('La hora de fin debe ser posterior a la de inicio.');
    }
    resolveLinks(ctx, input);
    const id = insertRow(ctx, 'time_entries', TIME_COLUMNS, input);
    reply.code(201);
    return getTimeEntry(ctx, id);
  });

  app.patch('/api/time-entries/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(timeEntryUpdateSchema, req.body);
    const current = getTimeEntry(ctx, id);
    const start = patch.startedAt ?? current.startedAt;
    const end = patch.endedAt === undefined ? current.endedAt : patch.endedAt;
    if (end && Date.parse(end) <= Date.parse(start)) {
      throw new ValidationError('La hora de fin debe ser posterior a la de inicio.');
    }
    if (patch.taskId !== undefined || patch.jobId !== undefined) resolveLinks(ctx, patch);
    updateRow(ctx, 'time_entries', TIME_COLUMNS, id, patch, { what: 'El registro de tiempo' });
    return getTimeEntry(ctx, id);
  });

  app.delete('/api/time-entries/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    moveToTrash(ctx, 'time_entry', id);
    return { ok: true };
  });

  // Cronómetro: solo puede haber uno en marcha.
  app.get('/api/timer', async () => ({ running: runningEntry(ctx) }));

  app.post('/api/timer/start', async (req) => {
    const input = parse(timerStartSchema, req.body ?? {});
    resolveLinks(ctx, input);
    const tx = ctx.sqlite.transaction(() => {
      stopTimer(ctx);
      return insertRow(ctx, 'time_entries', TIME_COLUMNS, {
        ...input,
        startedAt: ctx.nowISO(),
        endedAt: null,
        billable: true,
      });
    });
    const id = tx();
    return { running: getTimeEntry(ctx, id) };
  });

  app.post('/api/timer/stop', async () => ({ stopped: stopTimer(ctx) }));
}
