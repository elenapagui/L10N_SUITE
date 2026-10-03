import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Download,
  Highlighter,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CORPUS_LANGS,
  CORPUS_TEXT_TYPES,
  SEARCH_MODES,
  formatNumber,
  labelOf,
  langLabel,
  type ConcordanceHit,
  type ConcordanceQuery,
  type ConcordanceResult,
  type CorpusFilters,
  type SearchCondition,
  type SearchMode,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, NativeSelect } from '@/components/ui/input';
import { Checkbox, Spinner } from '@/components/ui/misc';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { api, apiUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AnnotationDialog, type AnnotationTarget } from './Annotations';
import { FiltersPanel } from './FiltersPanel';
import { useSavedSearches } from './hooks';

type Cond = Omit<SearchCondition, 'caseSensitive'> & { caseSensitive?: boolean };

const PAGE = 100;
const newCond = (lang = 'ko'): Cond => ({ lang, mode: 'text', query: '', negate: false });

async function downloadExport(query: ConcordanceQuery) {
  const res = await fetch(apiUrl('/corpus/concordance/export'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!res.ok) throw new Error('No se ha podido exportar.');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Concordancias.xlsx';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function HitRow({
  hit,
  showParallel,
  onAnnotate,
}: {
  hit: ConcordanceHit;
  showParallel: boolean;
  onAnnotate: (t: AnnotationTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const others = Object.entries(hit.parallel).filter(([l]) => l !== hit.lang);
  return (
    <>
      <tr
        className="group cursor-pointer border-b hover:bg-accent/30"
        onClick={() => setOpen((o) => !o)}
        data-testid="kwic-row"
      >
        <td className="max-w-0 truncate py-1.5 pl-3 pr-1 text-right" lang={hit.lang} dir="ltr">
          <span className="text-muted-foreground">{hit.left}</span>
        </td>
        <td
          className="whitespace-nowrap px-1 py-1.5 text-center font-semibold text-primary"
          lang={hit.lang}
        >
          {hit.match}
        </td>
        <td className="max-w-0 truncate py-1.5 pl-1 pr-3" lang={hit.lang}>
          <span className="text-muted-foreground">{hit.right}</span>
        </td>
        <td className="hidden w-48 truncate px-2 py-1.5 text-xs text-muted-foreground lg:table-cell">
          {hit.gameTitle}
          {hit.annotationCount > 0 && (
            <Highlighter className="ml-1 inline size-3 text-primary" aria-label="Con anotaciones" />
          )}
        </td>
      </tr>
      {showParallel && !open && others.length > 0 && (
        <tr
          className="border-b bg-muted/20 text-xs text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <td colSpan={4} className="truncate px-3 py-1">
            {others.map(([l, t]) => (
              <span key={l} lang={l} className="mr-4">
                <span className="mr-1 font-medium uppercase">{l}</span>
                {t}
              </span>
            ))}
          </td>
        </tr>
      )}
      {open && (
        <tr className="border-b bg-muted/30">
          <td colSpan={4} className="px-3 py-3">
            <div className="grid gap-2 text-sm">
              {Object.entries(hit.parallel).map(([l, t]) => (
                <div key={l} className="grid grid-cols-[6rem_1fr] gap-2">
                  <span className="text-xs text-muted-foreground">{langLabel(l)}</span>
                  <span lang={l} className="whitespace-pre-wrap">
                    {l === hit.lang ? (
                      <>
                        {t.slice(0, hit.start)}
                        <mark className="rounded bg-primary/15 px-0.5 text-inherit">
                          {t.slice(hit.start, hit.end)}
                        </mark>
                        {t.slice(hit.end)}
                      </>
                    ) : (
                      t
                    )}
                  </span>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {hit.gameTitle} · {hit.documentTitle} ·{' '}
                  {labelOf(CORPUS_TEXT_TYPES, hit.textType as never)}
                  {hit.stringId && ` · ${hit.stringId}`}
                  {hit.speaker && ` · ${hit.speaker}`}
                </span>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAnnotate({
                        segmentId: hit.segmentId,
                        lang: hit.lang,
                        start: hit.start,
                        end: hit.end,
                        quote: hit.match,
                      });
                    }}
                    data-testid="annotate-hit"
                  >
                    <Highlighter /> Anotar la coincidencia
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link
                      to="/corpus/documentos/$documentId"
                      params={{ documentId: hit.documentId }}
                      search={{ pos: hit.position }}
                    >
                      Ver en el documento
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function ConcordancerPage() {
  const qc = useQueryClient();
  const saved = useSavedSearches();
  const [conds, setConds] = useState<Cond[]>([newCond('ko')]);
  const [filters, setFilters] = useState<CorpusFilters>({});
  const [sort, setSort] = useState<'document' | 'left' | 'right' | 'match'>('document');
  const [contextChars, setContextChars] = useState(60);
  const [offset, setOffset] = useState(0);
  const [showParallel, setShowParallel] = useState(true);
  const [target, setTarget] = useState<AnnotationTarget | null>(null);
  const [lastQuery, setLastQuery] = useState<ConcordanceQuery | null>(null);
  const [saveName, setSaveName] = useState<string | null>(null);

  const goTo = (off: number) => {
    if (!lastQuery) return;
    setOffset(off);
    run.mutate({ ...lastQuery, offset: off });
  };

  const run = useMutation({
    mutationKey: ['concordance'],
    mutationFn: (q: ConcordanceQuery) =>
      api<ConcordanceResult>('/corpus/concordance', { method: 'POST', body: q }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se ha podido buscar.'),
  });

  const buildQuery = (off = 0): ConcordanceQuery | null => {
    const valid = conds.filter((c) => c.query.trim());
    if (!valid.length) return null;
    return {
      conditions: valid.map((c) => ({ ...c, caseSensitive: c.caseSensitive ?? false })),
      filters,
      sort,
      contextChars,
      offset: off,
      limit: PAGE,
    };
  };

  const search = (off = 0) => {
    const q = buildQuery(off);
    if (!q) return;
    setOffset(off);
    setLastQuery(q);
    run.mutate(q);
  };

  const update = (i: number, patch: Partial<Cond>) =>
    setConds((cs) =>
      cs.map((c, j) => {
        if (j !== i) return c;
        const next = { ...c, ...patch };
        // La búsqueda por lema solo existe para el coreano.
        if (next.mode === 'lemma' && next.lang !== 'ko') next.mode = 'text';
        return next;
      }),
    );
  const r = run.data;

  const load = (q: ConcordanceQuery) => {
    setConds(
      q.conditions.map((c) => ({
        lang: c.lang,
        mode: c.mode ?? 'text',
        query: c.query,
        negate: c.negate ?? false,
      })),
    );
    setFilters((q.filters as CorpusFilters) ?? {});
    setSort(q.sort ?? 'document');
    setContextChars(q.contextChars ?? 60);
    setLastQuery({ ...q, offset: 0, limit: PAGE });
    setOffset(0);
    run.mutate({ ...q, offset: 0, limit: PAGE });
  };

  return (
    <Page wide>
      <PageHeader
        title="Concordancias"
        icon={<Search />}
        description="Busca en el corpus paralelo y consulta cada coincidencia con su contexto y su traducción."
      />
      <form
        className="grid gap-2 rounded-lg border bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          search(0);
        }}
      >
        {conds.map((c, i) => (
          <div key={i} className="grid grid-cols-[8.5rem_10rem_1fr_auto_auto] items-center gap-2">
            <NativeSelect
              value={c.lang}
              onChange={(e) => update(i, { lang: e.target.value })}
              aria-label="Idioma"
              data-testid={`cond-lang-${i}`}
            >
              {CORPUS_LANGS.slice(0, 5).map((l) => (
                <option key={l.value} value={l.value}>
                  {i === 0 ? '' : c.negate ? 'y sin ' : 'y '}
                  {l.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value={c.mode}
              onChange={(e) => update(i, { mode: e.target.value as SearchMode })}
              aria-label="Modo"
              title={SEARCH_MODES.find((m) => m.value === c.mode)?.help}
            >
              {SEARCH_MODES.filter((m) => m.value !== 'lemma' || c.lang === 'ko').map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </NativeSelect>
            <Input
              lang={c.lang}
              value={c.query}
              onChange={(e) => update(i, { query: e.target.value })}
              placeholder={
                c.mode === 'regex'
                  ? 'Expresión regular'
                  : c.mode === 'wildcard'
                    ? 'habilidad*, poci?n'
                    : 'Texto que buscar'
              }
              className={cn(c.mode === 'regex' && 'font-mono')}
              autoFocus={i === 0}
              data-testid={`cond-query-${i}`}
            />
            <label
              className="flex items-center gap-1.5 text-sm"
              title="Los segmentos que cumplan esta condición se excluyen"
            >
              <Checkbox
                checked={c.negate}
                disabled={i === 0}
                onCheckedChange={(v) => update(i, { negate: v === true })}
              />
              Excluir
            </label>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={conds.length === 1}
              onClick={() => setConds((cs) => cs.filter((_, j) => j !== i))}
              aria-label="Quitar la condición"
            >
              <X />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={conds.length >= 6}
            onClick={() => setConds((cs) => [...cs, newCond(cs[0]?.lang === 'ko' ? 'es' : 'ko')])}
          >
            <Plus /> Condición
          </Button>
          <FiltersPanel value={filters} onChange={setFilters} />
          <NativeSelect
            className="h-8 w-48"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            aria-label="Orden"
          >
            <option value="document">Orden del corpus</option>
            <option value="left">Por el contexto izquierdo</option>
            <option value="right">Por el contexto derecho</option>
            <option value="match">Por la coincidencia</option>
          </NativeSelect>
          <NativeSelect
            className="h-8 w-36"
            value={String(contextChars)}
            onChange={(e) => setContextChars(Number(e.target.value))}
            aria-label="Contexto"
          >
            {[30, 60, 90, 150].map((n) => (
              <option key={n} value={n}>
                {n} caracteres
              </option>
            ))}
          </NativeSelect>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost">
                <Bookmark /> Guardadas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuItem
                disabled={!buildQuery()}
                onSelect={() => {
                  const q = buildQuery();
                  if (q) setSaveName(q.conditions.map((c) => c.query).join(' · '));
                }}
              >
                <Plus /> Guardar la búsqueda actual
              </DropdownMenuItem>
              {(saved.data ?? []).length > 0 && <DropdownMenuSeparator />}
              {(saved.data ?? []).length > 0 && (
                <DropdownMenuLabel>Búsquedas guardadas</DropdownMenuLabel>
              )}
              {(saved.data ?? []).map((s) => (
                <DropdownMenuItem key={s.id} onSelect={() => load(s.query)} className="group">
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100"
                    aria-label="Borrar la búsqueda guardada"
                    onClick={async (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      await api(`/corpus/saved-searches/${s.id}`, { method: 'DELETE' });
                      await qc.invalidateQueries({ queryKey: ['corpus-saved-searches'] });
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="submit"
            className="ml-auto"
            disabled={run.isPending || !conds.some((c) => c.query.trim())}
            data-testid="concordance-search"
          >
            <Search /> Buscar
          </Button>
        </div>
      </form>

      <div className="mt-4">
        {run.isPending && <Spinner />}
        {r && !run.isPending && (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span data-testid="concordance-total">
                <strong>{formatNumber(r.total, 0)}</strong>{' '}
                {r.total === 1 ? 'coincidencia' : 'coincidencias'} en {formatNumber(r.segments, 0)}{' '}
                segmentos
              </span>
              <span className="text-xs text-muted-foreground">({r.elapsedMs} ms)</span>
              {r.truncated && (
                <span className="text-xs text-muted-foreground">
                  Se muestran y ordenan las primeras 100 000.
                </span>
              )}
              {r.notice && (
                <span className="basis-full text-xs text-amber-700 dark:text-warning">
                  {r.notice}
                </span>
              )}
              <label className="ml-auto flex items-center gap-2">
                <Checkbox
                  checked={showParallel}
                  onCheckedChange={(v) => setShowParallel(v === true)}
                />
                Mostrar la traducción
              </label>
              <Button
                size="sm"
                variant="outline"
                disabled={!r.total || !lastQuery}
                onClick={() =>
                  lastQuery &&
                  void downloadExport(lastQuery).catch((e: Error) => toast.error(e.message))
                }
              >
                <Download /> Excel
              </Button>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="size-8"
                  disabled={offset === 0}
                  onClick={() => goTo(offset - PAGE)}
                  aria-label="Anteriores"
                >
                  <ChevronLeft />
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {r.total ? `${offset + 1}–${Math.min(offset + PAGE, r.total)}` : '0'}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-8"
                  disabled={offset + PAGE >= Math.min(r.total, 100_000)}
                  onClick={() => goTo(offset + PAGE)}
                  aria-label="Siguientes"
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
            {r.hits.length > 0 && (
              <div className="overflow-hidden rounded-lg border bg-card">
                <table className="w-full table-fixed text-sm" data-testid="kwic">
                  <colgroup>
                    <col className="w-[42%]" />
                    <col className="w-[16%]" />
                    <col className="w-[42%] lg:w-[30%]" />
                    <col className="hidden lg:table-column" />
                  </colgroup>
                  <tbody>
                    {r.hits.map((h, i) => (
                      <HitRow
                        key={`${h.segmentId}-${h.start}-${i}`}
                        hit={h}
                        showParallel={showParallel}
                        onAnnotate={setTarget}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {!r && !run.isPending && (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            <p className="mb-2 font-medium text-foreground">Cómo buscar</p>
            <ul className="list-disc space-y-1 pl-5">
              {SEARCH_MODES.map((m) => (
                <li key={m.value}>
                  <strong>{m.label}:</strong> {m.help}.
                </li>
              ))}
              <li>
                Añade condiciones en otros idiomas: por ejemplo, <em>coreano contiene 스킬</em> y{' '}
                <em>sin español contiene habilidad</em>.
              </li>
              <li>
                Las búsquedas de 1 o 2 sílabas en coreano funcionan, pero son algo más lentas en
                corpus grandes.
              </li>
            </ul>
          </div>
        )}
      </div>
      <Dialog open={saveName !== null} onOpenChange={(o) => !o && setSaveName(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guardar la búsqueda</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={saveName ?? ''}
            onChange={(e) => setSaveName(e.target.value)}
            aria-label="Nombre"
          />
          <DialogFooter>
            <Button
              disabled={!saveName?.trim()}
              onClick={async () => {
                const q = buildQuery();
                if (!q || !saveName?.trim()) return;
                await api('/corpus/saved-searches', {
                  method: 'POST',
                  body: { name: saveName.trim(), query: q },
                });
                await qc.invalidateQueries({ queryKey: ['corpus-saved-searches'] });
                setSaveName(null);
                toast.success('Búsqueda guardada');
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AnnotationDialog
        target={target}
        onOpenChange={(o) => !o && setTarget(null)}
        onSaved={() => lastQuery && run.mutate({ ...lastQuery, offset })}
      />
    </Page>
  );
}
