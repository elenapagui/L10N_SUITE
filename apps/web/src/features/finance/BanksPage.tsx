import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, EyeOff, Landmark, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  BANK_MOVEMENT_KINDS,
  CURRENCIES,
  formatAccountNumber,
  formatDateES,
  formatMoney,
  labelOf,
  maskAccountNumber,
  plural,
  todayISO,
  type BankAccount,
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
import { Checkbox, Spinner } from '@/components/ui/misc';
import { DecimalInput } from '@/components/common/inputs';
import { EmptyState, Page, PageHeader } from '@/components/layout/PageHeader';
import { useSettings } from '@/hooks/core';
import { useTrashWithUndo } from '@/hooks/mutations';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Section } from '@/features/work/shared';
import { ChargeCell } from './ExpensesPage';
import { EXPENSE_KEYS, useBankAccounts, useBankMovements, useExpenses } from './hooks';

function useRefresh() {
  const qc = useQueryClient();
  return () => Promise.all(EXPENSE_KEYS.map((k) => qc.invalidateQueries({ queryKey: k })));
}

function AccountDialog({
  account,
  open,
  onOpenChange,
}: {
  account: BankAccount | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const settings = useSettings();
  const refresh = useRefresh();
  const baseCurrency = settings.data?.preferences.baseCurrency ?? 'EUR';
  const blank = () => ({
    name: account?.name ?? '',
    bankName: account?.bankName ?? '',
    accountNumber: account?.accountNumber ?? '',
    currency: account?.currency ?? baseCurrency,
    balanceCents: account ? account.balanceCents : (null as number | null),
    isDefault: account?.isDefault ?? false,
    active: account?.active ?? true,
    notes: account?.notes ?? '',
  });
  const [d, setD] = useState(blank);
  useEffect(() => {
    if (open) setD(blank());
  }, [open, account]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  const save = async () => {
    try {
      const body = {
        name: d.name,
        bankName: d.bankName || null,
        accountNumber: d.accountNumber ? formatAccountNumber(d.accountNumber) : null,
        currency: d.currency,
        isDefault: d.isDefault,
        active: d.active,
        notes: d.notes || null,
      };
      if (account) await api(`/bank-accounts/${account.id}`, { method: 'PATCH', body });
      else
        await api('/bank-accounts', {
          method: 'POST',
          body: { ...body, balanceCents: d.balanceCents ?? 0, balanceDate: todayISO() },
        });
      await refresh();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido guardar.');
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? 'Editar cuenta' : 'Nueva cuenta bancaria'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" hint="Para reconocerla: «Cuenta autónomos», «Ahorro»…">
            <Input
              autoFocus
              value={d.name}
              onChange={(e) => set('name', e.target.value)}
              data-testid="bank-name"
            />
          </Field>
          <Field label="Banco">
            <Input
              value={d.bankName}
              onChange={(e) => set('bankName', e.target.value)}
              data-testid="bank-bank"
            />
          </Field>
          <Field label="Número de cuenta (IBAN)" className="sm:col-span-2">
            <Input
              value={d.accountNumber}
              onChange={(e) => set('accountNumber', e.target.value.toUpperCase())}
              placeholder="ES00 0000 0000 0000 0000 0000"
              className="font-mono"
              data-testid="bank-number"
            />
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
          {account ? (
            <Field label="Saldo" hint="Se cambia con «Actualizar saldo».">
              <Input disabled value={formatMoney(account.balanceCents, account.currency)} />
            </Field>
          ) : (
            <Field label="Saldo actual">
              <DecimalInput
                value={d.balanceCents}
                scale={100}
                suffix={d.currency}
                onCommit={(v) => set('balanceCents', v)}
                testId="bank-balance"
              />
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={d.isDefault} onCheckedChange={(v) => set('isDefault', v === true)} />
            Cuenta principal (se elige sola en los gastos nuevos)
          </label>
          {account && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={d.active} onCheckedChange={(v) => set('active', v === true)} />
              En uso
            </label>
          )}
          <Field label="Notas" className="sm:col-span-2">
            <Textarea rows={2} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button disabled={!d.name.trim()} onClick={() => void save()} data-testid="bank-save">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BalanceDialog({
  account,
  onOpenChange,
}: {
  account: BankAccount | null;
  onOpenChange: (o: boolean) => void;
}) {
  const refresh = useRefresh();
  const [cents, setCents] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  useEffect(() => {
    if (account) {
      setCents(account.balanceCents);
      setDate(todayISO());
      setNote('');
    }
  }, [account]);
  const save = async () => {
    if (!account || cents == null) return;
    try {
      await api(`/bank-accounts/${account.id}/balance`, {
        method: 'POST',
        body: { balanceCents: cents, date, note: note || null },
      });
      await refresh();
      toast.success('Saldo actualizado');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido guardar.');
    }
  };
  return (
    <Dialog open={account !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Actualizar saldo · {account?.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Escribe el saldo que te muestra el banco. Los gastos pendientes de cargar no se restan: si
          ya te los han cobrado y el saldo los incluye, no pulses «Cargar» en ellos.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Saldo">
            <DecimalInput
              value={cents}
              scale={100}
              suffix={account?.currency}
              onCommit={setCents}
              testId="balance-amount"
            />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Nota (opcional)" className="sm:col-span-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button
            disabled={cents == null || !date}
            onClick={() => void save()}
            data-testid="balance-save"
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountNumber({ value }: { value: string | null }) {
  const [shown, setShown] = useState(false);
  if (!value) return <span className="text-sm text-muted-foreground">Sin número de cuenta</span>;
  return (
    <span className="inline-flex items-center gap-1 font-mono text-sm">
      {shown ? formatAccountNumber(value) : maskAccountNumber(value)}
      <button
        type="button"
        className="rounded p-1 text-muted-foreground hover:bg-accent"
        aria-label={shown ? 'Ocultar' : 'Mostrar'}
        onClick={(e) => {
          e.stopPropagation();
          setShown((s) => !s);
        }}
      >
        {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
      <button
        type="button"
        className="rounded p-1 text-muted-foreground hover:bg-accent"
        aria-label="Copiar el número de cuenta"
        onClick={(e) => {
          e.stopPropagation();
          void navigator.clipboard
            .writeText(value.replace(/\s+/g, ''))
            .then(() => toast.success('Número de cuenta copiado'));
        }}
      >
        <Copy className="size-3.5" />
      </button>
    </span>
  );
}

function AccountDetail({ account }: { account: BankAccount }) {
  const pending = useExpenses({ bankAccountId: account.id, pending: 'true' });
  const movements = useBankMovements(account.id);
  const banks = useBankAccounts();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title={`Pendientes de cargar (${pending.data?.length ?? 0})`}>
        {(pending.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay gastos pendientes en esta cuenta.</p>
        ) : (
          <ul className="grid gap-2" data-testid="bank-pending">
            {(pending.data ?? []).map((e) => (
              <li key={e.id} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                  {formatDateES(e.date)}
                </span>
                <span className="min-w-0 flex-1 truncate">{e.concept}</span>
                <span className="tabular-nums">{formatMoney(e.totalCents, e.currency)}</span>
                <ChargeCell e={e} banks={banks.data ?? []} />
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Movimientos del saldo">
        {movements.isLoading ? (
          <Spinner />
        ) : (
          <ul className="grid gap-1.5 text-sm" data-testid="bank-movements">
            {(movements.data ?? []).map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                  {formatDateES(m.date)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {labelOf(BANK_MOVEMENT_KINDS, m.kind)}
                  {m.note ? ` · ${m.note}` : ''}
                </span>
                <span
                  className={cn(
                    'tabular-nums',
                    m.amountCents < 0
                      ? 'text-destructive'
                      : 'text-emerald-700 dark:text-emerald-400',
                  )}
                >
                  {m.amountCents > 0 ? '+' : ''}
                  {formatMoney(m.amountCents, account.currency)}
                </span>
                <span className="w-28 text-right tabular-nums text-muted-foreground">
                  {formatMoney(m.balanceAfter, account.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

export function BanksPage() {
  const q = useBankAccounts();
  const trash = useTrashWithUndo();
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [open, setOpen] = useState(false);
  const [balanceFor, setBalanceFor] = useState<BankAccount | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const list = q.data ?? [];
  const current = list.find((b) => b.id === selected) ?? list[0] ?? null;
  const totals = new Map<string, number>();
  for (const b of list.filter((x) => x.active))
    totals.set(b.currency, (totals.get(b.currency) ?? 0) + b.balanceCents);

  return (
    <Page wide>
      <PageHeader
        title="Bancos"
        icon={<Landmark />}
        description="Tus cuentas, su saldo y los gastos que se cargan en cada una. El saldo es el que tú indicas: los gastos solo lo cambian al pulsar «Cargar»."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            data-testid="new-bank"
          >
            <Plus /> Nueva cuenta
          </Button>
        }
      />
      {q.isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Landmark />}
          title="Aún no hay cuentas"
          description="Añade tus cuentas con su saldo. Al apuntar un gasto podrás elegir de qué banco sale y «cargarlo» en el saldo cuando te lo cobren."
        />
      ) : (
        <div className="grid gap-6">
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            Total en cuentas en uso:
            {[...totals].map(([cur, cents]) => (
              <strong key={cur} className="text-foreground">
                {formatMoney(cents, cur)}
              </strong>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="bank-cards">
            {list.map((b) => (
              <div
                key={b.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(b.id)}
                onKeyDown={(e) => e.key === 'Enter' && setSelected(b.id)}
                className={cn(
                  'grid gap-2 rounded-lg border bg-card p-4 text-left shadow-xs transition-colors hover:bg-accent/30',
                  current?.id === b.id && 'ring-2 ring-primary/40',
                  !b.active && 'opacity-60',
                )}
                data-testid="bank-card"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      {b.name}
                      {b.isDefault && (
                        <Star
                          className="size-3.5 fill-amber-400 text-amber-500"
                          aria-label="Principal"
                        />
                      )}
                      {!b.active && <Badge variant="outline">Sin uso</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{b.bankName ?? '—'}</div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Editar la cuenta"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(b);
                      setOpen(true);
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Eliminar la cuenta"
                    onClick={(e) => {
                      e.stopPropagation();
                      void trash('bank_account', b.id, b.name, EXPENSE_KEYS);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <AccountNumber value={b.accountNumber} />
                <div
                  className="text-2xl font-semibold tabular-nums"
                  data-testid="bank-card-balance"
                >
                  {formatMoney(b.balanceCents, b.currency)}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {b.balanceDate && <span>Saldo a {formatDateES(b.balanceDate)}</span>}
                  {b.pendingCount > 0 && (
                    <span className="font-medium text-amber-700 dark:text-amber-400">
                      · {plural(b.pendingCount, 'gasto', 'gastos')} sin cargar (
                      {formatMoney(b.pendingCents, b.currency)})
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="justify-self-start"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBalanceFor(b);
                  }}
                  data-testid="bank-update-balance"
                >
                  Actualizar saldo
                </Button>
              </div>
            ))}
          </div>
          {current && <AccountDetail account={current} />}
        </div>
      )}
      <AccountDialog account={editing} open={open} onOpenChange={setOpen} />
      <BalanceDialog account={balanceFor} onOpenChange={(o) => !o && setBalanceFor(null)} />
    </Page>
  );
}
