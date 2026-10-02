import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import {
  SERVICES,
  UNIT_PLURALS,
  formatDateES,
  fromCents,
  fromRateMicros,
  invoiceTotals,
  labelOf,
  todayISO,
  type InvoiceLine,
  type Job,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { ValidationError } from '../../lib/errors';
import { decodeRow, placeholders } from '../../lib/sql';
import { parse } from '../../lib/validate';
import { getSettings } from '../../services/settings';
import { contentDisposition } from '../attachments';
import { getClient } from '../work/clients';
import { JOB_COLUMNS, JOB_SELECT } from '../work/jobs';
import { getInvoice, invoiceJobs } from './invoices';

/**
 * «Resumen para facturar»: hoja con los encargos, importes, IVA e IRPF para copiar en tu
 * programa de facturación. Lleva un aviso claro de que NO es una factura.
 */
export async function billingSummary(
  ctx: AppContext,
  input: { invoiceId?: string; clientId?: string; jobIds?: string[] },
): Promise<{ buffer: Buffer; name: string }> {
  const settings = getSettings(ctx);
  let jobs: Job[];
  let extra: InvoiceLine[] = [];
  let number: string | null = null;
  let date = todayISO(ctx.now());
  let clientId = input.clientId;
  let vatPct: number;
  let irpfPct: number;
  let currency: string;
  if (input.invoiceId) {
    const inv = getInvoice(ctx, input.invoiceId);
    jobs = invoiceJobs(ctx, inv.id);
    extra = inv.extraLines;
    number = inv.number;
    date = inv.issueDate;
    clientId = inv.clientId ?? undefined;
    vatPct = inv.vatPct;
    irpfPct = inv.irpfPct;
    currency = inv.currency;
  } else {
    if (!input.clientId || !input.jobIds?.length)
      throw new ValidationError('Elige un cliente y al menos un encargo.');
    jobs = (
      ctx.sqlite
        .prepare(
          `${JOB_SELECT} WHERE j.id IN (${placeholders(input.jobIds)}) AND j.deleted_at IS NULL`,
        )
        .all(...input.jobIds) as Record<string, unknown>[]
    ).map((r) => decodeRow<Job>(JOB_COLUMNS, r));
    const c = getClient(ctx, input.clientId);
    vatPct = c.vatPct ?? settings.preferences.defaultVatPct;
    irpfPct = c.irpfPct ?? settings.preferences.defaultIrpfPct;
    currency = jobs[0]?.currency ?? c.currency;
  }
  const client = clientId ? getClient(ctx, clientId) : null;
  const base =
    jobs.reduce((s, j) => s + (j.amountCents ?? 0), 0) +
    extra.reduce((s, l) => s + l.amountCents, 0);
  const totals = invoiceTotals(base, vatPct, irpfPct);
  const fmt = currency === 'EUR' ? '#,##0.00 "€"' : `#,##0.00 "${currency}"`;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'L10N Suite';
  const ws = wb.addWorksheet('Resumen para facturar');
  ws.columns = [
    { width: 44 },
    { width: 16 },
    { width: 18 },
    { width: 18 },
    { width: 14 },
    { width: 16 },
  ];
  const p = settings.profile;
  const title = ws.addRow(['RESUMEN PARA FACTURAR — NO ES UNA FACTURA']);
  title.font = { bold: true, size: 14, color: { argb: 'FF4F46E5' } };
  ws.addRow([
    number
      ? `Datos para la factura n.º ${number}`
      : 'Datos para preparar la factura en tu programa de facturación',
  ]);
  ws.addRow([`Fecha: ${formatDateES(date)}`]);
  ws.addRow([]);
  ws.addRow(['Emisor', 'Cliente']).font = { bold: true };
  const emitter = [
    p.businessName || p.displayName,
    p.taxId,
    p.address,
    p.email,
    p.iban ? `IBAN: ${p.iban}` : '',
  ];
  const receiver = [
    client?.legalName ?? client?.name ?? '',
    client?.taxId ?? '',
    client?.address ?? '',
    client?.email ?? '',
    client?.country ?? '',
  ];
  for (let i = 0; i < 5; i++) ws.addRow([emitter[i] ?? '', receiver[i] ?? '']);
  ws.addRow([]);
  const head = ws.addRow(['Concepto', 'Pedido (PO)', 'Servicio', 'Volumen', 'Tarifa', 'Importe']);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  for (const j of jobs) {
    const vol =
      j.unit === 'flat'
        ? ''
        : `${j.weightedVolume ?? j.volume ?? ''} ${UNIT_PLURALS[j.unit] ?? ''}${j.weightedVolume != null ? ' (ponderado)' : ''}`;
    const row = ws.addRow([
      `${j.title}${j.gameTitle ? ` — ${j.gameTitle}` : ''}`,
      j.poNumber ?? '',
      labelOf(SERVICES, j.service),
      vol,
      j.rateMicros != null && j.unit !== 'flat' ? fromRateMicros(j.rateMicros) : '',
      fromCents(j.amountCents ?? 0),
    ]);
    row.getCell(6).numFmt = fmt;
  }
  for (const l of extra) {
    const row = ws.addRow([l.description, '', '', '', '', fromCents(l.amountCents)]);
    row.getCell(6).numFmt = fmt;
  }
  ws.addRow([]);
  const add = (label: string, cents: number, bold = false) => {
    const row = ws.addRow(['', '', '', '', label, fromCents(cents)]);
    row.getCell(6).numFmt = fmt;
    if (bold) row.font = { bold: true };
  };
  add('Base imponible', totals.baseCents);
  add(`IVA (${vatPct} %)`, totals.vatCents);
  if (irpfPct > 0) add(`Retención IRPF (−${irpfPct} %)`, -totals.irpfCents);
  add('Total', totals.totalCents, true);
  ws.addRow([]);
  if (client?.paymentTermsDays != null)
    ws.addRow([`Plazo de pago: ${client.paymentTermsDays} días`]);
  const name = `Resumen para facturar - ${client?.name ?? 'cliente'} - ${date}.xlsx`.replace(
    /[\\/:*?"<>|]/g,
    '_',
  );
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), name };
}

export async function summaryRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  app.get('/api/billing/summary', async (req, reply) => {
    const q = parse(
      z.object({
        invoiceId: z.string().optional(),
        clientId: z.string().optional(),
        jobIds: z
          .string()
          .optional()
          .transform((v) => v?.split(',').filter(Boolean)),
      }),
      req.query,
    );
    const { buffer, name } = await billingSummary(ctx, q);
    reply
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', contentDisposition('attachment', name));
    return reply.send(buffer);
  });
}
