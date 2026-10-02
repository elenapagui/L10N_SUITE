import { useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { FolderKanban, FolderOpen, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  languageOptions,
  PROJECT_STATUSES,
  formatMoney,
  formatRate,
  pairLabel,
  type Project,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Field } from '@/components/ui/label';
import { Input, NativeSelect } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AttachmentsPanel } from '@/components/common/AttachmentsPanel';
import { EntitySelect } from '@/components/common/EntitySelect';
import { CommitInput } from '@/components/common/inputs';
import { TagPicker } from '@/components/common/TagPicker';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { useTrashWithUndo } from '@/hooks/mutations';
import {
  useClient,
  useClients,
  useGames,
  useInvalidateWork,
  useJobs,
  useProject,
  useTimer,
} from '@/hooks/work';
import { api } from '@/lib/api';
import { desktop } from '@/lib/desktop';
import { formatDuration } from '@/lib/format';
import { JobsTable, NewJobDialog } from './JobsPage';
import { NewQueryButton, QueriesTable } from './QueriesPage';
import { TaskListView } from './tasks/TaskListView';
import { TimeEntriesList } from './time/TimePage';
import { useTimerControls } from './time/useTimerControls';
import { BackLink, FieldGrid, Section, Stat, usePatch } from './shared';

interface RateChange {
  jobId: string;
  title: string;
  fromMicros: number | null;
  toMicros: number;
  currency: string;
}

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const navigate = useNavigate();
  const q = useProject(projectId);
  const jobs = useJobs({ projectId });
  const clients = useClients();
  const games = useGames();
  const client = useClient(q.data?.clientId ?? '');
  const patch = usePatch<Project>(`/projects/${projectId}`);
  const trash = useTrashWithUndo();
  const timer = useTimer();
  const controls = useTimerControls();
  const [newJob, setNewJob] = useState(false);
  const confirm = useConfirm();
  const invalidate = useInvalidateWork();

  /** Tras cambiar el cliente o los idiomas, ofrece poner la tarifa vigente en los encargos pendientes. */
  const offerRateUpdate = async () => {
    const preview = await api<{ changes: RateChange[] }>(`/projects/${projectId}/apply-rates`, {
      method: 'POST',
      query: { dryRun: '1' },
    });
    const n = preview.changes.length;
    if (!n) return;
    const ok = await confirm({
      title:
        n === 1 ? '¿Actualizar la tarifa de 1 encargo?' : `¿Actualizar la tarifa de ${n} encargos?`,
      description: (
        <div className="grid gap-2">
          <p>
            Con el cliente y los idiomas nuevos, estos encargos pendientes de facturar tienen otra
            tarifa:
          </p>
          <ul className="grid gap-1">
            {preview.changes.slice(0, 8).map((c) => (
              <li key={c.jobId} className="flex justify-between gap-3">
                <span className="truncate">{c.title}</span>
                <span className="shrink-0 tabular-nums">
                  {formatRate(c.fromMicros, c.currency)} → {formatRate(c.toMicros, c.currency)}
                </span>
              </li>
            ))}
            {n > 8 && <li>y {n - 8} más</li>}
          </ul>
        </div>
      ),
      confirmLabel: 'Actualizar tarifas',
    });
    if (!ok) return;
    await api(`/projects/${projectId}/apply-rates`, { method: 'POST' });
    await invalidate();
    toast.success(n === 1 ? 'Tarifa actualizada' : `${n} tarifas actualizadas`);
  };

  if (q.isLoading)
    return (
      <Page>
        <Spinner />
      </Page>
    );
  if (!q.data)
    return (
      <Page>
        <p className="text-muted-foreground">No se ha encontrado el proyecto.</p>
      </Page>
    );
  const p = q.data;
  const save = (v: Partial<Project>) =>
    patch.mutate(v, {
      onSuccess: () => {
        if ('clientId' in v || 'sourceLang' in v || 'targetLang' in v) void offerRateUpdate();
      },
    });
  const running =
    timer.data?.running?.projectId === p.id &&
    !timer.data.running.jobId &&
    !timer.data.running.taskId;
  const loggedSeconds = (jobs.data ?? []).reduce((s, j) => s + j.loggedSeconds, 0);

  const chooseFolder = async () => {
    const dir = await desktop?.chooseDirectory({ title: 'Carpeta de archivos del proyecto' });
    if (dir) save({ localFolder: dir });
  };

  return (
    <Page wide>
      <BackLink to="/trabajo/proyectos" label="Proyectos" />
      <PageHeader
        icon={<FolderKanban />}
        title={p.name}
        description={
          <span className="inline-flex flex-wrap gap-x-2">
            {p.clientId ? (
              <Link
                to="/trabajo/clientes/$clientId"
                params={{ clientId: p.clientId }}
                className="hover:underline"
              >
                {p.clientName}
              </Link>
            ) : (
              'Sin cliente'
            )}
            {p.gameId && (
              <Link
                to="/trabajo/juegos/$gameId"
                params={{ gameId: p.gameId }}
                className="hover:underline"
              >
                · {p.gameTitle}
              </Link>
            )}
            <span>· {pairLabel(p.sourceLang, p.targetLang)}</span>
          </span>
        }
        actions={
          <>
            <NativeSelect
              value={p.status}
              onChange={(e) => save({ status: e.target.value as Project['status'] })}
              className="w-40"
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
            {p.localFolder && desktop && (
              <Button
                variant="outline"
                onClick={async () => {
                  const err = await desktop!.openPath(p.localFolder!);
                  if (err) toast.error(err);
                }}
              >
                <FolderOpen /> Carpeta
              </Button>
            )}
            {running ? (
              <Button variant="outline" onClick={() => controls.stop()}>
                <Pause /> Parar
              </Button>
            ) : (
              <Button variant="outline" onClick={() => controls.start({ projectId: p.id }, p.name)}>
                <Play /> Cronometrar
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Eliminar proyecto"
              onClick={async () => {
                await trash('project', p.id, p.name, [['projects']]);
                void navigate({ to: '/trabajo/proyectos' });
              }}
            >
              <Trash2 />
            </Button>
          </>
        }
      />
      <div className="mb-5">
        <TagPicker entityType="project" entityId={p.id} />
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Encargos abiertos" value={p.openJobCount} hint={`${p.jobCount} en total`} />
        <Stat label="Tareas pendientes" value={p.openTaskCount} />
        <Stat
          label="Importe total"
          value={formatMoney(p.totalCents, client.data?.client.currency ?? 'EUR')}
        />
        <Stat label="Tiempo en encargos" value={formatDuration(loggedSeconds)} />
      </div>
      <Tabs defaultValue="encargos">
        <TabsList>
          <TabsTrigger value="encargos">Encargos ({p.jobCount})</TabsTrigger>
          <TabsTrigger value="tareas">Tareas</TabsTrigger>
          <TabsTrigger value="consultas">Consultas</TabsTrigger>
          <TabsTrigger value="tiempo">Tiempo</TabsTrigger>
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="archivos">Archivos</TabsTrigger>
        </TabsList>
        <TabsContent value="encargos" className="grid gap-3">
          <div>
            <Button size="sm" onClick={() => setNewJob(true)} data-testid="project-new-job">
              <Plus /> Nuevo encargo
            </Button>
          </div>
          <JobsTable jobs={jobs.data ?? []} showProject={false} />
          <NewJobDialog open={newJob} onOpenChange={setNewJob} projectId={p.id} />
        </TabsContent>
        <TabsContent value="tareas">
          <TaskListView
            query={{ projectId: p.id }}
            defaults={{ projectId: p.id }}
            showContext
            emptyText="Sin tareas pendientes en este proyecto."
          />
        </TabsContent>
        <TabsContent value="consultas" className="grid gap-3">
          <div>
            <NewQueryButton projectId={p.id} />
          </div>
          <QueriesTable query={{ projectId: p.id }} />
        </TabsContent>
        <TabsContent value="tiempo">
          <TimeEntriesList query={{ projectId: p.id }} />
        </TabsContent>
        <TabsContent value="datos" className="grid gap-6 lg:grid-cols-2">
          <Section title="Datos del proyecto">
            <FieldGrid>
              <Field label="Nombre">
                <CommitInput value={p.name} onCommit={(v) => v && save({ name: v })} />
              </Field>
              <Field label="Herramienta CAT">
                <CommitInput
                  value={p.catTool}
                  onCommit={(v) => save({ catTool: v })}
                  placeholder="memoQ, Trados, Phrase…"
                />
              </Field>
              <Field label="Cliente">
                <EntitySelect
                  options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                  value={p.clientId}
                  onChange={(clientId) => save({ clientId })}
                />
              </Field>
              <Field label="Juego">
                <EntitySelect
                  options={(games.data ?? []).map((g) => ({ value: g.id, label: g.title }))}
                  value={p.gameId}
                  onChange={(gameId) => save({ gameId })}
                />
              </Field>
              <Field label="Idioma de origen">
                <NativeSelect
                  value={p.sourceLang ?? ''}
                  onChange={(e) => save({ sourceLang: e.target.value || null })}
                >
                  <option value="">—</option>
                  {languageOptions(p.sourceLang).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Idioma de destino">
                <NativeSelect
                  value={p.targetLang ?? ''}
                  onChange={(e) => save({ targetLang: e.target.value || null })}
                >
                  <option value="">—</option>
                  {languageOptions(p.targetLang).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Inicio">
                <Input
                  type="date"
                  value={p.startDate ?? ''}
                  onChange={(e) => save({ startDate: e.target.value || null })}
                />
              </Field>
              <Field label="Fin">
                <Input
                  type="date"
                  value={p.endDate ?? ''}
                  onChange={(e) => save({ endDate: e.target.value || null })}
                />
              </Field>
              <Field label="Color">
                <input
                  type="color"
                  value={p.color ?? '#6366f1'}
                  onChange={(e) => save({ color: e.target.value })}
                  className="h-9 w-16 cursor-pointer rounded border bg-transparent"
                />
              </Field>
              <Field
                label="Carpeta de archivos"
                hint="Se abre con un clic desde la cabecera del proyecto"
                className="sm:col-span-2"
              >
                <div className="flex gap-2">
                  <CommitInput
                    value={p.localFolder}
                    onCommit={(v) => save({ localFolder: v })}
                    className="font-mono text-xs"
                  />
                  {desktop && (
                    <Button variant="outline" onClick={() => void chooseFolder()}>
                      Elegir…
                    </Button>
                  )}
                </div>
              </Field>
            </FieldGrid>
          </Section>
          <Section title="Notas">
            <CommitInput
              value={p.notes}
              onCommit={(v) => save({ notes: v })}
              multiline
              rows={14}
              placeholder="Instrucciones generales, guía de estilo del cliente, decisiones de terminología…"
            />
          </Section>
        </TabsContent>
        <TabsContent value="archivos">
          <AttachmentsPanel entityType="project" entityId={p.id} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
