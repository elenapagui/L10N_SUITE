import { useMemo, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BILLING_STATUSES,
  JOB_STATUSES,
  UNIT_PLURALS,
  formatMoney,
  formatNumber,
  jobDate,
  labelOf,
  plural,
  type Job,
  type PeriodRange,
} from '@l10n/shared';
import { DueLabel, JobStatusBadge } from '@/components/common/badges';
import {
  CardGrid,
  GroupedList,
  PeriodPicker,
  StatusBoard,
  Timeline,
  ViewSwitcher,
  usePeriod,
  usePersistentState,
  type GroupOption,
  type ViewKind,
} from '@/components/views/views';
import { useInvalidateWork, useJobs } from '@/hooks/work';
import { api } from '@/lib/api';
import { JobsTable } from './JobsPage';
import { Stat } from './shared';

export const JOB_STATUS_COLORS: Record<string, string> = {
  received: '#64748b',
  in_progress: '#2563eb',
  delivered: '#16a34a',
  client_review: '#d97706',
  closed: '#475569',
  cancelled: '#dc2626',
};

/** Número de encargos, volumen por unidad e importe por moneda (sin los cancelados). */
export function jobTotals(jobs: Job[]) {
  const live = jobs.filter((j) => j.status !== 'cancelled');
  const units = new Map<string, number>();
  const money = new Map<string, number>();
  for (const j of live) {
    if (j.unit !== 'flat' && (j.weightedVolume ?? j.volume))
      units.set(j.unit, (units.get(j.unit) ?? 0) + (j.weightedVolume ?? j.volume ?? 0));
    if (j.amountCents) money.set(j.currency, (money.get(j.currency) ?? 0) + j.amountCents);
  }
  return { count: live.length, units, money };
}

export function jobTotalsText(jobs: Job[]): string {
  const t = jobTotals(jobs);
  return [
    plural(t.count, 'encargo', 'encargos'),
    ...[...t.units].map(([u, v]) => `${formatNumber(Math.round(v))} ${UNIT_PLURALS[u] ?? u}`),
    ...[...t.money].map(([c, cents]) => formatMoney(cents, c)),
  ].join(' · ');
}

/** Filtra los encargos cuya fecha (entrega real, prevista o recepción) cae en el periodo. */
export function jobsInPeriod(jobs: Job[], range: PeriodRange | null): Job[] {
  if (!range) return jobs;
  return jobs.filter((j) => {
    const d = jobDate(j);
    return d !== null && d >= range.from && d <= range.to;
  });
}

/** Filtro de texto por título, proyecto, cliente, juego o n.º de pedido. */
export function filterJobs(jobs: Job[], filter: string): Job[] {
  const q = filter.trim().toLowerCase();
  if (!q) return jobs;
  return jobs.filter((j) =>
    [j.title, j.projectName, j.clientName, j.gameTitle, j.poNumber]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(q)),
  );
}

