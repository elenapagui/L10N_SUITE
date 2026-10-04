import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pause, Play, Plus, Repeat, Trash2, Undo2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  CURRENCIES,
  EXPENSE_CATEGORIES,
  RECURRING_FREQUENCIES,
  describeFrequency,
  formatDateES,
  formatMoney,
  formatNumber,
  labelOf,
  percentOf,
  todayISO,
  type BankAccount,
  type Expense,
  type ExpenseCategory,
  type RecurringExpense,
  type RecurringFrequency,
} from '@l10n/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/misc';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AttachmentsPanel } from '@/components/common/AttachmentsPanel';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { DecimalInput } from '@/components/common/inputs';
import { EmptyState, Page, PageHeader } from '@/components/layout/PageHeader';
import { useSettings } from '@/hooks/core';
import { useTrashWithUndo } from '@/hooks/mutations';
import { api } from '@/lib/api';
import { Stat } from '@/features/work/shared';
import { EXPENSE_KEYS, useBankAccounts, useExpenses, useRecurringExpenses } from './hooks';

function useRefreshExpenses() {
  const qc = useQueryClient();
  return () => Promise.all(EXPENSE_KEYS.map((k) => qc.invalidateQueries({ queryKey: k })));
}

/** «Cargar»: resta el gasto del saldo de su banco (o lo deshace). */
export function useCharge() {
  const refresh = useRefreshExpenses();
  return async (e: Pick<Expense, 'id' | 'concept'>, undo = false) => {
    try {
      await api(`/expenses/${e.id}/${undo ? 'uncharge' : 'charge'}`, { method: 'POST' });
      toast.success(undo ? `Cargo deshecho: ${e.concept}` : `Cargado: ${e.concept}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido cargar.');
    }
    await refresh();
  };
}

export function ChargeCell({ e, banks }: { e: Expense; banks: BankAccount[] }) {
  const charge = useCharge();
  if (e.chargedAt)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        Cargado el {formatDateES(e.chargedAt)}
        <button
          type="button"
          className="rounded p-0.5 hover:bg-accent"
          aria-label="Deshacer el cargo"
          title="Deshacer el cargo (devuelve el importe al saldo)"
          onClick={(ev) => {
            ev.stopPropagation();
            void charge(e, true);
          }}
        >
          <Undo2 className="size-3.5" />
        </button>
      </span>
    );
  if (!e.bankAccountId || !banks.some((b) => b.id === e.bankAccountId))
    return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7"
      onClick={(ev) => {
        ev.stopPropagation();
        void charge(e);
      }}
      data-testid="expense-charge"
    >
      Cargar
    </Button>
  );
}

function BankSelect({
  value,
  onChange,
  banks,
  testId,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  banks: BankAccount[];
  testId?: string;
}) {
  return (
    <NativeSelect
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      data-testid={testId}
    >
      <option value="">Sin banco</option>
      {banks
        .filter((b) => b.active || b.id === value)
        .map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
            {b.bankName ? ` · ${b.bankName}` : ''}
          </option>
        ))}
    </NativeSelect>
  );
}

interface Draft {
  date: string;
  supplier: string;
  concept: string;
  category: ExpenseCategory;
  currency: string;
  exchangeRate: number;
  baseCents: number | null;
  vatPct: number;
  deductible: boolean;
  notes: string;
  bankAccountId: string | null;
}

function toDraft(e: Expense | null, currency: string, bankId: string | null): Draft {
  return e
    ? {
        date: e.date,
        supplier: e.supplier ?? '',
        concept: e.concept,
        category: e.category,
        currency: e.currency,
        exchangeRate: e.exchangeRate,
        baseCents: e.baseCents,
        vatPct: e.vatPct,
        deductible: e.deductible,
        notes: e.notes ?? '',
        bankAccountId: e.bankAccountId,
      }
    : {
        date: todayISO(),
        supplier: '',
        concept: '',
        category: 'software',
        currency,
        exchangeRate: 1,
        baseCents: null,
        vatPct: 21,
        deductible: true,
        notes: '',
        bankAccountId: bankId,
      };
}

function ExpenseDialog({
  expense,
  open,
  onOpenChange,
}: {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const settings = useSettings();
  const banks = useBankAccounts();
  const refresh = useRefreshExpenses();
  const baseCurrency = settings.data?.preferences.baseCurrency ?? 'EUR';
  const defaultBank = banks.data?.find((b) => b.isDefault && b.active)?.id ?? null;
  const [d, setD] = useState<Draft>(() => toDraft(expense, baseCurrency, defaultBank));
  const [savedId, setSavedId] = useState<string | null>(expense?.id ?? null);
  const [repeat, setRepeat] = useState(false);
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [busy, setBusy] = useState(false);
  const bankTouched = useRef(false);
  // Solo al abrir: si los bancos o los ajustes llegan después, no se pierde lo escrito.
  useEffect(() => {
    if (open) {
      setD(toDraft(expense, baseCurrency, defaultBank));
      setSavedId(expense?.id ?? null);
      setRepeat(false);
      setFrequency('monthly');
      bankTouched.current = false;
    }
  }, [open, expense]); // eslint-disable-line react-hooks/exhaustive-deps
  // La cuenta principal, si llega con el diálogo ya abierto y aún no se ha elegido banco.
  useEffect(() => {
    if (open && !expense && defaultBank && !bankTouched.current)
      setD((x) => (x.bankAccountId ? x : { ...x, bankAccountId: defaultBank }));
  }, [open, expense, defaultBank]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        ...d,
        baseCents: d.baseCents ?? 0,
        exchangeRate: d.currency === baseCurrency ? 1 : d.exchangeRate,
      };
      const e = savedId
        ? await api<Expense>(`/expenses/${savedId}`, { method: 'PATCH', body })
        : await api<Expense>('/expenses', { method: 'POST', body });
      // Ya está guardado: si algo falla después, volver a pulsar Guardar no lo duplica.
      if (!savedId) setSavedId(e.id);
      // «Se repite»: este gasto es el primero de la serie.
      if (!savedId && repeat) {
        try {
          await api('/recurring-expenses', {
            method: 'POST',
            body: {
              concept: d.concept,
              supplier: d.supplier || null,
              category: d.category,
              currency: d.currency,
              baseCents: d.baseCents ?? 0,
              vatPct: d.vatPct,
              deductible: d.deductible,
              bankAccountId: d.bankAccountId,
              frequency,
              startDate: d.date,
              fromExpenseId: e.id,
            },
          });
          toast.success(`Se apuntará solo: ${describeFrequency(frequency).toLowerCase()}`);
        } catch (error) {
          toast.error(
            `El gasto se ha guardado, pero no su repetición${
              error instanceof Error ? ` (${error.message})` : ''
            }: créala en la pestaña Recurrentes.`,
          );
        }
      }
      await refresh();
      if (savedId) onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido guardar.');
    } finally {
      setBusy(false);
    }
  };

  const vat = percentOf(d.baseCents ?? 0, d.vatPct);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{expense ? 'Editar gasto' : 'Nuevo gasto'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Concepto" className="sm:col-span-2">
            <Input
              value={d.concept}
              onChange={(e) => set('concept', e.target.value)}
              autoFocus
              data-testid="expense-concept"
            />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={d.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="Proveedor">
            <Input value={d.supplier} onChange={(e) => set('supplier', e.target.value)} />
          </Field>
          <Field label="Categoría">
            <NativeSelect
              value={d.category}
              onChange={(e) => set('category', e.target.value as ExpenseCategory)}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Moneda">
            <NativeSelect value={d.currency} onChange={(e) => set('currency', e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Base imponible">
            <DecimalInput
              value={d.baseCents}
              scale={100}
              suffix={d.currency}
              onCommit={(v) => set('baseCents', v)}
              testId="expense-base"
            />
          </Field>
          <Field
            label="IVA soportado (%)"
            hint={`Cuota: ${formatMoney(vat, d.currency)} · Total: ${formatMoney((d.baseCents ?? 0) + vat, d.currency)}`}
          >
            <DecimalInput value={d.vatPct} suffix="%" onCommit={(v) => set('vatPct', v ?? 0)} />
          </Field>
          {d.currency !== baseCurrency && (
            <Field label={`Tipo de cambio (1 ${d.currency} = ? ${baseCurrency})`}>
              <DecimalInput
                value={d.exchangeRate}
                maxDecimals={6}
                dotDecimal
                onCommit={(v) => set('exchangeRate', v ?? 1)}
              />
            </Field>
          )}
          <Field
            label="Banco"
            hint={
              expense?.chargedAt
                ? `Cargado el ${formatDateES(expense.chargedAt)}: si cambias el importe o el banco, se ajusta el saldo.`
                : 'El saldo no cambia hasta que pulses «Cargar».'
            }
          >
            <BankSelect
              value={d.bankAccountId}
              onChange={(v) => {
                bankTouched.current = true;
                set('bankAccountId', v);
              }}
              banks={banks.data ?? []}
              testId="expense-bank"
            />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Checkbox
              checked={d.deductible}
              onCheckedChange={(v) => set('deductible', v === true)}
            />
            Deducible (cuenta en el resumen trimestral)
          </label>
          {!expense && !savedId && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed p-3 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={repeat}
                  onCheckedChange={(v) => setRepeat(v === true)}
                  data-testid="expense-repeat"
                />
                <Repeat className="size-4 text-muted-foreground" /> Se repite
              </label>
              {repeat && (
                <>
                  <NativeSelect
                    className="h-8 w-44"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
                    data-testid="expense-frequency"
                  >
                    {RECURRING_FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </NativeSelect>
                  <span className="text-xs text-muted-foreground">
                    La app lo apuntará sola cada periodo (con el mismo importe y banco).
                  </span>
                </>
              )}
            </div>
          )}
          <Field label="Notas" className="sm:col-span-2">
            <Textarea rows={2} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
        {savedId ? (
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">Justificante</h3>
            <AttachmentsPanel entityType="expense" entityId={savedId} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Podrás adjuntar el justificante después de guardar.
          </p>
        )}
        <DialogFooter>
          {savedId && !expense && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          )}
          <Button
            disabled={!d.concept.trim() || d.baseCents == null || busy}
            onClick={() => void save()}
            data-testid="expense-save"
          >
            {savedId && !expense ? 'Guardar cambios' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RecDraft {
  concept: string;
  supplier: string;
  category: ExpenseCategory;
  currency: string;
  baseCents: number | null;
  vatPct: number;
  deductible: boolean;
  bankAccountId: string | null;
  frequency: RecurringFrequency;
  interval: number;
  startDate: string;
  nextDate: string;
  endDate: string;
  notes: string;
}

function RecurringDialog({
  item,
  open,
  onOpenChange,
}: {
  item: RecurringExpense | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const settings = useSettings();
  const banks = useBankAccounts();
  const refresh = useRefreshExpenses();
  const baseCurrency = settings.data?.preferences.baseCurrency ?? 'EUR';
  const defaultBank = banks.data?.find((b) => b.isDefault && b.active)?.id ?? null;
  const blank = (): RecDraft =>
    item
      ? {
          concept: item.concept,
          supplier: item.supplier ?? '',
          category: item.category,
          currency: item.currency,
          baseCents: item.baseCents,
          vatPct: item.vatPct,
          deductible: item.deductible,
          bankAccountId: item.bankAccountId,
          frequency: item.frequency,
          interval: item.interval,
          startDate: item.startDate,
          nextDate: item.nextDate,
          endDate: item.endDate ?? '',
          notes: item.notes ?? '',
        }
      : {
          concept: '',
          supplier: '',
          category: 'software',
          currency: baseCurrency,
          baseCents: null,
          vatPct: 21,
          deductible: true,
          bankAccountId: defaultBank,
          frequency: 'monthly',
          interval: 1,
          startDate: todayISO(),
          nextDate: todayISO(),
          endDate: '',
          notes: '',
        };
  const [d, setD] = useState<RecDraft>(blank);
  const bankTouched = useRef(false);
  useEffect(() => {
    if (open) {
      setD(blank());
      bankTouched.current = false;
    }
  }, [open, item]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open && !item && defaultBank && !bankTouched.current)
      setD((x) => (x.bankAccountId ? x : { ...x, bankAccountId: defaultBank }));
  }, [open, item, defaultBank]);
  const set = <K extends keyof RecDraft>(k: K, v: RecDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const body = {
        concept: d.concept,
        supplier: d.supplier || null,
        category: d.category,
        currency: d.currency,
        baseCents: d.baseCents ?? 0,
        vatPct: d.vatPct,
        deductible: d.deductible,
        bankAccountId: d.bankAccountId,
        frequency: d.frequency,
        interval: d.interval,
        endDate: d.endDate || null,
        notes: d.notes || null,
        ...(item
          ? item.nextDate !== d.nextDate
            ? { nextDate: d.nextDate }
            : {}
          : { startDate: d.startDate }),
      };
      if (item) await api(`/recurring-expenses/${item.id}`, { method: 'PATCH', body });
      else await api('/recurring-expenses', { method: 'POST', body });
      await refresh();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido guardar.');
    } finally {
      setBusy(false);
    }
  };
  const vat = percentOf(d.baseCents ?? 0, d.vatPct);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{item ? 'Editar gasto recurrente' : 'Nuevo gasto recurrente'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Concepto" className="sm:col-span-2">
            <Input
              value={d.concept}
              onChange={(e) => set('concept', e.target.value)}
              autoFocus
              placeholder="Renovación del dominio, Netflix…"
              data-testid="recurring-concept"
            />
          </Field>
          <Field label="Proveedor">
            <Input value={d.supplier} onChange={(e) => set('supplier', e.target.value)} />
          </Field>
          <Field label="Categoría">
            <NativeSelect
              value={d.category}
              onChange={(e) => set('category', e.target.value as ExpenseCategory)}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Base imponible">
            <DecimalInput
              value={d.baseCents}
              scale={100}
              suffix={d.currency}
              onCommit={(v) => set('baseCents', v)}
              testId="recurring-base"
            />
          </Field>
          <Field
            label="IVA soportado (%)"
            hint={`Total: ${formatMoney((d.baseCents ?? 0) + vat, d.currency)}`}
          >
            <DecimalInput value={d.vatPct} suffix="%" onCommit={(v) => set('vatPct', v ?? 0)} />
          </Field>
          <Field label="Moneda">
            <NativeSelect value={d.currency} onChange={(e) => set('currency', e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Banco">
            <BankSelect
              value={d.bankAccountId}
              onChange={(v) => {
                bankTouched.current = true;
                set('bankAccountId', v);
              }}
              banks={banks.data ?? []}
            />
          </Field>
          <Field label="Se repite">
            <div className="flex gap-2">
              <NativeSelect
                value={d.frequency}
                onChange={(e) => set('frequency', e.target.value as RecurringFrequency)}
                data-testid="recurring-frequency"
              >
                {RECURRING_FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </NativeSelect>
              <Input
                type="number"
                min={1}
                max={36}
                className="w-20"
                title="Cada cuántos periodos"
                value={d.interval}
                onChange={(e) => set('interval', Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </Field>
          {item ? (
            <Field label="Próximo cargo">
              <Input
                type="date"
                value={d.nextDate}
                onChange={(e) => set('nextDate', e.target.value)}
              />
            </Field>
          ) : (
            <Field label="Primer cargo" hint="Si es hoy o ya pasó, se apunta en el acto.">
              <Input
                type="date"
                value={d.startDate}
                onChange={(e) => set('startDate', e.target.value)}
                data-testid="recurring-start"
              />
            </Field>
          )}
          <Field label="Hasta (opcional)">
            <Input type="date" value={d.endDate} onChange={(e) => set('endDate', e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Checkbox
              checked={d.deductible}
              onCheckedChange={(v) => set('deductible', v === true)}
            />
            Deducible
          </label>
          <Field label="Notas" className="sm:col-span-2">
            <Textarea rows={2} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button
            disabled={!d.concept.trim() || d.baseCents == null || busy}
            onClick={() => void save()}
            data-testid="recurring-save"
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecurringPanel() {
  const q = useRecurringExpenses();
  const refresh = useRefreshExpenses();
  const trash = useTrashWithUndo();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [open, setOpen] = useState(false);
  const list = q.data ?? [];
  const toggle = async (r: RecurringExpense) => {
    try {
      await api(`/recurring-expenses/${r.id}`, { method: 'PATCH', body: { active: !r.active } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido cambiar.');
    }
    await refresh();
  };
  const columns: ColumnDef<RecurringExpense, unknown>[] = [
    {
      accessorKey: 'concept',
      header: 'Concepto',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.concept}</div>
          <div className="text-xs text-muted-foreground">
            {labelOf(EXPENSE_CATEGORIES, row.original.category)}
            {row.original.supplier ? ` · ${row.original.supplier}` : ''}
          </div>
        </div>
      ),
    },
    {
      id: 'frequency',
      header: 'Frecuencia',
      cell: ({ row }) => describeFrequency(row.original.frequency, row.original.interval),
    },
    {
      accessorKey: 'totalCents',
      header: 'Importe',
      meta: { align: 'right' },
      cell: ({ row }) => formatMoney(row.original.totalCents, row.original.currency),
    },
    {
      accessorKey: 'nextDate',
      header: 'Próximo cargo',
      cell: ({ row }) =>
        !row.original.active ? (
          <Badge variant="outline">En pausa</Badge>
        ) : row.original.endDate && row.original.nextDate > row.original.endDate ? (
          <Badge variant="outline">Terminado</Badge>
        ) : (
          formatDateES(row.original.nextDate)
        ),
    },
    {
      accessorKey: 'bankAccountName',
      header: 'Banco',
      cell: ({ row }) => row.original.bankAccountName ?? '—',
    },
    {
      accessorKey: 'generatedCount',
      header: 'Apuntados',
      meta: { align: 'right' },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label={row.original.active ? 'Pausar' : 'Reanudar'}
            title={row.original.active ? 'Pausar' : 'Reanudar'}
            onClick={(ev) => {
              ev.stopPropagation();
              void toggle(row.original);
            }}
          >
            {row.original.active ? <Pause /> : <Play />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Eliminar el gasto recurrente"
            onClick={async (ev) => {
              ev.stopPropagation();
              const ok = await confirm({
                title: `¿Dejar de apuntar «${row.original.concept}»?`,
                description: 'Los gastos ya apuntados se conservan.',
                confirmLabel: 'Eliminar',
                destructive: true,
              });
              if (ok)
                await trash('recurring_expense', row.original.id, row.original.concept, [
                  ['recurring-expenses'],
                ]);
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ];
  // Coste mensual aproximado de las series en marcha, por moneda.
  const monthly = new Map<string, number>();
  for (const r of list) {
    if (!r.active || (r.endDate && r.nextDate > r.endDate)) continue;
    const perYear = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 }[r.frequency] / r.interval;
    monthly.set(r.currency, (monthly.get(r.currency) ?? 0) + (r.totalCents * perYear) / 12);
  }
  const monthlyText = [...monthly]
    .map(([c, cents]) => formatMoney(Math.round(cents), c))
    .join(' + ');
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          La app apunta sola cada gasto el día que toca (con su banco) y te avisa. Después solo
          tienes que pulsar «Cargar» cuando te lo cobren.
          {monthlyText && ` Unos ${monthlyText} al mes.`}
        </p>
        <Button
          className="ml-auto"
          variant="outline"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          data-testid="new-recurring"
        >
          <Plus /> Nuevo gasto recurrente
        </Button>
      </div>
      {list.length === 0 ? (
        <EmptyState
          icon={<Repeat />}
          title="Aún no hay gastos recurrentes"
          description="Por ejemplo, la renovación anual del dominio, la cuota mensual de una suscripción o la gestoría cada trimestre."
        />
      ) : (
        <DataTable
          data={list}
          columns={columns}
          onRowClick={(r) => {
            setEditing(r);
            setOpen(true);
          }}
          testId="recurring-table"
        />
      )}
      <RecurringDialog item={editing} open={open} onOpenChange={setOpen} />
    </div>
  );
}

export function ExpensesPage() {
  const thisYear = new Date().getFullYear();
  const [tab, setTab] = useState<'expenses' | 'recurring'>('expenses');
  const [year, setYear] = useState(thisYear);
  const [category, setCategory] = useState('');
  const [bank, setBank] = useState('');
  // Los pendientes de cargar, de cualquier año: un cargo de diciembre puede llegar en enero.
  const pendingOnly = bank === 'pending';
  const expenses = useExpenses({
    from: pendingOnly ? undefined : `${year}-01-01`,
    to: pendingOnly ? undefined : `${year + 1}-01-01`,
    category: category || undefined,
    bankAccountId: bank && bank !== 'pending' ? bank : undefined,
    pending: bank === 'pending' ? 'true' : undefined,
  });
  const banks = useBankAccounts();
  const [editing, setEditing] = useState<Expense | null>(null);
  const [open, setOpen] = useState(false);
  const trash = useTrashWithUndo();
  const bankList = useMemo(() => banks.data ?? [], [banks.data]);

  const totals = useMemo(() => {
    const list = expenses.data ?? [];
    const conv = (c: number, e: Expense) => Math.round(c * e.exchangeRate);
    return {
      base: list.reduce((s, e) => s + conv(e.baseCents, e), 0),
      vat: list.filter((e) => e.deductible).reduce((s, e) => s + conv(e.vatCents, e), 0),
      count: list.length,
    };
  }, [expenses.data]);

  const columns = useMemo<ColumnDef<Expense, unknown>[]>(
    () => [
      { accessorKey: 'date', header: 'Fecha', cell: ({ row }) => formatDateES(row.original.date) },
      {
        accessorKey: 'concept',
        header: 'Concepto',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 font-medium">
            {row.original.concept}
            {row.original.recurringId && (
              <Repeat className="size-3.5 text-muted-foreground" aria-label="Gasto recurrente" />
            )}
          </span>
        ),
      },
      { accessorKey: 'supplier', header: 'Proveedor' },
      {
        accessorKey: 'category',
        header: 'Categoría',
        cell: ({ row }) => labelOf(EXPENSE_CATEGORIES, row.original.category),
      },
      {
        accessorKey: 'baseCents',
        header: 'Base',
        meta: { align: 'right' },
        cell: ({ row }) => formatMoney(row.original.baseCents, row.original.currency),
      },
      {
        accessorKey: 'vatCents',
        header: 'IVA',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span title={`${formatNumber(row.original.vatPct)} %`}>
            {formatMoney(row.original.vatCents, row.original.currency)}
          </span>
        ),
      },
      {
        accessorKey: 'totalCents',
        header: 'Total',
        meta: { align: 'right' },
        cell: ({ row }) => formatMoney(row.original.totalCents, row.original.currency),
      },
      {
        accessorKey: 'bankAccountName',
        header: 'Banco',
        cell: ({ row }) => row.original.bankAccountName ?? '—',
      },
      {
        id: 'charge',
        header: 'Cargo',
        enableSorting: false,
        cell: ({ row }) => <ChargeCell e={row.original} banks={bankList} />,
      },
      {
        accessorKey: 'deductible',
        header: 'Deducible',
        cell: ({ row }) =>
          row.original.deductible ? (
            <Badge variant="success">Sí</Badge>
          ) : (
            <Badge variant="outline">No</Badge>
          ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Eliminar gasto"
            onClick={(ev) => {
              ev.stopPropagation();
              void trash('expense', row.original.id, row.original.concept, EXPENSE_KEYS);
            }}
          >
            <Trash2 />
          </Button>
        ),
      },
    ],
    [trash, bankList],
  );

  return (
    <Page wide>
      <PageHeader
        title="Gastos"
        icon={<Wallet />}
        description="Gastos de la actividad con su IVA soportado, su banco y el justificante adjunto."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            data-testid="new-expense"
          >
            <Plus /> Nuevo gasto
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="expenses">Gastos</TabsTrigger>
          <TabsTrigger value="recurring" data-testid="tab-recurring">
            Recurrentes
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'recurring' ? (
        <RecurringPanel />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="Año" className="w-28">
              <NativeSelect
                value={String(year)}
                onChange={(e) => setYear(Number(e.target.value))}
                disabled={pendingOnly}
                title={
                  pendingOnly ? 'Los pendientes de cargar se muestran de todos los años' : undefined
                }
              >
                {Array.from({ length: 6 }, (_, i) => thisYear + 1 - i).map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Categoría" className="w-72">
              <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Todas</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {bankList.length > 0 && (
              <Field label="Banco" className="w-56">
                <NativeSelect value={bank} onChange={(e) => setBank(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="pending">Pendientes de cargar</option>
                  {bankList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Stat label="Gastos (base)" value={formatMoney(totals.base)} />
            <Stat label="IVA soportado deducible" value={formatMoney(totals.vat)} />
            <Stat label="Registros" value={totals.count} />
          </div>
          <DataTable
            data={expenses.data ?? []}
            columns={columns}
            onRowClick={(e) => {
              setEditing(e);
              setOpen(true);
            }}
            empty="No hay gastos en este periodo."
            testId="expenses-table"
          />
        </>
      )}
      <ExpenseDialog expense={editing} open={open} onOpenChange={setOpen} />
    </Page>
  );
}
