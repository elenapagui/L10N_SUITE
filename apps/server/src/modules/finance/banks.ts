import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  bankAccountInputSchema,
  bankAccountUpdateSchema,
  bankBalanceSchema,
  formatMoney,
  idSchema,
  maskAccountNumber,
  todayISO,
  type BankAccount,
  type BankMovement,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { columns, decodeRow, insertRow, selectList, updateRow } from '../../lib/sql';
import { parse } from '../../lib/validate';
import { indexEntity } from '../../services/search';
import { moveToTrash, registerTrashable } from '../../services/trash';

const BANK_COLUMNS = columns({
  id: 'id',
  name: 'name',
  bankName: 'bank_name',
  accountNumber: 'account_number',
  currency: 'currency',
  balanceCents: 'balance_cents',
  balanceDate: 'balance_date',
  isDefault: { col: 'is_default', bool: true },
  color: 'color',
  notes: 'notes',
  active: { col: 'active', bool: true },
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

const BANK_SELECT = `SELECT ${selectList(BANK_COLUMNS, 'b')},
  (SELECT COUNT(*) FROM expenses e WHERE e.bank_account_id = b.id AND e.deleted_at IS NULL AND e.charged_at IS NULL) AS "pendingCount",
  (SELECT COALESCE(SUM(e.total_cents), 0) FROM expenses e WHERE e.bank_account_id = b.id AND e.deleted_at IS NULL AND e.charged_at IS NULL) AS "pendingCents"
  FROM bank_accounts b`;

function decode(r: Record<string, unknown>): BankAccount {
  return {
    ...decodeRow<BankAccount>(BANK_COLUMNS, r),
    pendingCount: Number(r.pendingCount ?? 0),
    pendingCents: Number(r.pendingCents ?? 0),
  };
}

export function getBankAccount(ctx: AppContext, id: string): BankAccount {
  const row = ctx.sqlite.prepare(`${BANK_SELECT} WHERE b.id = ? AND b.deleted_at IS NULL`).get(id);
  if (!row) throw new NotFoundError('La cuenta');
  return decode(row as Record<string, unknown>);
}

export function listBankAccounts(ctx: AppContext): BankAccount[] {
  return (
    ctx.sqlite
      .prepare(
        `${BANK_SELECT} WHERE b.deleted_at IS NULL ORDER BY b.is_default DESC, b.active DESC, lower(b.name)`,
      )
      .all() as Record<string, unknown>[]
  ).map(decode);
}

export function listMovements(ctx: AppContext, accountId: string): BankMovement[] {
  return ctx.sqlite
    .prepare(
      `SELECT id, account_id AS accountId, date, amount_cents AS amountCents, kind, expense_id AS expenseId,
         note, balance_after AS balanceAfter, created_at AS createdAt
       FROM bank_movements WHERE account_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 500`,
    )
    .all(accountId) as BankMovement[];
}

/** En la búsqueda solo se ve el número enmascarado, nunca el completo. */
function indexBank(ctx: AppContext, b: BankAccount) {
  indexEntity(ctx, {
    entityType: 'bank_account',
    entityId: b.id,
    title: b.name,
    subtitle: ['Cuenta bancaria', b.bankName, maskAccountNumber(b.accountNumber)]
      .filter(Boolean)
      .join(' · '),
    text: b.notes,
  });
}

function clearOtherDefaults(ctx: AppContext, id: string) {
  ctx.sqlite.prepare('UPDATE bank_accounts SET is_default = 0 WHERE id <> ?').run(id);
}

/** Suma (o resta, con importe negativo) al saldo y lo deja anotado en el historial. */
function moveBalance(
  ctx: AppContext,
  accountId: string,
  m: { amountCents: number; kind: BankMovement['kind']; expenseId?: string | null; note?: string },
  date = todayISO(ctx.now()),
) {
  const account = getBankAccount(ctx, accountId);
  const after = account.balanceCents + m.amountCents;
  ctx.sqlite
    .prepare('UPDATE bank_accounts SET balance_cents = ?, updated_at = ? WHERE id = ?')
    .run(after, ctx.nowISO(), accountId);
  ctx.sqlite
    .prepare(
      `INSERT INTO bank_movements (id, account_id, date, amount_cents, kind, expense_id, note, balance_after, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      accountId,
      date,
      m.amountCents,
      m.kind,
      m.expenseId ?? null,
      m.note ?? null,
      after,
      ctx.nowISO(),
    );
}

interface ExpenseRow {
  id: string;
  concept: string;
  currency: string;
  totalCents: number;
  bankAccountId: string | null;
  chargedAt: string | null;
  deletedAt: string | null;
}

function expenseRow(ctx: AppContext, id: string): ExpenseRow {
  const row = ctx.sqlite
    .prepare(
      `SELECT id, concept, currency, total_cents AS totalCents, bank_account_id AS bankAccountId,
         charged_at AS chargedAt, deleted_at AS deletedAt FROM expenses WHERE id = ?`,
    )
    .get(id) as ExpenseRow | undefined;
  if (!row) throw new NotFoundError('El gasto');
  return row;
}

/** «Cargar»: resta el gasto del saldo de su banco. */
export function chargeExpense(ctx: AppContext, expenseId: string): void {
  ctx.sqlite.transaction(() => {
    const e = expenseRow(ctx, expenseId);
    if (e.deletedAt) throw new NotFoundError('El gasto');
    if (e.chargedAt) throw new ValidationError('Este gasto ya está cargado.');
    if (!e.bankAccountId) throw new ValidationError('Elige antes el banco del gasto.');
    const account = getBankAccount(ctx, e.bankAccountId);
    if (account.currency !== e.currency)
      throw new ValidationError(
        `El gasto está en ${e.currency} y la cuenta en ${account.currency}: actualiza el saldo a mano con el importe que te han cobrado.`,
      );
    moveBalance(ctx, account.id, {
      amountCents: -e.totalCents,
      kind: 'charge',
      expenseId: e.id,
      note: e.concept,
    });
    ctx.sqlite
      .prepare('UPDATE expenses SET charged_at = ?, updated_at = ? WHERE id = ?')
      .run(todayISO(ctx.now()), ctx.nowISO(), e.id);
  })();
}

/** Deshace el cargo: devuelve el importe al saldo. */
export function unchargeExpense(ctx: AppContext, expenseId: string, note?: string): void {
  ctx.sqlite.transaction(() => {
    const e = expenseRow(ctx, expenseId);
    if (!e.chargedAt) return;
    // El cargo se hizo en la cuenta que tenía entonces el gasto.
    const charge = ctx.sqlite
      .prepare(
        `SELECT account_id AS accountId, amount_cents AS amountCents FROM bank_movements
         WHERE expense_id = ? AND kind = 'charge' ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      )
      .get(e.id) as { accountId: string; amountCents: number } | undefined;
    const accountId = charge?.accountId ?? e.bankAccountId;
    const live =
      accountId &&
      ctx.sqlite
        .prepare('SELECT 1 FROM bank_accounts WHERE id = ? AND deleted_at IS NULL')
        .get(accountId);
    if (accountId && live)
      moveBalance(ctx, accountId, {
        amountCents: charge ? -charge.amountCents : e.totalCents,
        kind: 'uncharge',
        expenseId: e.id,
        note: note ?? e.concept,
      });
    ctx.sqlite
      .prepare('UPDATE expenses SET charged_at = NULL, updated_at = ? WHERE id = ?')
      .run(ctx.nowISO(), e.id);
  })();
}

