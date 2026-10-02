import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Wallet } from 'lucide-react';
import {
  CURRENCIES,
  EXPENSE_CATEGORIES,
  formatDateES,
  formatMoney,
  formatNumber,
  labelOf,
  percentOf,
  todayISO,
  type Expense,
  type ExpenseCategory,
} from '@l10n/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { AttachmentsPanel } from '@/components/common/AttachmentsPanel';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { DecimalInput } from '@/components/common/inputs';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { useSettings } from '@/hooks/core';
import { useTrashWithUndo } from '@/hooks/mutations';
import { useApiMutation } from '@/hooks/work';
import { api } from '@/lib/api';
import { Stat } from '@/features/work/shared';
import { useExpenses } from './hooks';

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
}

function toDraft(e: Expense | null, currency: string): Draft {
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
  const baseCurrency = settings.data?.preferences.baseCurrency ?? 'EUR';
  const [d, setD] = useState<Draft>(() => toDraft(expense, baseCurrency));
  const [savedId, setSavedId] = useState<string | null>(expense?.id ?? null);
  useEffect(() => {
    if (open) {
      setD(toDraft(expense, baseCurrency));
      setSavedId(expense?.id ?? null);
    }
  }, [open, expense, baseCurrency]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const save = useApiMutation(
    () => {
      const body = {
        ...d,
        baseCents: d.baseCents ?? 0,
        exchangeRate: d.currency === baseCurrency ? 1 : d.exchangeRate,
      };
      return savedId
        ? api<Expense>(`/expenses/${savedId}`, { method: 'PATCH', body })
        : api<Expense>('/expenses', { method: 'POST', body });
    },
    {
      onSuccess: (e) => {
        if (savedId) onOpenChange(false);
        else setSavedId(e.id);
      },
    },
  );

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
                onCommit={(v) => set('exchangeRate', v ?? 1)}
              />
            </Field>
          )}
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Checkbox
              checked={d.deductible}
              onCheckedChange={(v) => set('deductible', v === true)}
            />
            Deducible (cuenta en el resumen trimestral)
          </label>
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
            disabled={!d.concept.trim() || d.baseCents == null || save.isPending}
            onClick={() => save.mutate(undefined)}
            data-testid="expense-save"
          >
            {savedId && !expense ? 'Guardar cambios' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExpensesPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [category, setCategory] = useState('');
  const expenses = useExpenses({
    from: `${year}-01-01`,
    to: `${year + 1}-01-01`,
    category: category || undefined,
  });
  const [editing, setEditing] = useState<Expense | null>(null);
  const [open, setOpen] = useState(false);
  const trash = useTrashWithUndo();

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
        cell: ({ row }) => <span className="font-medium">{row.original.concept}</span>,
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
              void trash('expense', row.original.id, row.original.concept, [['expenses']]);
            }}
          >
            <Trash2 />
          </Button>
        ),
      },
    ],
    [trash],
  );

  return (
    <Page wide>
      <PageHeader
        title="Gastos"
        icon={<Wallet />}
        description="Gastos de la actividad con su IVA soportado y el justificante adjunto."
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
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Año" className="w-28">
          <NativeSelect value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
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
      <ExpenseDialog expense={editing} open={open} onOpenChange={setOpen} />
    </Page>
  );
}
