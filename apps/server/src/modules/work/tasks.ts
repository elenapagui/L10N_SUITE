import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addDaysISO,
  areaInputSchema,
  checklistItemInputSchema,
  commentInputSchema,
  idSchema,
  nextOccurrence,
  patchSchema,
  taskInputSchema,
  taskListInputSchema,
  taskStatusInputSchema,
  taskUpdateSchema,
  todayISO,
  type Area,
  type ChecklistItem,
  type Comment,
  type RecurrenceRule,
  type Tag,
  type Task,
  type TaskList,
  type TaskStatus,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { newId } from '../../lib/ids';
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

export const TASK_COLUMNS = columns({
  id: 'id',
  title: 'title',
  description: 'description',
  statusId: 'status_id',
  priority: 'priority',
  areaId: 'area_id',
  listId: 'list_id',
  projectId: 'project_id',
  jobId: 'job_id',
  gameId: 'game_id',
  parentId: 'parent_id',
  relatedType: 'related_type',
  relatedId: 'related_id',
  startDate: 'start_date',
  dueDate: 'due_date',
  dueTime: 'due_time',
  estimateMinutes: 'estimate_minutes',
  recurrence: { col: 'recurrence', json: true },
  completedAt: 'completed_at',
  sortOrder: 'sort_order',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

const TASK_SELECT = `SELECT ${selectList(TASK_COLUMNS, 't')},
  s.name AS "statusName", s.color AS "statusColor", s.category AS "statusCategory",
  a.name AS "areaName", a.color AS "areaColor", l.name AS "listName",
  p.name AS "projectName", j.title AS "jobTitle", g.title AS "gameTitle", pt.title AS "parentTitle",
  (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = t.id AND c.deleted_at IS NULL) AS "subtaskCount",
  (SELECT COUNT(*) FROM tasks c JOIN task_statuses cs ON cs.id = c.status_id
     WHERE c.parent_id = t.id AND c.deleted_at IS NULL AND cs.category = 'done') AS "subtaskDoneCount",
  (SELECT COUNT(*) FROM checklist_items ci WHERE ci.entity_type = 'task' AND ci.entity_id = t.id) AS "checklistCount",
  (SELECT COUNT(*) FROM checklist_items ci WHERE ci.entity_type = 'task' AND ci.entity_id = t.id AND ci.done = 1) AS "checklistDoneCount",
  (SELECT COALESCE(SUM(CAST((julianday(COALESCE(te.ended_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))) - julianday(te.started_at)) * 86400 AS INTEGER)), 0)
     FROM time_entries te WHERE te.task_id = t.id AND te.deleted_at IS NULL) AS "loggedSeconds"
  FROM tasks t
  JOIN task_statuses s ON s.id = t.status_id
  LEFT JOIN areas a ON a.id = t.area_id
  LEFT JOIN task_lists l ON l.id = t.list_id
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN jobs j ON j.id = t.job_id
  LEFT JOIN games g ON g.id = t.game_id
  LEFT JOIN tasks pt ON pt.id = t.parent_id`;

/** Tareas visibles: no borradas, y sin padre, proyecto ni encargo en la papelera. */
const VISIBLE = `t.deleted_at IS NULL AND (pt.id IS NULL OR pt.deleted_at IS NULL)
  AND (p.id IS NULL OR p.deleted_at IS NULL) AND (j.id IS NULL OR j.deleted_at IS NULL)`;

function attachTags(ctx: AppContext, tasks: Task[]): Task[] {
  if (tasks.length === 0) return tasks;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks) t.tags = [];
  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = ctx.sqlite
      .prepare(
        `SELECT x.entity_id AS taskId, tg.id, tg.name, tg.color, tg.created_at AS createdAt, tg.updated_at AS updatedAt
         FROM taggings x JOIN tags tg ON tg.id = x.tag_id
         WHERE x.entity_type = 'task' AND tg.deleted_at IS NULL AND x.entity_id IN (${placeholders(chunk)})
         ORDER BY tg.name`,
      )
      .all(...chunk) as (Tag & { taskId: string })[];
    for (const { taskId, ...tag } of rows) byId.get(taskId)?.tags.push(tag);
  }
  return tasks;
}

function decodeTask(row: Record<string, unknown>): Task {
  return decodeRow<Task>(TASK_COLUMNS, row);
}

