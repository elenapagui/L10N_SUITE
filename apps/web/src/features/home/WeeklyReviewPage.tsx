import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  FileText,
  GraduationCap,
  Package,
  Printer,
} from 'lucide-react';
import {
  UNIT_PLURALS,
  addDaysISO,
  formatDateES,
  formatMoney,
  formatNumber,
  type WeeklyReview,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/misc';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { api } from '@/lib/api';
import { Stat } from '@/features/work/shared';

export const useWeeklyReview = (week?: string) =>
  useQuery({
    queryKey: ['weekly-review', week ?? null],
    queryFn: () => api<WeeklyReview>('/review/weekly', { query: { week } }),
  });

const short = (d: string) => formatDateES(d).slice(0, 5);

function List({
  empty,
  children,
}: {
  empty: string;
  children: React.ReactNode[] | React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return <ul className="grid gap-1.5 text-sm">{items}</ul>;
}

/** Revisión semanal: lo hecho en una semana y lo que viene en la siguiente. */
export function WeeklyReviewPage() {
  const { semana } = useSearch({ strict: false }) as { semana?: string };
  const navigate = useNavigate();
  const q = useWeeklyReview(semana);
  const r = q.data;
  const go = (week: string) => void navigate({ to: '/revision-semanal', search: { semana: week } });

  return (
    <Page>
      <PageHeader
        icon={<CalendarCheck />}
        title="Revisión semanal"
        description={
          r
            ? `Semana del ${formatDateES(r.weekStart)} al ${formatDateES(r.weekEnd)}, y lo que viene hasta el ${formatDateES(r.nextEnd)}.`
            : undefined
        }
        actions={
          r && (
            <div className="flex items-center gap-1 print:hidden">
              <Button
                variant="outline"
                size="icon"
                aria-label="Semana anterior"
                onClick={() => go(addDaysISO(r.weekStart, -7))}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Semana siguiente"
                onClick={() => go(addDaysISO(r.weekStart, 7))}
              >
                <ChevronRight />
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer /> Imprimir o PDF
              </Button>
            </div>
          )
        }
      />
      {!r ? <Spinner /> : <ReviewBody r={r} />}
    </Page>
  );
}

function ReviewBody({ r }: { r: WeeklyReview }) {
  const money = (c: number) => formatMoney(c, r.baseCurrency);
  const d = r.done;
  const n = r.next;
  const volume = d.delivered.units
    .map((u) => `${formatNumber(Math.round(u.volume))} ${UNIT_PLURALS[u.unit] ?? u.unit}`)
    .join(' · ');
  return (
    <div className="grid gap-6" data-testid="weekly-review">
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">
          Lo que hiciste ({short(r.weekStart)}–{short(r.weekEnd)})
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Encargos entregados" value={d.delivered.count} hint={volume || undefined} />
          <Stat label="Importe entregado" value={money(d.delivered.cents)} hint="Base, sin IVA" />
          <Stat
            label="Facturado"
            value={money(d.invoiced.cents)}
            hint={`${d.invoiced.count} ${d.invoiced.count === 1 ? 'factura' : 'facturas'} · cobrado ${money(d.collected.cents)}`}
          />
          <Stat
            label="Horas registradas"
            value={formatNumber(d.hours.total, 1)}
            hint={`${d.tasksCompleted.count} ${d.tasksCompleted.count === 1 ? 'tarea completada' : 'tareas completadas'}`}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Entregas</CardTitle>
            </CardHeader>
            <CardContent>
              <List empty="Ninguna entrega esta semana.">
                {d.delivered.jobs.map((j) => (
                  <li key={j.id} className="flex items-center gap-2">
                    <Package className="size-4 shrink-0 text-muted-foreground" />
                    <Link
                      to="/trabajo/encargos/$jobId"
                      params={{ jobId: j.id }}
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      {j.title}
                      {j.clientName && (
                        <span className="text-muted-foreground"> · {j.clientName}</span>
                      )}
                    </Link>
                    <span className="text-xs text-muted-foreground">{short(j.deliveredAt)}</span>
                  </li>
                ))}
              </List>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tiempo y tareas</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <List empty="Sin tiempo registrado.">
                {d.hours.byArea.map((a) => (
                  <li key={a.name} className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: a.color }} />
                    <span className="flex-1">{a.name}</span>
                    <span className="tabular-nums">{formatNumber(a.hours, 1)} h</span>
                  </li>
                ))}
              </List>
              {d.tasksCompleted.titles.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Tareas completadas
                  </p>
                  <List empty="">
                    {d.tasksCompleted.titles.map((title, i) => (
                      <li key={i} className="truncate">
                        ✓ {title}
                      </li>
                    ))}
                  </List>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Investigación</CardTitle>
              <CardDescription>
                {d.referencesRead}{' '}
                {d.referencesRead === 1 ? 'lectura terminada' : 'lecturas terminadas'} ·{' '}
                {d.referencesAdded}{' '}
                {d.referencesAdded === 1 ? 'referencia nueva' : 'referencias nuevas'} ·{' '}
                {formatNumber(d.corpus.segments)} segmentos de corpus
              </CardDescription>
            </CardHeader>
            <CardContent>
              <List empty="Sin cambios en tus publicaciones.">
                {d.academic.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <GraduationCap className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span>{a.summary}</span>
                  </li>
                ))}
              </List>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">
          Lo que viene ({short(r.nextStart)}–{short(r.nextEnd)})
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Entregas" value={n.deliveries.length} />
          <Stat label="Tareas con fecha" value={n.tasks.length} />
          <Stat
            label="Cobros previstos"
            value={money(n.collections.cents)}
            hint={
              n.overdueCollectionsCents > 0
                ? `y ${money(n.overdueCollectionsCents)} vencidos`
                : undefined
            }
          />
          <Stat
            label="Tareas vencidas"
            value={n.overdueTasks}
            tone={n.overdueTasks > 0 ? 'danger' : undefined}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Entregas</CardTitle>
            </CardHeader>
            <CardContent>
              <List empty="Ninguna entrega prevista.">
                {n.deliveries.map((j) => (
                  <li key={j.id} className="flex items-center gap-2">
                    <Package className="size-4 shrink-0 text-muted-foreground" />
                    <Link
                      to="/trabajo/encargos/$jobId"
                      params={{ jobId: j.id }}
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      {j.title}
                      {j.clientName && (
                        <span className="text-muted-foreground"> · {j.clientName}</span>
                      )}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {short(j.dueDate)}
                      {j.dueTime ? ` ${j.dueTime}` : ''}
                    </span>
                  </li>
                ))}
              </List>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tareas</CardTitle>
            </CardHeader>
            <CardContent>
              <List empty="Ninguna tarea con fecha.">
                {n.tasks.slice(0, 15).map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="text-xs text-muted-foreground">{short(t.dueDate)}</span>
                  </li>
                ))}
              </List>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plazos académicos</CardTitle>
            </CardHeader>
            <CardContent>
              <List empty="Ningún plazo.">
                {n.deadlines.map((e) => (
                  <li key={`${e.kind}-${e.id}`} className="flex items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{e.title}</span>
                    <span className="text-xs text-muted-foreground">{short(e.date)}</span>
                  </li>
                ))}
              </List>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