export function registerBankEntity(): void {
  registerTrashable({
    type: 'bank_account',
    table: 'bank_accounts',
    titleSql: 'name',
    // Si se va la cuenta principal, pasa a serlo otra activa.
    onTrash: (ctx) => {
      const hasDefault = ctx.sqlite
        .prepare('SELECT 1 FROM bank_accounts WHERE deleted_at IS NULL AND is_default = 1')
        .get();
      if (hasDefault) return;
      const next = ctx.sqlite
        .prepare(
          'SELECT id FROM bank_accounts WHERE deleted_at IS NULL ORDER BY active DESC, created_at LIMIT 1',
        )
        .get() as { id: string } | undefined;
      if (next)
        ctx.sqlite.prepare('UPDATE bank_accounts SET is_default = 1 WHERE id = ?').run(next.id);
    },
    onRestore: (ctx, id) => {
      // Vuelve como secundaria si ya hay otra principal.
      ctx.sqlite
        .prepare(
          `UPDATE bank_accounts SET is_default = 0 WHERE id = ? AND EXISTS
             (SELECT 1 FROM bank_accounts WHERE id <> ? AND deleted_at IS NULL AND is_default = 1)`,
        )
        .run(id, id);
      indexBank(ctx, getBankAccount(ctx, id));
    },
  });
}

