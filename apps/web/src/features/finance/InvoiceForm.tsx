import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  UNIT_PLURALS,
  addDaysISO,
  formatMoney,
  formatNumber,
  invoiceTotals,
  todayISO,
  type Client,
  type Invoice,
  type InvoiceLine,
  type Job,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input, Textarea } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/misc';
import { DecimalInput } from '@/components/common/inputs';
import { useSettings } from '@/hooks/core';
import { useApiMutation, useClient } from '@/hooks/work';
import { api } from '@/lib/api';

/**
 * Registrar una factura emitida con tu programa de facturación a partir de los encargos
 * pendientes de un cliente. La app no emite facturas: guarda los datos para el seguimiento.
 */
export function InvoiceDialog({
  open,
  onOpenChange,
  clientId,
  jobs,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: string;
  jobs: Job[];
  onCreated?: (inv: Invoice) => void;
}) {
  const settings = useSettings();
  const client = useClient(clientId);
  const prefs = settings.data?.preferences;
  const c: Client | undefined = client.data?.client;
  const [number, setNumber] = useState('');
  const [issueDate, setIssueDate] = useState(todayISO());
  const [selected, setSelected] = useState<Set<string>>(new Set(jobs.map((j) => j.id)));
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [vatPct, setVatPct] = useState<number | null>(null);
  const [irpfPct, setIrpfPct] = useState<number | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    void api<{ number: string }>('/invoices/next-number').then((r) =>
      setNumber((n) => n || r.number),
    );
    setSelected(new Set(jobs.map((j) => j.id)));
  }, [open, jobs]);

  const currency = jobs[0]?.currency ?? c?.currency ?? 'EUR';
  const effVat = vatPct ?? c?.vatPct ?? prefs?.defaultVatPct ?? 21;
  const effIrpf = irpfPct ?? c?.irpfPct ?? prefs?.defaultIrpfPct ?? 15;
  const terms = c?.paymentTermsDays ?? prefs?.paymentTermsDays ?? 30;
  const totals = useMemo(() => {
    const base =
      jobs.filter((j) => selected.has(j.id)).reduce((s, j) => s + (j.amountCents ?? 0), 0) +
      lines.reduce((s, l) => s + l.amountCents, 0);
    return invoiceTotals(base, effVat, effIrpf);
  }, [jobs, selected, lines, effVat, effIrpf]);
  const foreign = prefs && currency !== prefs.baseCurrency;

  const create = useApiMutation(
    () =>
      api<Invoice>('/invoices', {
        method: 'POST',
        body: {
          number,
          clientId,
          issueDate,
          jobIds: [...selected],
          extraLines: lines.filter((l) => l.description.trim()),
          vatPct: effVat,
          irpfPct: effIrpf,
          currency,
          exchangeRate: foreign ? exchangeRate : 1,
          notes,
        },
      }),
    {
      onSuccess: (inv) => {
        onOpenChange(false);
        onCreated?.(inv);
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Registrar factura · {c?.name ?? ''}</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-sm text-muted-foreground">
          Emite la factura con tu programa de facturación y registra aquí sus datos para el
          seguimiento de cobros e informes.
        </p>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Número de factura">
            <Input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              data-testid="invoice-number"
            />
          </Field>
          <Field label="Fecha de emisión">
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
          <Field label="IVA (%)">
            <DecimalInput
              value={effVat}
              onCommit={(v) => setVatPct(v ?? 0)}
              suffix="%"
              testId="invoice-vat"
            />
          </Field>
          <Field label="Retención IRPF (%)">
            <DecimalInput value={effIrpf} onCommit={(v) => setIrpfPct(v ?? 0)} suffix="%" />
          </Field>
        </div>
        <div className="grid gap-1">
          <h3 className="text-sm font-medium">Encargos</h3>
          <div className="max-h-64 overflow-y-auto rounded-md border">
            {jobs.map((j) => (
              <label
                key={j.id}
                className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-0 hover:bg-muted/40"
              >
                <Checkbox
                  checked={selected.has(j.id)}
                  onCheckedChange={(v) =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (v) n.add(j.id);
                      else n.delete(j.id);
                      return n;
                    })
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{j.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[
                      j.projectName,
                      j.poNumber ? `PO ${j.poNumber}` : null,
                      j.volume != null && j.unit !== 'flat'
                        ? `${formatNumber(j.weightedVolume ?? j.volume)} ${UNIT_PLURALS[j.unit]}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="tabular-nums">{formatMoney(j.amountCents, j.currency)}</span>
              </label>
            ))}
            {jobs.length === 0 && (
              <p className="px-3 py-3 text-sm text-muted-foreground">No hay encargos pendientes.</p>
            )}
          </div>
        </div>
        <div className="grid gap-2">
          <h3 className="text-sm font-medium">Otros conceptos</h3>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_10rem_auto] gap-2">
              <Input
                value={l.description}
                placeholder="Concepto (recargo por urgencia, gestión de terminología…)"
                onChange={(e) =>
                  setLines((ls) =>
                    ls.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                  )
                }
              />
              <DecimalInput
                value={l.amountCents}
                scale={100}
                suffix={currency}
                onCommit={(v) =>
                  setLines((ls) => ls.map((x, j) => (j === i ? { ...x, amountCents: v ?? 0 } : x)))
                }
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label="Quitar concepto"
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            </div>
          ))}
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLines((ls) => [...ls, { description: '', amountCents: 0 }])}
            >
              <Plus /> Concepto
            </Button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_18rem]">
          <div className="grid gap-4">
            {foreign && (
              <Field
                label={`Tipo de cambio (1 ${currency} = ? ${prefs?.baseCurrency})`}
                hint="El que aplica tu factura o tu banco; se usa en los informes en tu moneda principal"
              >
                <DecimalInput
                  value={exchangeRate}
                  onCommit={setExchangeRate}
                  maxDecimals={6}
                  dotDecimal
                />
              </Field>
            )}
            <Field label="Notas">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </Field>
          </div>
          <dl className="grid content-start gap-1 rounded-lg bg-muted/40 p-4 text-sm">
            <div className="flex justify-between">
              <dt>Base imponible</dt>
              <dd className="tabular-nums">{formatMoney(totals.baseCents, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>IVA ({formatNumber(effVat)} %)</dt>
              <dd className="tabular-nums">{formatMoney(totals.vatCents, currency)}</dd>
            </div>
            {effIrpf > 0 && (
              <div className="flex justify-between">
                <dt>IRPF (−{formatNumber(effIrpf)} %)</dt>
                <dd className="tabular-nums">−{formatMoney(totals.irpfCents, currency)}</dd>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t pt-2 font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums" data-testid="invoice-total">
                {formatMoney(totals.totalCents, currency)}
              </dd>
            </div>
            <div className="text-xs text-muted-foreground">
              Vence el {addDaysISO(issueDate, terms).split('-').reverse().join('/')}
            </div>
          </dl>
        </div>
        <DialogFooter>
          <Button
            disabled={
              !number.trim() ||
              (selected.size === 0 && lines.length === 0) ||
              (foreign && !exchangeRate) ||
              create.isPending
            }
            onClick={() => create.mutate(undefined)}
            data-testid="invoice-save"
          >
            Registrar factura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
