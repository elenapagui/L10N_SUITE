import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Gamepad2, Plus, Search, Trash2 } from 'lucide-react';
import {
  BUSINESS_MODELS,
  GAME_STATUSES,
  GENRE_SUGGESTIONS,
  PLATFORM_SUGGESTIONS,
  labelOf,
  plural,
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
import {
  useApiMutation,
  useGame,
  useGames,
  useInvalidateWork,
  useJobs,
  useProjects,
} from '@/hooks/work';
import {
  CardGrid,
  GroupedList,
  PeriodPicker,
  StatusBoard,
  ViewSwitcher,
  usePeriod,
  usePersistentState,
  type GroupOption,
  type ViewKind,
} from '@/components/views/views';
import { PeriodJobs, moneyText, usePeriodJobStats } from './JobViews';
import { api } from '@/lib/api';
import { NewProjectDialog, ProjectsTable } from './ProjectsPage';
import { TaskListView } from './tasks/TaskListView';
import { BackLink, FieldGrid, Section, Stat, usePatch } from './shared';
import {
  CharactersPanel,
  GameKnowledgePanel,
  GlossaryPanel,
} from '@/features/resources/GameResources';

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
    const t = v.trim().normalize('NFC');
    const key = t.toLocaleLowerCase('es');
    if (t && !value.some((x) => x.normalize('NFC').toLocaleLowerCase('es') === key))
      onChange([...value, t]);
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
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
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

const GAME_STATUS_COLORS: Record<string, string> = {
  development: '#d97706',
  released: '#16a34a',
  end_of_service: '#475569',
};

type GameRow = Game & { periodJobs: number; periodMoney: Map<string, number> | undefined };

const GAME_GROUPS: GroupOption<GameRow>[] = [
  { value: 'status', label: 'Estado', get: (g) => labelOf(GAME_STATUSES, g.status) },
  { value: 'developer', label: 'Desarrolladora', get: (g) => g.developer },
  { value: 'platform', label: 'Plataforma', get: (g) => g.platforms },
  { value: 'genre', label: 'Género', get: (g) => g.genres },
];

function GameCard({ g }: { g: GameRow }) {
  return (
    <>
      <div>
        <div className="font-medium leading-snug">{g.title}</div>
        {g.originalTitle && (
          <div className="ko text-xs text-muted-foreground" lang="ko">
            {g.originalTitle}
          </div>
        )}
      </div>
      <div className="truncate text-xs text-muted-foreground">
        {[g.developer, g.platforms.join(', ')].filter(Boolean).join(' · ') || '—'}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
        <span>{plural(g.periodJobs, 'encargo', 'encargos')}</span>
        <span className="ml-auto font-medium text-foreground tabular-nums">
          {moneyText(g.periodMoney)}
        </span>
      </div>
    </>
  );
}

export function GamesPage() {
  const games = useGames();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const invalidate = useInvalidateWork();
  const [filter, setFilter] = useState('');
  const [layout, setLayout] = usePersistentState<ViewKind>('l10n-view-games', 'table');
  const [groupBy, setGroupBy] = usePersistentState('l10n-group-games', 'status');
  const { period, setPeriod, range } = usePeriod('games');
  const stats = usePeriodJobStats(range, (j) => j.gameId);
  const rows = useMemo<GameRow[]>(() => {
    const q = filter.trim().toLowerCase();
    return (games.data ?? [])
      .filter((g) => !range || stats.has(g.id))
      .filter(
        (g) =>
          !q ||
          [g.title, g.originalTitle, g.developer, ...g.genres, ...g.platforms]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q)),
      )
      .map((g) => ({
        ...g,
        periodJobs: stats.get(g.id)?.count ?? 0,
        periodMoney: stats.get(g.id)?.money,
      }));
  }, [games.data, stats, range, filter]);
  const openGame = (g: Game) =>
    void navigate({ to: '/trabajo/juegos/$gameId', params: { gameId: g.id } });
  const move = async (g: Game, to: string) => {
    qc.setQueriesData<Game[]>({ queryKey: ['games'] }, (old) =>
      old?.map((x) => (x.id === g.id ? { ...x, status: to as Game['status'] } : x)),
    );
    try {
      await api(`/games/${g.id}`, { method: 'PATCH', body: { status: to } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido cambiar el estado.');
    }
    await invalidate();
  };
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
  const columns = useMemo<ColumnDef<GameRow, unknown>[]>(
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
      { accessorKey: 'periodJobs', header: 'Encargos', meta: { align: 'right' } },
      {
        id: 'amount',
        header: 'Importe',
        meta: { align: 'right' },
        accessorFn: (g) => [...(g.periodMoney?.values() ?? [])].reduce((a, b) => a + b, 0),
        cell: ({ row }) => moneyText(row.original.periodMoney),
      },
    ],
    [],
  );
  const table = (items: GameRow[]) => (
    <DataTable data={items} columns={columns} onRowClick={openGame} testId="games-table" />
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
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar…"
                className="pl-8"
              />
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <PeriodPicker period={period} onChange={setPeriod} range={range} />
              <ViewSwitcher
                views={['table', 'cards', 'board', 'grouped']}
                value={layout}
                onChange={setLayout}
              />
            </div>
          </div>
          {layout === 'cards' ? (
            <CardGrid
              items={rows}
              getId={(g) => g.id}
              onClick={openGame}
              renderCard={(g) => (
                <>
                  <Badge variant="outline" className="justify-self-start">
                    {labelOf(GAME_STATUSES, g.status)}
                  </Badge>
                  <GameCard g={g} />
                </>
              )}
              empty="No hay juegos."
            />
          ) : layout === 'board' ? (
            <StatusBoard
              items={rows}
              columns={GAME_STATUSES.map((s) => ({
                value: s.value,
                label: s.label,
                color: GAME_STATUS_COLORS[s.value],
              }))}
              getId={(g) => g.id}
              getStatus={(g) => g.status}
              renderCard={(g) => <GameCard g={g} />}
              onMove={(g, st) => void move(g, st)}
              onOpen={openGame}
            />
          ) : layout === 'grouped' ? (
            <GroupedList
              items={rows}
              options={GAME_GROUPS}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
              render={table}
              subtotal={(items) => {
                const m = new Map<string, number>();
                for (const g of items)
                  for (const [c, v] of g.periodMoney ?? []) m.set(c, (m.get(c) ?? 0) + v);
                return `${plural(
                  items.reduce((a, g) => a + g.periodJobs, 0),
                  'encargo',
                  'encargos',
                )} · ${moneyText(m)}`;
              }}
            />
          ) : (
            table(rows)
          )}
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
  const { tab } = useSearch({ from: '/trabajo/juegos/$gameId' });
  const navigate = useNavigate();
  const q = useGame(gameId);
  const projects = useProjects({ gameId });
  const jobs = useJobs({ gameId });
  const patch = usePatch<Game>(`/games/${gameId}`, ['game', gameId]);
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
      <Tabs
        value={tab ?? 'ficha'}
        onValueChange={(v) =>
          void navigate({
            to: '/trabajo/juegos/$gameId',
            params: { gameId },
            search: v === 'ficha' ? {} : { tab: v },
            replace: true,
          })
        }
      >
        <TabsList>
          <TabsTrigger value="ficha">Ficha</TabsTrigger>
          <TabsTrigger value="glosario">Glosario</TabsTrigger>
          <TabsTrigger value="personajes">Personajes</TabsTrigger>
          <TabsTrigger value="conocimiento">Páginas y tablas</TabsTrigger>
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
            <PeriodJobs jobs={jobs.data ?? []} storageKey="game-jobs" showProject />
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
        <TabsContent value="glosario">
          <GlossaryPanel gameId={g.id} />
        </TabsContent>
        <TabsContent value="personajes">
          <CharactersPanel gameId={g.id} />
        </TabsContent>
        <TabsContent value="conocimiento">
          <GameKnowledgePanel gameId={g.id} />
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
