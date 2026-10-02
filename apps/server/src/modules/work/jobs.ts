import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  JOB_STATUSES,
  idSchema,
  jobAmount,
  jobInputSchema,
  jobUpdateSchema,
  labelOf,
  rawVolume,
  todayISO,
  weightedVolume,
  type CatBand,
  type Job,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError } from '../../lib/errors';
import { columns, decodeRow, insertRow, placeholders, selectList, updateRow } from '../../lib/sql';
import { parse } from '../../lib/validate';
import { logActivity } from '../../services/activity';
import { indexEntity } from '../../services/search';
import { moveToTrash, registerTrashable } from '../../services/trash';
import { OPEN_JOB_STATUSES, resolveRate } from './clients';
import { getProject } from './projects';
import { applyTemplate } from './templates';

export const JOB_COLUMNS = columns({
  id: 'id',
  projectId: 'project_id',
  title: 'title',
  poNumber: 'po_number',
  service: 'service',
  contentType: 'content_type',
  status: 'status',
  receivedAt: 'received_at',
  dueDate: 'due_date',
  dueTime: 'due_time',
  deliveredAt: 'delivered_at',
  unit: 'unit',
  volume: 'volume',
  catAnalysis: { col: 'cat_analysis', json: true },
  weightedVolume: 'weighted_volume',
  rateMicros: 'rate_micros',
  currency: 'currency',
  amountCents: 'amount_cents',
  amountManual: { col: 'amount_manual', bool: true },
  billingStatus: 'billing_status',
  invoiceId: 'invoice_id',
  notes: 'notes',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

export const JOB_SELECT = `SELECT ${selectList(JOB_COLUMNS, 'j')}, p.name AS "projectName", p.client_id AS "clientId",
  c.name AS "clientName", p.game_id AS "gameId", g.title AS "gameTitle",
  p.source_lang AS "sourceLang", p.target_lang AS "targetLang",
  (SELECT COALESCE(SUM(CAST((julianday(COALESCE(te.ended_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))) - julianday(te.started_at)) * 86400 AS INTEGER)), 0)
     FROM time_entries te WHERE te.job_id = j.id AND te.deleted_at IS NULL) AS "loggedSeconds",
  (SELECT COUNT(*) FROM tasks t JOIN task_statuses s ON s.id = t.status_id
     WHERE t.job_id = j.id AND t.deleted_at IS NULL AND s.category != 'done') AS "openTaskCount"
  FROM jobs j
  JOIN projects p ON p.id = j.project_id
  LEFT JOIN clients c ON c.id = p.client_id
  LEFT JOIN games g ON g.id = p.game_id`;

function indexJob(ctx: AppContext, j: Job) {
  indexEntity(ctx, {
    entityType: 'job',
    entityId: j.id,
    title: j.title,
    subtitle: [j.projectName, j.clientName, j.poNumber ? `PO ${j.poNumber}` : null]
      .filter(Boolean)
      .join(' · '),
    text: [j.gameTitle, labelOf(JOB_STATUSES, j.status), j.notes].filter(Boolean).join(' '),
  });
}

export function getJob(ctx: AppContext, id: string): Job {
  const row = ctx.sqlite
    .prepare(`${JOB_SELECT} WHERE j.id = ? AND j.deleted_at IS NULL AND p.deleted_at IS NULL`)
    .get(id);
  if (!row) throw new NotFoundError('El encargo');
  return decodeRow<Job>(JOB_COLUMNS, row as Record<string, unknown>);
}

export interface JobFilters {
  projectId?: string;
  clientId?: string;
  gameId?: string;
  status?: string[];
  billingStatus?: string[];
  open?: boolean;
  dueFrom?: string;
  dueTo?: string;
}

export function listJobs(ctx: AppContext, f: JobFilters = {}): Job[] {
  const where = ['j.deleted_at IS NULL', 'p.deleted_at IS NULL'];
  const params: unknown[] = [];
  const eq = (col: string, v: string | undefined) => {
    if (v) {
      where.push(`${col} = ?`);
      params.push(v);
    }
  };
  eq('j.project_id', f.projectId);
  eq('p.client_id', f.clientId);
  eq('p.game_id', f.gameId);
  if (f.status?.length) {
    where.push(`j.status IN (${placeholders(f.status)})`);
    params.push(...f.status);
  }
  if (f.billingStatus?.length) {
    where.push(`j.billing_status IN (${placeholders(f.billingStatus)})`);
    params.push(...f.billingStatus);
  }
  if (f.open) where.push(`j.status IN ${OPEN_JOB_STATUSES}`);
  if (f.dueFrom) {
    where.push('j.due_date >= ?');
    params.push(f.dueFrom);
  }
  if (f.dueTo) {
    where.push('j.due_date <= ?');
    params.push(f.dueTo);
  }
  const rows = ctx.sqlite
    .prepare(
      `${JOB_SELECT} WHERE ${where.join(' AND ')}
       ORDER BY CASE WHEN j.status IN ${OPEN_JOB_STATUSES} THEN 0 ELSE 1 END,
       COALESCE(j.due_date, '9999-12-31'), COALESCE(j.due_time, '23:59'), j.created_at DESC`,
    )
    .all(...params) as Record<string, unknown>[];
  return rows.map((r) => decodeRow<Job>(JOB_COLUMNS, r));
}

type JobFields = z.output<typeof jobUpdateSchema>;

/**
 * Recalcula volumen, volumen ponderado e importe. Si el importe se ha fijado a mano,
 * se respeta. Con tarifa plana el importe es la tarifa (volumen 1).
 */
export function deriveJobFields(
  ctx: AppContext,
  merged: JobFields & { projectId: string },
): Pick<JobFields, 'volume' | 'amountCents'> & { weightedVolume: number | null } {
  const bands = merged.catAnalysis as CatBand[] | null | undefined;
  const hasAnalysis = Boolean(bands && bands.some((b) => b.count > 0));
  const volume =
    merged.unit === 'flat'
      ? (merged.volume ?? 1)
      : hasAnalysis
        ? rawVolume(bands!)
        : (merged.volume ?? null);
  const weighted = hasAnalysis ? weightedVolume(bands!) : null;
  if (merged.amountManual)
    return { volume, weightedVolume: weighted, amountCents: merged.amountCents ?? null };
  const project = getProject(ctx, merged.projectId);
  const rate = resolveRate(ctx, {
    clientId: project.clientId,
    service: merged.service ?? 'translation',
    unit: merged.unit ?? 'word',
    sourceLang: project.sourceLang,
    targetLang: project.targetLang,
  });
  const minimum = rate && rate.rateMicros === merged.rateMicros ? rate.minimumCents : null;
  const amountCents = jobAmount({
    volume: weighted ?? volume,
    rateMicros: merged.rateMicros ?? null,
    minimumCents: minimum,
  });
  return { volume, weightedVolume: weighted, amountCents };
}

export function registerJobEntity(): void {
  registerTrashable({
    type: 'job',
    table: 'jobs',
    titleSql: 'title',
    onRestore: (ctx, id) => indexJob(ctx, getJob(ctx, id)),
    onPurge: (ctx, id) => {
      ctx.sqlite
        .prepare(
          'DELETE FROM tasks WHERE job_id = ? OR parent_id IN (SELECT id FROM tasks WHERE job_id = ?)',
        )
        .run(id, id);
    },
  });
}

export async function jobRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });
  const csv = z
    .string()
    .optional()
    .transform((v) => v?.split(',').filter(Boolean));

  app.get('/api/jobs', async (req) => {
    const q = parse(
      z.object({
        projectId: z.string().optional(),
        clientId: z.string().optional(),
        gameId: z.string().optional(),
        status: csv,
        billingStatus: csv,
        open: z.coerce.boolean().optional(),
        dueFrom: z.string().optional(),
        dueTo: z.string().optional(),
      }),
      req.query,
    );
    return listJobs(ctx, q);
  });

  app.get('/api/jobs/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return getJob(ctx, id);
  });

  app.post('/api/jobs', async (req, reply) => {
    const { templateId, ...input } = parse(jobInputSchema, req.body);
    const project = getProject(ctx, input.projectId);
    if (input.rateMicros == null) {
      const rate = resolveRate(ctx, {
        clientId: project.clientId,
        service: input.service,
        unit: input.unit,
        sourceLang: project.sourceLang,
        targetLang: project.targetLang,
      });
      if (rate) {
        input.rateMicros = rate.rateMicros;
        input.currency = rate.currency;
      }
    }
    if (!input.receivedAt) input.receivedAt = todayISO(ctx.now());
    if (input.status === 'delivered' && !input.deliveredAt) input.deliveredAt = todayISO(ctx.now());
    const derived = deriveJobFields(ctx, input);
    const tx = ctx.sqlite.transaction(() => {
      const id = insertRow(ctx, 'jobs', JOB_COLUMNS, { ...input, ...derived });
      if (templateId) {
        applyTemplate(
          ctx,
          templateId,
          { projectId: project.id, jobId: id, gameId: project.gameId },
          input.dueDate,
          'job',
        );
      }
      return id;
    });
    const id = tx();
    const job = getJob(ctx, id);
    indexJob(ctx, job);
    logActivity(ctx, {
      entityType: 'job',
      entityId: id,
      action: 'crear',
      summary: `Encargo «${job.title}» (${job.projectName}) recibido`,
    });
    reply.code(201);
    return job;
  });

  app.patch('/api/jobs/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(jobUpdateSchema, req.body);
    const before = getJob(ctx, id);
    if (patch.projectId) getProject(ctx, patch.projectId);
    if (patch.status === 'delivered' && !before.deliveredAt && patch.deliveredAt === undefined) {
      patch.deliveredAt = todayISO(ctx.now());
    }
    const merged = { ...before, ...patch };
    const derived = deriveJobFields(ctx, merged);
    updateRow(ctx, 'jobs', JOB_COLUMNS, id, { ...patch, ...derived }, { what: 'El encargo' });
    const job = getJob(ctx, id);
    indexJob(ctx, job);
    if (patch.status && patch.status !== before.status) {
      logActivity(ctx, {
        entityType: 'job',
        entityId: id,
        action: 'estado',
        summary: `Encargo «${job.title}»: ${labelOf(JOB_STATUSES, job.status)}`,
      });
    }
    return job;
  });

  app.delete('/api/jobs/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    moveToTrash(ctx, 'job', id);
    return { ok: true };
  });
}
