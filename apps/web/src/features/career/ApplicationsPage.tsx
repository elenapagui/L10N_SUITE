import { useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { BriefcaseBusiness, Kanban, List, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  APPLICATION_KINDS,
  APPLICATION_STATUSES,
  formatDateES,
  labelOf,
  plural,
  todayISO,
  type ApplicationKind,
  type ApplicationStatus,
  type JobApplication,
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
import { Input, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Spinner } from '@/components/ui/misc';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { EmptyState, Page, PageHeader } from '@/components/layout/PageHeader';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Stat } from '@/features/work/shared';
import { useApplications } from './hooks';

const STAGE_COLORS: Record<string, string> = {
  open: '#64748b',
  active: '#0891b2',
  done: '#22c55e',
  closed: '#ef4444',
};

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const s = APPLICATION_STATUSES.find((x) => x.value === status)!;
  const variant =
    s.stage === 'done'
      ? 'success'
      : s.stage === 'active'
        ? 'warning'
        : s.stage === 'closed'
          ? 'destructive'
          : 'outline';
  return <Badge variant={variant}>{s.label}</Badge>;
}

/** «Entrevista: 9 oct., 11:30» o «Seguimiento: 15 oct.». */
function NextLine({ a }: { a: JobApplication }) {
  const today = todayISO();
  if (a.nextDate)
    return (
      <span className="text-xs font-medium text-cyan-800 dark:text-cyan-300">
        {a.nextDate.label}: {formatDateES(a.nextDate.date)}
        {a.nextDate.time ? `, ${a.nextDate.time}` : ''}
      </span>
    );
  if (a.status === 'saved' && a.deadline)
    return (
      <span
        className={cn(
          'text-xs',
          a.deadline < today ? 'font-medium text-destructive' : 'text-muted-foreground',
        )}
      >
        Plazo: {formatDateES(a.deadline)}
      </span>
    );
  if (a.followUpAt)
    return (
      <span
        className={cn(
          'text-xs',
          a.followUpAt <= today ? 'font-medium text-amber-700' : 'text-muted-foreground',
        )}
      >
        Seguimiento: {formatDateES(a.followUpAt)}
      </span>
    );
  return null;
}

function Card({ a, dragging }: { a: JobApplication; dragging?: boolean }) {
  return (
    <div
      className={cn(
        'grid gap-1 rounded-md border bg-card p-2.5 text-sm shadow-xs',
        dragging && 'rotate-1 shadow-lg ring-2 ring-primary/40',
      )}
    >
      <div className="font-medium leading-snug">{a.title}</div>
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span className="truncate">{a.company}</span>
        <span>· {a.kind === 'freelance' ? 'Freelance' : 'Plantilla'}</span>
      </div>
      <NextLine a={a} />
    </div>
  );
}

function DraggableCard({ a }: { a: JobApplication }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: a.id });
  return (
    <Link
      to="/empleo/$applicationId"
      params={{ applicationId: a.id }}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn('block', isDragging && 'opacity-30')}
      data-testid="application-card"
    >
      <Card a={a} />
    </Link>
  );
}

function Column({
  status,
  children,
  count,
}: {
  status: (typeof APPLICATION_STATUSES)[number];
  children: React.ReactNode;
  count: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.value });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-60 shrink-0 flex-col rounded-lg bg-muted/50 p-2',
        isOver && 'bg-primary/5 ring-2 ring-primary/30',
      )}
      data-testid={`column-${status.value}`}
    >
      <div className="mb-2 flex items-center gap-2 px-1 text-sm font-medium">
        <span
          className="size-2.5 rounded-full"
          style={{ background: STAGE_COLORS[status.stage] }}
        />
        {status.label}
        <span className="text-xs font-normal text-muted-foreground">{count}</span>
      </div>
      <div className="grid min-h-16 content-start gap-2">{children}</div>
    </div>
  );
}

function NewApplicationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [kind, setKind] = useState<ApplicationKind>('freelance');
  const [url, setUrl] = useState('');
  const [applied, setApplied] = useState(true);
  const reset = () => {
    setTitle('');
    setCompany('');
    setKind('freelance');
    setUrl('');
    setApplied(true);
  };
  const create = async () => {
    try {
      const a = await api<JobApplication>('/job-applications', {
        method: 'POST',
        body: {
          title: title.trim(),
          company: company.trim(),
          kind,
          url: url.trim() || null,
          status: applied ? 'applied' : 'saved',
        },
      });
      await qc.invalidateQueries({ queryKey: ['job-applications'] });
      onOpenChange(false);
      reset();
      void navigate({ to: '/empleo/$applicationId', params: { applicationId: a.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido guardar.');
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva candidatura</DialogTitle>
        </DialogHeader>
        <Field label="Puesto">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Traductora KO-ES de videojuegos"
            data-testid="application-title"
          />
        </Field>
        <Field label="Empresa">
          <Input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            data-testid="application-company"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo">
            <NativeSelect
              value={kind}
              onChange={(e) => setKind(e.target.value as ApplicationKind)}
              data-testid="application-kind"
            >
              {APPLICATION_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Enlace a la oferta">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={applied}
            onChange={(e) => setApplied(e.target.checked)}
            data-testid="application-applied"
          />
          Ya he enviado la solicitud (hoy)
        </label>
        <DialogFooter>
          <Button
            disabled={!title.trim() || !company.trim()}
            onClick={() => void create()}
            data-testid="application-create"
          >
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function readView(): 'board' | 'list' {
  try {
    return localStorage.getItem('l10n-applications-view') === 'list' ? 'list' : 'board';
  } catch {
    return 'board';
  }
}

export function ApplicationsPage() {
  const q = useApplications();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [view, setView] = useState<'board' | 'list'>(readView);
  const [kind, setKind] = useState<'all' | ApplicationKind>('all');
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const all = useMemo(() => q.data ?? [], [q.data]);
  const list = useMemo(
    () => (kind === 'all' ? all : all.filter((a) => a.kind === kind)),
    [all, kind],
  );

  // Cifras: candidaturas presentadas, con respuesta y tiempo medio hasta la respuesta.
  const stats = useMemo(() => {
    const applied = list.filter((a) => a.appliedAt);
    const answered = applied.filter((a) => a.firstResponseDays != null);
    const days = answered.map((a) => Math.max(0, a.firstResponseDays!));
    const stage = (a: JobApplication) =>
      APPLICATION_STATUSES.find((s) => s.value === a.status)!.stage;
    return {
      active: list.filter((a) => stage(a) === 'active').length,
      inProcess: list.filter((a) => a.status === 'test' || a.status === 'interview').length,
      applied: applied.length,
      responseRate: applied.length ? Math.round((answered.length / applied.length) * 100) : null,
      avgDays: days.length ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : null,
    };
  }, [list]);

  const upcoming = list
    .filter((a) => a.nextDate)
    .sort((x, y) =>
      (x.nextDate!.date + (x.nextDate!.time ?? '')).localeCompare(
        y.nextDate!.date + (y.nextDate!.time ?? ''),
      ),
    );

  const setStatus = async (id: string, status: string) => {
    const before = qc.getQueryData<JobApplication[]>(['job-applications']);
    qc.setQueryData<JobApplication[]>(['job-applications'], (old) =>
      old?.map((a) => (a.id === id ? { ...a, status: status as ApplicationStatus } : a)),
    );
    try {
      await api(`/job-applications/${id}`, { method: 'PATCH', body: { status } });
    } catch (error) {
      qc.setQueryData(['job-applications'], before);
      toast.error(error instanceof Error ? error.message : 'No se ha podido cambiar el estado.');
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['job-applications'] }),
      qc.invalidateQueries({ queryKey: ['job-application', id] }),
      qc.invalidateQueries({ queryKey: ['job-application-events', id] }),
    ]);
  };

  const columns = useMemo<ColumnDef<JobApplication, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Puesto',
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      { accessorKey: 'company', header: 'Empresa' },
      {
        accessorKey: 'kind',
        header: 'Tipo',
        cell: ({ row }) => labelOf(APPLICATION_KINDS, row.original.kind),
      },
      {
        accessorKey: 'status',
        header: 'Estado',
        cell: ({ row }) => <ApplicationStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'appliedAt',
        header: 'Solicitada',
        cell: ({ row }) => formatDateES(row.original.appliedAt),
      },
      {
        id: 'next',
        header: 'Próximo paso',
        accessorFn: (a) => a.nextDate?.date ?? a.followUpAt ?? a.deadline ?? '',
        cell: ({ row }) => <NextLine a={row.original} />,
      },
      { accessorKey: 'source', header: 'Fuente' },
    ],
    [],
  );

  const activeApp = active ? list.find((a) => a.id === active) : null;

  return (
    <Page wide>
      <PageHeader
        title="Candidaturas"
        icon={<BriefcaseBusiness />}
        description="Las ofertas a las que te presentas, en agencias y en plantilla: pruebas, entrevistas, seguimiento y respuestas."
        actions={
          <>
            <NativeSelect
              className="h-9 w-40"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              aria-label="Tipo"
            >
              <option value="all">Todas</option>
              {APPLICATION_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </NativeSelect>
            <div className="flex rounded-md border p-0.5">
              {(['board', 'list'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={cn(
                    'flex items-center gap-1 rounded px-2 py-1 text-sm',
                    view === v ? 'bg-accent font-medium' : 'text-muted-foreground',
                  )}
                  onClick={() => {
                    setView(v);
                    try {
                      localStorage.setItem('l10n-applications-view', v);
                    } catch {
                      /* sin almacenamiento */
                    }
                  }}
                >
                  {v === 'board' ? <Kanban className="size-4" /> : <List className="size-4" />}
                  {v === 'board' ? 'Tablero' : 'Lista'}
                </button>
              ))}
            </div>
            <Button onClick={() => setCreating(true)} data-testid="new-application">
              <Plus /> Nueva candidatura
            </Button>
          </>
        }
      />
      {list.length > 0 && (
        <div
          className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          data-testid="application-stats"
        >
          <Stat
            label="En curso"
            value={stats.active}
            hint={`${stats.inProcess} con prueba o entrevista`}
          />
          <Stat label="Presentadas" value={stats.applied} />
          <Stat
            label="Tasa de respuesta"
            value={stats.responseRate == null ? '—' : `${stats.responseRate} %`}
            hint="Prueba, entrevista, oferta o respuesta"
          />
          <Stat
            label="Días hasta la respuesta"
            value={stats.avgDays ?? '—'}
            hint="Media desde la solicitud"
          />
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <span className="text-muted-foreground">Próximas fechas:</span>
          {upcoming.slice(0, 6).map((a) => (
            <Link
              key={a.id}
              to="/empleo/$applicationId"
              params={{ applicationId: a.id }}
              className="rounded-full border px-2.5 py-0.5 hover:bg-accent"
            >
              {a.nextDate!.label} · {formatDateES(a.nextDate!.date)}
              {a.nextDate!.time ? ` ${a.nextDate!.time}` : ''} · {a.company}
            </Link>
          ))}
        </div>
      )}
      {q.isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<BriefcaseBusiness />}
          title={all.length ? 'No hay candidaturas de este tipo' : 'Aún no hay candidaturas'}
          description="Guarda las ofertas que te interesan y anota cada paso: la prueba, las entrevistas y las respuestas. La app te avisa si conviene escribir para preguntar."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus /> Nueva candidatura
            </Button>
          }
        />
      ) : view === 'list' ? (
        <DataTable
          data={list}
          columns={columns}
          onRowClick={(a) =>
            void navigate({ to: '/empleo/$applicationId', params: { applicationId: a.id } })
          }
        />
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(e) => setActive(String(e.active.id))}
          onDragCancel={() => setActive(null)}
          onDragEnd={(e) => {
            setActive(null);
            const to = e.over?.id ? String(e.over.id) : null;
            const a = list.find((x) => x.id === e.active.id);
            if (a && to && to !== a.status) void setStatus(a.id, to);
          }}
        >
          <div className="flex gap-3 overflow-x-auto pb-3">
            {APPLICATION_STATUSES.map((s) => {
              const items = list.filter((a) => a.status === s.value);
              return (
                <Column key={s.value} status={s} count={items.length}>
                  {items.map((a) => (
                    <DraggableCard key={a.id} a={a} />
                  ))}
                </Column>
              );
            })}
          </div>
          <DragOverlay>{activeApp && <Card a={activeApp} dragging />}</DragOverlay>
        </DndContext>
      )}
      {list.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {plural(list.length, 'candidatura', 'candidaturas')}. Arrastra una tarjeta para cambiar su
          estado.
        </p>
      )}
      <NewApplicationDialog open={creating} onOpenChange={setCreating} />
    </Page>
  );
}
