import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp } from 'lucide-react';
import {
  UNITS,
  UNIT_PLURALS,
  formatMoney,
  formatNumber,
  labelOf,
  type ClientProfitability,
  type ClientProfitabilityReport,
} from '@l10n/shared';
import { Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ChartFrame, HBarList } from './charts';

export const useClientProfitability = (year: number) =>
  useQuery({
    queryKey: ['finance-clients', year],
    queryFn: () => api<ClientProfitabilityReport>('/reports/clients', { query: { year } }),
  });

/** «120 000 caracteres · 3000 palabras» (las dos unidades principales). */
function volumeLabel(c: ClientProfitability) {
  return (
    c.units
      .filter((u) => u.unit !== 'flat' && u.volume > 0)
      .slice(0, 2)
      .map((u) => `${formatNumber(Math.round(u.volume))} ${UNIT_PLURALS[u.unit] ?? u.unit}`)
      .join(' · ') || '—'
  );
}

/** Tarifa media de la unidad principal: importe ÷ volumen. */
function avgRate(c: ClientProfitability, currency: string) {
  const u = c.units.find((x) => x.unit !== 'flat' && x.volume > 0);
  if (!u) return '—';
  const perUnit = u.cents / u.volume / 100;
  const singular = labelOf(UNITS, u.unit).toLowerCase();
  return `${new Intl.NumberFormat('es-ES', { style: 'currency', currency, maximumFractionDigits: 4 }).format(perUnit)}/${singular}`;
}

type SortKey = 'incomeCents' | 'hourlyCents' | 'hours' | 'avgPaymentDays' | 'overdueCents';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'incomeCents', label: 'Ingresos' },
  { key: 'hours', label: 'Horas' },
  { key: 'hourlyCents', label: '€/hora' },
  { key: 'avgPaymentDays', label: 'Días de cobro' },
  { key: 'overdueCents', label: 'Vencido' },
];

/** Rentabilidad por cliente: ingresos, horas, €/hora efectivo, tarifa media y cobro. */
export function ProfitabilityPanel({ year }: { year: number }) {
  const q = useClientProfitability(year);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: 'incomeCents',
    desc: true,
  });
  const rows = useMemo(() => {
    const list = [...(q.data?.clients ?? [])];
    list.sort((a, b) => {
      // Los valores vacíos van siempre al final.
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null) return 1;
      if (bv == null) return -1;
      return sort.desc ? bv - av : av - bv;
    });
    return list;
  }, [q.data, sort]);
  if (!q.data) return <Spinner />;
  const currency = q.data.baseCurrency;
  const money = (c: number) => formatMoney(c, currency);
  const withHourly = [...q.data.clients]
    .filter((c) => c.hourlyCents != null)
    .sort((a, b) => b.hourlyCents! - a.hourlyCents!);

  return (
    <section className="grid gap-4" data-testid="profitability">
      <div>
        <h2 className="text-lg font-semibold">Rentabilidad por cliente · {year}</h2>
        <p className="text-sm text-muted-foreground">
          Encargos entregados en el año (base, sin IVA). El €/hora solo cuenta los encargos con
          tiempo registrado; las horas incluyen todo el tiempo del cliente.
          {q.data.unconverted > 0 &&
            (q.data.unconverted === 1
              ? ' 1 encargo en otra moneda no se suma por falta de tipo de cambio (puedes indicarlo en Ajustes → Preferencias).'
              : ` ${q.data.unconverted} encargos en otra moneda no se suman por falta de tipo de cambio (puedes indicarlo en Ajustes → Preferencias).`)}
        </p>
      </div>
      <div className="grid gap-4">
        <div className="overflow-x-auto rounded-lg border bg-card">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Sin encargos entregados en {year}.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Cliente</TH>
                  <TH className="text-right">Encargos</TH>
                  <TH>Volumen</TH>
                  <TH className="text-right">Tarifa media</TH>
                  {COLUMNS.map((c) => (
                    <TH key={c.key} className="text-right">
                      <button
                        type="button"
                        className={cn(
                          'inline-flex items-center gap-1 uppercase hover:text-foreground',
                          sort.key === c.key && 'text-foreground',
                        )}
                        onClick={() =>
                          setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : true }))
                        }
                      >
                        {c.label}
                        {sort.key === c.key &&
                          (sort.desc ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ArrowUp className="size-3" />
                          ))}
                      </button>
                    </TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {rows.map((c) => (
                  <TR key={c.clientId}>
                    <TD>
                      <Link
                        to="/trabajo/clientes/$clientId"
                        params={{ clientId: c.clientId }}
                        className="font-medium hover:underline"
                      >
                        {c.clientName}
                      </Link>
                    </TD>
                    <TD className="text-right tabular-nums">{c.jobCount}</TD>
                    <TD className="whitespace-nowrap text-xs text-muted-foreground">
                      {volumeLabel(c)}
                    </TD>
                    <TD className="whitespace-nowrap text-right tabular-nums">
                      {avgRate(c, currency)}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {c.jobCount > 0 && c.units.length === 0 ? '—' : money(c.incomeCents)}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {c.hours ? formatNumber(c.hours, 1) : '—'}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {c.hourlyCents != null ? money(c.hourlyCents) : '—'}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {c.avgPaymentDays != null ? `${c.avgPaymentDays} d` : '—'}
                    </TD>
                    <TD
                      className={cn(
                        'text-right tabular-nums',
                        c.overdueCents > 0 && 'font-medium text-destructive',
                      )}
                    >
                      {c.overdueCents > 0 ? money(c.overdueCents) : '—'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
        <ChartFrame
          title="€/hora efectivo por cliente"
          description="Importe de los encargos con tiempo registrado ÷ sus horas."
          table={
            <Table>
              <THead>
                <TR>
                  <TH>Cliente</TH>
                  <TH className="text-right">€/hora</TH>
                </TR>
              </THead>
              <TBody>
                {withHourly.map((c) => (
                  <TR key={c.clientId}>
                    <TD>{c.clientName}</TD>
                    <TD className="text-right tabular-nums">{money(c.hourlyCents!)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          }
        >
          <HBarList
            rows={withHourly.map((c) => ({
              key: c.clientId,
              label: c.clientName,
              value: c.hourlyCents!,
              hint: `${formatNumber(c.hours, 1)} h en el año`,
            }))}
            format={money}
            max={50}
            empty="Registra tiempo en tus encargos para ver el €/hora de cada cliente."
          />
        </ChartFrame>
      </div>
    </section>
  );
}
