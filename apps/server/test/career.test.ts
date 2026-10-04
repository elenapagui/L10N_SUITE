import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ApplicationEvent,
  CalendarEvent,
  Client,
  JobApplication,
  Rate,
  Reminder,
  WeeklyReview,
} from '@l10n/shared';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;
let clock = new Date('2026-10-05T10:00:00');
beforeEach(async () => {
  clock = new Date('2026-10-05T10:00:00');
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

const newApp = (body: Record<string, unknown> = {}) =>
  req<JobApplication>(
    'POST',
    '/api/job-applications',
    {
      title: 'Traductora KO-ES',
      company: 'Hangul Loc',
      kind: 'freelance',
      ...body,
    },
    201,
  );

describe('candidaturas', () => {
  it('guarda una oferta y la presenta: fecha de solicitud, seguimiento e historial', async () => {
    const a = await newApp({ deadline: '2026-10-07' });
    expect(a).toMatchObject({ status: 'saved', appliedAt: null, followUpAt: null });

    // Plazo para presentarse en el calendario y aviso dos días antes.
    let cal = await req<CalendarEvent[]>('GET', '/api/calendar?from=2026-10-01&to=2026-10-31');
    expect(cal.filter((e) => e.kind === 'application').map((e) => e.title)).toEqual([
      'Presentarse a: Traductora KO-ES',
    ]);
    let reminders = await req<Reminder[]>('GET', '/api/reminders');
    expect(reminders.map((r) => r.title)).toContain('Plazo para presentarte');

    const applied = await req<JobApplication>('PATCH', `/api/job-applications/${a.id}`, {
      status: 'applied',
    });
    // Seguimiento a los 10 días (ajuste por defecto).
    expect(applied).toMatchObject({
      status: 'applied',
      appliedAt: '2026-10-05',
      followUpAt: '2026-10-15',
    });
    const events = await req<ApplicationEvent[]>('GET', `/api/job-applications/${a.id}/events`);
    expect(events.map((e) => [e.kind, e.notes])).toEqual([['status', 'Guardada → Solicitada']]);

    cal = await req<CalendarEvent[]>('GET', '/api/calendar?from=2026-10-01&to=2026-10-31');
    expect(cal.filter((e) => e.kind === 'application').map((e) => e.title)).toEqual([
      'Seguimiento: Hangul Loc',
    ]);

    // Diez días sin respuesta: aviso para escribir.
    clock = new Date('2026-10-15T09:00:00');
    reminders = await req<Reminder[]>('GET', '/api/reminders');
    const follow = reminders.find((r) => r.title === 'Candidatura sin respuesta');
    expect(follow?.body).toContain('Hangul Loc');
    expect(follow?.route).toBe(`/empleo/${a.id}`);

    // Escribir para preguntar aplaza el siguiente seguimiento.
    await req(
      'POST',
      `/api/job-applications/${a.id}/events`,
      {
        kind: 'follow_up',
        date: '2026-10-15',
      },
      201,
    );
    expect((await req<JobApplication>('GET', `/api/job-applications/${a.id}`)).followUpAt).toBe(
      '2026-10-25',
    );
    reminders = await req<Reminder[]>('GET', '/api/reminders');
    expect(reminders.some((r) => r.title === 'Candidatura sin respuesta')).toBe(false);
  });

  it('el estado avanza con los pasos y nunca retrocede; prueba y entrevista en el calendario', async () => {
    const a = await newApp({ status: 'applied', appliedAt: '2026-10-01' });
    expect(a.followUpAt).toBe('2026-10-11');

    await req(
      'POST',
      `/api/job-applications/${a.id}/events`,
      {
        kind: 'test_received',
        date: '2026-10-05',
        dueDate: '2026-10-06',
      },
      201,
    );
    let cur = await req<JobApplication>('GET', `/api/job-applications/${a.id}`);
    expect(cur).toMatchObject({
      status: 'test',
      firstResponseDays: 4,
      nextDate: { date: '2026-10-06', label: 'Entrega de la prueba' },
    });
    const reminders = await req<Reminder[]>('GET', '/api/reminders');
    expect(reminders.map((r) => r.title)).toContain('Entrega de la prueba mañana');

    await req(
      'POST',
      `/api/job-applications/${a.id}/events`,
      {
        kind: 'test_sent',
        date: '2026-10-06',
      },
      201,
    );
    await req(
      'POST',
      `/api/job-applications/${a.id}/events`,
      {
        kind: 'interview',
        date: '2026-10-09',
        time: '11:30',
      },
      201,
    );
    cur = await req<JobApplication>('GET', `/api/job-applications/${a.id}`);
    expect(cur).toMatchObject({
      status: 'interview',
      nextDate: { date: '2026-10-09', time: '11:30', label: 'Entrevista' },
    });

    const cal = await req<CalendarEvent[]>('GET', '/api/calendar?from=2026-10-01&to=2026-10-31');
    const mine = cal.filter((e) => e.kind === 'application');
    expect(mine.find((e) => e.title === 'Entregar la prueba: Hangul Loc')).toMatchObject({
      date: '2026-10-06',
      done: true,
    });
    expect(mine.find((e) => e.title === 'Entrevista: Hangul Loc')).toMatchObject({
      date: '2026-10-09',
      time: '11:30',
      entityId: a.id,
    });

    // Una nota o un paso anterior no hacen retroceder el estado.
    await req(
      'POST',
      `/api/job-applications/${a.id}/events`,
      {
        kind: 'test_received',
        date: '2026-10-10',
      },
      201,
    );
    expect((await req<JobApplication>('GET', `/api/job-applications/${a.id}`)).status).toBe(
      'interview',
    );

    // Rechazada: sin seguimiento ni avisos.
    const closed = await req<JobApplication>('PATCH', `/api/job-applications/${a.id}`, {
      status: 'rejected',
    });
    expect(closed.followUpAt).toBeNull();
    await req(
      'POST',
      `/api/job-applications/${a.id}/events`,
      {
        kind: 'offer',
        date: '2026-10-12',
      },
      201,
    );
    expect((await req<JobApplication>('GET', `/api/job-applications/${a.id}`)).status).toBe(
      'rejected',
    );
  });

  it('pasa a cliente con su contacto y su tarifa, sin duplicar', async () => {
    const a = await newApp({
      status: 'accepted',
      url: 'https://hangul-loc.example/careers/123',
      contactName: 'Min-ji Park',
      contactEmail: 'vendors@hangul-loc.example',
      rateMicros: 70_000,
      rateUnit: 'char',
      sourceLang: 'ko',
      targetLang: 'es',
    });
    const client = await req<Client>('POST', `/api/job-applications/${a.id}/client`);
    expect(client).toMatchObject({
      name: 'Hangul Loc',
      kind: 'agency',
      website: 'https://hangul-loc.example',
      email: 'vendors@hangul-loc.example',
    });
    const detail = await req<{ contacts: { name: string; isPrimary: boolean }[]; rates: Rate[] }>(
      'GET',
      `/api/clients/${client.id}`,
    );
    expect(detail.contacts).toMatchObject([{ name: 'Min-ji Park', isPrimary: true }]);
    expect(detail.rates).toMatchObject([
      { unit: 'char', rateMicros: 70_000, sourceLang: 'ko', targetLang: 'es' },
    ]);
    const linked = await req<JobApplication>('GET', `/api/job-applications/${a.id}`);
    expect(linked).toMatchObject({ clientId: client.id, clientName: 'Hangul Loc' });

    const again = await req<Client>('POST', `/api/job-applications/${a.id}/client`);
    expect(again.id).toBe(client.id);
    expect((await req<Client[]>('GET', '/api/clients')).length).toBe(1);
  });

  it('papelera, búsqueda global y revisión semanal', async () => {
    const a = await newApp({
      title: 'Localization Specialist',
      company: 'Nexon Europe',
      kind: 'in_house',
    });
    await req(
      'POST',
      `/api/job-applications/${a.id}/events`,
      {
        kind: 'applied',
        date: '2026-09-29',
      },
      201,
    );
    await req(
      'POST',
      `/api/job-applications/${a.id}/events`,
      {
        kind: 'interview',
        date: '2026-10-08',
        time: '10:00',
      },
      201,
    );

    const found = await req<{ entityType: string; entityId: string }[]>(
      'GET',
      '/api/search?q=Nexon',
    );
    expect(found.some((r) => r.entityType === 'job_application' && r.entityId === a.id)).toBe(true);

    const review = await req<WeeklyReview>('GET', '/api/review/weekly?week=2026-09-28');
    expect(review.done.applications).toEqual({ sent: 1, responses: 0 });
    const next = await req<WeeklyReview>('GET', '/api/review/weekly?week=2026-09-28');
    expect(next.next.deadlines.map((d) => d.title)).toContain('Entrevista: Nexon Europe');

    await req('DELETE', `/api/job-applications/${a.id}`);
    expect(await req<JobApplication[]>('GET', '/api/job-applications')).toHaveLength(0);
    await req('GET', `/api/job-applications/${a.id}`, undefined, 404);
    const trash = await req<{ entityType: string; entityId: string; title: string }[]>(
      'GET',
      '/api/trash',
    );
    expect(trash.find((i) => i.entityType === 'job_application')?.title).toBe(
      'Localization Specialist · Nexon Europe',
    );
    await req('POST', '/api/trash/restore', { entityType: 'job_application', entityId: a.id });
    expect(await req<JobApplication[]>('GET', '/api/job-applications')).toHaveLength(1);
  });

  it('valida los datos con mensajes en español', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/job-applications',
      payload: { title: 'Sin empresa' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('Empresa');
  });
});
