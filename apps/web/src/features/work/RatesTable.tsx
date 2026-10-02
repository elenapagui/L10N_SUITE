import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  CURRENCIES,
  LANGUAGES,
  SERVICES,
  UNITS,
  formatMoney,
  formatRate,
  labelOf,
  pairLabel,
  type Rate,
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
import { Input, NativeSelect } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { DecimalInput } from '@/components/common/inputs';
import { useApiMutation } from '@/hooks/work';
import { useTrashWithUndo } from '@/hooks/mutations';
import { api } from '@/lib/api';

function RateDialog({
  open,
  onOpenChange,
  clientId,
  currency,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: string | null;
  currency: string;
}) {
  const [service, setService] = useState('translation');
  const [unit, setUnit] = useState('word');
  const [sourceLang, setSourceLang] = useState('');
  const [targetLang, setTargetLang] = useState('');
  const [rateMicros, setRateMicros] = useState<number | null>(null);
  const [minimumCents, setMinimumCents] = useState<number | null>(null);
  const [cur, setCur] = useState(currency);
  const [notes, setNotes] = useState('');
  const create = useApiMutation(
    () =>
      api('/rates', {
        method: 'POST',
        body: {
          clientId,
          service,
          unit,
          sourceLang: sourceLang || null,
          targetLang: targetLang || null,
          rateMicros,
          minimumCents,
          currency: cur,
          notes,
        },
      }),
    { onSuccess: () => onOpenChange(false) },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva tarifa</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Servicio">
            <NativeSelect value={service} onChange={(e) => setService(e.target.value)}>
              {SERVICES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Unidad">
            <NativeSelect value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Idioma de origen" hint="Vacío = cualquiera">
            <NativeSelect value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
              <option value="">Cualquiera</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Idioma de destino">
            <NativeSelect value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
              <option value="">Cualquiera</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Tarifa"
            hint={
              unit === 'flat'
                ? 'Importe total'
                : `Por ${labelOf(UNITS, unit).toLowerCase()} (p. ej. 0,075)`
            }
          >
            <DecimalInput
              value={rateMicros}
              onCommit={setRateMicros}
              scale={1_000_000}
              maxDecimals={6}
              testId="rate-value"
            />
          </Field>
          <Field label="Moneda">
            <NativeSelect value={cur} onChange={(e) => setCur(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Mínimo por encargo" hint="Opcional">
            <DecimalInput value={minimumCents} onCommit={setMinimumCents} scale={100} />
          </Field>
          <Field label="Notas">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button
            disabled={rateMicros == null || create.isPending}
            onClick={() => create.mutate(undefined)}
          >
            Guardar tarifa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RatesTable({
  rates,
  clientId,
  currency,
}: {
  rates: Rate[];
  clientId: string | null;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const trash = useTrashWithUndo();
  return (
    <div className="grid gap-3">
      <div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="new-rate">
          <Plus /> Añadir tarifa
        </Button>
      </div>
      {rates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin tarifas. Al crear un encargo se aplicará automáticamente la tarifa que coincida en
          servicio, unidad e idiomas.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <THead>
              <TR>
                <TH>Servicio</TH>
                <TH>Idiomas</TH>
                <TH>Unidad</TH>
                <TH className="text-right">Tarifa</TH>
                <TH className="text-right">Mínimo</TH>
                <TH>Notas</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {rates.map((r) => (
                <TR key={r.id}>
                  <TD>{labelOf(SERVICES, r.service)}</TD>
                  <TD>
                    {r.sourceLang || r.targetLang
                      ? pairLabel(r.sourceLang, r.targetLang)
                      : 'Cualquiera'}
                  </TD>
                  <TD>{labelOf(UNITS, r.unit)}</TD>
                  <TD className="text-right tabular-nums">
                    {formatRate(r.rateMicros, r.currency)}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {r.minimumCents ? formatMoney(r.minimumCents, r.currency) : '—'}
                  </TD>
                  <TD className="text-muted-foreground">{r.notes ?? ''}</TD>
                  <TD className="text-right">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Eliminar tarifa"
                      onClick={() =>
                        void trash(
                          'rate',
                          r.id,
                          `${labelOf(SERVICES, r.service)} (${labelOf(UNITS, r.unit)})`,
                          [['client'], ['rates']],
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
      {open && (
        <RateDialog open={open} onOpenChange={setOpen} clientId={clientId} currency={currency} />
      )}
    </div>
  );
}
