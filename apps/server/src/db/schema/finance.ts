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
    ...timestamps(),
    ...softDelete(),
  },
  (t) => [index('expenses_date_idx').on(t.date)],
);
