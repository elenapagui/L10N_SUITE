import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Client, Job, Project, Reminder, Task, WeeklyReview } from '@l10n/shared';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;
let clock = new Date('2026-09-30T10:00:00');
beforeEach(async () => {
  clock = new Date('2026-09-30T10:00:00');
  t = await createTestApp({ now: () => clock });
});
afterEach(async () => {
  await t.cleanup();
});

async function req<T>(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  payload?: unknown,
  status?: number,
): Promise<T> {
  const res = await t.app.inject({ method, url, payload: payload as object });
  if (status) expect(res.statusCode, res.body).toBe(status);
  else expect(res.statusCode, res.body).toBeLessThan(300);
  return res.json() as T;
}

describe('revisión semanal', () => {
  it('resume la semana anterior y anticipa la siguiente', async () => {
    // Semana revisada: lunes 28/09 a domingo 04/10/2026.
    const client = await req<Client>('POST', '/api/clients', { name: 'Hangul Studio' });
    const project = await req<Project>('POST', '/api/projects', {
      name: 'Live ops',
      clientId: client.id,
    });
    const job = await req<Job>(
      'POST',
      '/api/jobs',
      {
        projectId: project.id,
        title: 'Parche 2.4',
        unit: 'char',
        volume: 8000,
        rateMicros: 30_000,
      },
      201,
    );
    await req('PATCH', `/api/jobs/${job.id}`, { status: 'delivered', deliveredAt: '2026-10-01' });
    await req(
      'POST',
      '/api/time-entries',
      { jobId: job.id, startedAt: '2026-09-29T08:00:00Z', endedAt: '2026-09-29T11:00:00Z' },
      201,
    );
    const task = await req<Task>('POST', '/api/tasks', { title: 'Glosario del parche' }, 201);
    await req('PATCH', `/api/tasks/${task.id}`, { statusId: 'status-done' });
    await req(
      'POST',
      '/api/jobs',
      { projectId: project.id, title: 'Evento de Halloween', dueDate: '2026-10-07' },
      201,
    );
    await req(
      'POST',
      '/api/publications',
      { title: 'Honoríficos en gacha', deadline: '2026-10-09' },
      201,
    );

    // El lunes siguiente aparece el aviso y la revisión es la de la semana anterior.
    clock = new Date('2026-10-05T09:00:00');
    const reminders = await req<Reminder[]>('GET', '/api/reminders');
    expect(reminders.map((r) => r.route)).toContain('/revision-semanal');

    const r = await req<WeeklyReview>('GET', '/api/review/weekly');
    expect(r).toMatchObject({
      weekStart: '2026-09-28',
      weekEnd: '2026-10-04',
      nextStart: '2026-10-05',
    });
    expect(r.done.delivered).toMatchObject({
      count: 1,
      cents: 24_000,
      units: [{ unit: 'char', volume: 8000 }],
    });
    expect(r.done.hours.total).toBeCloseTo(3);
    expect(r.done.hours.byArea[0]).toMatchObject({ name: 'Trabajo' });
    expect(r.done.tasksCompleted.titles).toContain('Glosario del parche');
    expect(r.done.academic.map((a) => a.summary).join(' ')).toContain('Honoríficos en gacha');
    expect(r.next.deliveries.map((d) => d.title)).toEqual(['Evento de Halloween']);
    expect(r.next.deadlines).toEqual([
      expect.objectContaining({
        kind: 'publication',
        title: expect.stringContaining('Honoríficos'),
      }),
    ]);

    // Se puede pedir cualquier semana.
    const other = await req<WeeklyReview>('GET', '/api/review/weekly?week=2026-10-08');
    expect(other.weekStart).toBe('2026-10-05');
    expect(other.done.delivered.count).toBe(0);
  });
});
