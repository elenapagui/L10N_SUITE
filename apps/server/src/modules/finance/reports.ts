import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import {
  EXPENSE_CATEGORIES,
  INVOICE_STATUSES,
  SERVICES,
  diffDaysISO,
  fromCents,
  labelOf,
  pairLabel,
  quarterRange,
  todayISO,
  addDaysISO,
  invoiceTotals,
  type BreakdownRow,
  type FinanceOverview,
  type Forecast,
  type ForecastItem,
  type QuarterReport,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { parse } from '../../lib/validate';
import { getSettings } from '../../services/settings';
import { contentDisposition } from '../attachments';
import { listExpenses } from './expenses';
import { listClients } from '../work/clients';
import { listJobs } from '../work/jobs';
import { BILLABLE, listInvoices } from './invoices';

/** Convierte a la moneda principal con el tipo de cambio de la factura o del gasto. */
const toBase = (cents: number, rate: number) => Math.round(cents * (rate || 1));

function breakdown(rows: { key: string; label: string; cents: number }[]): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();
  for (const r of rows) {
    const cur = map.get(r.key) ?? { key: r.key, label: r.label, cents: 0, count: 0 };
    cur.cents += r.cents;
    cur.count++;
    map.set(r.key, cur);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents);
}

export function financeOverview(ctx: AppContext, year: number): FinanceOverview {
  const baseCurrency = getSettings(ctx).preferences.baseCurrency;
  const y = String(year);
  const invoices = listInvoices(ctx).filter((i) => i.status !== 'cancelled');
  const yearInvoices = invoices.filter((i) => i.issueDate.startsWith(y));
  const expenses = listExpenses(ctx, { from: `${y}-01-01`, to: `${year + 1}-01-01` });

  const months = Array.from({ length: 12 }, (_, i) => ({
    month: `${y}-${String(i + 1).padStart(2, '0')}`,
    invoicedCents: 0,
    paidCents: 0,
    expensesCents: 0,
  }));
  for (const inv of yearInvoices)
    months[Number(inv.issueDate.slice(5, 7)) - 1]!.invoicedCents += toBase(
      inv.baseCents,
      inv.exchangeRate,
    );
  for (const inv of invoices) {
    if (inv.status === 'paid' && inv.paidAt?.startsWith(y)) {
      months[Number(inv.paidAt.slice(5, 7)) - 1]!.paidCents += toBase(
        inv.baseCents,
        inv.exchangeRate,
      );
    }
  }
  for (const e of expenses)
    months[Number(e.date.slice(5, 7)) - 1]!.expensesCents += toBase(e.baseCents, e.exchangeRate);

  // Desgloses a partir de los encargos de las facturas del año (más los conceptos sueltos).
  const jobRows = ctx.sqlite
    .prepare(
      `SELECT j.amount_cents AS cents, j.service, i.exchange_rate AS rate, c.id AS clientId, c.name AS clientName,
              g.id AS gameId, g.title AS gameTitle, p.source_lang AS src, p.target_lang AS tgt
       FROM jobs j JOIN invoices i ON i.id = j.invoice_id JOIN projects p ON p.id = j.project_id
       LEFT JOIN clients c ON c.id = p.client_id LEFT JOIN games g ON g.id = p.game_id
       WHERE i.deleted_at IS NULL AND i.status != 'cancelled' AND substr(i.issue_date, 1, 4) = ? AND j.deleted_at IS NULL`,
    )
    .all(y) as {
    cents: number | null;
    service: string;
    rate: number;
    clientId: string | null;
    clientName: string | null;
    gameId: string | null;
    gameTitle: string | null;
    src: string | null;
    tgt: string | null;
  }[];
  const jr = jobRows.map((r) => ({ ...r, base: toBase(r.cents ?? 0, r.rate) }));
  const extra = yearInvoices.flatMap((i) =>
    i.extraLines.map((l) => ({ inv: i, cents: toBase(l.amountCents, i.exchangeRate) })),
  );

  const byClient = breakdown([
    ...yearInvoices.map((i) => ({
      key: i.clientId ?? '-',
      label: i.clientName ?? 'Sin cliente',
      cents: toBase(i.baseCents, i.exchangeRate),
    })),
  ]);
  const byService = breakdown([
    ...jr.map((r) => ({ key: r.service, label: labelOf(SERVICES, r.service), cents: r.base })),
    ...extra.map((e) => ({ key: 'extra', label: 'Otros conceptos', cents: e.cents })),
  ]);
  const byGame = breakdown(
    jr.map((r) => ({ key: r.gameId ?? '-', label: r.gameTitle ?? 'Sin juego', cents: r.base })),
  );
  const byPair = breakdown(
    jr.map((r) => ({ key: `${r.src}-${r.tgt}`, label: pairLabel(r.src, r.tgt), cents: r.base })),
  );

  // Cobros pendientes por antigüedad (todas las facturas emitidas sin cobrar).
  const today = todayISO(ctx.now());
  const buckets = [
    { bucket: 'current' as const, label: 'Sin vencer', cents: 0, count: 0 },
    { bucket: 'd30' as const, label: 'Vencidas hasta 30 días', cents: 0, count: 0 },
    { bucket: 'd60' as const, label: '31–60 días', cents: 0, count: 0 },
    { bucket: 'd90' as const, label: '61–90 días', cents: 0, count: 0 },
    { bucket: 'older' as const, label: 'Más de 90 días', cents: 0, count: 0 },
  ];
  let pendingCollection = 0;
  for (const inv of invoices.filter((i) => i.status === 'issued')) {
    const cents = toBase(inv.totalCents, inv.exchangeRate);
    pendingCollection += cents;
    const late = inv.dueDate && inv.dueDate < today ? diffDaysISO(inv.dueDate, today) : 0;
    const b =
      late <= 0
        ? buckets[0]!
        : late <= 30
          ? buckets[1]!
          : late <= 60
            ? buckets[2]!
            : late <= 90
              ? buckets[3]!
              : buckets[4]!;
    b.cents += cents;
    b.count++;
  }

  // Días medios de cobro por cliente (facturas cobradas).
  const pay = new Map<string, { days: number; n: number }>();
  for (const inv of invoices.filter((i) => i.status === 'paid' && i.paidAt)) {
    const k = inv.clientName ?? 'Sin cliente';
    const cur = pay.get(k) ?? { days: 0, n: 0 };
    cur.days += diffDaysISO(inv.issueDate, inv.paidAt!);
    cur.n++;
    pay.set(k, cur);
  }

  const pendingBilling = (
    ctx.sqlite
      .prepare(
        `SELECT COALESCE(SUM(j.amount_cents), 0) AS s FROM jobs j JOIN projects p ON p.id = j.project_id
         WHERE j.deleted_at IS NULL AND p.deleted_at IS NULL AND ${BILLABLE} AND j.currency = ?`,
      )
      .get(baseCurrency) as { s: number }
  ).s;

  // €/hora efectivo: importe de los encargos entregados en el año con tiempo registrado.
  const hourly = ctx.sqlite
    .prepare(
      `SELECT SUM(j.amount_cents) AS cents, SUM(t.secs) AS secs FROM jobs j
       JOIN (SELECT job_id, SUM((julianday(ended_at) - julianday(started_at)) * 86400) AS secs
             FROM time_entries WHERE deleted_at IS NULL AND ended_at IS NOT NULL AND job_id IS NOT NULL GROUP BY job_id) t ON t.job_id = j.id
       WHERE j.deleted_at IS NULL AND j.currency = ? AND substr(COALESCE(j.delivered_at, ''), 1, 4) = ? AND t.secs > 0`,
    )
    .get(baseCurrency, y) as { cents: number | null; secs: number | null };

  const invoiced = months.reduce((s, m) => s + m.invoicedCents, 0);
  const expensesTotal = months.reduce((s, m) => s + m.expensesCents, 0);
  return {
    year,
    baseCurrency,
    months,
    totals: {
      invoicedCents: invoiced,
      paidCents: months.reduce((s, m) => s + m.paidCents, 0),
      expensesCents: expensesTotal,
      netCents: invoiced - expensesTotal,
      pendingCollectionCents: pendingCollection,
      pendingBillingCents: pendingBilling,
    },
    byClient,
    byService,
    byGame,
    byPair,
    receivables: buckets,
    paymentDays: [...pay.entries()]
      .map(([clientName, v]) => ({ clientName, days: Math.round(v.days / v.n), invoices: v.n }))
      .sort((a, b) => b.days - a.days),
    effectiveHourlyCents:
      hourly.cents && hourly.secs ? Math.round(hourly.cents / (hourly.secs / 3600)) : null,
  };
}

