import { Link } from '@tanstack/react-router';
import { AlertTriangle, FileText, Package } from 'lucide-react';
import { formatDateES, formatMoney } from '@l10n/shared';
import { Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Stat } from '@/features/work/shared';
import { cn } from '@/lib/utils';
import { ChartFrame, GroupedBarChart, Legend, type ChartSeries } from './charts';
import { useForecast } from './hooks';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Mismo orden de la paleta que el resto de informes: chart-1 para lo ya facturado.
const SERIES: ChartSeries[] = [
  { key: 'invoicedCents', label: 'Facturas emitidas', color: 'var(--chart-1)' },
  { key: 'pendingCents', label: 'Encargos por facturar', color: 'var(--chart-2)' },
];

/** Previsión de cobros: lo vencido, lo de los próximos 30 días y lo previsto mes a mes. */
export function ForecastPanel() {
  const q = useForecast(6);
  const f = q.data;
  if (!f) return <Spinner />;
  const money = (c: number) => formatMoney(c, f.baseCurrency);
  const months = f.months.map((m) => ({
    ...m,
    label: `${MONTHS[Number(m.month.slice(5, 7)) - 1]} ${m.month.slice(2, 4)}`,
  }));
  return (
    <section className="grid gap-4" data-testid="forecast">
      <div>
        <h2 className="text-lg font-semibold">Previsión de cobros</h2>
        <p className="text-sm text-muted-foreground">
          Lo que esperas cobrar a partir de hoy, con IVA e IRPF: tus facturas emitidas en su
          vencimiento y los encargos sin facturar, suponiendo la factura a fin del mes de entrega y
          el plazo de pago de cada cliente.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Vencido sin cobrar"
          value={money(f.overdueCents)}
          tone={f.overdueCents > 0 ? 'danger' : undefined}
        />
        <Stat label="Próximos 30 días" value={money(f.next30Cents)} />
        <Stat
          label="Total pendiente"
          value={money(f.totalCents)}
          hint={
            f.laterCents > 0
              ? `${money(f.laterCents)} después de ${months.at(-1)?.label}`
              : 'Facturas emitidas y encargos sin facturar'
          }
        />
      </div>
      {f.unconverted > 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="size-4 text-amber-600" />
          {f.unconverted === 1
            ? '1 partida en otra moneda no se suma: aún no hay ninguna factura con su tipo de cambio.'
            : `${f.unconverted} partidas en otras monedas no se suman: aún no hay facturas con su tipo de cambio.`}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <ChartFrame
          title="Cobros previstos por mes"
          description="Lo vencido no se incluye en el gráfico."
          legend={<Legend series={SERIES} />}
          testId="forecast-chart"
          table={
            <Table>
              <THead>
                <TR>
                  <TH>Mes</TH>
                  <TH className="text-right">Facturas emitidas</TH>
                  <TH className="text-right">Encargos por facturar</TH>
                  <TH className="text-right">Total</TH>
                </TR>
              </THead>
              <TBody>
                {months.map((m) => (
                  <TR key={m.month}>
                    <TD>{m.label}</TD>
                    <TD className="text-right tabular-nums">{money(m.invoicedCents)}</TD>
                    <TD className="text-right tabular-nums">{money(m.pendingCents)}</TD>
                    <TD className="text-right tabular-nums">
                      {money(m.invoicedCents + m.pendingCents)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          }
        >
          <GroupedBarChart
            data={months}
            series={SERIES}
            value={(m, k) => m[k as 'invoicedCents' | 'pendingCents'] / 100}
            format={(v) => money(Math.round(v * 100))}
            ariaLabel="Cobros previstos por mes"
          />
        </ChartFrame>
        <section className="rounded-lg border bg-card p-4">
          <h3 className="mb-2 font-medium">Por cliente</h3>
          {f.byClient.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay nada pendiente de cobro.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Cliente</TH>
                  <TH className="text-right">Emitido</TH>
                  <TH className="text-right">Por facturar</TH>
                </TR>
              </THead>
              <TBody>
                {f.byClient.map((c) => (
                  <TR key={c.key}>
                    <TD>{c.label}</TD>
                    <TD className="text-right tabular-nums">{money(c.invoicedCents)}</TD>
                    <TD className="text-right tabular-nums">{money(c.pendingCents)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </section>
      </div>
      {f.items.length > 0 && (
        <details className="rounded-lg border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {f.items.length === 1 ? 'Ver la partida' : `Ver las ${f.items.length} partidas`}
          </summary>
          <ul className="mt-3 grid gap-1 text-sm" data-testid="forecast-items">
            {f.items.map((it) => {
              const Icon = it.kind === 'invoice' ? FileText : Package;
              const label = (
                <>
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {it.label}
                    {it.clientName && (
                      <span className="text-muted-foreground"> · {it.clientName}</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'w-28 text-right text-xs',
                      it.overdue ? 'font-medium text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {it.overdue ? 'Vencida ' : ''}
                    {formatDateES(it.expectedDate)}
                  </span>
                  <span className="w-28 text-right tabular-nums">
                    {formatMoney(it.cents, it.currency)}
                  </span>
                </>
              );
              const cls = 'flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent';
              return (
                <li key={`${it.kind}-${it.id}`}>
                  {it.kind === 'invoice' ? (
                    <Link to="/finanzas/facturas" search={{ factura: it.id }} className={cls}>
                      {label}
                    </Link>
                  ) : (
                    <Link to="/trabajo/encargos/$jobId" params={{ jobId: it.id }} className={cls}>
                      {label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
