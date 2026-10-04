import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addDaysISO,
  formatMoney,
  idSchema,
  nextOccurrence,
  nextRecurrenceRule,
  percentOf,
  recurringExpenseInputSchema,
  recurringExpenseUpdateSchema,
  todayISO,
  type RecurrenceRule,
  type RecurringExpense,
  type RecurringFrequency,
  type Reminder,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { assertExists, columns, decodeRow, insertRow, selectList, updateRow } from '../../lib/sql';
import { parse } from '../../lib/validate';
import { getSettings } from '../../services/settings';
import { moveToTrash, registerTrashable } from '../../services/trash';
import { getExpense, indexExpense } from './expenses';

const REC_COLUMNS = columns({
  id: 'id',
  concept: 'concept',
  supplier: 'supplier',
  category: 'category',
  currency: 'currency',
  baseCents: 'base_cents',
  vatPct: 'vat_pct',
  deductible: { col: 'deductible', bool: true },
  bankAccountId: 'bank_account_id',
  frequency: 'frequency',
  interval: 'interval',
  startDate: 'start_date',
  nextDate: 'next_date',
  endDate: 'end_date',
  dayOfMonth: 'day_of_month',
  active: { col: 'active', bool: true },
  notes: 'notes',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

const REC_SELECT = `SELECT ${selectList(REC_COLUMNS, 'r')}, b.name AS "bankAccountName",
  (SELECT COUNT(*) FROM expenses e WHERE e.recurring_id = r.id AND e.deleted_at IS NULL) AS "generatedCount"
  FROM recurring_expenses r LEFT JOIN bank_accounts b ON b.id = r.bank_account_id AND b.deleted_at IS NULL`;

function decode(r: Record<string, unknown>): RecurringExpense {
  const rec = decodeRow<RecurringExpense>(REC_COLUMNS, r);
  const vatCents = percentOf(rec.baseCents, rec.vatPct);
  return {
    ...rec,
    vatCents,
    totalCents: rec.baseCents + vatCents,
    bankAccountName: (r.bankAccountName as string | null) ?? null,
    generatedCount: Number(r.generatedCount ?? 0),
  };
}

export function getRecurring(ctx: AppContext, id: string): RecurringExpense {
  const row = ctx.sqlite.prepare(`${REC_SELECT} WHERE r.id = ? AND r.deleted_at IS NULL`).get(id);
  if (!row) throw new NotFoundError('El gasto recurrente');
  return decode(row as Record<string, unknown>);
}

export function listRecurring(ctx: AppContext): RecurringExpense[] {
  return (
    ctx.sqlite
      .prepare(`${REC_SELECT} WHERE r.deleted_at IS NULL ORDER BY r.active DESC, r.next_date`)
      .all() as Record<string, unknown>[]
  ).map(decode);
}

/** Trimestral = mensual cada 3 meses; el día de referencia evita que el 31 derive al 28. */
function ruleOf(r: {
  frequency: RecurringFrequency;
  interval: number;
  dayOfMonth: number | null;
}): RecurrenceRule {
  const quarterly = r.frequency === 'quarterly';
  return {
    freq: quarterly ? 'monthly' : (r.frequency as RecurrenceRule['freq']),
    interval: Math.max(1, r.interval) * (quarterly ? 3 : 1),
    monthlyMode: 'same_day',
    dayOfMonth: r.dayOfMonth ?? undefined,
  };
}

/** Fecha siguiente a `date` y el día de referencia que hay que guardar. */
export function advance(
  date: string,
  r: { frequency: RecurringFrequency; interval: number; dayOfMonth: number | null },
): { next: string; dayOfMonth: number | null } {
  const rule = ruleOf(r);
  const next = nextOccurrence(date, rule);
  const anchored = nextRecurrenceRule(date, rule);
  return { next, dayOfMonth: anchored.dayOfMonth ?? null };
}

/**
 * Primera fecha de la serie que no ha pasado (hoy incluido), sin apuntar las de en medio: al
 * reanudar una suscripción pausada no se apuntan los meses en que estuvo pausada.
 */
function skipToToday(ctx: AppContext, id: string): void {
  const r = getRecurring(ctx, id);
  const today = todayISO(ctx.now());
  let next = r.nextDate;
  let dayOfMonth = r.dayOfMonth ?? Number(r.startDate.slice(8, 10));
  for (let guard = 0; guard < 2000 && next < today; guard++) {
    const step = advance(next, { ...r, dayOfMonth });
    next = step.next;
    dayOfMonth = step.dayOfMonth ?? dayOfMonth;
  }
  if (next === r.nextDate) return;
  ctx.sqlite
    .prepare(
      'UPDATE recurring_expenses SET next_date = ?, day_of_month = ?, updated_at = ? WHERE id = ?',
    )
    .run(next, dayOfMonth, ctx.nowISO(), id);
}

/** Cambio del último gasto de la serie (en moneda extranjera); si no hay, 1. */
function lastExchangeRate(ctx: AppContext, id: string, currency: string): number {
  if (currency === getSettings(ctx).preferences.baseCurrency) return 1;
  const row = ctx.sqlite
    .prepare(
      `SELECT exchange_rate AS rate FROM expenses WHERE recurring_id = ? AND currency = ?
       ORDER BY date DESC, created_at DESC LIMIT 1`,
    )
    .get(id, currency) as { rate: number } | undefined;
  return row?.rate ?? 1;
}

/**
 * Apunta los gastos recurrentes que ya tocan (hasta hoy), aunque la app haya estado cerrada
 * varios periodos. Es idempotente: cada gasto apuntado avanza la fecha del siguiente.
 */
export function generateRecurringExpenses(ctx: AppContext): number {
  if (ctx.integrity !== 'ok' || ctx.maintenance) return 0;
  const today = todayISO(ctx.now());
  let created = 0;
  const due = ctx.sqlite
    .prepare(
      `SELECT id FROM recurring_expenses WHERE deleted_at IS NULL AND active = 1 AND next_date <= ?
         AND (end_date IS NULL OR next_date <= end_date)`,
    )
    .all(today) as { id: string }[];
  for (const { id } of due) {
    ctx.sqlite.transaction(() => {
      const r = getRecurring(ctx, id);
      let next = r.nextDate;
      let dayOfMonth = r.dayOfMonth ?? Number(r.startDate.slice(8, 10));
      const rate = lastExchangeRate(ctx, r.id, r.currency);
      for (
        let guard = 0;
        guard < 400 && next <= today && (!r.endDate || next <= r.endDate);
        guard++
      ) {
        const vatCents = percentOf(r.baseCents, r.vatPct);
        const bankLive =
          r.bankAccountId &&
          ctx.sqlite
            .prepare('SELECT 1 FROM bank_accounts WHERE id = ? AND deleted_at IS NULL')
            .get(r.bankAccountId);
        const expenseId = newId();
        const now = ctx.nowISO();
        ctx.sqlite
          .prepare(
            `INSERT INTO expenses (id, date, supplier, concept, category, currency, exchange_rate, base_cents,
               vat_pct, vat_cents, total_cents, deductible, notes, bank_account_id, recurring_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            expenseId,
            next,
            r.supplier,
            r.concept,
            r.category,
            r.currency,
            rate,
            r.baseCents,
            r.vatPct,
            vatCents,
            r.baseCents + vatCents,
            r.deductible ? 1 : 0,
            r.notes,
            bankLive ? r.bankAccountId : null,
            r.id,
            now,
            now,
          );
        indexExpense(ctx, getExpense(ctx, expenseId));
        created++;
        const step = advance(next, { ...r, dayOfMonth });
        next = step.next;
        dayOfMonth = step.dayOfMonth ?? dayOfMonth;
      }
      ctx.sqlite
        .prepare(
          'UPDATE recurring_expenses SET next_date = ?, day_of_month = ?, updated_at = ? WHERE id = ?',
        )
        .run(next, dayOfMonth, ctx.nowISO(), id);
    })();
  }
  return created;
}

/** Aviso de los gastos apuntados solos en la última semana (uno por gasto). */
export function recurringReminders(ctx: AppContext): Reminder[] {
  const today = todayISO(ctx.now());
  const rows = ctx.sqlite
    .prepare(
      `SELECT e.id, e.concept, e.total_cents AS totalCents, e.currency, e.date,
         e.bank_account_id AS bankAccountId
       FROM expenses e JOIN recurring_expenses r ON r.id = e.recurring_id
       WHERE e.deleted_at IS NULL AND e.charged_at IS NULL AND e.date BETWEEN ? AND ?
         -- El gasto apuntado a mano al marcar «Se repite» no se ha apuntado solo.
         AND e.created_at >= r.created_at`,
    )
    .all(addDaysISO(today, -7), today) as {
    id: string;
    concept: string;
    totalCents: number;
    currency: string;
    date: string;
    bankAccountId: string | null;
  }[];
  return rows.map((e) => ({
    key: `recurring-expense:${e.id}`,
    title: 'Gasto recurrente apuntado',
    body: `${e.concept}: ${formatMoney(e.totalCents, e.currency).replace(/\u00a0/g, ' ')}. ${
      e.bankAccountId
        ? 'Cárgalo en tu banco cuando te lo cobren.'
        : 'Indica de qué banco sale para poder cargarlo.'
    }`,
    route: '/finanzas/gastos',
  }));
}

export function registerRecurringEntity(): void {
  registerTrashable({
    type: 'recurring_expense',
    table: 'recurring_expenses',
    titleSql: 'concept',
    onRestore: (ctx, id) => skipToToday(ctx, id),
  });
}

export async function recurringRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });

  app.get('/api/recurring-expenses', async () => {
    generateRecurringExpenses(ctx);
    return listRecurring(ctx);
  });

  app.post('/api/recurring-expenses', async (req, reply) => {
    const { fromExpenseId, ...body } = (req.body ?? {}) as Record<string, unknown>;
    const input = parse(recurringExpenseInputSchema, body);
    assertExists(ctx, 'bank_accounts', input.bankAccountId, 'La cuenta');
    const from = typeof fromExpenseId === 'string' ? fromExpenseId : null;
    if (from) getExpense(ctx, from);
    const dayOfMonth = Number(input.startDate.slice(8, 10));
    let id = '';
    ctx.sqlite.transaction(() => {
      // Desde un gasto ya apuntado («Se repite»): ese es el primero y el siguiente toca después.
      const step = from ? advance(input.startDate, { ...input, dayOfMonth }) : null;
      id = insertRow(ctx, 'recurring_expenses', REC_COLUMNS, {
        ...input,
        nextDate: step?.next ?? input.startDate,
        dayOfMonth: step?.dayOfMonth ?? dayOfMonth,
      });
      if (from)
        ctx.sqlite
          .prepare('UPDATE expenses SET recurring_id = ?, updated_at = ? WHERE id = ?')
          .run(id, ctx.nowISO(), from);
    })();
    // Si el primer cargo es hoy o ya pasó, se apunta en el acto.
    generateRecurringExpenses(ctx);
    reply.code(201);
    return getRecurring(ctx, id);
  });

  app.patch('/api/recurring-expenses/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(recurringExpenseUpdateSchema, req.body);
    const current = getRecurring(ctx, id);
    assertExists(ctx, 'bank_accounts', patch.bankAccountId, 'La cuenta');
    const values: Record<string, unknown> = { ...patch };
    // Cambiar el día del próximo cargo cambia también el día de referencia.
    if (patch.nextDate) values.dayOfMonth = Number(patch.nextDate.slice(8, 10));
    else if (patch.startDate && current.generatedCount === 0) {
      values.nextDate = patch.startDate;
      values.dayOfMonth = Number(patch.startDate.slice(8, 10));
    }
    ctx.sqlite.transaction(() => {
      updateRow(ctx, 'recurring_expenses', REC_COLUMNS, id, values, {
        what: 'El gasto recurrente',
      });
      // Al reanudarla no se apuntan los cargos del tiempo en pausa.
      if (patch.active === true && !current.active && !patch.nextDate) skipToToday(ctx, id);
    })();
    generateRecurringExpenses(ctx);
    return getRecurring(ctx, id);
  });

  app.delete('/api/recurring-expenses/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    getRecurring(ctx, id);
    moveToTrash(ctx, 'recurring_expense', id);
    return { ok: true };
  });
}
