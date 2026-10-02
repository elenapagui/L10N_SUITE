import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Highlighter,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CORPUS_TEXT_TYPES,
  formatNumber,
  langLabel,
  type CorpusTextType,
  type Segment,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { CommitInput } from '@/components/common/inputs';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { BackLink } from '@/features/work/shared';
import {
  AnnotatableText,
  AnnotationChip,
  AnnotationDialog,
  type AnnotationTarget,
} from './Annotations';
import { useCorpusDocument, useSegments } from './hooks';

const PAGE = 100;

function SegmentEditor({
  segment,
  langs,
  onDone,
}: {
  segment: Segment;
  langs: string[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(langs.map((l) => [l, segment.texts[l] ?? ''])),
  );
  return (
    <div className="grid gap-2 p-2">
      {langs.map((l) => (
        <label key={l} className="grid gap-1 text-xs">
          <span className="text-muted-foreground">{langLabel(l)}</span>
          <Textarea
            lang={l}
            rows={2}
            value={texts[l]}
            onChange={(e) => setTexts((t) => ({ ...t, [l]: e.target.value }))}
          />
        </label>
      ))}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            try {
              await api(`/corpus/segments/${segment.id}`, { method: 'PATCH', body: { texts } });
              await qc.invalidateQueries({ queryKey: ['corpus-segments'] });
              onDone();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'No se ha podido guardar.');
            }
          }}
        >
          Guardar
        </Button>
      </div>
    </div>
  );
}

