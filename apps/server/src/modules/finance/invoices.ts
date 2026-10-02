import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addDaysISO,
  diffDaysISO,
  idSchema,
  invoiceInputSchema,
  invoiceTotals,
  invoiceUpdateSchema,
  isoDateSchema,
  todayISO,
  type Invoice,
  type InvoiceLine,
  type PendingBillingGroup,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { columns, decodeRow, insertRow, placeholders, selectList, updateRow } from '../../lib/sql';
import { parse } from '../../lib/validate';
import { logActivity } from '../../services/activity';
import { indexEntity } from '../../services/search';
import { getSettings } from '../../services/settings';
import { moveToTrash, registerTrashable } from '../../services/trash';
import { getClient } from '../work/clients';
import { JOB_SELECT, JOB_COLUMNS } from '../work/jobs';
import type { Job } from '@l10n/shared';

export const INVOICE_COLUMNS = columns({
  id: 'id',
  number: 'number',
  clientId: 'client_id',
  issueDate: 'issue_date',
  dueDate: 'due_date',
  currency: 'currency',
  exchangeRate: 'exchange_rate',
  baseCents: 'base_cents',
  vatPct: 'vat_pct',
  vatCents: 'vat_cents',
  irpfPct: 'irpf_pct',
  irpfCents: 'irpf_cents',
  totalCents: 'total_cents',
  status: 'status',
  paidAt: 'paid_at',
  extraLines: { col: 'extra_lines', json: true },
  notes: 'notes',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

const INVOICE_SELECT = `SELECT ${selectList(INVOICE_COLUMNS, 'i')}, c.name AS "clientName",
  (SELECT COUNT(*) FROM jobs j WHERE j.invoice_id = i.id AND j.deleted_at IS NULL) AS "jobCount"
  FROM invoices i LEFT JOIN clients c ON c.id = i.client_id`;

/** Encargos facturables: entregados (o en revisión del cliente o cerrados) y pendientes de facturar. */
export const BILLABLE = `j.billing_status = 'pending' AND j.status IN ('delivered','client_review','closed')`;

function decodeInvoice(ctx: AppContext, row: Record<string, unknown>): Invoice {
  const inv = decodeRow<Invoice>(INVOICE_COLUMNS, row);
  const today = todayISO(ctx.now());
  inv.overdueDays =
    inv.status === 'issued' && inv.dueDate && inv.dueDate < today
      ? diffDaysISO(inv.dueDate, today)
      : null;
  return inv;
}

export function getInvoice(ctx: AppContext, id: string): Invoice {
  const row = ctx.sqlite
    .prepare(`${INVOICE_SELECT} WHERE i.id = ? AND i.deleted_at IS NULL`)
    .get(id);
  if (!row) throw new NotFoundError('La factura');
  return decodeInvoice(ctx, row as Record<string, unknown>);
}

export function invoiceJobs(ctx: AppContext, invoiceId: string): Job[] {
  return (
    ctx.sqlite
      .prepare(
        `${JOB_SELECT} WHERE j.invoice_id = ? AND j.deleted_at IS NULL ORDER BY j.due_date, j.title`,
      )
      .all(invoiceId) as Record<string, unknown>[]
  ).map((r) => decodeRow<Job>(JOB_COLUMNS, r));
}

export function listInvoices(
  ctx: AppContext,
  f: { status?: string[]; clientId?: string; year?: number } = {},
): Invoice[] {
  const where = ['i.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (f.status?.length) {
    where.push(`i.status IN (${placeholders(f.status)})`);
    params.push(...f.status);
  }
  if (f.clientId) {
    where.push('i.client_id = ?');
    params.push(f.clientId);
  }
  if (f.year) {
    where.push('substr(i.issue_date, 1, 4) = ?');
    params.push(String(f.year));
  }
  return (
    ctx.sqlite
      .prepare(
        `${INVOICE_SELECT} WHERE ${where.join(' AND ')} ORDER BY i.issue_date DESC, i.number DESC`,
      )
      .all(...params) as Record<string, unknown>[]
  ).map((r) => decodeInvoice(ctx, r));
}

/** Encargos pendientes de facturar agrupados por cliente y moneda. */
export function pendingBilling(ctx: AppContext, clientId?: string): PendingBillingGroup[] {
  const rows = (
    ctx.sqlite
      .prepare(
        `${JOB_SELECT} WHERE j.deleted_at IS NULL AND p.deleted_at IS NULL AND ${BILLABLE}
         ${clientId ? 'AND p.client_id = ?' : ''} ORDER BY c.name, j.delivered_at, j.title`,
      )
      .all(...(clientId ? [clientId] : [])) as Record<string, unknown>[]
  ).map((r) => decodeRow<Job>(JOB_COLUMNS, r));
  const groups = new Map<string, PendingBillingGroup>();
  for (const job of rows) {
    const key = `${job.clientId ?? ''}|${job.currency}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        clientId: job.clientId,
        clientName: job.clientName,
        currency: job.currency,
        totalCents: 0,
        jobs: [],
      };
      groups.set(key, g);
    }
    g.jobs.push(job);
    g.totalCents += job.amountCents ?? 0;
  }
  return [...groups.values()];
}

function indexInvoice(ctx: AppContext, inv: Invoice) {
  indexEntity(ctx, {
    entityType: 'invoice',
    entityId: inv.id,
    title: `Factura ${inv.number}`,
    subtitle: inv.clientName,
    text: inv.notes,
  });
}

function assertNumberFree(ctx: AppContext, number: string, exceptId?: string) {
  const dup = ctx.sqlite
    .prepare(
      "SELECT id FROM invoices WHERE number = ? AND deleted_at IS NULL AND status != 'cancelled' AND id IS NOT ?",
    )
    .get(number, exceptId ?? null);
  if (dup) throw new ConflictError(`Ya hay una factura con el número «${number}».`);
}

/** Comprueba que los encargos son del cliente, están libres y tienen la moneda de la factura. */
function validateJobs(
  ctx: AppContext,
  jobIds: string[],
  clientId: string,
  currency: string,
  invoiceId?: string,
): Job[] {
  if (jobIds.length === 0) return [];
  const jobs = (
    ctx.sqlite
      .prepare(`${JOB_SELECT} WHERE j.id IN (${placeholders(jobIds)}) AND j.deleted_at IS NULL`)
      .all(...jobIds) as Record<string, unknown>[]
  ).map((r) => decodeRow<Job>(JOB_COLUMNS, r));
  if (jobs.length !== new Set(jobIds).size)
    throw new ValidationError('Alguno de los encargos no existe.');
  for (const j of jobs) {
    if (j.clientId !== clientId)
      throw new ValidationError(`El encargo «${j.title}» es de otro cliente.`);
    if (j.invoiceId && j.invoiceId !== invoiceId)
      throw new ValidationError(`El encargo «${j.title}» ya está en otra factura.`);
    if (j.currency !== currency)
      throw new ValidationError(
        `El encargo «${j.title}» está en ${j.currency} y la factura en ${currency}.`,
      );
  }
  return jobs;
}

function computeTotals(jobs: Job[], extraLines: InvoiceLine[], vatPct: number, irpfPct: number) {
  const base =
    jobs.reduce((s, j) => s + (j.amountCents ?? 0), 0) +
    extraLines.reduce((s, l) => s + l.amountCents, 0);
  return invoiceTotals(base, vatPct, irpfPct);
}

function linkJobs(
  ctx: AppContext,
  invoiceId: string,
  jobIds: string[],
  billingStatus: 'invoiced' | 'paid',
) {
  const now = ctx.nowISO();
  ctx.sqlite
    .prepare(
      "UPDATE jobs SET invoice_id = NULL, billing_status = 'pending', updated_at = ? WHERE invoice_id = ?",
    )
    .run(now, invoiceId);
  if (jobIds.length) {
    ctx.sqlite
      .prepare(
        `UPDATE jobs SET invoice_id = ?, billing_status = ?, updated_at = ? WHERE id IN (${placeholders(jobIds)})`,
      )
      .run(invoiceId, billingStatus, now, ...jobIds);
  }
}

export function registerInvoiceEntity(): void {
  registerTrashable({
    type: 'invoice',
    table: 'invoices',
    titleSql: "'Factura ' || number",
    // Los encargos vuelven a «pendiente de facturar»; se recuerdan para poder restaurarla.
    onTrash: (ctx, id) => {
      const ids = (
        ctx.sqlite.prepare('SELECT id FROM jobs WHERE invoice_id = ?').all(id) as { id: string }[]
      ).map((r) => r.id);
      ctx.sqlite
        .prepare('UPDATE invoices SET job_snapshot = ? WHERE id = ?')
        .run(JSON.stringify(ids), id);
      ctx.sqlite
        .prepare(
          "UPDATE jobs SET invoice_id = NULL, billing_status = 'pending' WHERE invoice_id = ?",
        )
        .run(id);
    },
    onRestore: (ctx, id) => {
      const row = ctx.sqlite
        .prepare('SELECT job_snapshot AS s, status FROM invoices WHERE id = ?')
        .get(id) as { s: string | null; status: string };
      const ids = row.s ? (JSON.parse(row.s) as string[]) : [];
      if (ids.length && row.status !== 'cancelled') {
        ctx.sqlite
          .prepare(
            `UPDATE jobs SET invoice_id = ?, billing_status = ? WHERE id IN (${placeholders(ids)}) AND invoice_id IS NULL AND billing_status = 'pending'`,
          )
          .run(id, row.status === 'paid' ? 'paid' : 'invoiced', ...ids);
      }
      indexInvoice(ctx, getInvoice(ctx, id));
    },
  });
}

export async function invoiceRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });

  app.get('/api/invoices', async (req) => {
    const q = parse(
      z.object({
        status: z
          .string()
          .optional()
          .transform((v) => v?.split(',').filter(Boolean)),
        clientId: z.string().optional(),
        year: z.coerce.number().int().min(2000).max(2100).optional(),
      }),
      req.query,
    );
    return listInvoices(ctx, q);
  });

  app.get('/api/invoices/next-number', async () => {
    const year = todayISO(ctx.now()).slice(0, 4);
    const rows = ctx.sqlite
      .prepare(
        'SELECT number FROM invoices WHERE deleted_at IS NULL AND substr(issue_date, 1, 4) = ?',
      )
      .all(year) as { number: string }[];
    // Se toma el último número que termina en cifras y se le suma uno, conservando el prefijo.
    let best: { prefix: string; n: number; width: number } | null = null;
    for (const { number } of rows) {
      const m = /^(.*?)(\d+)$/.exec(number);
      if (m && (!best || Number(m[2]) > best.n))
        best = { prefix: m[1]!, n: Number(m[2]), width: m[2]!.length };
    }
    return {
      number: best
        ? `${best.prefix}${String(best.n + 1).padStart(best.width, '0')}`
        : `${year}-001`,
    };
  });

  app.get('/api/invoices/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return { invoice: getInvoice(ctx, id), jobs: invoiceJobs(ctx, id) };
  });

  app.get('/api/billing/pending', async (req) => {
    const q = parse(z.object({ clientId: z.string().optional() }), req.query);
    return pendingBilling(ctx, q.clientId);
  });

  app.post('/api/invoices', async (req, reply) => {
    const input = parse(invoiceInputSchema, req.body);
    const client = getClient(ctx, input.clientId);
    const prefs = getSettings(ctx).preferences;
    const currency = input.currency ?? client.currency;
    const vatPct = input.vatPct ?? client.vatPct ?? prefs.defaultVatPct;
    const irpfPct = input.irpfPct ?? client.irpfPct ?? prefs.defaultIrpfPct;
    const dueDate =
      input.dueDate ??
      addDaysISO(input.issueDate, client.paymentTermsDays ?? prefs.paymentTermsDays);
    const exchangeRate = currency === prefs.baseCurrency ? 1 : (input.exchangeRate ?? 1);
    assertNumberFree(ctx, input.number);
    const jobs = validateJobs(ctx, input.jobIds, client.id, currency);
    if (jobs.length === 0 && input.extraLines.length === 0) {
      throw new ValidationError('La factura tiene que incluir al menos un encargo o un concepto.');
    }
    const totals = computeTotals(jobs, input.extraLines, vatPct, irpfPct);
    const tx = ctx.sqlite.transaction(() => {
      const id = insertRow(ctx, 'invoices', INVOICE_COLUMNS, {
        number: input.number,
        clientId: client.id,
        issueDate: input.issueDate,
        dueDate,
        currency,
        exchangeRate,
        vatPct,
        irpfPct,
        ...totals,
        status: 'issued',
        extraLines: input.extraLines,
        notes: input.notes,
      });
      linkJobs(ctx, id, input.jobIds, 'invoiced');
      return id;
    });
    const id = tx();
    const invoice = getInvoice(ctx, id);
    indexInvoice(ctx, invoice);
    logActivity(ctx, {
      entityType: 'invoice',
      entityId: id,
      action: 'crear',
      summary: `Factura ${invoice.number} registrada (${client.name})`,
    });
    reply.code(201);
    return invoice;
  });

  app.patch('/api/invoices/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(invoiceUpdateSchema, req.body);
    const current = getInvoice(ctx, id);
    if (current.status === 'cancelled')
      throw new ValidationError('Una factura anulada no se puede modificar.');
    if (patch.number && patch.number !== current.number) assertNumberFree(ctx, patch.number, id);
    const jobIds = patch.jobIds ?? invoiceJobs(ctx, id).map((j) => j.id);
    const currency = patch.currency ?? current.currency;
    const jobs = validateJobs(ctx, jobIds, current.clientId!, currency, id);
    const extraLines = patch.extraLines ?? current.extraLines;
    const vatPct = patch.vatPct ?? current.vatPct;
    const irpfPct = patch.irpfPct ?? current.irpfPct;
    const totals = computeTotals(jobs, extraLines, vatPct, irpfPct);
    const tx = ctx.sqlite.transaction(() => {
      updateRow(ctx, 'invoices', INVOICE_COLUMNS, id, {
        number: patch.number,
        issueDate: patch.issueDate,
        dueDate: patch.dueDate,
        currency,
        exchangeRate: patch.exchangeRate ?? undefined,
        vatPct,
        irpfPct,
        extraLines,
        notes: patch.notes,
        ...totals,
      });
      if (patch.jobIds) linkJobs(ctx, id, jobIds, current.status === 'paid' ? 'paid' : 'invoiced');
    });
    tx();
    const invoice = getInvoice(ctx, id);
    indexInvoice(ctx, invoice);
    return invoice;
  });

  app.post('/api/invoices/:id/pay', async (req) => {
    const { id } = parse(idParam, req.params);
    const { paidAt } = parse(z.object({ paidAt: isoDateSchema.optional() }), req.body ?? {});
    const current = getInvoice(ctx, id);
    if (current.status === 'cancelled') throw new ValidationError('La factura está anulada.');
    const date = paidAt ?? todayISO(ctx.now());
    const tx = ctx.sqlite.transaction(() => {
      updateRow(ctx, 'invoices', INVOICE_COLUMNS, id, { status: 'paid', paidAt: date });
      ctx.sqlite
        .prepare("UPDATE jobs SET billing_status = 'paid', updated_at = ? WHERE invoice_id = ?")
        .run(ctx.nowISO(), id);
    });
    tx();
    logActivity(ctx, {
      entityType: 'invoice',
      entityId: id,
      action: 'estado',
      summary: `Factura ${current.number} cobrada`,
    });
    return getInvoice(ctx, id);
  });

  app.post('/api/invoices/:id/unpay', async (req) => {
    const { id } = parse(idParam, req.params);
    const tx = ctx.sqlite.transaction(() => {
      updateRow(ctx, 'invoices', INVOICE_COLUMNS, id, { status: 'issued', paidAt: null });
      ctx.sqlite
        .prepare("UPDATE jobs SET billing_status = 'invoiced', updated_at = ? WHERE invoice_id = ?")
        .run(ctx.nowISO(), id);
    });
    tx();
    return getInvoice(ctx, id);
  });

  /** Anular: la factura se conserva (para la numeración) y los encargos vuelven a estar pendientes. */
  app.post('/api/invoices/:id/cancel', async (req) => {
    const { id } = parse(idParam, req.params);
    const current = getInvoice(ctx, id);
    const tx = ctx.sqlite.transaction(() => {
      updateRow(ctx, 'invoices', INVOICE_COLUMNS, id, { status: 'cancelled', paidAt: null });
      ctx.sqlite
        .prepare(
          "UPDATE jobs SET invoice_id = NULL, billing_status = 'pending', updated_at = ? WHERE invoice_id = ?",
        )
        .run(ctx.nowISO(), id);
    });
    tx();
    logActivity(ctx, {
      entityType: 'invoice',
      entityId: id,
      action: 'estado',
      summary: `Factura ${current.number} anulada`,
    });
    return getInvoice(ctx, id);
  });

  app.delete('/api/invoices/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    moveToTrash(ctx, 'invoice', id);
    return { ok: true };
  });
}
