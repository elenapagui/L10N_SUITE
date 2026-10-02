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
import { GraduationCap, Kanban, List, Plus } from 'lucide-react';
import {
  PUBLICATION_STATUSES,
  PUBLICATION_TYPES,
  formatDateES,
  labelOf,
  todayISO,
  type Publication,
  type PublicationStatus,
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
import { useSettings } from '@/hooks/core';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { usePublications } from './hooks';

const STAGE_COLORS: Record<string, string> = {
  writing: '#64748b',
  review: '#f59e0b',
  done: '#22c55e',
  closed: '#ef4444',
};

export function StatusBadge({ status }: { status: PublicationStatus }) {
  const s = PUBLICATION_STATUSES.find((x) => x.value === status)!;
  const variant =
    s.stage === 'done'
      ? 'success'
      : s.stage === 'review'
        ? 'warning'
        : s.stage === 'closed'
          ? 'destructive'
          : 'outline';
  return <Badge variant={variant}>{s.label}</Badge>;
}

function DeadlineLabel({ date }: { date: string | null }) {
  if (!date) return null;
  const late = date < todayISO();
  return (
    <span
      className={cn('text-xs', late ? 'font-medium text-destructive' : 'text-muted-foreground')}
    >
      Plazo: {formatDateES(date)}
    </span>
  );
}

function Card({ p, dragging }: { p: Publication; dragging?: boolean }) {
  return (
    <div
      className={cn(
        'grid gap-1.5 rounded-md border bg-card p-2.5 text-sm shadow-xs',
        dragging && 'rotate-1 shadow-lg ring-2 ring-primary/40',
      )}
    >
      <div className="font-medium leading-snug">{p.title}</div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{labelOf(PUBLICATION_TYPES, p.type)}</span>
        {p.journalName && <span className="truncate italic">{p.journalName}</span>}
      </div>
      <div className="flex items-center gap-2">
        <DeadlineLabel date={p.deadline} />
        {p.openTaskCount > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {p.openTaskCount} {p.openTaskCount === 1 ? 'tarea' : 'tareas'}
          </span>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ p }: { p: Publication }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id });
  return (
    <Link
      to="/academico/publicaciones/$publicationId"
      params={{ publicationId: p.id }}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn('block', isDragging && 'opacity-30')}
      data-testid="publication-card"
    >
      <Card p={p} />
    </Link>
  );
}

function Column({
  status,
  children,
  count,
}: {
  status: (typeof PUBLICATION_STATUSES)[number];
  children: React.ReactNode;
  count: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.value });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-64 shrink-0 flex-col rounded-lg bg-muted/50 p-2',
        isOver && 'bg-primary/5 ring-2 ring-primary/30',
      )}
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

function NewPublicationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const settings = useSettings();
  const [title, setTitle] = useState('');
  const [type, setType] = useState('article');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva publicación</DialogTitle>
        </DialogHeader>
        <Field label="Título (provisional)">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            data-testid="publication-title"
          />
        </Field>
        <Field label="Tipo">
          <NativeSelect value={type} onChange={(e) => setType(e.target.value)}>
            {PUBLICATION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <DialogFooter>
          <Button
            disabled={!title.trim()}
            onClick={async () => {
              const me = settings.data?.profile.displayName || settings.data?.profile.businessName;
              const p = await api<Publication>('/publications', {
                method: 'POST',
                body: {
                  title: title.trim(),
                  type,
                  authors: me ? [{ name: me, isMe: true, corresponding: true }] : [],
                },
              });
              await qc.invalidateQueries({ queryKey: ['publications'] });
              onOpenChange(false);
              setTitle('');
              void navigate({
                to: '/academico/publicaciones/$publicationId',
                params: { publicationId: p.id },
              });
            }}
            data-testid="publication-create"
          >
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PublicationsPage() {
  const pubs = usePublications();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [view, setView] = useState<'board' | 'list'>(() => {
    try {
      return (localStorage.getItem('l10n-publications-view') as 'board' | 'list') ?? 'board';
    } catch {
      return 'board';
    }
  });
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const list = useMemo(() => pubs.data ?? [], [pubs.data]);
  const upcoming = list
    .filter(
      (p) => p.deadline && !['published', 'rejected', 'accepted', 'in_press'].includes(p.status),
    )
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!));

  const setStatus = async (id: string, status: string) => {
    qc.setQueryData<Publication[]>(['publications'], (old) =>
      old?.map((p) => (p.id === id ? { ...p, status: status as PublicationStatus } : p)),
    );
    await api(`/publications/${id}`, { method: 'PATCH', body: { status } });
    await qc.invalidateQueries({ queryKey: ['publications'] });
  };

  const columns = useMemo<ColumnDef<Publication, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Título',
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        accessorKey: 'type',
        header: 'Tipo',
        cell: ({ row }) => labelOf(PUBLICATION_TYPES, row.original.type),
      },
      {
        accessorKey: 'status',
        header: 'Estado',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      { accessorKey: 'journalName', header: 'Revista o congreso' },
      {
        id: 'authors',
        header: 'Autoría',
        accessorFn: (p) => p.authors.map((a) => a.name).join(', '),
      },
      {
        accessorKey: 'deadline',
        header: 'Plazo',
        cell: ({ row }) => <DeadlineLabel date={row.original.deadline} />,
      },
      {
        accessorKey: 'updatedAt',
        header: 'Modificada',
        cell: ({ row }) => formatDateES(row.original.updatedAt.slice(0, 10)),
      },
    ],
    [],
  );

  const activePub = active ? list.find((p) => p.id === active) : null;

  return (
    <Page wide>
      <PageHeader
        title="Publicaciones"
        icon={<GraduationCap />}
        description="Tus artículos, capítulos y ponencias, de la idea a la publicación, con sus envíos, tareas y bibliografía."
        actions={
          <>
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
                      localStorage.setItem('l10n-publications-view', v);
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
            <Button onClick={() => setCreating(true)} data-testid="new-publication">
              <Plus /> Nueva publicación
            </Button>
          </>
        }
      />
      {upcoming.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <span className="text-muted-foreground">Próximos plazos:</span>
          {upcoming.slice(0, 5).map((p) => (
            <Link
              key={p.id}
              to="/academico/publicaciones/$publicationId"
              params={{ publicationId: p.id }}
              className="rounded-full border px-2.5 py-0.5 hover:bg-accent"
            >
              {formatDateES(p.deadline)} ·{' '}
              {p.title.length > 40 ? `${p.title.slice(0, 40)}…` : p.title}
            </Link>
          ))}
        </div>
      )}
      {pubs.isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<GraduationCap />}
          title="Aún no hay publicaciones"
          description="Empieza por una idea: podrás añadir el esquema, la revista, los envíos y la bibliografía."
        />
      ) : view === 'list' ? (
        <DataTable
          data={list}
          columns={columns}
          onRowClick={(p) =>
            void navigate({
              to: '/academico/publicaciones/$publicationId',
              params: { publicationId: p.id },
            })
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
            const p = list.find((x) => x.id === e.active.id);
            if (p && to && to !== p.status) void setStatus(p.id, to);
          }}
        >
          <div className="flex gap-3 overflow-x-auto pb-3">
            {PUBLICATION_STATUSES.map((s) => {
              const items = list.filter((p) => p.status === s.value);
              return (
                <Column key={s.value} status={s} count={items.length}>
                  {items.map((p) => (
                    <DraggableCard key={p.id} p={p} />
                  ))}
                </Column>
              );
            })}
          </div>
          <DragOverlay>{activePub && <Card p={activePub} dragging />}</DragOverlay>
        </DndContext>
      )}
      <NewPublicationDialog open={creating} onOpenChange={setCreating} />
    </Page>
  );
}