export function DocumentPage() {
  const { documentId } = useParams({ strict: false }) as { documentId: string };
  const search = useSearch({ from: '/corpus/documentos/$documentId' });
  const doc = useCorpusDocument(documentId);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [offset, setOffset] = useState(() =>
    search.pos ? Math.floor((search.pos - 1) / PAGE) * PAGE : 0,
  );
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const segs = useSegments(documentId, offset, PAGE, query);
  const [target, setTarget] = useState<AnnotationTarget | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  useEffect(() => {
    const h = window.setTimeout(() => {
      setQuery(q);
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(h);
  }, [q]);

  // Lleva al segmento pedido (desde el concordanciador).
  useEffect(() => {
    if (!search.pos || !segs.data) return;
    document.getElementById(`seg-${search.pos}`)?.scrollIntoView({ block: 'center' });
  }, [search.pos, segs.data]);

  const langs = useMemo(() => {
    const fromDoc = doc.data?.languages ?? [];
    const order = ['ko', 'es', 'en'];
    return [...fromDoc].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  }, [doc.data]);

  if (doc.isLoading) {
    return (
      <Page>
        <Spinner />
      </Page>
    );
  }
  if (!doc.data) {
    return (
      <Page>
        <p className="text-muted-foreground">Este documento no existe o está en la papelera.</p>
      </Page>
    );
  }
  const d = doc.data;
  const total = segs.data?.total ?? 0;
  const patchDoc = async (body: Record<string, unknown>) => {
    await api(`/corpus/documents/${d.id}`, { method: 'PATCH', body });
    await qc.invalidateQueries({ queryKey: ['corpus-document', d.id] });
    await qc.invalidateQueries({ queryKey: ['corpus-documents'] });
  };

  return (
    <Page wide>
      <BackLink to={`/corpus/juegos/${d.gameId}`} label={d.gameTitle} />
      <PageHeader
        icon={<FileText />}
        title={d.title}
        description={`${formatNumber(d.segmentCount, 0)} segmentos · ${d.annotationCount} anotaciones${d.sourceFile ? ` · ${d.sourceFile}` : ''}`}
        actions={
          <NativeSelect
            className="w-44"
            value={d.textType}
            onChange={(e) => void patchDoc({ textType: e.target.value as CorpusTextType })}
            aria-label="Tipo de texto"
          >
            {CORPUS_TEXT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <CommitInput
          value={d.notes}
          onCommit={(v) => void patchDoc({ notes: v })}
          placeholder="Notas del documento…"
        />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="w-72 pl-8"
            placeholder="Buscar en el documento…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {total
            ? `${offset + 1}–${Math.min(offset + PAGE, total)} de ${formatNumber(total, 0)}`
            : 'Sin segmentos'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
            aria-label="Anteriores"
          >
            <ChevronLeft />
          </Button>
          <Button
            size="icon"
            variant="outline"
            disabled={offset + PAGE >= total}
            onClick={() => setOffset(offset + PAGE)}
            aria-label="Siguientes"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        Selecciona un fragmento de texto para anotarlo, o usa el rotulador de la fila para anotar el
        segmento entero.
      </p>
      <div className="overflow-hidden rounded-lg border">
        <div
          className="grid border-b bg-muted/60 text-xs font-medium text-muted-foreground"
          style={{ gridTemplateColumns: `4rem 10rem repeat(${langs.length}, minmax(0, 1fr)) 5rem` }}
        >
          <div className="px-2 py-2">#</div>
          <div className="px-2 py-2">ID · hablante</div>
          {langs.map((l) => (
            <div key={l} className="px-2 py-2">
              {langLabel(l)}
            </div>
          ))}
          <div />
        </div>
        {(segs.data?.items ?? []).map((s) => (
          <div
            key={s.id}
            id={`seg-${s.position}`}
            className={cn(
              'group grid border-b text-sm last:border-0',
              search.pos === s.position && 'bg-primary/5',
            )}
            style={{
              gridTemplateColumns: `4rem 10rem repeat(${langs.length}, minmax(0, 1fr)) 5rem`,
            }}
            data-testid="corpus-segment"
          >
            <div className="px-2 py-2 text-xs text-muted-foreground tabular-nums">{s.position}</div>
            <div className="min-w-0 px-2 py-2 text-xs">
              {s.stringId && <div className="truncate font-mono">{s.stringId}</div>}
              {s.speaker && (
                <div lang="ko" className="truncate text-muted-foreground">
                  {s.speaker}
                </div>
              )}
              {s.context && <div className="truncate text-muted-foreground/80">{s.context}</div>}
            </div>
            {editing === s.id ? (
              <div style={{ gridColumn: `span ${langs.length}` }}>
                <SegmentEditor segment={s} langs={langs} onDone={() => setEditing(null)} />
              </div>
            ) : (
              langs.map((l) => (
                <div key={l} className="min-w-0 px-2 py-2">
                  {s.texts[l] ? (
                    <AnnotatableText
                      text={s.texts[l]}
                      lang={l}
                      segmentId={s.id}
                      annotations={s.annotations}
                      onAnnotate={setTarget}
                    />
                  ) : (
                    <span className="text-xs text-destructive/70">(sin texto)</span>
                  )}
                </div>
              ))
            )}
            <div className="flex items-start justify-end gap-0.5 px-1 py-1 opacity-0 group-hover:opacity-100">
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="Anotar el segmento"
                title="Anotar el segmento entero"
                onClick={() => setTarget({ segmentId: s.id })}
              >
                <Highlighter />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="Corregir"
                title="Corregir los textos"
                onClick={() => setEditing(s.id)}
              >
                <Pencil />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="Eliminar segmento"
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: '¿Eliminar el segmento?',
                      description: 'Se borran sus textos y anotaciones. No se puede deshacer.',
                      confirmLabel: 'Eliminar',
                      destructive: true,
                    }))
                  )
                    return;
                  await api(`/corpus/segments/${s.id}`, { method: 'DELETE' });
                  await qc.invalidateQueries({ queryKey: ['corpus-segments'] });
                }}
              >
                <Trash2 />
              </Button>
            </div>
            {s.annotations.length > 0 && (
              <div className="col-span-full flex flex-wrap gap-1 px-2 pb-2 pl-[14rem]">
                {s.annotations.map((a) => (
                  <AnnotationChip key={a.id} a={a} />
                ))}
              </div>
            )}
          </div>
        ))}
        {segs.isFetching && !segs.data && (
          <div className="p-4">
            <Spinner />
          </div>
        )}
      </div>
      <AnnotationDialog target={target} onOpenChange={(o) => !o && setTarget(null)} />
    </Page>
  );
}
