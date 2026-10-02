import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CircleCheck, CircleDashed, House, Package } from 'lucide-react';
import { formatDateTimeES, formatMoney, type ActivityEntry } from '@l10n/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/misc';
import { DueLabel, JobStatusBadge } from '@/components/common/badges';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { useSettings, useTags } from '@/hooks/core';
import { useClients, useDashboard } from '@/hooks/work';
import { useBackups } from '@/features/settings/BackupsPanel';
import { Stat } from '@/features/work/shared';
import { TaskRow } from '@/features/work/tasks/TaskRow';
import { TaskQuickAdd } from '@/features/work/tasks/TaskQuickAdd';
import { api } from '@/lib/api';
import { formatHours } from '@/lib/format';

function greeting(date: Date): string {
  const h = date.getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 14) return 'Buenos días';
  if (h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

function todayLabel(date: Date): string {
  const s = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Step({
  done,
  children,
  to,
  search,
}: {
  done: boolean;
  children: React.ReactNode;
  to: string;
  search?: object;
}) {
  return (
    <Link
      to={to as never}
      search={search as never}
      className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent"
    >
      {done ? (
        <CircleCheck className="size-4 text-success" />
      ) : (
        <CircleDashed className="size-4 text-muted-foreground" />
      )}
      <span className={done ? 'text-muted-foreground line-through' : ''}>{children}</span>
    </Link>
  );
}

function FirstSteps() {
  const settings = useSettings();
  const tags = useTags();
  const backups = useBackups();
  const clients = useClients();
  const steps = [
    {
      done: Boolean(settings.data?.profile.businessName),
      label: 'Completa tus datos profesionales',
      to: '/ajustes',
      search: { tab: 'perfil' },
    },
    {
      done: (clients.data?.length ?? 0) > 0,
      label: 'Añade tu primer cliente',
      to: '/trabajo/clientes',
    },
    {
      done: Boolean(settings.data?.backups.directory),
      label: 'Elige una carpeta en la nube para las copias',
      to: '/ajustes',
      search: { tab: 'copias' },
    },
    {
      done: (tags.data?.length ?? 0) > 0,
      label: 'Crea tus primeras etiquetas',
      to: '/ajustes',
      search: { tab: 'etiquetas' },
    },
    {
      done: (backups.data?.items.length ?? 0) > 0,
      label: 'Comprueba que se ha hecho la primera copia',
      to: '/ajustes',
      search: { tab: 'copias' },
    },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Primeros pasos</CardTitle>
        <CardDescription>Deja la aplicación lista para trabajar.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1">
        {steps.map((s) => (
          <Step key={s.label} done={s.done} to={s.to} search={s.search}>
            {s.label}
          </Step>
        ))}
      </CardContent>
    </Card>
  );
}

export function HomePage() {
  const now = new Date();
  const settings = useSettings();
  const dashboard = useDashboard();
  const navigate = useNavigate();
  const activity = useQuery({
    queryKey: ['activity'],
    queryFn: () => api<ActivityEntry[]>('/activity', { query: { limit: 10 } }),
  });
  const name = settings.data?.profile.displayName;
  const d = dashboard.data;

  return (
    <Page wide>
      <PageHeader
        icon={<House />}
        title={`${greeting(now)}${name ? `, ${name}` : ''}`}
        description={todayLabel(now)}
      />
      {!d ? (
        <Spinner />
      ) : (
        <div className="grid gap-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Encargos en curso"
              value={d.activeJobCount}
              hint={
                d.overdueJobs.length ? `${d.overdueJobs.length} con la entrega atrasada` : undefined
              }
              tone={d.overdueJobs.length ? 'danger' : undefined}
            />
            <Stat
              label="Horas esta semana"
              value={formatHours(d.secondsThisWeek)}
              hint={`Hoy: ${formatHours(d.secondsToday)}`}
            />
            <Stat
              label="Entregado este mes"
              value={formatMoney(d.deliveredThisMonthCents, d.baseCurrency)}
            />
            <Stat
              label="Pendiente de facturar"
              value={formatMoney(d.pendingBillingCents, d.baseCurrency)}
              tone={d.pendingBillingCents > 0 ? 'warning' : undefined}
            />
          </div>
          <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
            <div className="grid content-start gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Para hoy</CardTitle>
                  <CardDescription>Tareas vencidas y de hoy.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {d.tasksOverdue.length + d.tasksToday.length === 0 && (
                    <p className="px-5 pb-3 text-sm text-muted-foreground">
                      Nada pendiente para hoy.
                    </p>
                  )}
                  <div className="border-t">
                    {d.tasksOverdue.map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                    {d.tasksToday.map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                    <TaskQuickAdd
                      defaults={{ dueDate: d.today }}
                      placeholder="Añadir tarea para hoy…"
                    />
                  </div>
                </CardContent>
              </Card>
              <FirstSteps />
            </div>
            <div className="grid content-start gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Entregas</CardTitle>
                  <CardDescription>Atrasadas y de los próximos 7 días.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-1 p-2 pt-0">
                  {d.overdueJobs.length + d.upcomingJobs.length === 0 && (
                    <p className="px-3 pb-2 text-sm text-muted-foreground">
                      Ninguna entrega próxima.
                    </p>
                  )}
                  {[...d.overdueJobs, ...d.upcomingJobs].map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() =>
                        void navigate({ to: '/trabajo/encargos/$jobId', params: { jobId: j.id } })
                      }
                      className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      {d.overdueJobs.includes(j) ? (
                        <AlertTriangle className="size-4 shrink-0 text-destructive" />
                      ) : (
                        <Package className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{j.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[j.projectName, j.clientName].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <JobStatusBadge status={j.status} />
                      <DueLabel date={j.dueDate} time={j.dueTime} className="w-24 text-right" />
                    </button>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Actividad reciente</CardTitle>
                </CardHeader>
                <CardContent>
                  {(activity.data?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">Aquí verás los últimos cambios.</p>
                  ) : (
                    <ul className="grid gap-2 text-sm">
                      {activity.data?.map((a) => (
                        <li key={a.id} className="flex gap-3">
                          <span className="w-32 shrink-0 text-xs text-muted-foreground">
                            {formatDateTimeES(a.createdAt)}
                          </span>
                          <span className="min-w-0">{a.summary}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