export function getTask(ctx: AppContext, id: string): Task {
  const row = ctx.sqlite.prepare(`${TASK_SELECT} WHERE t.id = ? AND ${VISIBLE}`).get(id);
  if (!row) throw new NotFoundError('La tarea');
  return attachTags(ctx, [decodeTask(row as Record<string, unknown>)])[0]!;
}

export interface TaskFilters {
  areaId?: string;
  listId?: string;
  projectId?: string;
  jobId?: string;
  gameId?: string;
  parentId?: string;
  topLevel?: boolean;
  statusCategory?: string[];
  includeDone?: boolean;
  due?: 'overdue' | 'today' | 'week' | 'none' | 'upcoming' | 'today_or_overdue';
  dueFrom?: string;
  dueTo?: string;
  tagId?: string;
  relatedType?: string;
  relatedId?: string;
  limit?: number;
}

export function listTasks(ctx: AppContext, f: TaskFilters = {}): Task[] {
  const where = [VISIBLE];
  const params: unknown[] = [];
  const eq = (col: string, v: string | undefined) => {
    if (v) {
      where.push(`${col} = ?`);
      params.push(v);
    }
  };
  eq('t.area_id', f.areaId);
  eq('t.list_id', f.listId);
  eq('t.project_id', f.projectId);
  eq('t.job_id', f.jobId);
  eq('t.game_id', f.gameId);
  eq('t.parent_id', f.parentId);
  eq('t.related_type', f.relatedType);
  eq('t.related_id', f.relatedId);
  if (f.topLevel) where.push('t.parent_id IS NULL');
  if (f.statusCategory?.length) {
    where.push(`s.category IN (${placeholders(f.statusCategory)})`);
    params.push(...f.statusCategory);
  } else if (f.includeDone === false) {
    where.push("s.category != 'done'");
  }
  const today = todayISO(ctx.now());
  switch (f.due) {
    case 'overdue':
      where.push("t.due_date < ? AND s.category != 'done'");
      params.push(today);
      break;
    case 'today':
      where.push('t.due_date = ?');
      params.push(today);
      break;
    case 'today_or_overdue':
      where.push("t.due_date <= ? AND s.category != 'done'");
      params.push(today);
      break;
    case 'week':
      where.push('t.due_date >= ? AND t.due_date <= ?');
      params.push(today, addDaysISO(today, 7));
      break;
    case 'upcoming':
      where.push('t.due_date > ?');
      params.push(today);
      break;
    case 'none':
      where.push('t.due_date IS NULL');
      break;
  }
  if (f.dueFrom) {
    where.push('t.due_date >= ?');
    params.push(f.dueFrom);
  }
  if (f.dueTo) {
    where.push('t.due_date <= ?');
    params.push(f.dueTo);
  }
  if (f.tagId) {
    where.push(
      "EXISTS (SELECT 1 FROM taggings x WHERE x.entity_type = 'task' AND x.entity_id = t.id AND x.tag_id = ?)",
    );
    params.push(f.tagId);
  }
  const rows = ctx.sqlite
    .prepare(
      `${TASK_SELECT} WHERE ${where.join(' AND ')}
       ORDER BY CASE s.category WHEN 'done' THEN 1 ELSE 0 END, t.sort_order, COALESCE(t.due_date, '9999-12-31'),
       t.priority, t.created_at
       LIMIT ?`,
    )
    .all(...params, f.limit ?? 5000) as Record<string, unknown>[];
  return attachTags(ctx, rows.map(decodeTask));
}

// ── Estados, áreas y listas ─────────────────────────────────────────────────
export function listStatuses(ctx: AppContext): TaskStatus[] {
  return ctx.sqlite
    .prepare(
      `SELECT id, name, color, category, sort_order AS sortOrder FROM task_statuses
       ORDER BY CASE category WHEN 'todo' THEN 0 WHEN 'doing' THEN 1 ELSE 2 END, sort_order`,
    )
    .all() as TaskStatus[];
}

function getStatus(ctx: AppContext, id: string): TaskStatus {
  const s = listStatuses(ctx).find((x) => x.id === id);
  if (!s) throw new NotFoundError('El estado');
  return s;
}

export function defaultStatusId(ctx: AppContext, category: 'todo' | 'done' = 'todo'): string {
  const s = listStatuses(ctx).find((x) => x.category === category);
  if (!s) throw new ValidationError('No hay ningún estado de tarea configurado.');
  return s.id;
}

export function listAreas(ctx: AppContext): Area[] {
  return ctx.sqlite
    .prepare(
      'SELECT id, name, color, sort_order AS sortOrder FROM areas WHERE deleted_at IS NULL ORDER BY sort_order',
    )
    .all() as Area[];
}

