import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  EXPENSE_CATEGORIES,
  expenseInputSchema,
  expenseUpdateSchema,
  idSchema,
  labelOf,
  percentOf,
  type Expense,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError } from '../../lib/errors';
import { assertExists, columns, decodeRow, insertRow, selectList, updateRow } from '../../lib/sql';
import { parse, queryBool } from '../../lib/validate';
import { chargeExpense, unchargeExpense } from './banks';
import { generateRecurringExpenses } from './recurring';
import { indexEntity } from '../../services/search';
import { moveToTrash, registerTrashable } from '../../services/trash';

export const EXPENSE_COLUMNS = columns({
  id: 'id',
  date: 'date',
  supplier: 'supplier',
  concept: 'concept',
  category: 'category',
  currency: 'currency',
  exchangeRate: 'exchange_rate',
  baseCents: 'base_cents',
  vatPct: 'vat_pct',
  vatCents: 'vat_cents',
  totalCents: 'total_cents',
  deductible: { col: 'deductible', bool: true },
  notes: 'notes',
  bankAccountId: 'bank_account_id',
  chargedAt: 'charged_at',
  recurringId: 'recurring_id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

const EXPENSE_FROM = `FROM expenses e LEFT JOIN bank_accounts b ON b.id = e.bank_account_id AND b.deleted_at IS NULL`;
const decodeExpense = (r: Record<string, unknown>): Expense => ({
  ...decodeRow<Expense>(EXPENSE_COLUMNS, r),
  bankAccountName: (r.bankAccountName as string | null) ?? null,
});

export function getExpense(ctx: AppContext, id: string): Expense {
  const row = ctx.sqlite
    .prepare(
      `SELECT ${selectList(EXPENSE_COLUMNS, 'e')}, b.name AS "bankAccountName" ${EXPENSE_FROM} WHERE e.id = ? AND e.deleted_at IS NULL`,
    )
    .get(id);
  if (!row) throw new NotFoundError('El gasto');
  return decodeExpense(row as Record<string, unknown>);
}

export function listExpenses(
  ctx: AppContext,
  f: {
    from?: string;
    to?: string;
    category?: string;
    bankAccountId?: string;
    pending?: boolean;
  } = {},
): Expense[] {
  const where = ['e.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (f.from) {
    where.push('e.date >= ?');
    params.push(f.from);
  }
  if (f.to) {
    where.push('e.date < ?');
    params.push(f.to);
  }
  if (f.category) {
    where.push('e.category = ?');
    params.push(f.category);
  }
  if (f.bankAccountId) {
    where.push('e.bank_account_id = ?');
    params.push(f.bankAccountId);
  }
  if (f.pending) where.push('e.charged_at IS NULL');
  return (
    ctx.sqlite
      .prepare(
        `SELECT ${selectList(EXPENSE_COLUMNS, 'e')}, b.name AS "bankAccountName" ${EXPENSE_FROM} WHERE ${where.join(' AND ')} ORDER BY e.date DESC, e.created_at DESC`,
      )
      .all(...params) as Record<string, unknown>[]
  ).map(decodeExpense);
}

function withTotals<T extends { baseCents?: number; vatPct?: number }>(e: T, current?: Expense) {
  const base = e.baseCents ?? current?.baseCents ?? 0;
  const pct = e.vatPct ?? current?.vatPct ?? 0;
  const vatCents = percentOf(base, pct);
  return { ...e, vatCents, totalCents: base + vatCents };
}

export function indexExpense(ctx: AppContext, e: Expense) {
  indexEntity(ctx, {
    entityType: 'expense',
    entityId: e.id,
    title: e.concept,
    subtitle: [e.supplier, labelOf(EXPENSE_CATEGORIES, e.category)].filter(Boolean).join(' · '),
    text: e.notes,
  });
}

export function registerExpenseEntity(): void {
  registerTrashable({
    type: 'expense',
    table: 'expenses',
    titleSql: 'concept',
    // Un gasto borrado no ha salido del banco: se devuelve el importe al saldo.
    onTrash: (ctx, id) => unchargeExpense(ctx, id, 'Gasto enviado a la papelera'),
    onRestore: (ctx, id) => indexExpense(ctx, getExpense(ctx, id)),
  });
}

export async function expenseRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });

  app.get('/api/expenses', async (req) => {
    const q = parse(
      z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        category: z.string().optional(),
        bankAccountId: z.string().optional(),
        pending: queryBool,
      }),
      req.query,
    );
    // Los gastos recurrentes que ya tocan se apuntan antes de listar.
    generateRecurringExpenses(ctx);
    return listExpenses(ctx, q);
  });

  app.post('/api/expenses', async (req, reply) => {
    const input = parse(expenseInputSchema, req.body);
    assertExists(ctx, 'bank_accounts', input.bankAccountId, 'La cuenta');
    const id = insertRow(ctx, 'expenses', EXPENSE_COLUMNS, withTotals(input));
    const e = getExpense(ctx, id);
    indexExpense(ctx, e);
    reply.code(201);
    return e;
  });

  app.patch('/api/expenses/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(expenseUpdateSchema, req.body);
    const current = getExpense(ctx, id);
    assertExists(ctx, 'bank_accounts', patch.bankAccountId, 'La cuenta');
    const values = withTotals(patch, current);
    // Si ya estaba cargado y cambia el importe o el banco, se rehace el cargo.
    const recharge =
      current.chargedAt &&
      (values.totalCents !== current.totalCents ||
        (patch.bankAccountId !== undefined && patch.bankAccountId !== current.bankAccountId) ||
        (patch.currency !== undefined && patch.currency !== current.currency));
    ctx.sqlite.transaction(() => {
      if (recharge) unchargeExpense(ctx, id, 'Gasto modificado');
      updateRow(ctx, 'expenses', EXPENSE_COLUMNS, id, values, { what: 'El gasto' });
      if (recharge && (patch.bankAccountId ?? current.bankAccountId)) {
        try {
          chargeExpense(ctx, id);
        } catch {
          // Sin banco o en otra moneda: queda pendiente de cargar.
        }
      }
    })();
    const e = getExpense(ctx, id);
    indexExpense(ctx, e);
    return e;
  });

  app.delete('/api/expenses/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    moveToTrash(ctx, 'expense', id);
    return { ok: true };
  });
}
