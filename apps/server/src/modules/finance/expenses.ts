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
import { columns, decodeRow, insertRow, selectList, updateRow } from '../../lib/sql';
import { parse } from '../../lib/validate';
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
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

export function getExpense(ctx: AppContext, id: string): Expense {
  const row = ctx.sqlite
    .prepare(
      `SELECT ${selectList(EXPENSE_COLUMNS, 'e')} FROM expenses e WHERE e.id = ? AND e.deleted_at IS NULL`,
    )
    .get(id);
  if (!row) throw new NotFoundError('El gasto');
  return decodeRow<Expense>(EXPENSE_COLUMNS, row as Record<string, unknown>);
}

export function listExpenses(
  ctx: AppContext,
  f: { from?: string; to?: string; category?: string } = {},
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
  return (
    ctx.sqlite
      .prepare(
        `SELECT ${selectList(EXPENSE_COLUMNS, 'e')} FROM expenses e WHERE ${where.join(' AND ')} ORDER BY e.date DESC, e.created_at DESC`,
      )
      .all(...params) as Record<string, unknown>[]
  ).map((r) => decodeRow<Expense>(EXPENSE_COLUMNS, r));
}

function withTotals<T extends { baseCents?: number; vatPct?: number }>(e: T, current?: Expense) {
  const base = e.baseCents ?? current?.baseCents ?? 0;
  const pct = e.vatPct ?? current?.vatPct ?? 0;
  const vatCents = percentOf(base, pct);
  return { ...e, vatCents, totalCents: base + vatCents };
}

function indexExpense(ctx: AppContext, e: Expense) {
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
      }),
      req.query,
    );
    return listExpenses(ctx, q);
  });

  app.post('/api/expenses', async (req, reply) => {
    const input = parse(expenseInputSchema, req.body);
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
    updateRow(ctx, 'expenses', EXPENSE_COLUMNS, id, withTotals(patch, current), {
      what: 'El gasto',
    });
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