/**
 * Resumen trimestral ORIENTATIVO de los modelos 303 (IVA) y 130 (pago fraccionado del IRPF
 * en estimación directa). No sustituye el cálculo de la gestoría.
 */
export function quarterReport(ctx: AppContext, year: number, quarter: number): QuarterReport {
  const baseCurrency = getSettings(ctx).preferences.baseCurrency;
  const { from, to } = quarterRange(year, quarter);
  const invoices = listInvoices(ctx).filter((i) => i.status !== 'cancelled');
  const inQ = invoices.filter((i) => i.issueDate >= from && i.issueDate < to);
  const ytd = invoices.filter((i) => i.issueDate >= `${year}-01-01` && i.issueDate < to);
  const expQ = listExpenses(ctx, { from, to }).filter((e) => e.deductible);
  const expYtd = listExpenses(ctx, { from: `${year}-01-01`, to }).filter((e) => e.deductible);

  const sum = <T>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);
  const incomeBase = sum(inQ, (i) => toBase(i.baseCents, i.exchangeRate));
  const vatCharged = sum(inQ, (i) => toBase(i.vatCents, i.exchangeRate));
  const withheld = sum(inQ, (i) => toBase(i.irpfCents, i.exchangeRate));
  const expBase = sum(expQ, (e) => toBase(e.baseCents, e.exchangeRate));
  const vatDeductible = sum(expQ, (e) => toBase(e.vatCents, e.exchangeRate));

  const ytdIncome = sum(ytd, (i) => toBase(i.baseCents, i.exchangeRate));
  const ytdExpenses = sum(expYtd, (e) => toBase(e.baseCents, e.exchangeRate));
  const ytdWithheld = sum(ytd, (i) => toBase(i.irpfCents, i.exchangeRate));
  const ytdNet = ytdIncome - ytdExpenses;

  // Pagos fraccionados de los trimestres anteriores (calculados igual, solo si salen positivos).
  let previous = 0;
  for (let q = 1; q < quarter; q++)
    previous += Math.max(0, quarterReport(ctx, year, q).model130Cents);
  const model130 = Math.max(0, Math.round(ytdNet * 0.2) - ytdWithheld - previous);
  const withRetention = sum(
    ytd.filter((i) => i.irpfCents > 0),
    (i) => toBase(i.baseCents, i.exchangeRate),
  );

  return {
    year,
    quarter,
    from,
    to,
    baseCurrency,
    invoicesCount: inQ.length,
    incomeBaseCents: incomeBase,
    vatChargedCents: vatCharged,
    irpfWithheldCents: withheld,
    expensesBaseCents: expBase,
    vatDeductibleCents: vatDeductible,
    model303Cents: vatCharged - vatDeductible,
    ytdIncomeBaseCents: ytdIncome,
    ytdExpensesBaseCents: ytdExpenses,
    ytdNetCents: ytdNet,
    ytdWithheldCents: ytdWithheld,
    previousPaymentsCents: previous,
    model130Cents: model130,
    withholdingSharePct: ytdIncome > 0 ? Math.round((withRetention / ytdIncome) * 1000) / 10 : 0,
  };
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

