import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { id, softDelete, timestamps } from './_columns';
import { clients } from './work';

export const invoices = sqliteTable(
  'invoices',
  {
    id: id(),
    number: text('number').notNull(),
    clientId: text('client_id').references(() => clients.id, { onDelete: 'set null' }),
    issueDate: text('issue_date').notNull(),
    dueDate: text('due_date'),
    currency: text('currency').notNull().default('EUR'),
    /** Unidades de la moneda principal por cada unidad de la moneda de la factura. */
    exchangeRate: real('exchange_rate').notNull().default(1),
    baseCents: integer('base_cents').notNull().default(0),
    vatPct: real('vat_pct').notNull().default(0),
    vatCents: integer('vat_cents').notNull().default(0),
    irpfPct: real('irpf_pct').notNull().default(0),
    irpfCents: integer('irpf_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    status: text('status').notNull().default('issued'),
    paidAt: text('paid_at'),
    extraLines: text('extra_lines', { mode: 'json' }).notNull().default('[]'),
    /** Encargos que tenía la factura al enviarla a la papelera (para restaurarla). */
    jobSnapshot: text('job_snapshot', { mode: 'json' }),
    notes: text('notes'),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [
    index('invoices_client_idx').on(t.clientId),
    index('invoices_issue_idx').on(t.issueDate),
    index('invoices_status_idx').on(t.status),
  ],
);

/** Cuentas bancarias: el saldo es manual y los gastos se «cargan» en él cuando se decide. */
export const bankAccounts = sqliteTable('bank_accounts', {
  id: id(),
  name: text('name').notNull(),
  bankName: text('bank_name'),
  accountNumber: text('account_number'),
  currency: text('currency').notNull().default('EUR'),
  balanceCents: integer('balance_cents').notNull().default(0),
  balanceDate: text('balance_date'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  color: text('color'),
  notes: text('notes'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  ...timestamps(),
  ...softDelete(),
});

/** Gastos que se repiten (dominio anual, suscripciones…): la app los apunta el día que tocan. */
export const recurringExpenses = sqliteTable(
  'recurring_expenses',
  {
    id: id(),
    concept: text('concept').notNull(),
    supplier: text('supplier'),
    category: text('category').notNull().default('other'),
    currency: text('currency').notNull().default('EUR'),
    baseCents: integer('base_cents').notNull(),
    vatPct: real('vat_pct').notNull().default(0),
    deductible: integer('deductible', { mode: 'boolean' }).notNull().default(true),
    bankAccountId: text('bank_account_id').references(() => bankAccounts.id, {
      onDelete: 'set null',
    }),
    frequency: text('frequency').notNull().default('monthly'),
    interval: integer('interval').notNull().default(1),
    startDate: text('start_date').notNull(),
    nextDate: text('next_date').notNull(),
    endDate: text('end_date'),
    dayOfMonth: integer('day_of_month'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    notes: text('notes'),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('recurring_expenses_next_idx').on(t.nextDate)],
);

export const expenses = sqliteTable(
  'expenses',
  {
    id: id(),
    date: text('date').notNull(),
    supplier: text('supplier'),
    concept: text('concept').notNull(),
    category: text('category').notNull().default('other'),
    currency: text('currency').notNull().default('EUR'),
    exchangeRate: real('exchange_rate').notNull().default(1),
    baseCents: integer('base_cents').notNull(),
    vatPct: real('vat_pct').notNull().default(0),
    vatCents: integer('vat_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    deductible: integer('deductible', { mode: 'boolean' }).notNull().default(true),
    notes: text('notes'),
    bankAccountId: text('bank_account_id').references(() => bankAccounts.id, {
      onDelete: 'set null',
    }),
    /** Cuándo se restó del saldo del banco (botón «Cargar»). */
    chargedAt: text('charged_at'),
    recurringId: text('recurring_id').references(() => recurringExpenses.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('expenses_date_idx').on(t.date), index('expenses_bank_idx').on(t.bankAccountId)],
);

/** Historial del saldo de cada cuenta: ajustes manuales y cargos de gastos. */
export const bankMovements = sqliteTable(
  'bank_movements',
  {
    id: id(),
    accountId: text('account_id')
      .notNull()
      .references(() => bankAccounts.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    amountCents: integer('amount_cents').notNull(),
    kind: text('kind').notNull(),
    expenseId: text('expense_id').references(() => expenses.id, { onDelete: 'set null' }),
    note: text('note'),
    balanceAfter: integer('balance_after').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('bank_movements_account_idx').on(t.accountId)],
);
