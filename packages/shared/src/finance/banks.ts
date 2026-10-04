import { z } from 'zod';
import { isoDateSchema, optionalText, patchSchema, requiredText } from '../schemas/common';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from './finance';

const optDate = isoDateSchema.nullish().transform((v) => v ?? null);
const optId = z
  .string()
  .max(64)
  .nullish()
  .transform((v) => v ?? null);

// ── Bancos ─────────────────────────────────────────────────────────────────
export const bankAccountInputSchema = z.object({
  name: requiredText('Nombre de la cuenta', 120),
  bankName: optionalText(120),
  accountNumber: optionalText(60),
  currency: z.string().length(3).default('EUR'),
  balanceCents: z.number().int().min(-1e13).max(1e13).default(0),
  balanceDate: optDate,
  isDefault: z.boolean().default(false),
  color: optionalText(9),
  notes: optionalText(5000),
  active: z.boolean().default(true),
});
/** El saldo no se cambia con PATCH: se ajusta con «Actualizar saldo» (queda en el historial). */
export const bankAccountUpdateSchema = patchSchema(
  bankAccountInputSchema.omit({ balanceCents: true, balanceDate: true }),
);

export const bankBalanceSchema = z.object({
  balanceCents: z.number().int().min(-1e13).max(1e13),
  date: isoDateSchema,
  note: optionalText(500),
});

export interface BankAccount {
  id: string;
  name: string;
  bankName: string | null;
  accountNumber: string | null;
  currency: string;
  balanceCents: number;
  balanceDate: string | null;
  isDefault: boolean;
  color: string | null;
  notes: string | null;
  active: boolean;
  /** Gastos de esta cuenta aún sin cargar. */
  pendingCount: number;
  pendingCents: number;
  createdAt: string;
  updatedAt: string;
}

export const BANK_MOVEMENT_KINDS = [
  { value: 'adjust', label: 'Saldo actualizado' },
  { value: 'charge', label: 'Cargo' },
  { value: 'uncharge', label: 'Cargo deshecho' },
] as const;

export interface BankMovement {
  id: string;
  accountId: string;
  date: string;
  amountCents: number;
  kind: 'adjust' | 'charge' | 'uncharge';
  expenseId: string | null;
  note: string | null;
  balanceAfter: number;
  createdAt: string;
}

/** «ES12 3456 7890 1234 5678 9012» → «ES12 •••• 9012». */
export function maskAccountNumber(n: string | null | undefined): string {
  if (!n) return '';
  const compact = n.replace(/\s+/g, '');
  if (compact.length <= 8) return compact;
  return `${compact.slice(0, 4)} •••• ${compact.slice(-4)}`;
}

/** Agrupa un IBAN de cuatro en cuatro para leerlo mejor. */
export function formatAccountNumber(n: string | null | undefined): string {
  if (!n) return '';
  return n
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

// ── Gastos recurrentes ─────────────────────────────────────────────────────
export const RECURRING_FREQUENCIES = [
  { value: 'weekly', label: 'Cada semana', plural: 'semanas' },
  { value: 'monthly', label: 'Cada mes', plural: 'meses' },
  { value: 'quarterly', label: 'Cada trimestre', plural: 'trimestres' },
  { value: 'yearly', label: 'Cada año', plural: 'años' },
] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number]['value'];

export function describeFrequency(frequency: RecurringFrequency, interval = 1): string {
  const f = RECURRING_FREQUENCIES.find((x) => x.value === frequency)!;
  return interval > 1 ? `Cada ${interval} ${f.plural}` : f.label;
}

export const recurringExpenseInputSchema = z.object({
  concept: requiredText('Concepto', 500),
  supplier: optionalText(200),
  category: z
    .enum(EXPENSE_CATEGORIES.map((c) => c.value) as [ExpenseCategory, ...ExpenseCategory[]])
    .default('other'),
  currency: z.string().length(3).default('EUR'),
  baseCents: z.number().int().min(0).max(1e12),
  vatPct: z.number().min(0).max(100).default(21),
  deductible: z.boolean().default(true),
  bankAccountId: optId,
  frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).default('monthly'),
  interval: z.number().int().min(1).max(36).default(1),
  /** Primer cargo. */
  startDate: isoDateSchema,
  endDate: optDate,
  active: z.boolean().default(true),
  notes: optionalText(5000),
});
export const recurringExpenseUpdateSchema = patchSchema(recurringExpenseInputSchema).extend({
  nextDate: isoDateSchema.optional(),
});

export interface RecurringExpense {
  id: string;
  concept: string;
  supplier: string | null;
  category: ExpenseCategory;
  currency: string;
  baseCents: number;
  vatPct: number;
  vatCents: number;
  totalCents: number;
  deductible: boolean;
  bankAccountId: string | null;
  bankAccountName: string | null;
  frequency: RecurringFrequency;
  interval: number;
  startDate: string;
  nextDate: string;
  endDate: string | null;
  dayOfMonth: number | null;
  active: boolean;
  notes: string | null;
  /** Gastos ya apuntados a partir de esta plantilla. */
  generatedCount: number;
  createdAt: string;
  updatedAt: string;
}
