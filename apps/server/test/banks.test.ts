import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BankAccount, BankMovement, Expense } from '@l10n/shared';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: () => new Date('2026-10-05T10:00:00') });
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

const bank = (body: Record<string, unknown> = {}) =>
  req<BankAccount>(
    'POST',
    '/api/bank-accounts',
    {
      name: 'Cuenta autónomos',
      bankName: 'Banco Ejemplo',
      accountNumber: 'ES12 3456 7890 1234 5678 9012',
      balanceCents: 100_000,
      ...body,
    },
    201,
  );

const expense = (body: Record<string, unknown> = {}) =>
  req<Expense>(
    'POST',
    '/api/expenses',
    {
      date: '2026-10-05',
      concept: 'Dominio web',
      category: 'marketing',
      baseCents: 1_000,
      vatPct: 21,
      ...body,
    },
    201,
  );

const balance = async (id: string) =>
  (await req<BankAccount>('GET', `/api/bank-accounts/${id}`)).balanceCents;

describe('bancos', () => {
  it('la primera cuenta es la principal y solo hay una principal', async () => {
    const a = await bank();
    expect(a).toMatchObject({ isDefault: true, balanceCents: 100_000, balanceDate: '2026-10-05' });
    const b = await bank({ name: 'Ahorro', isDefault: true });
    expect(b.isDefault).toBe(true);
    expect((await req<BankAccount>('GET', `/api/bank-accounts/${a.id}`)).isDefault).toBe(false);
  });

  it('el saldo es manual: «Cargar» lo resta y se puede deshacer', async () => {
    const a = await bank();
    const e = await expense({ bankAccountId: a.id });
    expect(e).toMatchObject({
      bankAccountName: 'Cuenta autónomos',
      chargedAt: null,
      totalCents: 1_210,
    });
    // Asociar el gasto no mueve el saldo.
    expect(await balance(a.id)).toBe(100_000);
    let acc = await req<BankAccount>('GET', `/api/bank-accounts/${a.id}`);
    expect(acc).toMatchObject({ pendingCount: 1, pendingCents: 1_210 });

    await req('POST', `/api/expenses/${e.id}/charge`);
    expect(await balance(a.id)).toBe(98_790);
    acc = await req<BankAccount>('GET', `/api/bank-accounts/${a.id}`);
    expect(acc.pendingCount).toBe(0);
    expect((await req<Expense[]>('GET', '/api/expenses'))[0]!.chargedAt).toBe('2026-10-05');
    // Cargar dos veces no resta dos veces.
    await req('POST', `/api/expenses/${e.id}/charge`, undefined, 400);

    await req('POST', `/api/expenses/${e.id}/uncharge`);
    expect(await balance(a.id)).toBe(100_000);

    const moves = await req<BankMovement[]>('GET', `/api/bank-accounts/${a.id}/movements`);
    expect(moves.map((m) => [m.kind, m.amountCents, m.balanceAfter])).toEqual([
      ['uncharge', 1_210, 100_000],
      ['charge', -1_210, 98_790],
      ['adjust', 100_000, 100_000],
    ]);
  });

  it('actualizar el saldo a mano queda en el historial', async () => {
    const a = await bank();
    const updated = await req<BankAccount>('POST', `/api/bank-accounts/${a.id}/balance`, {
      balanceCents: 87_550,
      date: '2026-10-04',
    });
    expect(updated).toMatchObject({ balanceCents: 87_550, balanceDate: '2026-10-04' });
    const [last] = await req<BankMovement[]>('GET', `/api/bank-accounts/${a.id}/movements`);
    expect(last).toMatchObject({ kind: 'adjust', amountCents: -12_450, balanceAfter: 87_550 });
    // El PATCH no cambia el saldo (solo «Actualizar saldo»).
    await req('PATCH', `/api/bank-accounts/${a.id}`, { balanceCents: 1, name: 'Principal' });
    expect(await balance(a.id)).toBe(87_550);
  });

  it('sin banco o en otra moneda no se puede cargar', async () => {
    const a = await bank();
    const noBank = await expense();
    const r1 = await t.app.inject({ method: 'POST', url: `/api/expenses/${noBank.id}/charge` });
    expect(r1.statusCode).toBe(400);
    expect(r1.json().message).toContain('banco');
    const usd = await expense({ bankAccountId: a.id, currency: 'USD', exchangeRate: 0.9 });
    const r2 = await t.app.inject({ method: 'POST', url: `/api/expenses/${usd.id}/charge` });
    expect(r2.statusCode).toBe(400);
    expect(r2.json().message).toContain('USD');
    expect(await balance(a.id)).toBe(100_000);
  });

  it('editar un gasto cargado rehace el cargo; borrarlo devuelve el importe', async () => {
    const a = await bank();
    const b = await bank({ name: 'Ahorro', balanceCents: 50_000 });
    const e = await expense({ bankAccountId: a.id });
    await req('POST', `/api/expenses/${e.id}/charge`);
    expect(await balance(a.id)).toBe(98_790);

    // Cambia el importe: se ajusta la diferencia.
    await req('PATCH', `/api/expenses/${e.id}`, { baseCents: 2_000 });
    expect(await balance(a.id)).toBe(97_580);
    // Cambia de banco: vuelve a la primera y se carga en la segunda.
    await req('PATCH', `/api/expenses/${e.id}`, { bankAccountId: b.id });
    expect(await balance(a.id)).toBe(100_000);
    expect(await balance(b.id)).toBe(47_580);

    // A la papelera: el dinero vuelve y, al restaurarlo, queda pendiente de cargar.
    await req('DELETE', `/api/expenses/${e.id}`);
    expect(await balance(b.id)).toBe(50_000);
    await req('POST', '/api/trash/restore', { entityType: 'expense', entityId: e.id });
    const restored = (await req<Expense[]>('GET', '/api/expenses'))[0]!;
    expect(restored.chargedAt).toBeNull();
    expect(await balance(b.id)).toBe(50_000);
  });

  it('la búsqueda no muestra el número de cuenta completo', async () => {
    await bank();
    const found = await req<{ title: string; subtitle: string | null }[]>(
      'GET',
      '/api/search?q=autonomos',
    );
    const hit = found.find((r) => r.title === 'Cuenta autónomos')!;
    expect(hit.subtitle).toContain('ES12 •••• 9012');
    expect(JSON.stringify(found)).not.toContain('3456 7890');
  });
});