/** Cambia el estado de un encargo al moverlo en el tablero (optimista; se deshace si falla). */
export function useMoveJob() {
  const qc = useQueryClient();
  const invalidate = useInvalidateWork();
  return async (job: Job, status: string) => {
    qc.setQueriesData<Job[]>({ queryKey: ['jobs'] }, (old) =>
      old?.map((j) => (j.id === job.id ? { ...j, status: status as Job['status'] } : j)),
    );
    try {
      await api(`/jobs/${job.id}`, { method: 'PATCH', body: { status } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido cambiar el estado.');
    }
    await invalidate();
  };
}

function JobCard({ job }: { job: Job }) {
  const done = !['received', 'in_progress', 'client_review'].includes(job.status);
  return (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-snug">{job.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {[job.projectName, job.clientName].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <DueLabel date={job.dueDate} time={job.dueTime} done={done} />
        {job.volume != null && job.unit !== 'flat' && (
          <span className="text-muted-foreground">
            {formatNumber(job.weightedVolume ?? job.volume)} {UNIT_PLURALS[job.unit]}
          </span>
        )}
        {job.amountCents != null && (
          <span className="ml-auto font-medium tabular-nums">
            {formatMoney(job.amountCents, job.currency)}
          </span>
        )}
      </div>
    </>
  );
}

const JOB_GROUPS: GroupOption<Job>[] = [
  { value: 'client', label: 'Cliente', get: (j) => j.clientName },
  { value: 'project', label: 'Proyecto', get: (j) => j.projectName },
  { value: 'game', label: 'Juego', get: (j) => j.gameTitle },
  { value: 'status', label: 'Estado', get: (j) => labelOf(JOB_STATUSES, j.status) },
  {
    value: 'billing',
    label: 'Facturación',
    get: (j) => labelOf(BILLING_STATUSES, j.billingStatus),
  },
];

/** Los encargos en la vista elegida: tabla, tarjetas, tablero, agrupada o línea de tiempo. */
export function JobsView({
  jobs,
  view,
  range,
  filter = '',
  showProject = true,
  storageKey,
}: {
  jobs: Job[];
  view: ViewKind;
  range: PeriodRange | null;
  filter?: string;
  showProject?: boolean;
  storageKey: string;
}) {
  const navigate = useNavigate();
  const move = useMoveJob();
  const [groupBy, setGroupBy] = usePersistentState(`l10n-group-${storageKey}`, 'client');
  const open = (j: Job) =>
    void navigate({ to: '/trabajo/encargos/$jobId', params: { jobId: j.id } });
  const visible = filterJobs(jobs, filter);

  if (view === 'cards')
    return (
      <CardGrid
        items={visible}
        getId={(j) => j.id}
        onClick={open}
        renderCard={(j) => (
          <>
            <span className="justify-self-start">
              <JobStatusBadge status={j.status} />
            </span>
            <JobCard job={j} />
          </>
        )}
        empty="No hay encargos."
      />
    );
  if (view === 'board')
    return (
      <StatusBoard
        items={visible}
        columns={JOB_STATUSES.map((s) => ({
          value: s.value,
          label: s.label,
          color: JOB_STATUS_COLORS[s.value],
        }))}
        getId={(j) => j.id}
        getStatus={(j) => j.status}
        renderCard={(j) => <JobCard job={j} />}
        onMove={(j, s) => void move(j, s)}
        onOpen={open}
        columnFooter={(list) => {
          const t = jobTotals(list);
          return [...t.money].map(([c, cents]) => formatMoney(cents, c)).join(' · ');
        }}
      />
    );
  if (view === 'grouped')
    return (
      <GroupedList
        items={visible}
        options={showProject ? JOB_GROUPS : JOB_GROUPS.filter((g) => g.value !== 'project')}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        render={(list) => <JobsTable jobs={list} showProject={showProject} />}
        subtotal={jobTotalsText}
      />
    );
  if (view === 'timeline')
    return (
      <Timeline
        items={visible}
        getId={(j) => j.id}
        getStart={(j) => j.receivedAt ?? j.createdAt.slice(0, 10)}
        getEnd={(j) => j.deliveredAt ?? j.dueDate ?? jobDate(j)}
        getLabel={(j) => j.title}
        getSublabel={(j) => [j.projectName, j.clientName].filter(Boolean).join(' · ')}
        getColor={(j) => JOB_STATUS_COLORS[j.status] ?? null}
        onOpen={open}
        range={range}
      />
    );
  return <JobsTable jobs={visible} showProject={showProject} />;
}

export interface PeriodStats {
  count: number;
  money: Map<string, number>;
}

/** «1.200,00 € · 300,00 US$» */
export function moneyText(money: Map<string, number> | undefined): string {
  if (!money || money.size === 0) return '—';
  return [...money].map(([c, cents]) => formatMoney(cents, c)).join(' · ');
}

/**
 * Encargos e importes del periodo agrupados por proyecto, cliente o juego (sin cancelados).
 * Con «Total», todos los encargos.
 */
export function usePeriodJobStats(
  range: PeriodRange | null,
  key: (j: Job) => string | null,
): Map<string, PeriodStats> {
  const jobs = useJobs({});
  return useMemo(() => {
    const out = new Map<string, PeriodStats>();
    for (const j of jobsInPeriod(jobs.data ?? [], range)) {
      const k = key(j);
      if (!k || j.status === 'cancelled') continue;
      const s = out.get(k) ?? { count: 0, money: new Map<string, number>() };
      s.count++;
      if (j.amountCents) s.money.set(j.currency, (s.money.get(j.currency) ?? 0) + j.amountCents);
      out.set(k, s);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs.data, range]);
}

/**
 * Encargos de una ficha (proyecto, cliente, juego) con periodo: total, año, trimestre o mes,
 * cifras del periodo (encargos, volumen, importe, horas y €/hora) y la vista elegida.
 */
export function PeriodJobs({
  jobs,
  storageKey,
  showProject = false,
  actions,
}: {
  jobs: Job[];
  storageKey: string;
  showProject?: boolean;
  actions?: ReactNode;
}) {
  const { period, setPeriod, range } = usePeriod(storageKey);
  const [layout, setLayout] = usePersistentState<ViewKind>(`l10n-view-${storageKey}`, 'table');
  const list = useMemo(() => jobsInPeriod(jobs, range), [jobs, range]);
  const t = jobTotals(list);
  const seconds = list.reduce((s, j) => s + (j.loggedSeconds ?? 0), 0);
  const single = t.money.size === 1 ? [...t.money][0]! : null;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {actions}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <PeriodPicker period={period} onChange={setPeriod} range={range} />
          <ViewSwitcher
            views={['table', 'cards', 'board', 'grouped', 'timeline']}
            value={layout}
            onChange={setLayout}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4" data-testid="period-stats">
        <Stat label={range ? `Encargos · ${range.label}` : 'Encargos'} value={t.count} />
        <Stat
          label="Volumen"
          value={
            [...t.units]
              .map(([u, v]) => `${formatNumber(Math.round(v))} ${UNIT_PLURALS[u] ?? u}`)
              .join(' · ') || '—'
          }
        />
        <Stat label="Importe" value={moneyText(t.money)} />
        <Stat
          label="Horas registradas"
          value={formatNumber(seconds / 3600, 1)}
          hint={
            single && seconds > 0
              ? `${formatMoney(Math.round(single[1] / (seconds / 3600)), single[0])}/hora`
              : undefined
          }
        />
      </div>
      <JobsView
        jobs={list}
        view={layout}
        range={range}
        showProject={showProject}
        storageKey={storageKey}
      />
    </div>
  );
}
