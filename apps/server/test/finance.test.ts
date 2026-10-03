import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  Client,
  FinanceOverview,
  Invoice,
  Job,
  PendingBillingGroup,
  Project,
  QuarterReport,
} from '@l10n/shared';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;
let clock = new Date('2026-10-02T10:00:00Z');
beforeEach(async () => {
  clock = new Date('2026-10-02T10:00:00Z');
  t = await createTestApp({ now: () => clock });
});
afterEach(async () => {
  await t.cleanup();
});

async function req<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
  status?: number,
): Promise<T> {
  const res = await t.app.inject({ method, url, payload: payload as object });
  if (status) expect(res.statusCode, res.body).toBe(status);
  else expect(res.statusCode, res.body).toBeLessThan(300);
  return res.json() as T;
}

async function setup(clientExtra: Record<string, unknown> = {}) {
  const client = await req<Client>('POST', '/api/clients', {
    name: 'Pixel Iberia',
    currency: 'EUR',
    vatPct: 21,
    irpfPct: 15,
    paymentTermsDays: 30,
    ...clientExtra,
  });
  const project = await req<Project>('POST', '/api/projects', {
    name: 'Proyecto',
    clientId: client.id,
    sourceLang: 'en',
    targetLang: 'es',
  });
  const job = async (title: string, amountEuros: number, status = 'delivered') => {
    const j = await req<Job>('POST', '/api/jobs', {
      projectId: project.id,
      title,
      unit: 'flat',
      rateMicros: amountEuros * 1_000_000,
    });
    return req<Job>('PATCH', `/api/jobs/${j.id}`, { status });
  };
  return { client, project, job };
}

