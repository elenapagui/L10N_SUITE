import { useMemo, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Gamepad2, Plus, Search, Trash2 } from 'lucide-react';
import {
  BUSINESS_MODELS,
  GAME_STATUSES,
  GENRE_SUGGESTIONS,
  PLATFORM_SUGGESTIONS,
  labelOf,
  type Game,
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
import { Field } from '@/components/ui/label';
import { Input, NativeSelect } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AttachmentsPanel } from '@/components/common/AttachmentsPanel';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { CommitInput, DecimalInput } from '@/components/common/inputs';
import { TagPicker } from '@/components/common/TagPicker';
import { EmptyState, Page, PageHeader } from '@/components/layout/PageHeader';
import { useTrashWithUndo } from '@/hooks/mutations';
import { useApiMutation, useGame, useGames, useJobs, useProjects } from '@/hooks/work';
import { api } from '@/lib/api';
import { JobsTable } from './JobsPage';
import { NewProjectDialog, ProjectsTable } from './ProjectsPage';
import { TaskListView } from './tasks/TaskListView';
import { BackLink, FieldGrid, Section, Stat, usePatch } from './shared';

/** Lista de valores libres con sugerencias (géneros, plataformas). */
function ChipsInput({
  value,
  onChange,
  suggestions,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
}) {
  const [text, setText] = useState('');
  const add = (v: string) => {
    const t = v.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setText('');
  };
  const listId = useMemo(() => `sug-${Math.random().toString(36).slice(2)}`, []);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1">
        {value.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1">
            {v}
            <button
              type="button"
              className="cursor-pointer opacity-60 hover:opacity-100"
              onClick={() => onChange(value.filter((x) => x !== v))}
              aria-label={`Quitar ${v}`}
            >
              ×
            </button>
          </Badge>
        ))}
      </div>
      <Input
        list={listId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          }
        }}
        onBlur={() => text && add(text)}
        placeholder="Escribe y pulsa Intro"
        className="h-8"
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !value.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}

export function GamesPage() {
  const games = useGames();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const create = useApiMutation(
    () => api<Game>('/games', { method: 'POST', body: { title, originalTitle } }),
    {
      onSuccess: (g) => {
        setOpen(false);
        setTitle('');
        setOriginalTitle('');
        void navigate({ to: '/trabajo/juegos/$gameId', params: { gameId: g.id } });
      },
    },
  );
  const columns = useMemo<ColumnDef<Game, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Juego',
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.title}</div>
            {row.original.originalTitle && (
              <div className="ko text-xs text-muted-foreground" lang="ko">
                {row.original.originalTitle}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'developer',
        header: 'Desarrolladora',
        cell: ({ row }) => row.original.developer ?? '—',
      },
      {
        accessorKey: 'releaseYear',
        header: 'Año',
        cell: ({ row }) => row.original.releaseYear ?? '—',
      },
      {
        id: 'genres',
        header: 'Géneros',
        accessorFn: (g) => g.genres.join(', '),
        cell: ({ row }) => row.original.genres.join(', ') || '—',
      },
      {
        id: 'platforms',
        header: 'Plataformas',
        accessorFn: (g) => g.platforms.join(', '),
        cell: ({ row }) => row.original.platforms.join(', ') || '—',
      },
      {
        accessorKey: 'status',
        header: 'Estado',
        cell: ({ row }) => labelOf(GAME_STATUSES, row.original.status),
      },
      { accessorKey: 'projectCount', header: 'Proyectos', meta: { align: 'right' } },
      { accessorKey: 'jobCount', header: 'Encargos', meta: { align: 'right' } },
    ],
    [],
  );
  return (
    <Page wide>
      <PageHeader
        title="Juegos"
        icon={<Gamepad2 />}
        description="La ficha de cada juego reúne sus proyectos, encargos y notas (y más adelante, su glosario, sus personajes y su corpus)."
        actions={
          <Button onClick={() => setOpen(true)} data-testid="new-game">
            <Plus /> Nuevo juego
          </Button>
        }
      />
      {games.data && games.data.length === 0 ? (
        <EmptyState
          icon={<Gamepad2 />}
          title="Aún no hay juegos"
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus /> Añadir juego
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar…"
              className="pl-8"
            />
          </div>
          <DataTable
            data={games.data ?? []}
            columns={columns}
            filter={filter}
            onRowClick={(g) =>
              void navigate({ to: '/trabajo/juegos/$gameId', params: { gameId: g.id } })
            }
          />
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo juego</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim()) create.mutate(undefined);
            }}
          >
            <Field label="Título" hint="El que uses habitualmente (en español o en inglés)">
              <Input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="game-title"
              />
            </Field>
            <Field label="Título original">
              <Input
                value={originalTitle}
                onChange={(e) => setOriginalTitle(e.target.value)}
                lang="ko"
                placeholder="한국어 제목"
              />
            </Field>
            <DialogFooter>
              <Button type="submit" disabled={!title.trim() || create.isPending}>
                Añadir juego
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