const EUR = '#,##0.00';

/** Libro de Excel para la gestoría: facturas emitidas, gastos y resumen del periodo. */
export async function accountingWorkbook(
  ctx: AppContext,
  year: number,
  quarter?: number,
): Promise<{ buffer: Buffer; name: string }> {
  const range = quarter
    ? quarterRange(year, quarter)
    : { from: `${year}-01-01`, to: `${year + 1}-01-01` };
  const invoices = listInvoices(ctx)
    .filter((i) => i.issueDate >= range.from && i.issueDate < range.to)
    .reverse();
  const expenses = listExpenses(ctx, range).reverse();
  const profile = getSettings(ctx).profile;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'L10N Suite';

  const wi = wb.addWorksheet('Facturas emitidas');
  wi.columns = [
    { header: 'Número', key: 'number', width: 14 },
    { header: 'Fecha', key: 'date', width: 12 },
    { header: 'Cliente', key: 'client', width: 32 },
    { header: 'Moneda', key: 'currency', width: 9 },
    { header: 'Base', key: 'base', width: 13, style: { numFmt: EUR } },
    { header: '% IVA', key: 'vatPct', width: 8 },
    { header: 'IVA', key: 'vat', width: 12, style: { numFmt: EUR } },
    { header: '% IRPF', key: 'irpfPct', width: 8 },
    { header: 'IRPF', key: 'irpf', width: 12, style: { numFmt: EUR } },
    { header: 'Total', key: 'total', width: 13, style: { numFmt: EUR } },
    { header: 'Tipo de cambio', key: 'rate', width: 13 },
    { header: 'Estado', key: 'status', width: 11 },
    { header: 'Cobrada el', key: 'paid', width: 12 },
  ];
  for (const i of invoices) {
    wi.addRow({
      number: i.number,
      date: i.issueDate,
      client: i.clientName ?? '',
      currency: i.currency,
      base: fromCents(i.baseCents),
      vatPct: i.vatPct,
      vat: fromCents(i.vatCents),
      irpfPct: i.irpfPct,
      irpf: fromCents(i.irpfCents),
      total: fromCents(i.totalCents),
      rate: i.exchangeRate,
      status: labelOf(INVOICE_STATUSES, i.status),
      paid: i.paidAt ?? '',
    });
  }
  styleHeader(wi);

  const we = wb.addWorksheet('Gastos');
  we.columns = [
    { header: 'Fecha', key: 'date', width: 12 },
    { header: 'Proveedor', key: 'supplier', width: 26 },
    { header: 'Concepto', key: 'concept', width: 36 },
    { header: 'Categoría', key: 'category', width: 28 },
    { header: 'Moneda', key: 'currency', width: 9 },
    { header: 'Base', key: 'base', width: 12, style: { numFmt: EUR } },
    { header: '% IVA', key: 'vatPct', width: 8 },
    { header: 'IVA', key: 'vat', width: 11, style: { numFmt: EUR } },
    { header: 'Total', key: 'total', width: 12, style: { numFmt: EUR } },
    { header: 'Deducible', key: 'deductible', width: 10 },
  ];
  for (const e of expenses) {
    we.addRow({
      date: e.date,
      supplier: e.supplier ?? '',
      concept: e.concept,
      category: labelOf(EXPENSE_CATEGORIES, e.category),
      currency: e.currency,
      base: fromCents(e.baseCents),
      vatPct: e.vatPct,
      vat: fromCents(e.vatCents),
      total: fromCents(e.totalCents),
      deductible: e.deductible ? 'Sí' : 'No',
    });
  }
  styleHeader(we);

  const ws = wb.addWorksheet('Resumen');
  ws.columns = [
    { header: 'Concepto', key: 'k', width: 44 },
    { header: 'Importe', key: 'v', width: 16, style: { numFmt: EUR } },
  ];
  ws.addRow({
    k: `${profile.businessName || profile.displayName || 'L10N Suite'} — ${quarter ? `${quarter}.º trimestre de ${year}` : `año ${year}`}`,
  });
  if (quarter) {
    const r = quarterReport(ctx, year, quarter);
    ws.addRows([
      { k: 'Base imponible facturada', v: fromCents(r.incomeBaseCents) },
      { k: 'IVA repercutido', v: fromCents(r.vatChargedCents) },
      { k: 'Retenciones de IRPF', v: fromCents(r.irpfWithheldCents) },
      { k: 'Gastos deducibles (base)', v: fromCents(r.expensesBaseCents) },
      { k: 'IVA soportado deducible', v: fromCents(r.vatDeductibleCents) },
      { k: 'Modelo 303 (orientativo): IVA a ingresar', v: fromCents(r.model303Cents) },
      { k: 'Modelo 130 (orientativo): pago fraccionado', v: fromCents(r.model130Cents) },
      { k: 'Cálculo orientativo. Revísalo con tu gestoría.' },
    ]);
  } else {
    const o = financeOverview(ctx, year);
    ws.addRows([
      { k: 'Facturado (base)', v: fromCents(o.totals.invoicedCents) },
      { k: 'Cobrado (base)', v: fromCents(o.totals.paidCents) },
      { k: 'Gastos (base)', v: fromCents(o.totals.expensesCents) },
      { k: 'Rendimiento (facturado − gastos)', v: fromCents(o.totals.netCents) },
    ]);
  }
  styleHeader(ws);
  const name = `Contabilidad ${quarter ? `${year}-T${quarter}` : year}.xlsx`;
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), name };
}