describe('facturación', () => {
  it('agrupa lo pendiente de facturar y registra la factura con IVA e IRPF', async () => {
    const { client, job } = await setup();
    const a = await job('Encargo A', 100);
    const b = await job('Encargo B', 200);
    await job('Aún en curso', 50, 'in_progress');

    const pending = await req<PendingBillingGroup[]>('GET', '/api/billing/pending');
    expect(pending).toHaveLength(1);
    expect(pending[0]!.totalCents).toBe(30_000);
    expect(pending[0]!.jobs).toHaveLength(2);

    const next = await req<{ number: string }>('GET', '/api/invoices/next-number');
    expect(next.number).toBe('2026-001');

    const inv = await req<Invoice>(
      'POST',
      '/api/invoices',
      {
        number: next.number,
        clientId: client.id,
        issueDate: '2026-10-02',
        jobIds: [a.id, b.id],
        extraLines: [{ description: 'Recargo por urgencia', amountCents: 2_000 }],
      },
      201,
    );
    expect(inv.baseCents).toBe(32_000);
    expect(inv.vatCents).toBe(6_720);
    expect(inv.irpfCents).toBe(4_800);
    expect(inv.totalCents).toBe(33_920);
    expect(inv.dueDate).toBe('2026-11-01');
    expect(inv.jobCount).toBe(2);
    expect((await req<Job>('GET', `/api/jobs/${a.id}`)).billingStatus).toBe('invoiced');
    expect(await req<PendingBillingGroup[]>('GET', '/api/billing/pending')).toHaveLength(0);
    expect((await req<{ number: string }>('GET', '/api/invoices/next-number')).number).toBe(
      '2026-002',
    );

    // Número repetido
    await req(
      'POST',
      '/api/invoices',
      {
        number: '2026-001',
        clientId: client.id,
        issueDate: '2026-10-02',
        extraLines: [{ description: 'x', amountCents: 100 }],
      },
      409,
    );

    // Cobro
    const paid = await req<Invoice>('POST', `/api/invoices/${inv.id}/pay`, {
      paidAt: '2026-10-20',
    });
    expect(paid.status).toBe('paid');
    expect((await req<Job>('GET', `/api/jobs/${b.id}`)).billingStatus).toBe('paid');

    // Anulación: los encargos vuelven a estar pendientes
    await req<Invoice>('POST', `/api/invoices/${inv.id}/cancel`);
    expect((await req<Job>('GET', `/api/jobs/${a.id}`)).billingStatus).toBe('pending');
    expect((await req<PendingBillingGroup[]>('GET', '/api/billing/pending'))[0]!.jobs).toHaveLength(
      2,
    );
    // Una factura anulada no «revive» al deshacer el cobro.
    await req('POST', `/api/invoices/${inv.id}/unpay`, undefined, 400);
    expect((await req<{ invoice: Invoice }>('GET', `/api/invoices/${inv.id}`)).invoice.status).toBe(
      'cancelled',
    );
  });

  it('no recalcula el importe de un encargo ya facturado', async () => {
    const { client, job } = await setup();
    const a = await job('Encargo A', 100);
    await req(
      'POST',
      '/api/invoices',
      { number: 'F-1', clientId: client.id, issueDate: '2026-10-02', jobIds: [a.id] },
      201,
    );
    const edited = await req<Job>('PATCH', `/api/jobs/${a.id}`, {
      title: 'Encargo A (revisado)',
      rateMicros: 150_000_000,
    });
    expect(edited.amountCents).toBe(10_000);
  });

  it('impide mezclar clientes, monedas o encargos ya facturados', async () => {
    const { client, job } = await setup();
    const other = await setup({ name: 'Otra agencia' });
    const mine = await job('Mío', 100);
    const theirs = await other.job('Suyo', 100);
    await req(
      'POST',
      '/api/invoices',
      { number: 'F-1', clientId: client.id, issueDate: '2026-10-02', jobIds: [theirs.id] },
      400,
    );
    await req(
      'POST',
      '/api/invoices',
      { number: 'F-1', clientId: client.id, issueDate: '2026-10-02', jobIds: [mine.id] },
      201,
    );
    await req(
      'POST',
      '/api/invoices',
      { number: 'F-2', clientId: client.id, issueDate: '2026-10-02', jobIds: [mine.id] },
      400,
    );
    await req(
      'POST',
      '/api/invoices',
      { number: 'F-3', clientId: client.id, issueDate: '2026-10-02' },
      400,
    );
  });

  it('al enviar la factura a la papelera libera los encargos y al restaurarla los vuelve a vincular', async () => {
    const { client, job } = await setup();
    const a = await job('A', 100);
    const inv = await req<Invoice>(
      'POST',
      '/api/invoices',
      { number: 'F-9', clientId: client.id, issueDate: '2026-10-02', jobIds: [a.id] },
      201,
    );
    await req('DELETE', `/api/invoices/${inv.id}`);
    expect((await req<Job>('GET', `/api/jobs/${a.id}`)).billingStatus).toBe('pending');
    await req('POST', '/api/trash/restore', { entityType: 'invoice', entityId: inv.id });
    const back = await req<Job>('GET', `/api/jobs/${a.id}`);
    expect(back.billingStatus).toBe('invoiced');
    expect(back.invoiceId).toBe(inv.id);
  });

  it('exporta el resumen para facturar con el aviso de que no es una factura', async () => {
    const { client, job } = await setup();
    const a = await job('Ficha de tienda', 90);
    const res = await t.app.inject(`/api/billing/summary?clientId=${client.id}&jobIds=${a.id}`);
    expect(res.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.rawPayload as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(String(ws.getRow(1).getCell(1).value)).toContain('NO ES UNA FACTURA');
    const values: unknown[] = [];
    ws.eachRow((row) => values.push(...(row.values as unknown[])));
    expect(values).toContain('Ficha de tienda');
    expect(values).toContain(95.4); // 90 + 18,90 de IVA − 13,50 de IRPF
  });
});

describe('gastos e informes', () => {
  it('calcula el IVA de los gastos y los resúmenes del año y del trimestre', async () => {
    const { client, job } = await setup();
    const a = await job('A', 1000);
    await req(
      'POST',
      '/api/invoices',
      { number: 'F-1', clientId: client.id, issueDate: '2026-07-10', jobIds: [a.id] },
      201,
    );
    const b = await job('B', 500);
    const inv2 = await req<Invoice>(
      'POST',
      '/api/invoices',
      {
        number: 'F-2',
        clientId: client.id,
        issueDate: '2026-08-05',
        jobIds: [b.id],
        dueDate: '2026-08-20',
      },
      201,
    );
    const exp = await req<{ vatCents: number; totalCents: number }>(
      'POST',
      '/api/expenses',
      {
        date: '2026-08-01',
        concept: 'Licencia de memoQ',
        category: 'software',
        baseCents: 20_000,
        vatPct: 21,
      },
      201,
    );
    expect(exp.vatCents).toBe(4_200);
    expect(exp.totalCents).toBe(24_200);
    await req(
      'POST',
      '/api/expenses',
      { date: '2026-08-02', concept: 'Comida', baseCents: 3_000, vatPct: 10, deductible: false },
      201,
    );

    const o = await req<FinanceOverview>('GET', '/api/reports/overview?year=2026');
    expect(o.totals.invoicedCents).toBe(150_000);
    expect(o.months[6]!.invoicedCents).toBe(100_000);
    expect(o.byClient[0]!.label).toBe('Pixel Iberia');
    expect(o.byService[0]!.label).toBe('Traducción');
    // F-1 venció el 09/08 y F-2 el 20/08: ambas llevan entre 31 y 60 días de retraso el 02/10
    const d60 = o.receivables.find((r) => r.bucket === 'd60')!;
    expect(d60.count).toBe(2);
    expect(o.totals.pendingCollectionCents).toBeGreaterThan(0);

    const q = await req<QuarterReport>('GET', '/api/reports/quarter?year=2026&quarter=3');
    expect(q.incomeBaseCents).toBe(150_000);
    expect(q.vatChargedCents).toBe(31_500);
    expect(q.irpfWithheldCents).toBe(22_500);
    expect(q.expensesBaseCents).toBe(20_000); // la comida no es deducible
    expect(q.model303Cents).toBe(31_500 - 4_200);
    // 130: 20 % × (1500 − 200) − 225 de retenciones = 35 €
    expect(q.model130Cents).toBe(3_500);
    expect(q.withholdingSharePct).toBe(100);

    await req('POST', `/api/invoices/${inv2.id}/pay`, { paidAt: '2026-10-01' });
    const o2 = await req<FinanceOverview>('GET', '/api/reports/overview?year=2026');
    expect(o2.paymentDays[0]!.days).toBe(57);

    const xls = await t.app.inject('/api/reports/export?year=2026&quarter=3');
    expect(xls.statusCode).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xls.rawPayload as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Facturas emitidas', 'Gastos', 'Resumen']);
    expect(wb.getWorksheet('Facturas emitidas')!.rowCount).toBe(3);
  });

  it('avisa de los cobros atrasados y los muestra en el panel', async () => {
    const { client, job } = await setup();
    const a = await job('A', 100);
    await req(
      'POST',
      '/api/invoices',
      {
        number: 'F-1',
        clientId: client.id,
        issueDate: '2026-08-01',
        dueDate: '2026-09-01',
        jobIds: [a.id],
      },
      201,
    );
    const d = await req<{ pendingCollectionCents: number; overdueInvoiceCount: number }>(
      'GET',
      '/api/dashboard',
    );
    expect(d.overdueInvoiceCount).toBe(1);
    expect(d.pendingCollectionCents).toBe(10_600);
    const reminders = await req<{ title: string }[]>('GET', '/api/reminders');
    expect(reminders.map((r) => r.title)).toContain('Cobro atrasado');
  });
});
