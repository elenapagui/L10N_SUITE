import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Client, Forecast, Invoice, Job, Project, Rate } from '@l10n/shared';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;
const clock = new Date('2026-10-02T10:00:00Z');
beforeEach(async () => {
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

const rate = (data: Record<string, unknown>) =>
  req<Rate>('POST', '/api/rates', { currency: 'EUR', ...data }, 201);

describe('tarifas automáticas', () => {
  it('elige la tarifa del cliente por servicio y la mantiene al cambiar el encargo', async () => {
    const studio = await req<Client>('POST', '/api/clients', { name: 'Hangul Studio' });
    const other = await req<Client>('POST', '/api/clients', { name: 'Otro cliente' });
    await rate({ clientId: studio.id, service: 'translation', unit: 'char', rateMicros: 30_000 });
    await rate({ clientId: studio.id, service: 'review', unit: 'char', rateMicros: 12_000 });
    await rate({ clientId: other.id, service: 'translation', unit: 'char', rateMicros: 40_000 });
    await rate({ clientId: null, service: 'translation', unit: 'word', rateMicros: 80_000 });
    const project = await req<Project>('POST', '/api/projects', {
      name: 'Live ops',
      clientId: studio.id,
      sourceLang: 'ko',
      targetLang: 'es',
    });

    // Sin unidad: la del cliente (por carácter) gana a la general (por palabra).
    const resolved = await req<{ rate: Rate; source: string }>(
      'GET',
      `/api/rates/resolve?projectId=${project.id}&service=translation`,
    );
    expect(resolved.source).toBe('client');
    expect(resolved.rate).toMatchObject({ unit: 'char', rateMicros: 30_000 });
    const none = await req<{ rate: Rate | null; source: string | null }>(
      'GET',
      `/api/rates/resolve?projectId=${project.id}&service=lqa`,
    );
    expect(none).toMatchObject({ rate: null, source: null });

    const job = await req<Job>(
      'POST',
      '/api/jobs',
      { projectId: project.id, title: 'Parche 2.4', unit: 'char', volume: 10_000 },
      201,
    );
    expect(job.rateMicros).toBe(30_000);
    expect(job.amountCents).toBe(30_000);

    // Cambiar el servicio aplica la tarifa del nuevo servicio…
    const review = await req<Job & { rateChanged: boolean }>('PATCH', `/api/jobs/${job.id}`, {
      service: 'review',
    });
    expect(review).toMatchObject({ rateChanged: true, rateMicros: 12_000, amountCents: 12_000 });

    // …pero una tarifa puesta a mano se respeta.
    await req('PATCH', `/api/jobs/${job.id}`, { rateMicros: 20_000 });
    const manual = await req<Job & { rateChanged: boolean }>('PATCH', `/api/jobs/${job.id}`, {
      service: 'translation',
    });
    expect(manual).toMatchObject({ rateChanged: false, rateMicros: 20_000 });
    const jobRate = await req<{ rate: Rate }>('GET', `/api/jobs/${job.id}/rate`);
    expect(jobRate.rate.rateMicros).toBe(30_000);

    // Al cambiar el cliente del proyecto, vista previa y aplicación a los pendientes de facturar.
    await req('PATCH', `/api/projects/${project.id}`, { clientId: other.id });
    const preview = await req<{ changes: { jobId: string; toMicros: number }[]; applied: boolean }>(
      'POST',
      `/api/projects/${project.id}/apply-rates?dryRun=1`,
    );
    expect(preview.applied).toBe(false);
    expect(preview.changes).toEqual([
      expect.objectContaining({ jobId: job.id, fromMicros: 20_000, toMicros: 40_000 }),
    ]);
    expect((await req<Job>('GET', `/api/jobs/${job.id}`)).rateMicros).toBe(20_000);
    await req('POST', `/api/projects/${project.id}/apply-rates`);
    const updated = await req<Job>('GET', `/api/jobs/${job.id}`);
    expect(updated).toMatchObject({ rateMicros: 40_000, amountCents: 40_000 });
  });
});

describe('tarifas: casos sin coincidencia', () => {
  it('acepta tarifas con idiomas en proyectos sin idiomas y explica por qué no hay tarifa', async () => {
    const studio = await req<Client>('POST', '/api/clients', { name: 'Estudio Duplicado' });
    const twin = await req<Client>('POST', '/api/clients', { name: ' estudio duplicado ' });
    await rate({
      clientId: studio.id,
      service: 'translation',
      unit: 'char',
      sourceLang: 'ko',
      targetLang: 'es',
      rateMicros: 35_000,
    });
    await rate({
      clientId: twin.id,
      service: 'review',
      unit: 'char',
      sourceLang: 'ko',
      targetLang: 'es',
      rateMicros: 12_000,
    });

    // Proyecto sin idiomas (por ejemplo, importado de ClickUp): la tarifa KO→ES sirve.
    const noLangs = await req<Project>('POST', '/api/projects', {
      name: 'Sin idiomas',
      clientId: studio.id,
      sourceLang: null,
      targetLang: null,
    });
    const r1 = await req<{ rate: Rate | null; notes: string[] }>(
      'GET',
      `/api/rates/resolve?projectId=${noLangs.id}&service=translation`,
    );
    expect(r1.rate?.rateMicros).toBe(35_000);

    // Revisión: el cliente no tiene, pero su «gemelo» sí; y la de traducción es de otro servicio.
    const project = await req<Project>('POST', '/api/projects', {
      name: 'KO-ES',
      clientId: studio.id,
      sourceLang: 'ko',
      targetLang: 'es',
    });
    const r2 = await req<{
      rate: Rate | null;
      context: { clientName: string };
      candidates: { rate: Rate; reasons: string[] }[];
    }>('GET', `/api/rates/resolve?projectId=${project.id}&service=review`);
    expect(r2.rate).toBeNull();
    expect(r2.context.clientName).toBe('Estudio Duplicado');
    expect(r2.candidates.map((c) => c.reasons)).toEqual([
      ['es de otro cliente con el mismo nombre («estudio duplicado»)'],
      ['es de traducción'],
    ]);

    // Otro par de idiomas y otra unidad.
    const enProject = await req<Project>('POST', '/api/projects', {
      name: 'EN-ES',
      clientId: studio.id,
      sourceLang: 'en',
      targetLang: 'es',
    });
    const r3 = await req<{ rate: Rate | null; candidates: { reasons: string[] }[] }>(
      'GET',
      `/api/rates/resolve?projectId=${enProject.id}&service=translation&unit=word`,
    );
    expect(r3.rate).toBeNull();
    expect(r3.candidates[0]!.reasons).toEqual([
      'es por carácter',
      'es para KO→ES y el proyecto es EN→ES',
    ]);

    // Proyecto sin cliente.
    const orphan = await req<Project>('POST', '/api/projects', { name: 'Sin cliente' });
    const r4 = await req<{ notes: string[] }>(
      'GET',
      `/api/rates/resolve?projectId=${orphan.id}&service=translation`,
    );
    expect(r4.notes).toContain(
      'El proyecto no tiene cliente: solo se buscan las tarifas generales.',
    );
  });
});

describe('previsión de cobros', () => {
  it('reparte facturas y encargos sin facturar por la fecha prevista de cobro', async () => {
    const client = await req<Client>('POST', '/api/clients', {
      name: 'Pixel Iberia',
      vatPct: 21,
      irpfPct: 15,
      paymentTermsDays: 30,
    });
    const usd = await req<Client>('POST', '/api/clients', { name: 'Moon Games', currency: 'USD' });
    const project = await req<Project>('POST', '/api/projects', {
      name: 'Proyecto',
      clientId: client.id,
    });
    const usdProject = await req<Project>('POST', '/api/projects', {
      name: 'Proyecto USD',
      clientId: usd.id,
    });
    const job = async (title: string, euros: number, projectId = project.id, currency = 'EUR') => {
      const j = await req<Job>(
        'POST',
        '/api/jobs',
        { projectId, title, unit: 'flat', rateMicros: euros * 1_000_000, currency },
        201,
      );
      return req<Job>('PATCH', `/api/jobs/${j.id}`, { status: 'delivered' });
    };
    const old = await job('Encargo de agosto', 200);
    const recent = await job('Encargo de septiembre', 50);
    await job('Entregado hoy', 100);
    await job('En dólares', 300, usdProject.id, 'USD');
    await req<Invoice>(
      'POST',
      '/api/invoices',
      {
        number: 'F-1',
        clientId: client.id,
        issueDate: '2026-08-01',
        dueDate: '2026-08-31',
        jobIds: [old.id],
      },
      201,
    );
    await req<Invoice>(
      'POST',
      '/api/invoices',
      { number: 'F-2', clientId: client.id, issueDate: '2026-10-01', jobIds: [recent.id] },
      201,
    );

    const f = await req<Forecast>('GET', '/api/reports/forecast');
    // 200 € + 21 % IVA − 15 % IRPF = 212 € vencidos.
    expect(f.overdueCents).toBe(21_200);
    // F-2 vence el 31/10 (30 días): 53 €.
    expect(f.next30Cents).toBe(5_300);
    expect(f.months[0]).toEqual({ month: '2026-10', invoicedCents: 5_300, pendingCents: 0 });
    // Entregado hoy: factura a fin de mes (31/10) y cobro 30 días después (30/11): 106 €.
    expect(f.months[1]).toEqual({ month: '2026-11', invoicedCents: 0, pendingCents: 10_600 });
    expect(f.months).toHaveLength(6);
    expect(f.totalCents).toBe(37_100);
    expect(f.unconverted).toBe(1);
    expect(f.byClient[0]).toMatchObject({
      label: 'Pixel Iberia',
      invoicedCents: 26_500,
      pendingCents: 10_600,
    });
    expect(f.items.find((i) => i.label === 'En dólares')).toMatchObject({
      currency: 'USD',
      baseCents: null,
    });

    // Con un tipo de cambio aproximado en Ajustes, lo de dólares también se suma.
    const res = await t.app.inject({
      method: 'PUT',
      url: '/api/settings/preferences',
      payload: { fxRates: { USD: 0.9 } },
    });
    expect(res.statusCode, res.body).toBe(200);
    const withFx = await req<Forecast>('GET', '/api/reports/forecast');
    expect(withFx.unconverted).toBe(0);
    // 300 $ sin IVA ni IRPF configurados en el cliente → los de Ajustes (21 % y 15 %): 318 $ × 0,9.
    expect(withFx.items.find((i) => i.label === 'En dólares')).toMatchObject({
      cents: 31_800,
      baseCents: 28_620,
    });
    expect(withFx.totalCents).toBe(37_100 + 28_620);
  });
});