/** Último día del mes de una fecha ISO. */
function endOfMonthISO(date: string): string {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Previsión de cobros de los próximos meses:
 * - facturas emitidas sin cobrar, en su fecha de vencimiento (las vencidas, aparte);
 * - encargos pendientes de facturar: se supone la factura a fin del mes de entrega (o de la
 *   fecha prevista; nunca antes de hoy) y el cobro tras el plazo de pago del cliente.
 */
export function cashForecast(ctx: AppContext, horizonMonths = 6): Forecast {
  const prefs = getSettings(ctx).preferences;
  const baseCurrency = prefs.baseCurrency;
  const today = todayISO(ctx.now());
  const clients = new Map(listClients(ctx, { includeInactive: true }).map((c) => [c.id, c]));
  const invoices = listInvoices(ctx).filter((i) => i.status !== 'cancelled');
  // Tipo de cambio de cada moneda: el de la factura más reciente en esa moneda.
  const fx = new Map<string, number>([[baseCurrency, 1]]);
  for (const i of [...invoices].sort((a, b) => a.issueDate.localeCompare(b.issueDate)))
    if (i.exchangeRate) fx.set(i.currency, i.exchangeRate);
  // Los tipos aproximados de Ajustes tienen prioridad: los ha fijado la usuaria para esto.
  for (const [cur, rate] of Object.entries(prefs.fxRates ?? {}))
    if (cur !== baseCurrency) fx.set(cur, rate);

  const items: ForecastItem[] = [];
  for (const inv of invoices) {
    if (inv.status !== 'issued') continue;
    const terms =
      (inv.clientId ? clients.get(inv.clientId)?.paymentTermsDays : null) ?? prefs.paymentTermsDays;
    const expected = inv.dueDate ?? addDaysISO(inv.issueDate, terms);
    items.push({
      kind: 'invoice',
      id: inv.id,
      label: `Factura ${inv.number}`,
      clientName: inv.clientName,
      expectedDate: expected,
      cents: inv.totalCents,
      currency: inv.currency,
      baseCents: toBase(inv.totalCents, inv.exchangeRate),
      overdue: expected < today,
    });
  }
  const jobs = listJobs(ctx, {}).filter(
    (j) => j.billingStatus === 'pending' && j.status !== 'cancelled' && (j.amountCents ?? 0) > 0,
  );
  for (const j of jobs) {
    const client = j.clientId ? clients.get(j.clientId) : undefined;
    const ref = j.deliveredAt ?? j.dueDate ?? today;
    const invoiceDate = [endOfMonthISO(ref), today].sort().at(-1)!;
    const terms = client?.paymentTermsDays ?? prefs.paymentTermsDays;
    const { totalCents } = invoiceTotals(
      j.amountCents!,
      client?.vatPct ?? prefs.defaultVatPct,
      client?.irpfPct ?? prefs.defaultIrpfPct,
    );
    const rate = fx.get(j.currency);
    items.push({
      kind: 'job',
      id: j.id,
      label: j.title,
      clientName: j.clientName,
      expectedDate: addDaysISO(invoiceDate, terms),
      cents: totalCents,
      currency: j.currency,
      baseCents: rate ? toBase(totalCents, rate) : null,
      overdue: false,
    });
  }
  items.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));

  const months = Array.from({ length: horizonMonths }, (_, i) => {
    const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + i);
    return { month: d.toISOString().slice(0, 7), invoicedCents: 0, pendingCents: 0 };
  });
  const lastMonth = months.at(-1)!.month;
  const in30 = addDaysISO(today, 30);
  const byClient = new Map<string, Forecast['byClient'][number]>();
  let overdueCents = 0;
  let next30Cents = 0;
  let laterCents = 0;
  let totalCents = 0;
  let unconverted = 0;
  for (const it of items) {
    if (it.baseCents == null) {
      unconverted++;
      continue;
    }
    const cents = it.baseCents;
    totalCents += cents;
    const key = it.clientName ?? '—';
    const c = byClient.get(key) ?? {
      key,
      label: it.clientName ?? 'Sin cliente',
      invoicedCents: 0,
      pendingCents: 0,
      totalCents: 0,
    };
    c[it.kind === 'invoice' ? 'invoicedCents' : 'pendingCents'] += cents;
    c.totalCents += cents;
    byClient.set(key, c);
    if (it.overdue) {
      overdueCents += cents;
      continue;
    }
    if (it.expectedDate <= in30) next30Cents += cents;
    const month = it.expectedDate.slice(0, 7);
    if (month > lastMonth) {
      laterCents += cents;
      continue;
    }
    const m = months.find((x) => x.month === month) ?? months[0]!;
    m[it.kind === 'invoice' ? 'invoicedCents' : 'pendingCents'] += cents;
  }
  return {
    baseCurrency,
    today,
    overdueCents,
    next30Cents,
    totalCents,
    laterCents,
    months,
    byClient: [...byClient.values()].sort((a, b) => b.totalCents - a.totalCents),
    items,
    unconverted,
  };
}

export async function reportRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const yearSchema = z.coerce.number().int().min(2000).max(2100);

  app.get('/api/reports/overview', async (req) => {
    const q = parse(z.object({ year: yearSchema.optional() }), req.query);
    return financeOverview(ctx, q.year ?? Number(todayISO(ctx.now()).slice(0, 4)));
  });

  app.get('/api/reports/forecast', async (req) => {
    const q = parse(
      z.object({ months: z.coerce.number().int().min(1).max(24).optional() }),
      req.query,
    );
    return cashForecast(ctx, q.months ?? 6);
  });

  app.get('/api/reports/quarter', async (req) => {
    const q = parse(
      z.object({ year: yearSchema, quarter: z.coerce.number().int().min(1).max(4) }),
      req.query,
    );
    return quarterReport(ctx, q.year, q.quarter);
  });

  app.get('/api/reports/export', async (req, reply) => {
    const q = parse(
      z.object({ year: yearSchema, quarter: z.coerce.number().int().min(1).max(4).optional() }),
      req.query,
    );
    const { buffer, name } = await accountingWorkbook(ctx, q.year, q.quarter);
    reply
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', contentDisposition('attachment', name));
    return reply.send(buffer);
  });
}
