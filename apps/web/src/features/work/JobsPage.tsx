import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Package, Plus, Search } from 'lucide-react';
import {
  CONTENT_TYPES,
  SERVICES,
  UNITS,
  UNIT_PLURALS,
  formatMoney,
  formatNumber,
  labelOf,
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
import { Input, NativeSelect } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { EntitySelect } from '@/components/common/EntitySelect';
import { DecimalInput } from '@/components/common/inputs';
import { BillingBadge, DueLabel, JobStatusBadge } from '@/components/common/badges';
import { EmptyState, Page, PageHeader } from '@/components/layout/PageHeader';
import { useApiMutation, useJobs, useProjects, useTemplates } from '@/hooks/work';
import { api } from '@/lib/api';

export function NewJobDialog({
  open,
  onOpenChange,
  projectId: fixedProjectId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId?: string;
}) {
  const navigate = useNavigate();
  const projects = useProjects({ status: 'prospect,active,paused' });
  const templates = useTemplates('job');
  const [projectId, setProjectId] = useState<string | null>(fixedProjectId ?? null);
  const [title, setTitle] = useState('');
  const [service, setService] = useState('translation');
  const [contentType, setContentType] = useState('');
  const [unit, setUnit] = useState('word');
  const [volume, setVolume] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [templateId, setTemplateId] = useState('template-job-standard');

  const create = useApiMutation(
    () =>
      api<Job>('/jobs', {
        method: 'POST',
        body: {
          projectId,
          title,
          service,
          contentType: contentType || null,
          unit,
          volume,
          dueDate: dueDate || null,
          dueTime: dueTime || null,
          poNumber,
          templateId: templateId || null,
        },
      }),
    {
      onSuccess: (job) => {
        onOpenChange(false);
        setTitle('');
        void navigate({ to: '/trabajo/encargos/$jobId', params: { jobId: job.id } });
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Nuevo encargo</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim() && projectId) create.mutate(undefined);
          }}
        >
          {!fixedProjectId && (
            <Field label="Proyecto">
              <EntitySelect
                options={(projects.data ?? []).map((p) => ({
                  value: p.id,
                  label: p.name,
                  hint: p.clientName,
                }))}
                value={projectId}
                onChange={setProjectId}
                allowEmpty={false}
                placeholder="Elegir proyecto…"
                testId="job-project"
              />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field
              label="Título"
              htmlFor="job-title"
              hint="Parche 3.2, evento de Navidad, ficha de tienda…"
            >
              <Input
                id="job-title"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="N.º de pedido (PO)">
              <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Servicio">
              <NativeSelect value={service} onChange={(e) => setService(e.target.value)}>
                {SERVICES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Tipo de contenido">
              <NativeSelect value={contentType} onChange={(e) => setContentType(e.target.value)}>
                <option value="">—</option>
                {CONTENT_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Plantilla de tareas">
              <NativeSelect value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">Ninguna</option>
                {(templates.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
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
            <Field label="Volumen" hint="Podrás pegar el análisis del CAT después">
              <DecimalInput value={volume} onCommit={setVolume} maxDecimals={2} />
            </Field>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Field label="Entrega">
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  data-testid="job-due"
                />
              </Field>
              <Field label="Hora">
                <Input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="w-28"
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={!title.trim() || !projectId || create.isPending}
              data-testid="create-job"
            >
              Crear encargo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function JobsTable({
  jobs,
  filter = '',
  showProject = true,
}: {
  jobs: Job[];
  filter?: string;
  showProject?: boolean;
}) {
  const navigate = useNavigate();
  const columns = useMemo<ColumnDef<Job, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Encargo',
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.title}</div>
            <div className="text-xs text-muted-foreground">
              {labelOf(SERVICES, row.original.service)}
              {row.original.contentType
                ? ` · ${labelOf(CONTENT_TYPES, row.original.contentType)}`
                : ''}
              {row.original.poNumber ? ` · PO ${row.original.poNumber}` : ''}
            </div>
          </div>
        ),
      },
      ...(showProject
        ? ([
            {
              accessorKey: 'projectName',
              header: 'Proyecto',
              cell: ({ row }) => (
                <div>
                  <div>{row.original.projectName}</div>
                  <div className="text-xs text-muted-foreground">{row.original.clientName}</div>
                </div>
              ),
            },
          ] as ColumnDef<Job, unknown>[])
        : []),
      {
        accessorKey: 'status',
        header: 'Estado',
        cell: ({ row }) => <JobStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'dueDate',
        header: 'Entrega',
        cell: ({ row }) => (
          <DueLabel
            date={row.original.dueDate}
            time={row.original.dueTime}
            done={!['received', 'in_progress', 'client_review'].includes(row.original.status)}
          />
        ),
      },
      {
        id: 'volume',
        header: 'Volumen',
        meta: { align: 'right' },
        accessorFn: (j) => j.weightedVolume ?? j.volume ?? 0,
        cell: ({ row }) => {
          const j = row.original;
          if (j.volume == null) return '—';
          return (
            <span
              title={
                j.weightedVolume != null
                  ? `Ponderado: ${formatNumber(j.weightedVolume)}`
                  : undefined
              }
            >
              {formatNumber(j.weightedVolume ?? j.volume)}{' '}
              <span className="text-xs text-muted-foreground">{UNIT_PLURALS[j.unit]}</span>
            </span>
          );
        },
      },
      {
        accessorKey: 'amountCents',
        header: 'Importe',
        meta: { align: 'right' },
        cell: ({ row }) => formatMoney(row.original.amountCents, row.original.currency),
      },
      {
        accessorKey: 'billingStatus',
        header: 'Facturación',
        // Mientras el encargo está abierto, la facturación aún no aplica.
        cell: ({ row }) =>
          ['received', 'in_progress'].includes(row.original.status) &&
          row.original.billingStatus === 'pending' ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <BillingBadge status={row.original.billingStatus} />
          ),
      },
    ],
    [showProject],
  );
  return (
    <DataTable
      data={jobs}
      columns={columns}
      filter={filter}
      onRowClick={(j) => void navigate({ to: '/trabajo/encargos/$jobId', params: { jobId: j.id } })}
      empty="No hay encargos."
      testId="jobs-table"
    />
  );
}

export function JobsPage() {
  const [view, setView] = useState('open');
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const query =
    view === 'open'
      ? { open: true }
      : view === 'delivered'
        ? { status: 'delivered,client_review,closed' }
        : view === 'to_bill'
          ? { billingStatus: 'pending', status: 'delivered,client_review,closed' }
          : {};
  const jobs = useJobs(query);
  const projects = useProjects();
  return (
    <Page wide>
      <PageHeader
        title="Encargos"
        icon={<Package />}
        description="Cada encargo o lote de trabajo: parches, eventos, DLC, fichas de tienda…"
        actions={
          <Button
            onClick={() => setOpen(true)}
            disabled={(projects.data?.length ?? 0) === 0}
            data-testid="new-job"
          >
            <Plus /> Nuevo encargo
          </Button>
        }
      />
      {projects.data && projects.data.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="Primero crea un proyecto"
          description="Los encargos pertenecen a un proyecto (cliente + juego). Crea uno en Proyectos y vuelve aquí."
        />
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={view} onValueChange={setView}>
              <TabsList>
                <TabsTrigger value="open">En curso</TabsTrigger>
                <TabsTrigger value="delivered">Entregados</TabsTrigger>
                <TabsTrigger value="to_bill">Por facturar</TabsTrigger>
                <TabsTrigger value="all">Todos</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar…"
                className="pl-8"
              />
            </div>
          </div>
          <JobsTable jobs={jobs.data ?? []} filter={filter} />
        </div>
      )}
      <NewJobDialog open={open} onOpenChange={setOpen} />
    </Page>
  );
}
