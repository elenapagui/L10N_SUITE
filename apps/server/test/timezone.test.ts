import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WeeklyReview } from '@l10n/shared';
import { createTestApp, type TestApp } from './helpers';

// Las marcas de tiempo se guardan en UTC; los límites de la semana son los de la hora local.
const previousTz = process.env.TZ;
process.env.TZ = 'Europe/Madrid';
afterAll(() => {
  process.env.TZ = previousTz;
});

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: () => new Date('2026-10-06T10:00:00Z') });
});
afterEach(async () => {
  await t.cleanup();
});

describe('zona horaria', () => {
  it('la revisión semanal cuenta lo hecho cerca de medianoche en su semana local', async () => {
    const entry = async (startedAt: string, endedAt: string) => {
      const res = await t.app.inject({
        method: 'POST',
        url: '/api/time-entries',
        payload: { startedAt, endedAt, note: 'x' },
      });
      expect(res.statusCode, res.body).toBe(201);
    };
    // Lunes 28/09 de 00:30 a 01:30 en Madrid (domingo 27 en UTC): es de la semana revisada.
    await entry('2026-09-27T22:30:00Z', '2026-09-27T23:30:00Z');
    // Lunes 05/10 a las 00:30 en Madrid (domingo 4 en UTC): ya es de la semana siguiente.
    await entry('2026-10-04T22:30:00Z', '2026-10-04T23:00:00Z');
    const res = await t.app.inject({ method: 'GET', url: '/api/review/weekly?week=2026-09-28' });
    const review = res.json() as WeeklyReview;
    expect(review.done.hours.total).toBeCloseTo(1, 5);
  });
});
