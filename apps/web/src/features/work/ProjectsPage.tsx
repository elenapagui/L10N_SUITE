import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { FolderKanban, Plus, Search } from 'lucide-react';
import {
  languageOptions,
  PROJECT_STATUSES,
  formatMoney,
  pairLabel,
  todayISO,
  type Client,
  type Game,
  type Project,
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
import { DueLabel, ProjectStatusBadge } from '@/components/common/badges';
import { EmptyState, Page, PageHeader } from '@/components/layout/PageHeader';
import { useSettings } from '@/hooks/core';
import { useApiMutation, useClients, useGames, useProjects, useTemplates } from '@/hooks/work';
import { api } from '@/lib/api';

export function NewProjectDialog({
  open,
  onOpenChange,
  defaults = {},
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaults?: { clientId?: string; gameId?: string };
}) {
  const navigate = useNavigate();
  const settings = useSettings();
  const clients = useClients();
  const games = useGames();
  const templates = useTemplates('project');
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState<string | null>(defaults.clientId ?? null);
  const [gameId, setGameId] = useState<string | null>(defaults.gameId ?? null);
  const [sourceLang, setSourceLang] = useState(
    settings.data?.preferences.defaultSourceLang ?? 'ko',
  );
  const [targetLang, setTargetLang] = useState(
    settings.data?.preferences.defaultTargetLang ?? 'es',
  );
  const [templateId, setTemplateId] = useState<string>('');
  const [startDate, setStartDate] = useState(todayISO());

  const createClient = useApiMutation(
    (n: string) => api<Client>('/clients', { method: 'POST', body: { name: n } }),
    {
      onSuccess: (c) => setClientId(c.id),
    },
  );
  const createGame = useApiMutation(
    (t: string) => api<Game>('/games', { method: 'POST', body: { title: t } }),
    {
      onSuccess: (g) => setGameId(g.id),
    },
  );
  const create = useApiMutation(
    () =>
      api<Project>('/projects', {
        method: 'POST',
        body: {
          name,
          clientId,
          gameId,
          sourceLang,
          targetLang,
          startDate,
          templateId: templateId || null,
        },
      }),
    {
      onSuccess: (p) => {
        onOpenChange(false);
        setName('');
        void navigate({ to: '/trabajo/proyectos/$projectId', params: { projectId: p.id } });
      },
    },
  );

  const gameTitle = games.data?.find((g) => g.id === gameId)?.title;
  const clientName = clients.data?.find((c) => c.id === clientId)?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Nuevo proyecto</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate(undefined);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cliente">
              <EntitySelect
                options={(clients.data ?? []).map((c) => ({
                  value: c.id,
                  label: c.name,
                  hint: c.country,
                }))}
                value={clientId}
                onChange={setClientId}
                placeholder="Elegir cliente…"
                onCreate={(n) => createClient.mutate(n)}
                testId="project-client"
              />
            </Field>
            <Field label="Juego">
              <EntitySelect
                options={(games.data ?? []).map((g) => ({
                  value: g.id,
                  label: g.title,
                  hint: g.originalTitle,
                }))}
                value={gameId}
                onChange={setGameId}
                placeholder="Elegir juego…"
                onCreate={(t) => createGame.mutate(t)}
                testId="project-game"
              />
            </Field>
          </div>
          <Field
            label="Nombre del proyecto"
            htmlFor="project-name"
            hint="Por ejemplo: «Juego — localización KO→ES» o «Juego — actualizaciones 2026»"
          >
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={gameTitle ? `${gameTitle} — ${clientName ?? 'localización'}` : 'Nombre'}
              onFocus={() => {
                if (!name && gameTitle)
                  setName(`${gameTitle}${clientName ? ` — ${clientName}` : ''}`);
              }}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Origen">
              <NativeSelect value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
                {languageOptions(sourceLang).map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Destino">
              <NativeSelect value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
                {languageOptions(targetLang).map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Inicio">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
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
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={!name.trim() || create.isPending}
              data-testid="create-project"
            >
              Crear proyecto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectsTable({ projects, filter = '' }: { projects: Project[]; filter?: string }) {
  const navigate = useNavigate();
  const columns = useMemo<ColumnDef<Project, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Proyecto',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.color && (
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: row.original.color }}
              />
            )}
            <span className="font-medium">{row.original.name}</span>
          </div>
        ),
      },
      {
        accessorKey: 'clientName',
        header: 'Cliente',
        cell: ({ row }) => row.original.clientName ?? '—',
      },
      {
        accessorKey: 'gameTitle',
        header: 'Juego',
        cell: ({ row }) => row.original.gameTitle ?? '—',
      },
      {
        id: 'pair',
        header: 'Idiomas',
        cell: ({ row }) => pairLabel(row.original.sourceLang, row.original.targetLang),
      },
      {
        accessorKey: 'status',
        header: 'Estado',
        cell: ({ row }) => <ProjectStatusBadge status={row.original.status} />,
      },
      { accessorKey: 'openJobCount', header: 'Encargos abiertos', meta: { align: 'right' } },
      { accessorKey: 'openTaskCount', header: 'Tareas', meta: { align: 'right' } },
      {
        accessorKey: 'nextDueDate',
        header: 'Próxima entrega',
        cell: ({ row }) => <DueLabel date={row.original.nextDueDate} />,
      },
      {
        accessorKey: 'totalCents',
        header: 'Importe',
        meta: { align: 'right' },
        cell: ({ row }) => (row.original.totalCents ? formatMoney(row.original.totalCents) : '—'),
      },
    ],
    [],
  );
  return (
    <DataTable
      data={projects}
      columns={columns}
      filter={filter}
      onRowClick={(p) =>
        void navigate({ to: '/trabajo/proyectos/$projectId', params: { projectId: p.id } })
      }
      empty="No hay proyectos."
      testId="projects-table"
    />
  );
}

export function ProjectsPage() {
  const [status, setStatus] = useState('current');
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const statusQuery =
    status === 'current' ? 'prospect,active,paused' : status === 'all' ? undefined : status;
  const projects = useProjects({ status: statusQuery });
  const all = useProjects();

  return (
    <Page wide>
      <PageHeader
        title="Proyectos"
        icon={<FolderKanban />}
        description="Cada proyecto reúne un cliente, un juego y un par de idiomas; dentro van sus encargos."
        actions={
          <Button onClick={() => setOpen(true)} data-testid="new-project">
            <Plus /> Nuevo proyecto
          </Button>
        }
      />
      {all.data && all.data.length === 0 ? (
        <EmptyState
          icon={<FolderKanban />}
          title="Aún no hay proyectos"
          description="Crea un proyecto para cada cliente y juego. Dentro irás registrando los encargos (parches, eventos, DLC…)."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus /> Crear el primero
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={status} onValueChange={setStatus}>
              <TabsList>
                <TabsTrigger value="current">En curso</TabsTrigger>
                {PROJECT_STATUSES.map((s) => (
                  <TabsTrigger key={s.value} value={s.value}>
                    {s.label}
                  </TabsTrigger>
                ))}
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
          <ProjectsTable projects={projects.data ?? []} filter={filter} />
        </div>
      )}
      <NewProjectDialog open={open} onOpenChange={setOpen} />
    </Page>
  );
}
