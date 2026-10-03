import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  ChevronDown,
  Copy,
  Download,
  FileText,
  FolderPlus,
  Library,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  READ_STATUSES,
  apaHtml,
  apaText,
  compareApa,
  labelOf,
  referenceTypeLabel,
  type CslItem,
  type Reference,
  type ReferenceImportResult,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
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
import { Input, Textarea } from '@/components/ui/input';
import { Checkbox, Spinner } from '@/components/ui/misc';
import { EmptyState, PageHeader } from '@/components/layout/PageHeader';
import { api, apiUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { copyRich, useCollections, useReferences, type ReferenceFilters } from './hooks';
import { CslForm, ReferenceSheet, Stars } from './ReferenceSheet';

type AddMode = 'doi' | 'paste' | 'manual' | null;

function AddDialog({
  mode,
  onOpenChange,
  collectionId,
  onCreated,
}: {
  mode: AddMode;
  onOpenChange: (o: boolean) => void;
  collectionId?: string;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [doi, setDoi] = useState('');
  const [text, setText] = useState('');
  const [csl, setCsl] = useState<CslItem>({ type: 'article-journal', title: '' });
  const [found, setFound] = useState<{
    csl: CslItem;
    duplicateOf: string | null;
    apa: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!mode) {
      setDoi('');
      setText('');
      setFound(null);
      setCsl({ type: 'article-journal', title: '' });
    }
  }, [mode]);
  const refresh = () =>
    Promise.all(
      ['references', 'reference-collections', 'import-batches'].map((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      ),
    );
  const create = async (item: CslItem) => {
    const r = await api<Reference>('/references', {
      method: 'POST',
      body: { csl: item, collectionIds: collectionId ? [collectionId] : [] },
    });
    await refresh();
    onOpenChange(false);
    onCreated(r.id);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido completar.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent size={mode === 'manual' ? 'xl' : 'lg'}>
        <DialogHeader>
          <DialogTitle>
            {mode === 'doi'
              ? 'Añadir por DOI'
              : mode === 'paste'
                ? 'Pegar BibTeX, RIS o CSL-JSON'
                : 'Nueva referencia'}
          </DialogTitle>
        </DialogHeader>
        {mode === 'doi' && (
          <div className="grid gap-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () =>
                  setFound(await api('/references/doi', { method: 'POST', body: { doi } })),
                );
              }}
            >
              <Input
                autoFocus
                placeholder="10.1080/0907676X.2021.1234567 o https://doi.org/…"
                value={doi}
                onChange={(e) => setDoi(e.target.value)}
                data-testid="doi-input"
              />
              <Button type="submit" disabled={busy || doi.trim().length < 5}>
                <Search /> Buscar
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Necesita conexión a internet: los datos se obtienen de doi.org (Crossref, DataCite…).
            </p>
            {busy && <Spinner />}
            {found && (
              <div className="grid gap-2 rounded-md border p-3 text-sm">
                <p dangerouslySetInnerHTML={{ __html: apaHtml(found.csl) }} />
                {found.duplicateOf && (
                  <p className="text-xs text-amber-700 dark:text-warning">
                    Esta referencia ya está en tu biblioteca.
                  </p>
                )}
                <DialogFooter>
                  {found.duplicateOf ? (
                    <Button
                      onClick={() => {
                        onOpenChange(false);
                        onCreated(found.duplicateOf!);
                      }}
                    >
                      Ver la que ya tengo
                    </Button>
                  ) : (
                    <Button onClick={() => void run(() => create(found.csl))} data-testid="doi-add">
                      Añadir a la biblioteca
                    </Button>
                  )}
                </DialogFooter>
              </div>
            )}
          </div>
        )}
        {mode === 'paste' && (
          <div className="grid gap-3">
            <Textarea
              autoFocus
              rows={12}
              className="font-mono text-xs"
              placeholder={
                '@article{clave,\n  author = {Apellido, Nombre},\n  title = {…},\n  …\n}'
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              data-testid="paste-input"
            />
            <p className="text-xs text-muted-foreground">
              En Zotero: selecciona las referencias, botón derecho → Exportar → BibTeX o RIS, y pega
              el contenido o importa el archivo.
            </p>
            <DialogFooter>
              <Button
                disabled={busy || !text.trim()}
                onClick={() =>
                  void run(async () => {
                    const r = await api<ReferenceImportResult>('/references/import', {
                      method: 'POST',
                      body: { text, collectionId: collectionId ?? null },
                    });
                    toast.success(
                      `${r.created} referencias añadidas${r.duplicates ? ` · ${r.duplicates} ya estaban en la biblioteca` : ''}`,
                    );
                    await refresh();
                    onOpenChange(false);
                  })
                }
                data-testid="paste-import"
              >
                Importar
              </Button>
            </DialogFooter>
          </div>
        )}
        {mode === 'manual' && (
          <div className="grid gap-3">
            <CslForm value={csl} onChange={setCsl} />
            <DialogFooter>
              <Button
                disabled={busy || !csl.title?.trim()}
                onClick={() => void run(() => create(csl))}
                data-testid="manual-add"
              >
                Añadir
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function LibraryPage() {
  const search = useSearch({ from: '/academico/biblioteca' });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const collections = useCollections();
  const [scope, setScope] = useState<{ collectionId?: string; readStatus?: string }>({});
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<AddMode>(null);
  const [newCollection, setNewCollection] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = window.setTimeout(() => setQuery(q), 250);
    return () => window.clearTimeout(h);
  }, [q]);
  const filters: ReferenceFilters = { ...scope, q: query || undefined };
  const refs = useReferences(filters);
  const list = useMemo(() => refs.data ?? [], [refs.data]);
  const openId = search.ref ?? null;
  const open = (id: string | null) =>
    void navigate({ to: '/academico/biblioteca', search: id ? { ref: id } : {}, replace: true });

  // Solo cuentan las seleccionadas que siguen visibles: al buscar o filtrar, las ocultas se
  // quitan de la selección (si no, «Exportar» o «A una colección» actuarían sobre ellas).
  const selectedRefs = list.filter((r) => selected.has(r.id));
  useEffect(() => {
    if (refs.isFetching) return;
    setSelected((s) => {
      const visible = new Set(list.filter((r) => s.has(r.id)).map((r) => r.id));
      return visible.size === s.size ? s : visible;
    });
  }, [list, refs.isFetching]);
  const nSelected = selectedRefs.length;
  const seleccionadas = (n: number) => `${n} ${n === 1 ? 'seleccionada' : 'seleccionadas'}`;
  const target = selectedRefs.length ? selectedRefs : list;
  const exportUrl = (format: string) =>
    apiUrl('/references/export', { format, ids: target.map((r) => r.id).join(',') });
  const refresh = () =>
    Promise.all(
      ['references', 'reference-collections', 'import-batches'].map((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      ),
    );

  const importFile = async (file: File) => {
    const form = new FormData();
    if (scope.collectionId) form.append('collectionId', scope.collectionId);
    form.append('file', file, file.name);
    try {
      const r = await api<ReferenceImportResult>('/references/import', {
        method: 'POST',
        body: form,
      });
      toast.success(
        `${r.created} referencias importadas${r.duplicates ? ` · ${r.duplicates} duplicadas omitidas` : ''}. Puedes deshacerlo en Ajustes → Importar.`,
      );
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido importar.');
    }
  };

  const scopeLabel = scope.collectionId
    ? (collections.data?.find((c) => c.id === scope.collectionId)?.name ?? 'Colección')
    : scope.readStatus
      ? labelOf(READ_STATUSES, scope.readStatus as never)
      : 'Todas las referencias';

  const item = (label: string, value: typeof scope, count?: number, color?: string) => {
    const active =
      scope.collectionId === value.collectionId && scope.readStatus === value.readStatus;
    return (
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
          active && 'bg-accent font-medium',
        )}
        onClick={() => {
          setScope(value);
          setSelected(new Set());
        }}
      >
        {color && <span className="size-2.5 rounded-full" style={{ background: color }} />}
        <span className="truncate">{label}</span>
        {count != null && <span className="ml-auto text-xs text-muted-foreground">{count}</span>}
      </button>
    );
  };

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-56 shrink-0 overflow-y-auto border-r bg-sidebar/50 p-3 md:block">
        {item('Todas', {})}
        <h3 className="mb-1 mt-4 px-2 text-xs font-medium uppercase text-muted-foreground">
          Lectura
        </h3>
        {READ_STATUSES.map((s) => item(s.label, { readStatus: s.value }))}
        <div className="mb-1 mt-4 flex items-center px-2">
          <h3 className="text-xs font-medium uppercase text-muted-foreground">Colecciones</h3>
          <button
            type="button"
            className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-accent"
            onClick={() => setNewCollection('')}
            aria-label="Nueva colección"
            title="Nueva colección"
          >
            <FolderPlus className="size-4" />
          </button>
        </div>
        {(collections.data ?? []).map((c) => (
          <div key={c.id} className="group relative">
            {item(c.name, { collectionId: c.id }, c.count, c.color)}
            <button
              type="button"
              className="absolute right-8 top-1.5 hidden rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
              aria-label={`Eliminar la colección ${c.name}`}
              onClick={async () => {
                if (
                  !(await confirm({
                    title: `¿Eliminar la colección «${c.name}»?`,
                    description: 'Las referencias no se borran.',
                    confirmLabel: 'Eliminar',
                    destructive: true,
                  }))
                )
                  return;
                await api(`/reference-collections/${c.id}`, { method: 'DELETE' });
                if (scope.collectionId === c.id) setScope({});
                await refresh();
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
        <PageHeader
          title="Biblioteca"
          icon={<BookOpen />}
          description="Referencias bibliográficas con sus PDF, notas de lectura y citas; en APA 7 y exportables a BibTeX, RIS y CSL-JSON."
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-testid="add-reference">
                  <Plus /> Añadir <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setAdding('doi')}>Por DOI</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setAdding('paste')} data-testid="add-paste">
                  Pegar BibTeX, RIS o CSL-JSON
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                  Importar archivo .bib, .ris o .json
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setAdding('manual')} data-testid="add-manual">
                  A mano
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
        <input
          ref={fileRef}
          type="file"
          accept=".bib,.bibtex,.ris,.json,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importFile(f);
          }}
        />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="w-80 pl-8"
              placeholder="Buscar en títulos, autoría, notas, citas y PDF…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="library-search"
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {scopeLabel}: {list.length}
            {nSelected > 0 && ` · ${seleccionadas(nSelected)}`}
          </span>
          <div className="ml-auto flex gap-2">
            {nSelected > 0 && (collections.data ?? []).length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Library /> A una colección
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {(collections.data ?? []).map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      onSelect={async () => {
                        await api(`/reference-collections/${c.id}/items`, {
                          method: 'POST',
                          body: { add: selectedRefs.map((r) => r.id) },
                        });
                        toast.success(`Añadidas a «${c.name}»`);
                        await refresh();
                      }}
                    >
                      {c.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={!target.length}
              onClick={() => {
                const sorted = [...target].sort((a, b) => compareApa(a.csl, b.csl));
                void copyRich(
                  sorted.map((r) => `<p>${apaHtml(r.csl)}</p>`).join(''),
                  sorted.map((r) => apaText(r.csl)).join('\n\n'),
                ).then(() =>
                  toast.success(
                    `${sorted.length} ${sorted.length === 1 ? 'referencia copiada' : 'referencias copiadas'} en APA 7`,
                  ),
                );
              }}
            >
              <Copy /> Copiar en APA
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!target.length}>
                  <Download /> Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  {nSelected
                    ? seleccionadas(nSelected)
                    : target.length === 1
                      ? 'La única de la lista'
                      : `Las ${target.length} de la lista`}
                </DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <a href={exportUrl('bibtex')}>BibTeX (.bib)</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={exportUrl('ris')}>RIS (.ris)</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={exportUrl('csljson')}>CSL-JSON</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={exportUrl('apa')}>APA 7 (texto)</a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {refs.isLoading ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<BookOpen />}
            title={query ? 'Ninguna referencia coincide' : 'La biblioteca está vacía'}
            description="Añade referencias por DOI, pégalas en BibTeX o RIS o importa la exportación de Zotero o Mendeley."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full table-fixed text-sm" data-testid="library-table">
              <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      checked={selected.size > 0 && selected.size === list.length}
                      onCheckedChange={(v) =>
                        setSelected(v ? new Set(list.map((r) => r.id)) : new Set())
                      }
                      aria-label="Seleccionar todas"
                    />
                  </th>
                  <th className="w-44 px-2 py-2 text-left font-medium xl:w-56">Autoría</th>
                  <th className="w-16 px-2 py-2 text-left font-medium">Año</th>
                  <th className="px-2 py-2 text-left font-medium">Título</th>
                  <th className="hidden w-40 px-2 py-2 text-left font-medium lg:table-cell">
                    Tipo
                  </th>
                  <th className="hidden w-44 px-2 py-2 text-left font-medium md:table-cell">
                    Lectura
                  </th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr
                    key={r.id}
                    className={cn(
                      'cursor-pointer border-b last:border-0 hover:bg-accent/30',
                      openId === r.id && 'bg-accent/50',
                    )}
                    onClick={() => open(r.id)}
                    data-testid="library-row"
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={(v) =>
                          setSelected((s) => {
                            const n = new Set(s);
                            if (v) n.add(r.id);
                            else n.delete(r.id);
                            return n;
                          })
                        }
                        aria-label={`Seleccionar ${r.title}`}
                      />
                    </td>
                    <td className="truncate px-2 py-2">{r.creators || '—'}</td>
                    <td className="px-2 py-2 tabular-nums">{r.year ?? 's. f.'}</td>
                    <td className="px-2 py-2">
                      <div className="truncate font-medium">{r.title || 'Sin título'}</div>
                      {r.container && (
                        <div className="truncate text-xs italic text-muted-foreground">
                          {r.container}
                        </div>
                      )}
                    </td>
                    <td className="hidden px-2 py-2 text-xs text-muted-foreground lg:table-cell">
                      {referenceTypeLabel(r.type)}
                    </td>
                    <td className="hidden px-2 py-2 md:table-cell">
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {labelOf(READ_STATUSES, r.readStatus)}
                        {r.rating > 0 && <Stars value={r.rating} />}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      {r.pdfAttachmentId && (
                        <FileText className="size-4 text-muted-foreground" aria-label="Con PDF" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <AddDialog
        mode={adding}
        onOpenChange={(o) => !o && setAdding(null)}
        collectionId={scope.collectionId}
        onCreated={(id) => open(id)}
      />
      <ReferenceSheet id={openId} onClose={() => open(null)} />
      <Dialog open={newCollection !== null} onOpenChange={(o) => !o && setNewCollection(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva colección</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newCollection ?? ''}
            onChange={(e) => setNewCollection(e.target.value)}
            placeholder="Tesis, Honoríficos, Pendientes de citar…"
          />
          <DialogFooter>
            <Button
              disabled={!newCollection?.trim()}
              onClick={async () => {
                await api('/reference-collections', {
                  method: 'POST',
                  body: { name: newCollection!.trim() },
                });
                setNewCollection(null);
                await refresh();
              }}
            >
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
