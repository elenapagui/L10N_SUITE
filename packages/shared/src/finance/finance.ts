import { z } from 'zod';
import { isoDateSchema, optionalText, patchSchema, requiredText } from '../schemas/common';
import { percentOf } from '../money';

export const INVOICE_STATUSES = [
  { value: 'issued', label: 'Emitida' },
  { value: 'paid', label: 'Cobrada' },
  { value: 'cancelled', label: 'Anulada' },
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]['value'];

export const EXPENSE_CATEGORIES = [
  { value: 'software', label: 'Software y licencias (CAT, QA…)' },
  { value: 'hardware', label: 'Equipos informáticos' },
  { value: 'training', label: 'Formación y congresos' },
  { value: 'associations', label: 'Asociaciones profesionales' },
  { value: 'social_security', label: 'Cuota de autónomos' },
  { value: 'advisor', label: 'Gestoría y asesoría' },
  { value: 'books', label: 'Libros y documentación' },
  { value: 'office', label: 'Material de oficina' },
  { value: 'utilities', label: 'Suministros (internet, teléfono…)' },
  { value: 'travel', label: 'Viajes y desplazamientos' },
  { value: 'bank', label: 'Comisiones bancarias y de pago' },
  { value: 'marketing', label: 'Web y promoción' },
  { value: 'other', label: 'Otros' },
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['value'];

export interface InvoiceLine {
  description: string;
  amountCents: number;
}

export interface InvoiceTotals {
  baseCents: number;
  vatCents: number;
  irpfCents: number;
  totalCents: number;
}

/** Base, IVA, retención de IRPF y total (base + IVA − IRPF), redondeados al céntimo. */
export function invoiceTotals(baseCents: number, vatPct: number, irpfPct: number): InvoiceTotals {
  const vatCents = percentOf(baseCents, vatPct);
  const irpfCents = percentOf(baseCents, irpfPct);
  return { baseCents, vatCents, irpfCents, totalCents: baseCents + vatCents - irpfCents };
}

/** Trimestre natural de una fecha ISO. */
export function quarterOf(date: string): { year: number; quarter: 1 | 2 | 3 | 4 } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return { year, quarter: (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4 };
}

/** Primer día del trimestre y primer día del siguiente (intervalo [desde, hasta)). */
export function quarterRange(year: number, quarter: number): { from: string; to: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  const from = `${year}-${String(startMonth).padStart(2, '0')}-01`;
  const to =
    quarter === 4 ? `${year + 1}-01-01` : `${year}-${String(startMonth + 3).padStart(2, '0')}-01`;
  return { from, to };
}

const lineSchema = z.object({
  description: requiredText('Concepto', 500),
  amountCents: z.number().int().min(-1e12).max(1e12),
});

export const invoiceInputSchema = z.object({
  number: requiredText('Número', 60),
  clientId: z.string().min(1, 'Elige un cliente'),
  issueDate: isoDateSchema,
  dueDate: isoDateSchema.nullish().transform((v) => v ?? null),
  jobIds: z.array(z.string().min(1)).max(500).default([]),
  extraLines: z.array(lineSchema).max(50).default([]),
  vatPct: z
    .number()
    .min(0)
    .max(100)
    .nullish()
    .transform((v) => v ?? null),
  irpfPct: z
    .number()
    .min(0)
    .max(100)
    .nullish()
    .transform((v) => v ?? null),
  currency: z
    .string()
    .length(3)
    .nullish()
    .transform((v) => v ?? null),
  exchangeRate: z
    .number()
    .positive()
    .max(1e6)
    .nullish()
    .transform((v) => v ?? null),
  notes: optionalText(10_000),
});
export const invoiceUpdateSchema = patchSchema(invoiceInputSchema.omit({ clientId: true }));

export const expenseInputSchema = z.object({
  date: isoDateSchema,
  supplier: optionalText(200),
  concept: requiredText('Concepto', 500),
  category: z
    .enum(EXPENSE_CATEGORIES.map((c) => c.value) as [ExpenseCategory, ...ExpenseCategory[]])
    .default('other'),
  currency: z.string().length(3).default('EUR'),
  exchangeRate: z.number().positive().max(1e6).default(1),
  baseCents: z.number().int().min(-1e12).max(1e12),
  vatPct: z.number().min(0).max(100).default(21),
  deductible: z.boolean().default(true),
  notes: optionalText(10_000),
});
export const expenseUpdateSchema = patchSchema(expenseInputSchema);

export interface Invoice {
  id: string;
  number: string;
  clientId: string | null;
  clientName: string | null;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  exchangeRate: number;
  baseCents: number;
  vatPct: number;
  vatCents: number;
  irpfPct: number;
  irpfCents: number;
  totalCents: number;
  status: InvoiceStatus;
  paidAt: string | null;
  extraLines: InvoiceLine[];
  notes: string | null;
  jobCount: number;
  /** Días de retraso (solo emitidas y vencidas). */
  overdueDays: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  date: string;
  supplier: string | null;
  concept: string;
  category: ExpenseCategory;
  currency: string;
  exchangeRate: number;
  baseCents: number;
  vatPct: number;
  vatCents: number;
  totalCents: number;
  deductible: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PendingBillingGroup {
  clientId: string | null;
  clientName: string | null;
  currency: string;
  totalCents: number;
  jobs: import('../work/types').Job[];
}

export interface BreakdownRow {
  key: string;
  label: string;
  cents: number;
  count: number;
}

export interface FinanceOverview {
  year: number;
  baseCurrency: string;
  months: { month: string; invoicedCents: number; paidCents: number; expensesCents: number }[];
  totals: {
    invoicedCents: number;
    paidCents: number;
    expensesCents: number;
    netCents: number;
    pendingCollectionCents: number;
    pendingBillingCents: number;
  };
  byClient: BreakdownRow[];
  byService: BreakdownRow[];
  byGame: BreakdownRow[];
  byPair: BreakdownRow[];
  receivables: {
    bucket: 'current' | 'd30' | 'd60' | 'd90' | 'older';
    label: string;
    cents: number;
    count: number;
  }[];
  paymentDays: { clientName: string; days: number; invoices: number }[];
  effectiveHourlyCents: number | null;
}

export interface QuarterReport {
  year: number;
  quarter: number;
  from: string;
  to: string;
  baseCurrency: string;
  invoicesCount: number;
  incomeBaseCents: number;
  vatChargedCents: number;
  irpfWithheldCents: number;
  expensesBaseCents: number;
  vatDeductibleCents: number;
  model303Cents: number;
  ytdIncomeBaseCents: number;
  ytdExpensesBaseCents: number;
  ytdNetCents: number;
  ytdWithheldCents: number;
  previousPaymentsCents: number;
  model130Cents: number;
  withholdingSharePct: number;
}