export function listTaskLists(ctx: AppContext): TaskList[] {
  return ctx.sqlite
    .prepare(
      `SELECT id, area_id AS areaId, name, color, sort_order AS sortOrder FROM task_lists
       WHERE deleted_at IS NULL ORDER BY sort_order, lower(name)`,
    )
    .all() as TaskList[];
}

// ── Crear y actualizar ─────────────────────────────────────────────────────
type TaskInput = z.input<typeof taskInputSchema> & { checklist?: string[] };

function indexTask(ctx: AppContext, task: Task) {
  indexEntity(ctx, {
    entityType: 'task',
    entityId: task.id,
    title: task.title,
    subtitle: [task.projectName, task.jobTitle, task.areaName].filter(Boolean).join(' · '),
    text: task.description,
  });
}

/** Si la tarea va ligada a un encargo, hereda su proyecto y juego; si va ligada a un proyecto, su juego. */
function inheritLinks(
  ctx: AppContext,
  data: {
    projectId?: string | null;
    jobId?: string | null;
    gameId?: string | null;
    areaId?: string | null;
  },
) {
  if (data.jobId) {
    const job = ctx.sqlite
      .prepare(
        'SELECT j.project_id AS projectId, p.game_id AS gameId FROM jobs j JOIN projects p ON p.id = j.project_id WHERE j.id = ? AND j.deleted_at IS NULL',
      )
      .get(data.jobId) as { projectId: string; gameId: string | null } | undefined;
    if (!job) throw new NotFoundError('El encargo');
    data.projectId = job.projectId;
    if (data.gameId == null) data.gameId = job.gameId;
  }
  if (data.projectId && data.gameId == null) {
    const p = ctx.sqlite
      .prepare('SELECT game_id AS gameId FROM projects WHERE id = ?')
      .get(data.projectId) as { gameId: string | null } | undefined;
    if (!p) throw new NotFoundError('El proyecto');
    data.gameId = p.gameId;
  }
  if (!data.areaId && (data.projectId || data.jobId)) data.areaId = 'area-work';
}

export function createTask(ctx: AppContext, raw: TaskInput): Task {
  const { checklist, ...rest } = raw;
  const input = parse(taskInputSchema, rest);
  inheritLinks(ctx, input);
  assertExists(ctx, 'tasks', input.parentId, 'La tarea principal');
  assertExists(ctx, 'games', input.gameId, 'El juego');
  const statusId = input.statusId ?? defaultStatusId(ctx);
  const status = getStatus(ctx, statusId);
  const maxOrder = (
    ctx.sqlite.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM tasks').get() as { m: number }
  ).m;
  const id = insertRow(ctx, 'tasks', TASK_COLUMNS, {
    ...input,
    statusId,
    sortOrder: input.sortOrder ?? maxOrder + 1,
    completedAt: status.category === 'done' ? ctx.nowISO() : null,
  });
  if (checklist?.length) {
    const insert = ctx.sqlite.prepare(
      'INSERT INTO checklist_items (id, entity_type, entity_id, text, done, sort_order, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
    );
    checklist.forEach((text, i) => insert.run(newId(), 'task', id, text, i + 1, ctx.nowISO()));
  }
  const task = getTask(ctx, id);
  indexTask(ctx, task);
  return task;
}

