import { useMemo, useState } from 'react';
import { ChartColumnBig, Download, Info } from 'lucide-react';
import { formatMoney, formatNumber, quarterOf, todayISO, type BreakdownRow } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { apiUrl } from '@/lib/api';
import { Stat } from '@/features/work/shared';
import { ChartFrame, GroupedBarChart, HBarList, Legend, type ChartSeries } from './charts';
import { ForecastPanel } from './ForecastPanel';
import { ProfitabilityPanel } from './ProfitabilityPanel';
import { useOverview, useQuarter } from './hooks';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const SERIES: ChartSeries[] = [
  { key: 'invoicedCents', label: 'Facturado (base)', color: 'var(--chart-1)' },
  { key: 'expensesCents', label: 'Gastos (base)', color: 'var(--chart-2)' },
];

const BREAKDOWNS = [
  { key: 'byClient', label: 'Cliente' },
  { key: 'byService', label: 'Servicio' },
  { key: 'byGame', label: 'Juego' },
  { key: 'byPair', label: 'Par de idiomas' },
] as const;

function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <Table>
      <THead>
        <TR>
          {head.map((h, i) => (
            <TH key={h} className={i > 0 ? 'text-right' : undefined}>
              {h}
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {rows.map((r, i) => (
          <TR key={i}>
            {r.map((c, j) => (
              <TD key={j} className={j > 0 ? 'text-right tabular-nums' : undefined}>
                {c}
              </TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function QuarterPanel({ year, currency }: { year: number; currency: string }) {
  const current = quarterOf(todayISO());
  const [quarter, setQuarter] = useState(year === current.year ? current.quarter : 4);
  const q = useQuarter(year, quarter);
  const r = q.data;
  const money = (c: number) => formatMoney(c, currency);
  return (
    <section className="rounded-lg border bg-card p-4" data-testid="quarter-report">
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-medium">Resumen trimestral de impuestos</h2>
          <p className="text-xs text-muted-foreground">
            Cifras orientativas para preparar los modelos 303 y 130.
          </p>
        </div>
        <Tabs value={String(quarter)} onValueChange={(v) => setQuarter(Number(v) as 1 | 2 | 3 | 4)}>
          <TabsList>
            {[1, 2, 3, 4].map((n) => (
              <TabsTrigger key={n} value={String(n)}>
                {n}T
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button size="sm" variant="outline" asChild>
          <a href={apiUrl('/reports/export', { year, quarter })}>
            <Download /> Excel del trimestre
          </a>
        </Button>
      </header>
      {!r ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid content-start gap-2">
            <h3 className="text-sm font-medium">Modelo 303 · IVA</h3>
            <dl className="grid gap-1 rounded-md bg-muted/40 p-3 text-sm">
              <div className="flex justify-between">
                <dt>Base facturada ({r.invoicesCount} facturas)</dt>
                <dd className="tabular-nums">{money(r.incomeBaseCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>IVA repercutido</dt>
                <dd className="tabular-nums">{money(r.vatChargedCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>IVA soportado deducible</dt>
                <dd className="tabular-nums">−{money(r.vatDeductibleCents)}</dd>
              </div>
              <div className="mt-1 flex justify-between border-t pt-2 font-semibold">
                <dt>{r.model303Cents >= 0 ? 'Resultado a ingresar' : 'Resultado a compensar'}</dt>
                <dd className="tabular-nums" data-testid="model-303">
                  {money(r.model303Cents)}
                </dd>
              </div>
            </dl>
          </div>
          <div className="grid content-start gap-2">
            <h3 className="text-sm font-medium">Modelo 130 · IRPF (acumulado del año)</h3>
            <dl className="grid gap-1 rounded-md bg-muted/40 p-3 text-sm">
              <div className="flex justify-between">
                <dt>Ingresos</dt>
                <dd className="tabular-nums">{money(r.ytdIncomeBaseCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Gastos deducibles</dt>
                <dd className="tabular-nums">−{money(r.ytdExpensesBaseCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Rendimiento neto</dt>
                <dd className="tabular-nums">{money(r.ytdNetCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>20 % del rendimiento</dt>
                <dd className="tabular-nums">
                  {money(Math.max(0, Math.round(r.ytdNetCents * 0.2)))}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Retenciones soportadas</dt>
                <dd className="tabular-nums">−{money(r.ytdWithheldCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Pagos de trimestres anteriores</dt>
                <dd className="tabular-nums">−{money(r.previousPaymentsCents)}</dd>
              </div>
              <div className="mt-1 flex justify-between border-t pt-2 font-semibold">
                <dt>Pago fraccionado</dt>
                <dd className="tabular-nums" data-testid="model-130">
                  {money(r.model130Cents)}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              En lo que va de año, el {formatNumber(r.withholdingSharePct, 1)} % de tus ingresos
              lleva retención. Si en el año anterior al menos el 70 % la llevaba, no tienes que
              presentar el modelo 130.
            </p>
          </div>
          <p className="flex gap-2 text-xs text-muted-foreground lg:col-span-2">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Es una estimación con los datos registrados en la app (facturas por fecha de emisión y
            gastos deducibles). No sustituye a la revisión de tu gestoría: no contempla prorratas,
            operaciones intracomunitarias ni otros casos especiales.
          </p>
        </div>
      )}
    </section>
  );
}

export function ReportsPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [breakdown, setBreakdown] = useState<(typeof BREAKDOWNS)[number]['key']>('byClient');
  const o = useOverview(year);
  const data = o.data;
  const currency = data?.baseCurrency ?? 'EUR';
  const money = (c: number) => formatMoney(c, currency);

  const months = useMemo(
    () =>
      (data?.months ?? []).map((m) => ({ ...m, label: MONTHS[Number(m.month.slice(5, 7)) - 1]! })),
    [data],
  );
  const rows: BreakdownRow[] = data ? data[breakdown] : [];

  return (
    <Page wide>
      <PageHeader
        title="Informes"
        icon={<ChartColumnBig />}
        description="Ingresos, gastos, cobros pendientes e impuestos orientativos, en tu moneda principal."
        actions={
          <>
            <Field label="Año" className="w-28">
              <NativeSelect
                value={String(year)}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="Año"
              >
                {Array.from({ length: 6 }, (_, i) => thisYear - i).map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </NativeSelect>
            </Field>
            <Button variant="outline" asChild className="self-end">
              <a href={apiUrl('/reports/export', { year })}>
                <Download /> Excel para la gestoría
              </a>
            </Button>
          </>
        }
      />
      {!data ? (
        <Spinner />
      ) : (
        <div className="grid gap-4">
          <ForecastPanel />

          <h2 className="mt-2 text-lg font-semibold">Ingresos y gastos de {year}</h2>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6" data-testid="finance-kpis">
            <Stat
              label="Facturado"
              value={money(data.totals.invoicedCents)}
              hint="Base imponible"
            />
            <Stat
              label="Cobrado"
              value={money(data.totals.paidCents)}
              hint="Base de las facturas cobradas"
            />
            <Stat label="Gastos" value={money(data.totals.expensesCents)} />
            <Stat
              label="Rendimiento neto"
              value={money(data.totals.netCents)}
              tone={data.totals.netCents < 0 ? 'danger' : undefined}
            />
            <Stat
              label="Pendiente de cobro"
              value={money(data.totals.pendingCollectionCents)}
              hint="Total de facturas emitidas"
            />
            <Stat
              label="€/hora efectivo"
              value={data.effectiveHourlyCents != null ? money(data.effectiveHourlyCents) : '—'}
              hint="Importe de encargos con tiempo registrado"
            />
          </div>

          <ChartFrame
            title={`Facturado y gastos por mes · ${year}`}
            description="Base imponible, sin IVA."
            legend={<Legend series={SERIES} />}
            testId="monthly-chart"
            table={
              <SimpleTable
                head={['Mes', 'Facturado', 'Cobrado', 'Gastos']}
                rows={months.map((m) => [
                  m.label,
                  money(m.invoicedCents),
                  money(m.paidCents),
                  money(m.expensesCents),
                ])}
              />
            }
          >
            <GroupedBarChart
              data={months}
              series={SERIES}
              value={(m, k) => m[k as 'invoicedCents' | 'expensesCents'] / 100}
              format={(v) => money(Math.round(v * 100))}
              ariaLabel={`Facturado y gastos por mes en ${year}`}
            />
          </ChartFrame>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartFrame
              title="Ingresos por…"
              description={
                <Tabs
                  value={breakdown}
                  onValueChange={(v) => setBreakdown(v as typeof breakdown)}
                  className="mt-2"
                >
                  <TabsList>
                    {BREAKDOWNS.map((b) => (
                      <TabsTrigger key={b.key} value={b.key}>
                        {b.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              }
              table={
                <SimpleTable
                  head={[BREAKDOWNS.find((b) => b.key === breakdown)!.label, 'Importe', 'Encargos']}
                  rows={rows.map((r) => [r.label, money(r.cents), r.count])}
                />
              }
            >
              <HBarList
                rows={rows.map((r) => ({
                  key: r.key,
                  label: r.label,
                  value: r.cents,
                  hint: `${r.count} encargos`,
                }))}
                format={money}
              />
            </ChartFrame>

            <ChartFrame
              title="Antigüedad de los cobros pendientes"
              description="Facturas emitidas sin cobrar, según los días transcurridos desde el vencimiento."
              table={
                <SimpleTable
                  head={['Tramo', 'Importe', 'Facturas']}
                  rows={data.receivables.map((r) => [r.label, money(r.cents), r.count])}
                />
              }
            >
              <HBarList
                rows={data.receivables.map((r) => ({
                  key: r.bucket,
                  label: r.label,
                  value: r.cents,
                  hint: `${r.count} facturas`,
                }))}
                format={money}
                empty="No hay cobros pendientes."
              />
            </ChartFrame>
          </div>

          <ProfitabilityPanel year={year} />

          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <section className="rounded-lg border bg-card p-4">
              <h2 className="font-medium">Días medios de cobro</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Desde la emisión hasta el cobro, por cliente.
              </p>
              {data.paymentDays.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Aún no hay facturas cobradas.
                </p>
              ) : (
                <SimpleTable
                  head={['Cliente', 'Días', 'Facturas']}
                  rows={data.paymentDays.map((p) => [p.clientName, p.days, p.invoices])}
                />
              )}
            </section>
            <QuarterPanel year={year} currency={currency} />
          </div>
        </div>
      )}
    </Page>
  );
}