export async function bankRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });

  app.get('/api/bank-accounts', async () => listBankAccounts(ctx));
  app.get('/api/bank-accounts/:id', async (req) =>
    getBankAccount(ctx, parse(idParam, req.params).id),
  );
  app.get('/api/bank-accounts/:id/movements', async (req) => {
    const { id } = parse(idParam, req.params);
    getBankAccount(ctx, id);
    return listMovements(ctx, id);
  });

  app.post('/api/bank-accounts', async (req, reply) => {
    const input = parse(bankAccountInputSchema, req.body);
    // La primera cuenta es la principal.
    const first = !ctx.sqlite.prepare('SELECT 1 FROM bank_accounts WHERE deleted_at IS NULL').get();
    let id = '';
    ctx.sqlite.transaction(() => {
      id = insertRow(ctx, 'bank_accounts', BANK_COLUMNS, {
        ...input,
        isDefault: input.isDefault || first,
        balanceDate: input.balanceDate ?? todayISO(ctx.now()),
      });
      if (input.isDefault || first) clearOtherDefaults(ctx, id);
      ctx.sqlite
        .prepare(
          `INSERT INTO bank_movements (id, account_id, date, amount_cents, kind, note, balance_after, created_at)
           VALUES (?, ?, ?, ?, 'adjust', 'Saldo inicial', ?, ?)`,
        )
        .run(
          newId(),
          id,
          input.balanceDate ?? todayISO(ctx.now()),
          input.balanceCents,
          input.balanceCents,
          ctx.nowISO(),
        );
    })();
    const b = getBankAccount(ctx, id);
    indexBank(ctx, b);
    reply.code(201);
    return b;
  });

  app.patch('/api/bank-accounts/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(bankAccountUpdateSchema, req.body);
    getBankAccount(ctx, id);
    ctx.sqlite.transaction(() => {
      updateRow(ctx, 'bank_accounts', BANK_COLUMNS, id, patch, { what: 'La cuenta' });
      if (patch.isDefault) clearOtherDefaults(ctx, id);
    })();
    const b = getBankAccount(ctx, id);
    indexBank(ctx, b);
    return b;
  });

  /** «Actualizar saldo»: lo que dice el banco en una fecha (queda en el historial). */
  app.post('/api/bank-accounts/:id/balance', async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(bankBalanceSchema, req.body);
    const before = getBankAccount(ctx, id);
    ctx.sqlite.transaction(() => {
      moveBalance(
        ctx,
        id,
        {
          amountCents: input.balanceCents - before.balanceCents,
          kind: 'adjust',
          note:
            input.note ??
            `Saldo actualizado: ${formatMoney(input.balanceCents, before.currency).replace(/\u00a0/g, ' ')}`,
        },
        input.date,
      );
      ctx.sqlite
        .prepare('UPDATE bank_accounts SET balance_date = ? WHERE id = ?')
        .run(input.date, id);
    })();
    return getBankAccount(ctx, id);
  });

  app.delete('/api/bank-accounts/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    getBankAccount(ctx, id);
    moveToTrash(ctx, 'bank_account', id);
    return { ok: true };
  });

  app.post('/api/expenses/:id/charge', async (req) => {
    const { id } = parse(idParam, req.params);
    chargeExpense(ctx, id);
    return { ok: true };
  });
  app.post('/api/expenses/:id/uncharge', async (req) => {
    const { id } = parse(idParam, req.params);
    unchargeExpense(ctx, id);
    return { ok: true };
  });
}
