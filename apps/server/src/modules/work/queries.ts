import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import {
  QUERY_STATUSES,
  clientQueryInputSchema,
  clientQueryUpdateSchema,
  formatDateES,
  idSchema,
  labelOf,
  todayISO,
  type ClientQuery,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError } from '../../lib/errors';
import { columns, decodeRow, insertRow, placeholders, selectList, updateRow } from '../../lib/sql';
import { parse } from '../../lib/validate';
import { indexEntity } from '../../services/search';
import { moveToTrash, registerTrashable } from '../../services/trash';
import { contentDisposition } from '../attachments';
import { getProject } from './projects';

const QUERY_COLUMNS = columns({
  id: 'id',
  projectId: 'project_id',
  jobId: 'job_id',
  stringId: 'string_id',
  sourceText: 'source_text',
  context: 'context',
  question: 'question',
  answer: 'answer',
  status: 'status',
  askedAt: 'asked_at',
  answeredAt: 'answered_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

const QUERY_SELECT = `SELECT ${selectList(QUERY_COLUMNS, 'q')}, p.name AS "projectName", j.title AS "jobTitle"
  FROM client_queries q JOIN projects p ON p.id = q.project_id LEFT JOIN jobs j ON j.id = q.job_id`;

function indexQuery(ctx: AppContext, q: ClientQuery) {
  indexEntity(ctx, {
    entityType: 'client_query',
    entityId: q.id,
    title: q.question.slice(0, 120),
    subtitle: [q.projectName, q.stringId].filter(Boolean).join(' · '),
    text: [q.sourceText, q.context, q.answer].filter(Boolean).join(' '),
  });
}

export function getQuery(ctx: AppContext, id: string): ClientQuery {
  const row = ctx.sqlite.prepare(`${QUERY_SELECT} WHERE q.id = ? AND q.deleted_at IS NULL`).get(id);
  if (!row) throw new NotFoundError('La consulta');
  return decodeRow<ClientQuery>(QUERY_COLUMNS, row as Record<string, unknown>);
}

export function listQueries(
  ctx: AppContext,
  f: { projectId?: string; jobId?: string; status?: string[] } = {},
): ClientQuery[] {
  const where = ['q.deleted_at IS NULL', 'p.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (f.projectId) {
    where.push('q.project_id = ?');
    params.push(f.projectId);
  }
  if (f.jobId) {
    where.push('q.job_id = ?');
    params.push(f.jobId);
  }
  if (f.status?.length) {
    where.push(`q.status IN (${placeholders(f.status)})`);
    params.push(...f.status);
  }
  return (
    ctx.sqlite
      .prepare(`${QUERY_SELECT} WHERE ${where.join(' AND ')} ORDER BY q.created_at DESC`)
      .all(...params) as Record<string, unknown>[]
  ).map((r) => decodeRow<ClientQuery>(QUERY_COLUMNS, r));
}

/** Hoja de consultas en Excel, con el formato habitual para enviarla al cliente. */
export async function queriesWorkbook(queries: ClientQuery[], title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'L10N Suite';
  const ws = wb.addWorksheet('Consultas', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'N.º', key: 'n', width: 6 },
    { header: 'Encargo', key: 'job', width: 22 },
    { header: 'ID de cadena', key: 'stringId', width: 22 },
    { header: 'Texto origen', key: 'source', width: 45 },
    { header: 'Contexto', key: 'context', width: 30 },
    { header: 'Pregunta', key: 'question', width: 50 },
    { header: 'Respuesta', key: 'answer', width: 50 },
    { header: 'Estado', key: 'status', width: 14 },
    { header: 'Fecha', key: 'date', width: 12 },
  ];
  queries.forEach((q, i) =>
    ws.addRow({
      n: i + 1,
      job: q.jobTitle ?? '',
      stringId: q.stringId ?? '',
      source: q.sourceText ?? '',
      context: q.context ?? '',
      question: q.question,
      answer: q.answer ?? '',
      status: labelOf(QUERY_STATUSES, q.status),
      date: formatDateES(q.askedAt ?? q.createdAt),
    }),
  );
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  ws.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true };
  });
  ws.autoFilter = { from: 'A1', to: 'I1' };
  wb.title = title;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function registerQueryEntity(): void {
  registerTrashable({
    type: 'client_query',
    table: 'client_queries',
    titleSql: 'substr(question, 1, 80)',
    onRestore: (ctx, id) => indexQuery(ctx, getQuery(ctx, id)),
  });
}

export async function queryRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });
  const filters = z.object({
    projectId: z.string().optional(),
    jobId: z.string().optional(),
    status: z
      .string()
      .optional()
      .transform((v) => v?.split(',').filter(Boolean)),
  });

  app.get('/api/client-queries', async (req) => listQueries(ctx, parse(filters, req.query)));

  app.get('/api/client-queries/export', async (req, reply) => {
    const f = parse(filters, req.query);
    const queries = listQueries(ctx, f).reverse();
    const project = f.projectId ? getProject(ctx, f.projectId) : null;
    const name =
      `Consultas${project ? ` - ${project.name}` : ''} - ${todayISO(ctx.now())}.xlsx`.replace(
        /[\\/:*?"<>|]/g,
        '_',
      );
    const buffer = await queriesWorkbook(queries, name);
    reply
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', contentDisposition('attachment', name));
    return reply.send(buffer);
  });

  app.post('/api/client-queries', async (req, reply) => {
    const input = parse(clientQueryInputSchema, req.body);
    getProject(ctx, input.projectId);
    if (input.status === 'sent' && !input.askedAt) input.askedAt = todayISO(ctx.now());
    if (input.answer && !input.answeredAt) input.answeredAt = todayISO(ctx.now());
    const id = insertRow(ctx, 'client_queries', QUERY_COLUMNS, input);
    const q = getQuery(ctx, id);
    indexQuery(ctx, q);
    reply.code(201);
    return q;
  });

  app.patch('/api/client-queries/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(clientQueryUpdateSchema, req.body);
    const before = getQuery(ctx, id);
    if (patch.status === 'sent' && !before.askedAt && !patch.askedAt)
      patch.askedAt = todayISO(ctx.now());
    if (patch.answer && !before.answeredAt && !patch.answeredAt) {
      patch.answeredAt = todayISO(ctx.now());
      if (!patch.status && (before.status === 'draft' || before.status === 'sent'))
        patch.status = 'answered';
    }
    updateRow(ctx, 'client_queries', QUERY_COLUMNS, id, patch, { what: 'La consulta' });
    const q = getQuery(ctx, id);
    indexQuery(ctx, q);
    return q;
  });

  app.delete('/api/client-queries/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    moveToTrash(ctx, 'client_query', id);
    return { ok: true };
  });
}
