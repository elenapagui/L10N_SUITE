import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Library, Lock, Plus, Search } from 'lucide-react';
import {
  CORPUS_PHASES,
  TRANSLATION_DIRECTIONS,
  formatNumber,
  labelOf,
  langLabel,
  type CorpusProfile,
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
import { Spinner } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EntitySelect } from '@/components/common/EntitySelect';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { EmptyState, Page, PageHeader } from '@/components/layout/PageHeader';
import { useGames } from '@/hooks/work';
import { api } from '@/lib/api';
import { Stat } from '@/features/work/shared';
import { AnnotationSchema } from './AnnotationSchema';
import { ExportPanel } from './ExportPanel';
import { StatsPanel } from './StatsPanel';
import { useCorpusProfiles } from './hooks';

const PHASE_VARIANT: Record<string, 'outline' | 'secondary' | 'warning' | 'success'> = {
  identified: 'outline',
  obtained: 'secondary',
  cleaning: 'secondary',
  alignment: 'secondary',
  review: 'warning',
  annotation: 'warning',
  included: 'success',
};

export function PhaseBadge({ phase }: { phase: string }) {
  return (
    <Badge variant={PHASE_VARIANT[phase] ?? 'outline'}>
      {labelOf(CORPUS_PHASES, phase as never)}
    </Badge>
  );
}

function AddGameDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: Set<string>;
}) {
  const games = useGames();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [gameId, setGameId] = useState<string | null>(null);
  const options = (games.data ?? [])
    .filter((g) => !existing.has(g.id))
    .map((g) => ({ value: g.id, label: g.title, hint: g.originalTitle }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Añadir un juego al corpus</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          El juego tiene que existir en{' '}
          <Link to="/trabajo/juegos" className="underline">
            Juegos
          </Link>
          . Después podrás completar su ficha de corpus e importar sus textos.
        </p>
        <EntitySelect
          options={options}
          value={gameId}
          onChange={setGameId}
          placeholder="Elige un juego"
          testId="corpus-add-game-select"
        />
        <DialogFooter>
          <Button
            disabled={!gameId}
            onClick={async () => {
              await api(`/corpus/profiles/${gameId}`, { method: 'PUT', body: {} });
              await qc.invalidateQueries({ queryKey: ['corpus-profiles'] });
              onOpenChange(false);
              void navigate({ to: '/corpus/juegos/$gameId', params: { gameId: gameId! } });
            }}
            data-testid="corpus-add-game"
          >
            Añadir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CatalogTab() {
  const profiles = useCorpusProfiles();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const list = useMemo(() => profiles.data ?? [], [profiles.data]);
  const totals = useMemo(
    () => ({
      games: list.length,
      included: list.filter((p) => p.phase === 'included').length,
      documents: list.reduce((s, p) => s + p.documentCount, 0),
      segments: list.reduce((s, p) => s + p.segmentCount, 0),
    }),
    [list],
  );
  const columns = useMemo<ColumnDef<CorpusProfile, unknown>[]>(
    () => [
      {
        accessorKey: 'gameTitle',
        header: 'Juego',
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{row.original.gameTitle}</span>
            {row.original.originalTitle && (
              <span lang="ko" className="text-xs text-muted-foreground">
                {row.original.originalTitle}
              </span>
            )}
            {row.original.restricted && (
              <Lock className="size-3.5 text-muted-foreground" aria-label="Uso restringido" />
            )}
          </span>
        ),
      },
      {
        accessorKey: 'phase',
        header: 'Fase',
        cell: ({ row }) => <PhaseBadge phase={row.original.phase} />,
      },
      { accessorKey: 'releaseYear', header: 'Año' },
      { id: 'genres', header: 'Géneros', accessorFn: (p) => p.genres.join(', ') },
      {
        id: 'langs',
        header: 'Idiomas',
        accessorFn: (p) => p.languages.map((l) => l.toUpperCase()).join(' · '),
      },
      {
        accessorKey: 'translationDirection',
        header: 'Dirección',
        cell: ({ row }) => labelOf(TRANSLATION_DIRECTIONS, row.original.translationDirection),
      },
      { accessorKey: 'documentCount', header: 'Documentos', meta: { align: 'right' } },
      {
        accessorKey: 'segmentCount',
        header: 'Segmentos',
        meta: { align: 'right' },
        cell: ({ row }) => formatNumber(row.original.segmentCount, 0),
      },
    ],
    [],
  );
  if (profiles.isLoading) return <Spinner />;
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Juegos" value={totals.games} hint={`${totals.included} incluidos`} />
        <Stat label="Documentos" value={formatNumber(totals.documents, 0)} />
        <Stat label="Segmentos" value={formatNumber(totals.segments, 0)} />
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/corpus/concordancias">
              <Search /> Concordancias
            </Link>
          </Button>
          <Button onClick={() => setAdding(true)} data-testid="corpus-new-game">
            <Plus /> Añadir juego
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {CORPUS_PHASES.map((ph) => (
          <span
            key={ph.value}
            className="flex items-center gap-1.5 rounded-full border px-2.5 py-1"
          >
            <PhaseBadge phase={ph.value} />
            <span className="tabular-nums">{list.filter((p) => p.phase === ph.value).length}</span>
          </span>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState
          icon={<Library />}
          title="El corpus está vacío"
          description="Añade un juego al corpus y luego importa sus textos desde Excel o CSV (una columna por idioma)."
        />
      ) : (
        <DataTable
          data={list}
          columns={columns}
          onRowClick={(p) =>
            void navigate({ to: '/corpus/juegos/$gameId', params: { gameId: p.gameId } })
          }
          testId="corpus-games"
        />
      )}
      <AddGameDialog
        open={adding}
        onOpenChange={setAdding}
        existing={new Set(list.map((p) => p.gameId))}
      />
    </div>
  );
}

export function CorpusPage() {
  const search = useSearch({ from: '/corpus' });
  const navigate = useNavigate();
  const tab = search.tab ?? 'juegos';
  return (
    <Page wide>
      <PageHeader
        title="Corpus"
        icon={<Library />}
        description={`Corpus paralelo de videojuegos (${langLabel('ko').toLowerCase()}-${langLabel('es').toLowerCase()} y más): catálogo, textos, anotación, estadísticas y exportación.`}
      />
      <Tabs
        value={tab}
        onValueChange={(v) =>
          void navigate({ to: '/corpus', search: v === 'juegos' ? {} : { tab: v }, replace: true })
        }
      >
        <TabsList>
          <TabsTrigger value="juegos">Juegos</TabsTrigger>
          <TabsTrigger value="estadisticas">Estadísticas</TabsTrigger>
          <TabsTrigger value="anotacion">Esquema de anotación</TabsTrigger>
          <TabsTrigger value="exportar">Exportar y versiones</TabsTrigger>
        </TabsList>
        <TabsContent value="juegos">
          <CatalogTab />
        </TabsContent>
        <TabsContent value="estadisticas">
          <StatsPanel />
        </TabsContent>
        <TabsContent value="anotacion">
          <AnnotationSchema />
        </TabsContent>
        <TabsContent value="exportar">
          <ExportPanel />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