/** Al completar una tarea que se repite, se crea la siguiente con la fecha calculada. */
function spawnNextOccurrence(ctx: AppContext, task: Task): Task | null {
  const rule = task.recurrence as RecurrenceRule | null;
  if (!rule) return null;
  const base = task.dueDate ?? todayISO(ctx.now());
  const nextDue = nextOccurrence(base, rule);
  const nextStart =
    task.startDate && task.dueDate
      ? addDaysISO(nextDue, -Math.max(0, daysBetween(task.startDate, task.dueDate)))
      : null;
  const checklist = (
    ctx.sqlite
      .prepare(
        "SELECT text FROM checklist_items WHERE entity_type = 'task' AND entity_id = ? ORDER BY sort_order",
      )
      .all(task.id) as { text: string }[]
  ).map((r) => r.text);
  const next = createTask(ctx, {
    title: task.title,
    description: task.description,
    priority: task.priority,
    areaId: task.areaId,
    listId: task.listId,
    projectId: task.projectId,
    jobId: task.jobId,
    gameId: task.gameId,
    relatedType: task.relatedType,
    relatedId: task.relatedId,
    startDate: nextStart,
    dueDate: nextDue,
    dueTime: task.dueTime,
    estimateMinutes: task.estimateMinutes,
    recurrence: rule,
    checklist,
  });
  const tagIds = task.tags.map((t) => t.id);
  const insertTag = ctx.sqlite.prepare(
    'INSERT OR IGNORE INTO taggings (tag_id, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?)',
  );
  for (const tagId of tagIds) insertTag.run(tagId, 'task', next.id, ctx.nowISO());
  // La tarea completada deja de repetirse: la serie continúa en la nueva.
  ctx.sqlite.prepare('UPDATE tasks SET recurrence = NULL WHERE id = ?').run(task.id);
  return getTask(ctx, next.id);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function updateTask(
  ctx: AppContext,
  id: string,
  raw: unknown,
): { task: Task; next: Task | null } {
  const patch = parse(taskUpdateSchema, raw);
  const before = getTask(ctx, id);
  if (patch.parentId === id)
    throw new ValidationError('Una tarea no puede ser subtarea de sí misma.');
  if (patch.jobId !== undefined || patch.projectId !== undefined) {
    const links = {
      projectId: patch.projectId ?? before.projectId,
      jobId: patch.jobId ?? before.jobId,
      gameId: patch.gameId ?? null,
      areaId: patch.areaId ?? before.areaId,
    };
    if (patch.jobId === null) links.jobId = null;
    if (patch.projectId === null) links.projectId = null;
    inheritLinks(ctx, links);
    patch.projectId = links.projectId;
    patch.jobId = links.jobId;
    if (links.gameId !== null) patch.gameId = links.gameId;
    patch.areaId = links.areaId;
  }
  let completedAt: string | null | undefined;
  let becameDone = false;
  if (patch.statusId && patch.statusId !== before.statusId) {
    const next = getStatus(ctx, patch.statusId);
    if (next.category === 'done' && before.statusCategory !== 'done') {
      completedAt = ctx.nowISO();
      becameDone = true;
    } else if (next.category !== 'done') {
      completedAt = null;
    }
  }
  let spawned: Task | null = null;
  const tx = ctx.sqlite.transaction(() => {
    updateRow(
      ctx,
      'tasks',
      TASK_COLUMNS,
      id,
      { ...patch, ...(completedAt !== undefined ? { completedAt } : {}) },
      { what: 'La tarea' },
    );
    if (becameDone) spawned = spawnNextOccurrence(ctx, getTask(ctx, id));
  });
  tx();
  const task = getTask(ctx, id);
  indexTask(ctx, task);
  if (becameDone) {
    logActivity(ctx, {
      entityType: 'task',
      entityId: id,
      action: 'estado',
      summary: `Tarea completada: «${task.title}»`,
    });
  }
  return { task, next: spawned };
}

export function registerTaskEntities(): void {
  registerTrashable({
    type: 'task',
    table: 'tasks',
    titleSql: 'title',
    onRestore: (ctx, id) => indexTask(ctx, getTask(ctx, id)),
    onPurge: (ctx, id) => {
      ctx.sqlite.prepare('DELETE FROM tasks WHERE parent_id = ?').run(id);
      ctx.sqlite.prepare('UPDATE time_entries SET task_id = NULL WHERE task_id = ?').run(id);
    },
  });
  registerTrashable({ type: 'task_list', table: 'task_lists', titleSql: 'name' });
}

export async function taskRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });
  const csv = z
    .string()
    .optional()
    .transform((v) => v?.split(',').filter(Boolean));
  const bool = z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true' || v === '1'));

  app.get('/api/tasks', async (req) => {
    const q = parse(
      z.object({
        areaId: z.string().optional(),
        listId: z.string().optional(),
        projectId: z.string().optional(),
        jobId: z.string().optional(),
        gameId: z.string().optional(),
        parentId: z.string().optional(),
        topLevel: bool,
        statusCategory: csv,
        includeDone: bool,
        due: z
          .enum(['overdue', 'today', 'week', 'none', 'upcoming', 'today_or_overdue'])
          .optional(),
        dueFrom: z.string().optional(),
        dueTo: z.string().optional(),
        tagId: z.string().optional(),
        relatedType: z.string().optional(),
        relatedId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(10000).optional(),
      }),
      req.query,
    );
    return listTasks(ctx, q);
  });

  app.get('/api/tasks/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return getTask(ctx, id);
  });

  app.post('/api/tasks', async (req, reply) => {
    const body = (req.body ?? {}) as TaskInput;
    const checklist = Array.isArray(body.checklist)
      ? body.checklist.filter((x) => typeof x === 'string')
      : undefined;
    const task = createTask(ctx, { ...body, checklist });
    reply.code(201);
    return task;
  });

  app.patch('/api/tasks/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return updateTask(ctx, id, req.body);
  });

  app.delete('/api/tasks/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    moveToTrash(ctx, 'task', id);
    return { ok: true };
  });

  // Estados
  app.get('/api/task-statuses', async () => listStatuses(ctx));

  app.post('/api/task-statuses', async (req, reply) => {
    const input = parse(taskStatusInputSchema, req.body);
    const max = (
      ctx.sqlite.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM task_statuses').get() as {
        m: number;
      }
    ).m;
    const id = newId();
    ctx.sqlite
      .prepare(
        'INSERT INTO task_statuses (id, name, color, category, sort_order) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, input.name, input.color, input.category, max + 1);
    reply.code(201);
    return getStatus(ctx, id);
  });

  app.patch('/api/task-statuses/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(
      patchSchema(taskStatusInputSchema).extend({ sortOrder: z.number().optional() }),
      req.body,
    );
    const current = getStatus(ctx, id);
    if (patch.category && patch.category !== current.category) {
      const same = listStatuses(ctx).filter((s) => s.category === current.category);
      if (same.length === 1)
        throw new ConflictError('Tiene que quedar al menos un estado de cada tipo.');
    }
    ctx.sqlite
      .prepare(
        'UPDATE task_statuses SET name = ?, color = ?, category = ?, sort_order = ? WHERE id = ?',
      )
      .run(
        patch.name ?? current.name,
        patch.color ?? current.color,
        patch.category ?? current.category,
        patch.sortOrder ?? current.sortOrder,
        id,
      );
    return getStatus(ctx, id);
  });

  /** Borra un estado moviendo antes sus tareas a otro. */
  app.delete('/api/task-statuses/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const { moveTo } = parse(z.object({ moveTo: idSchema }), req.query);
    const current = getStatus(ctx, id);
    getStatus(ctx, moveTo);
    if (moveTo === id) throw new ValidationError('Elige otro estado para las tareas.');
    if (listStatuses(ctx).filter((s) => s.category === current.category).length === 1) {
      throw new ConflictError('Tiene que quedar al menos un estado de cada tipo.');
    }
    const tx = ctx.sqlite.transaction(() => {
      ctx.sqlite.prepare('UPDATE tasks SET status_id = ? WHERE status_id = ?').run(moveTo, id);
      ctx.sqlite.prepare('DELETE FROM task_statuses WHERE id = ?').run(id);
    });
    tx();
    return { ok: true };
  });

  // Áreas y listas
  app.get('/api/areas', async () => listAreas(ctx));

  app.post('/api/areas', async (req, reply) => {
    const input = parse(areaInputSchema, req.body);
    const max = (
      ctx.sqlite.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM areas').get() as {
        m: number;
      }
    ).m;
    const id = newId();
    ctx.sqlite
      .prepare('INSERT INTO areas (id, name, color, sort_order) VALUES (?, ?, ?, ?)')
      .run(id, input.name, input.color, max + 1);
    reply.code(201);
    return listAreas(ctx).find((a) => a.id === id);
  });

  app.patch('/api/areas/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(patchSchema(areaInputSchema), req.body);
    const current = listAreas(ctx).find((a) => a.id === id);
    if (!current) throw new NotFoundError('El área');
    ctx.sqlite
      .prepare('UPDATE areas SET name = ?, color = ? WHERE id = ?')
      .run(patch.name ?? current.name, patch.color ?? current.color, id);
    return listAreas(ctx).find((a) => a.id === id);
  });

  app.get('/api/task-lists', async () => listTaskLists(ctx));

  app.post('/api/task-lists', async (req, reply) => {
    const input = parse(taskListInputSchema, req.body);
    if (!listAreas(ctx).some((a) => a.id === input.areaId)) throw new NotFoundError('El área');
    const max = (
      ctx.sqlite.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM task_lists').get() as {
        m: number;
      }
    ).m;
    const id = insertRow(
      ctx,
      'task_lists',
      columns({ areaId: 'area_id', name: 'name', color: 'color', sortOrder: 'sort_order' }),
      {
        ...input,
        sortOrder: max + 1,
      },
    );
    reply.code(201);
    return listTaskLists(ctx).find((l) => l.id === id);
  });

  app.patch('/api/task-lists/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(patchSchema(taskListInputSchema), req.body);
    updateRow(
      ctx,
      'task_lists',
      columns({ areaId: 'area_id', name: 'name', color: 'color' }),
      id,
      patch,
      { what: 'La lista' },
    );
    return listTaskLists(ctx).find((l) => l.id === id);
  });

  app.delete('/api/task-lists/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    moveToTrash(ctx, 'task_list', id);
    return { ok: true };
  });

  // Checklists (de tareas, encargos…)
  app.get('/api/checklist', async (req) => {
    const q = parse(z.object({ entityType: z.string(), entityId: z.string() }), req.query);
    return listChecklist(ctx, q.entityType, q.entityId);
  });

  app.post('/api/checklist', async (req, reply) => {
    const input = parse(checklistItemInputSchema, req.body);
    const max = (
      ctx.sqlite
        .prepare(
          'SELECT COALESCE(MAX(sort_order), 0) AS m FROM checklist_items WHERE entity_type = ? AND entity_id = ?',
        )
        .get(input.entityType, input.entityId) as { m: number }
    ).m;
    const id = newId();
    ctx.sqlite
      .prepare(
        'INSERT INTO checklist_items (id, entity_type, entity_id, text, done, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        input.entityType,
        input.entityId,
        input.text,
        input.done ? 1 : 0,
        max + 1,
        ctx.nowISO(),
      );
    reply.code(201);
    return listChecklist(ctx, input.entityType, input.entityId).find((i) => i.id === id);
  });

  app.patch('/api/checklist/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(
      z.object({
        text: z.string().trim().min(1).max(1000).optional(),
        done: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }),
      req.body,
    );
    const row = ctx.sqlite
      .prepare('SELECT entity_type AS t, entity_id AS e FROM checklist_items WHERE id = ?')
      .get(id) as { t: string; e: string } | undefined;
    if (!row) throw new NotFoundError('El elemento');
    if (patch.text !== undefined)
      ctx.sqlite.prepare('UPDATE checklist_items SET text = ? WHERE id = ?').run(patch.text, id);
    if (patch.done !== undefined)
      ctx.sqlite
        .prepare('UPDATE checklist_items SET done = ? WHERE id = ?')
        .run(patch.done ? 1 : 0, id);
    if (patch.sortOrder !== undefined)
      ctx.sqlite
        .prepare('UPDATE checklist_items SET sort_order = ? WHERE id = ?')
        .run(patch.sortOrder, id);
    return listChecklist(ctx, row.t, row.e).find((i) => i.id === id);
  });

  app.delete('/api/checklist/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    ctx.sqlite.prepare('DELETE FROM checklist_items WHERE id = ?').run(id);
    return { ok: true };
  });

  // Comentarios
  app.get('/api/comments', async (req) => {
    const q = parse(z.object({ entityType: z.string(), entityId: z.string() }), req.query);
    return ctx.sqlite
      .prepare(
        `SELECT id, entity_type AS entityType, entity_id AS entityId, body, created_at AS createdAt, updated_at AS updatedAt
         FROM comments WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL ORDER BY created_at`,
      )
      .all(q.entityType, q.entityId) as Comment[];
  });

  app.post('/api/comments', async (req, reply) => {
    const input = parse(commentInputSchema, req.body);
    const id = newId();
    const now = ctx.nowISO();
    ctx.sqlite
      .prepare(
        'INSERT INTO comments (id, entity_type, entity_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, input.entityType, input.entityId, input.body, now, now);
    reply.code(201);
    return {
      id,
      entityType: input.entityType,
      entityId: input.entityId,
      body: input.body,
      createdAt: now,
      updatedAt: now,
    };
  });

  app.delete('/api/comments/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    ctx.sqlite.prepare('UPDATE comments SET deleted_at = ? WHERE id = ?').run(ctx.nowISO(), id);
    return { ok: true };
  });
}

export function listChecklist(
  ctx: AppContext,
  entityType: string,
  entityId: string,
): ChecklistItem[] {
  return (
    ctx.sqlite
      .prepare(
        `SELECT id, entity_type AS entityType, entity_id AS entityId, text, done, sort_order AS sortOrder
         FROM checklist_items WHERE entity_type = ? AND entity_id = ? ORDER BY sort_order`,
      )
      .all(entityType, entityId) as (Omit<ChecklistItem, 'done'> & { done: number })[]
  ).map((r) => ({ ...r, done: r.done === 1 }));
}
