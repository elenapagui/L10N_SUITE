import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { FileUp, Gamepad2, Library, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CORPUS_LANGS,
  CORPUS_PHASES,
  CORPUS_TEXT_TYPES,
  RIGHTS_STATUSES,
  TRANSLATION_DIRECTIONS,
  formatDateES,
  formatNumber,
  labelOf,
  type CorpusDocument,
  type CorpusProfile,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Checkbox, Spinner } from '@/components/ui/misc';
import { CommitInput } from '@/components/common/inputs';
import { DataTable, type ColumnDef } from '@/components/common/DataTable';
import { EmptyState, Page, PageHeader } from '@/components/layout/PageHeader';
import { useTrashWithUndo } from '@/hooks/mutations';
import { api } from '@/lib/api';
import { BackLink, FieldGrid, Section } from '@/features/work/shared';
import { ImportTextsDialog } from './ImportTextsDialog';
import { PhaseBadge } from './CorpusPage';
import { useCorpusDocuments, useCorpusProfile } from './hooks';

export function CorpusGamePage() {
  const { gameId } = useParams({ strict: false }) as { gameId: string };
  const profile = useCorpusProfile(gameId);
  const docs = useCorpusDocuments(gameId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const trash = useTrashWithUndo();
  const [importing, setImporting] = useState(false);

  const save = async (body: Partial<CorpusProfile>) => {
    try {
      await api(`/corpus/profiles/${gameId}`, { method: 'PUT', body });
      await Promise.all(
        ['corpus-profile', 'corpus-profiles', 'corpus-stats'].map((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido guardar.');
    }
  };

  const columns = useMemo<ColumnDef<CorpusDocument, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Documento',
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        accessorKey: 'textType',
        header: 'Tipo',
        cell: ({ row }) => labelOf(CORPUS_TEXT_TYPES, row.original.textType),
      },
      {
        id: 'langs',
        header: 'Idiomas',
        accessorFn: (d) => d.languages.map((l) => l.toUpperCase()).join(' · '),
      },
      {
        accessorKey: 'segmentCount',
        header: 'Segmentos',
        meta: { align: 'right' },
        cell: ({ row }) => formatNumber(row.original.segmentCount, 0),
      },
      { accessorKey: 'annotationCount', header: 'Anotaciones', meta: { align: 'right' } },
      {
        accessorKey: 'sourceFile',
        header: 'Archivo de origen',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.sourceFile}</span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Importado',
        cell: ({ row }) => formatDateES(row.original.createdAt.slice(0, 10)),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Eliminar documento"
            onClick={(e) => {
              e.stopPropagation();
              void trash('corpus_document', row.original.id, row.original.title, [
                ['corpus-documents'],
                ['corpus-profile'],
                ['corpus-profiles'],
                ['corpus-stats'],
              ]);
            }}
          >
            <Trash2 />
          </Button>
        ),
      },
    ],
    [trash],
  );

  if (profile.isLoading) {
    return (
      <Page>
        <Spinner />
      </Page>
    );
  }
  if (!profile.data) {
    return (
      <Page>
        <BackLink to="/corpus" label="Corpus" />
        <EmptyState
          icon={<Library />}
          title="Este juego no está en el corpus"
          action={<Button onClick={() => void save({})}>Añadir al corpus</Button>}
        />
      </Page>
    );
  }
  const p = profile.data;

  return (
    <Page wide>
      <BackLink to="/corpus" label="Corpus" />
      <PageHeader
        icon={<Library />}
        title={p.gameTitle}
        description={[p.originalTitle, p.releaseYear, p.genres.join(', ')]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <PhaseBadge phase={p.phase} />
            <Button variant="outline" asChild>
              <Link to="/trabajo/juegos/$gameId" params={{ gameId }}>
                <Gamepad2 /> Ficha del juego
              </Link>
            </Button>
            <Button onClick={() => setImporting(true)} data-testid="corpus-import-texts">
              <FileUp /> Importar textos
            </Button>
          </>
        }
      />
      <div className="grid gap-6">
        <Section title="Documentos">
          {docs.isLoading ? (
            <Spinner />
          ) : !docs.data?.length ? (
            <EmptyState
              icon={<FileUp />}
              title="Aún no hay textos"
              description="Importa un Excel o CSV con una columna por idioma (por ejemplo, A coreano y B español) y, si los tienes, el ID de cadena, el hablante y el contexto."
              action={<Button onClick={() => setImporting(true)}>Importar textos</Button>}
            />
          ) : (
            <DataTable
              data={docs.data}
              columns={columns}
              onRowClick={(d) =>
                void navigate({
                  to: '/corpus/documentos/$documentId',
                  params: { documentId: d.id },
                })
              }
              testId="corpus-documents"
            />
          )}
        </Section>
        <Section title="Ficha de corpus">
          <FieldGrid className="lg:grid-cols-3">
            <Field label="Fase de construcción">
              <NativeSelect
                value={p.phase}
                onChange={(e) => void save({ phase: e.target.value as CorpusProfile['phase'] })}
                data-testid="corpus-phase"
              >
                {CORPUS_PHASES.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Versión del juego">
              <CommitInput
                value={p.gameVersion}
                onCommit={(v) => void save({ gameVersion: v })}
                placeholder="2.4.1 (Global)"
              />
            </Field>
            <Field label="Fecha del texto">
              <CommitInput
                value={p.textDate}
                onCommit={(v) => void save({ textDate: v })}
                placeholder="Marzo de 2026"
              />
            </Field>
            <Field label="Dirección de traducción">
              <NativeSelect
                value={p.translationDirection}
                onChange={(e) =>
                  void save({
                    translationDirection: e.target.value as CorpusProfile['translationDirection'],
                  })
                }
              >
                {TRANSLATION_DIRECTIONS.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Empresa de localización">
              <CommitInput
                value={p.localizationCompany}
                onCommit={(v) => void save({ localizationCompany: v })}
              />
            </Field>
            <Field label="Método de obtención">
              <CommitInput
                value={p.acquisitionMethod}
                onCommit={(v) => void save({ acquisitionMethod: v })}
                placeholder="Extracción de archivos, transcripción, wiki…"
              />
            </Field>
            <Field label="Idiomas">
              <div className="flex flex-wrap gap-3 pt-1">
                {CORPUS_LANGS.slice(0, 5).map((l) => (
                  <label key={l.value} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={p.languages.includes(l.value)}
                      onCheckedChange={(on) =>
                        void save({
                          languages: on
                            ? [...p.languages, l.value]
                            : p.languages.filter((x) => x !== l.value).length
                              ? p.languages.filter((x) => x !== l.value)
                              : p.languages,
                        })
                      }
                    />
                    {l.label}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Derechos">
              <NativeSelect
                value={p.rights}
                onChange={(e) => void save({ rights: e.target.value as CorpusProfile['rights'] })}
              >
                {RIGHTS_STATUSES.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Uso restringido">
              <label className="flex items-center gap-2 pt-2 text-sm">
                <Checkbox
                  checked={p.restricted}
                  onCheckedChange={(v) => void save({ restricted: v === true })}
                />
                No incluir en las exportaciones (p. ej., material bajo NDA)
              </label>
            </Field>
            <Field label="Permisos y derechos (notas)" className="lg:col-span-3">
              <CommitInput
                value={p.rightsNotes}
                onCommit={(v) => void save({ rightsNotes: v })}
                multiline
                rows={2}
              />
            </Field>
            <Field label="Notas metodológicas" className="lg:col-span-3">
              <CommitInput
                value={p.methodNotes}
                onCommit={(v) => void save({ methodNotes: v })}
                multiline
                rows={4}
                placeholder="Criterios de limpieza, alineación, segmentos excluidos, incidencias…"
              />
            </Field>
          </FieldGrid>
          <div className="mt-4 flex">
            <Button
              variant="ghost"
              className="ml-auto text-destructive"
              onClick={async () => {
                if (
                  !(await confirm({
                    title: '¿Quitar el juego del corpus?',
                    description: 'Solo se puede si no tiene documentos. El juego sigue en la app.',
                    confirmLabel: 'Quitar',
                    destructive: true,
                  }))
                )
                  return;
                try {
                  await api(`/corpus/profiles/${gameId}`, { method: 'DELETE' });
                  await qc.invalidateQueries({ queryKey: ['corpus-profiles'] });
                  void navigate({ to: '/corpus' });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'No se ha podido quitar.');
                }
              }}
            >
              Quitar del corpus
            </Button>
          </div>
        </Section>
      </div>
      <ImportTextsDialog gameId={gameId} open={importing} onOpenChange={setImporting} />
    </Page>
  );
}
