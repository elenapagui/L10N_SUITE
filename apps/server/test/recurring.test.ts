import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BankAccount, Expense, RecurringExpense, Reminder } from '@l10n/shared';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;
let clock = new Date('2026-01-31T10:00:00');
beforeEach(async () => {
  clock = new Date('2026-01-31T10:00:00');
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

const dates = async (concept: string) =>
  (await req<Expense[]>('GET', '/api/expenses'))
    .filter((e) => e.concept === concept)
    .map((e) => e.date)
    .sort();

describe('gastos recurrentes', () => {
  it('mensual del día 31: se apunta solo, vuelve al 31 y se pone al día', async () => {
    const bank = await req<BankAccount>(
      'POST',
      '/api/bank-accounts',
      { name: 'Principal', balanceCents: 50_000 },
      201,
    );
    const r = await req<RecurringExpense>(
      'POST',
      '/api/recurring-expenses',
      {
        concept: 'Netflix',
        category: 'other',
        baseCents: 1_074,
        vatPct: 21,
        frequency: 'monthly',
        startDate: '2026-01-31',
        bankAccountId: bank.id,
        deductible: false,
      },
      201,
    );
    // El primer cargo es hoy: ya está apuntado, con su banco y sin cargar.
    expect(r).toMatchObject({ nextDate: '2026-02-28', generatedCount: 1, totalCents: 1_300 });
    const [first] = (await req<Expense[]>('GET', '/api/expenses')).filter(
      (e) => e.concept === 'Netflix',
    );
    expect(first).toMatchObject({
      date: '2026-01-31',
      totalCents: 1_300,
      bankAccountId: bank.id,
      chargedAt: null,
      recurringId: r.id,
      deductible: false,
    });
    // Asociado al banco, pero el saldo no cambia hasta «Cargar».
    expect((await req<BankAccount>('GET', `/api/bank-accounts/${bank.id}`)).balanceCents).toBe(
      50_000,
    );

    // La app estuvo cerrada hasta mayo: se apuntan los meses pendientes, sin derivar al 28.
    clock = new Date('2026-05-02T09:00:00');
    expect(await dates('Netflix')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    // Volver a pedirlos no duplica nada.
    expect(await dates('Netflix')).toHaveLength(4);
    const after = await req<RecurringExpense[]>('GET', '/api/recurring-expenses');
    expect(after[0]).toMatchObject({ nextDate: '2026-05-31', generatedCount: 4 });

    // Aviso de lo apuntado en la última semana.
    clock = new Date('2026-06-01T09:00:00');
    await req('GET', '/api/expenses');
    const reminders = await req<Reminder[]>('GET', '/api/reminders');
    expect(reminders.find((x) => x.title === 'Gasto recurrente apuntado')?.body).toContain(
      'Netflix',
    );
  });

  it('anual y trimestral, con fecha de fin y pausa', async () => {
    await req(
      'POST',
      '/api/recurring-expenses',
      {
        concept: 'Dominio web',
        category: 'marketing',
        baseCents: 1_500,
        frequency: 'yearly',
        startDate: '2026-03-15',
      },
      201,
    );
    const q = await req<RecurringExpense>(
      'POST',
      '/api/recurring-expenses',
      {
        concept: 'Gestoría',
        category: 'advisor',
        baseCents: 9_000,
        frequency: 'quarterly',
        startDate: '2026-01-31',
        endDate: '2026-08-01',
      },
      201,
    );
    clock = new Date('2028-01-01T09:00:00');
    expect(await dates('Dominio web')).toEqual(['2026-03-15', '2027-03-15']);
    // Trimestral hasta agosto: enero, abril y julio.
    expect(await dates('Gestoría')).toEqual(['2026-01-31', '2026-04-30', '2026-07-31']);

    // En pausa no se apunta nada.
    const domain = (await req<RecurringExpense[]>('GET', '/api/recurring-expenses')).find(
      (x) => x.concept === 'Dominio web',
    )!;
    await req('PATCH', `/api/recurring-expenses/${domain.id}`, { active: false });
    clock = new Date('2029-01-01T09:00:00');
    expect(await dates('Dominio web')).toEqual(['2026-03-15', '2027-03-15']);
    expect(q.frequency).toBe('quarterly');
  });

  it('«Se repite» desde un gasto ya apuntado no lo duplica', async () => {
    const e = await req<Expense>(
      'POST',
      '/api/expenses',
      { date: '2026-01-31', concept: 'Spotify', baseCents: 900, vatPct: 21 },
      201,
    );
    const r = await req<RecurringExpense>(
      'POST',
      '/api/recurring-expenses',
      {
        concept: 'Spotify',
        baseCents: 900,
        frequency: 'monthly',
        startDate: '2026-01-31',
        fromExpenseId: e.id,
      },
      201,
    );
    expect(r).toMatchObject({ nextDate: '2026-02-28', generatedCount: 1 });
    expect(await dates('Spotify')).toEqual(['2026-01-31']);
    const [first] = await req<Expense[]>('GET', '/api/expenses');
    expect(first!.recurringId).toBe(r.id);
  });

  it('con el primer cargo en el futuro no apunta nada todavía', async () => {
    const r = await req<RecurringExpense>(
      'POST',
      '/api/recurring-expenses',
      { concept: 'Hosting', baseCents: 500, frequency: 'monthly', startDate: '2026-02-10' },
      201,
    );
    expect(r).toMatchObject({ nextDate: '2026-02-10', generatedCount: 0 });
    expect(await dates('Hosting')).toEqual([]);
    // Cambiar el primer cargo antes de que se apunte nada mueve el próximo.
    const moved = await req<RecurringExpense>('PATCH', `/api/recurring-expenses/${r.id}`, {
      startDate: '2026-02-20',
    });
    expect(moved.nextDate).toBe('2026-02-20');
  });
});