export function GameDetailPage() {
  const { gameId } = useParams({ strict: false }) as { gameId: string };
  const navigate = useNavigate();
  const q = useGame(gameId);
  const projects = useProjects({ gameId });
  const jobs = useJobs({ gameId });
  const patch = usePatch<Game>(`/games/${gameId}`);
  const trash = useTrashWithUndo();
  const [newProject, setNewProject] = useState(false);

  if (q.isLoading)
    return (
      <Page>
        <Spinner />
      </Page>
    );
  if (!q.data)
    return (
      <Page>
        <p className="text-muted-foreground">No se ha encontrado el juego.</p>
      </Page>
    );
  const g = q.data;
  const save = (v: Partial<Game>) => patch.mutate(v);

  return (
    <Page wide>
      <BackLink to="/trabajo/juegos" label="Juegos" />
      <PageHeader
        icon={<Gamepad2 />}
        title={g.title}
        description={[g.originalTitle, g.developer, g.releaseYear].filter(Boolean).join(' · ')}
        actions={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Eliminar juego"
            onClick={async () => {
              await trash('game', g.id, g.title, [['games']]);
              void navigate({ to: '/trabajo/juegos' });
            }}
          >
            <Trash2 />
          </Button>
        }
      />
      <div className="mb-5">
        <TagPicker entityType="game" entityId={g.id} />
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Proyectos" value={g.projectCount} />
        <Stat label="Encargos" value={g.jobCount} />
        <Stat
          label="Estado"
          value={<span className="text-lg">{labelOf(GAME_STATUSES, g.status)}</span>}
        />
      </div>
      <Tabs defaultValue="ficha">
        <TabsList>
          <TabsTrigger value="ficha">Ficha</TabsTrigger>
          <TabsTrigger value="trabajo">Proyectos y encargos</TabsTrigger>
          <TabsTrigger value="tareas">Tareas</TabsTrigger>
          <TabsTrigger value="archivos">Archivos</TabsTrigger>
          <TabsTrigger value="notas">Notas</TabsTrigger>
        </TabsList>
        <TabsContent value="ficha">
          <Section title="Ficha del juego">
            <FieldGrid className="lg:grid-cols-3">
              <Field label="Título">
                <CommitInput value={g.title} onCommit={(v) => v && save({ title: v })} />
              </Field>
              <Field label="Título original">
                <CommitInput value={g.originalTitle} onCommit={(v) => save({ originalTitle: v })} />
              </Field>
              <Field label="Título en español">
                <CommitInput value={g.titleEs} onCommit={(v) => save({ titleEs: v })} />
              </Field>
              <Field label="Título en inglés">
                <CommitInput value={g.titleEn} onCommit={(v) => save({ titleEn: v })} />
              </Field>
              <Field label="Desarrolladora">
                <CommitInput value={g.developer} onCommit={(v) => save({ developer: v })} />
              </Field>
              <Field label="Editora">
                <CommitInput value={g.publisher} onCommit={(v) => save({ publisher: v })} />
              </Field>
              <Field label="Año de lanzamiento">
                <DecimalInput
                  value={g.releaseYear}
                  onCommit={(v) => save({ releaseYear: v })}
                  maxDecimals={0}
                />
              </Field>
              <Field label="Modelo de negocio">
                <NativeSelect
                  value={g.businessModel ?? ''}
                  onChange={(e) =>
                    save({ businessModel: (e.target.value || null) as Game['businessModel'] })
                  }
                >
                  <option value="">—</option>
                  {BUSINESS_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Estado">
                <NativeSelect
                  value={g.status}
                  onChange={(e) => save({ status: e.target.value as Game['status'] })}
                >
                  {GAME_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Clasificación (PEGI)">
                <CommitInput
                  value={g.pegi}
                  onCommit={(v) => save({ pegi: v })}
                  placeholder="PEGI 12"
                />
              </Field>
              <Field label="Web">
                <CommitInput value={g.website} onCommit={(v) => save({ website: v })} />
              </Field>
              <div />
              <Field label="Géneros">
                <ChipsInput
                  value={g.genres}
                  onChange={(genres) => save({ genres })}
                  suggestions={GENRE_SUGGESTIONS}
                />
              </Field>
              <Field label="Plataformas">
                <ChipsInput
                  value={g.platforms}
                  onChange={(platforms) => save({ platforms })}
                  suggestions={PLATFORM_SUGGESTIONS}
                />
              </Field>
            </FieldGrid>
          </Section>
        </TabsContent>
        <TabsContent value="trabajo" className="grid gap-6">
          <Section
            title="Proyectos"
            actions={
              <Button size="sm" variant="outline" onClick={() => setNewProject(true)}>
                <Plus /> Nuevo proyecto
              </Button>
            }
          >
            <ProjectsTable projects={projects.data ?? []} />
          </Section>
          <Section title="Encargos">
            <JobsTable jobs={jobs.data ?? []} />
          </Section>
          <NewProjectDialog
            open={newProject}
            onOpenChange={setNewProject}
            defaults={{ gameId: g.id }}
          />
        </TabsContent>
        <TabsContent value="tareas">
          <TaskListView query={{ gameId: g.id }} defaults={{ gameId: g.id }} showContext />
        </TabsContent>
        <TabsContent value="archivos">
          <AttachmentsPanel entityType="game" entityId={g.id} />
        </TabsContent>
        <TabsContent value="notas">
          <CommitInput
            value={g.notes}
            onCommit={(v) => save({ notes: v })}
            multiline
            rows={14}
            placeholder="Notas sobre el juego: mundo, tono, referencias…"
          />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
