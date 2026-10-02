import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileText,
  FileUp,
  History,
  Loader2,
  MoreHorizontal,
  Printer,
  RotateCcw,
  Star,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  entityLabel,
  formatDateTimeES,
  type Page as PageData,
  type PageRevision,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { EntitySelect } from '@/components/common/EntitySelect';
import { EmojiPicker } from '@/components/common/EmojiPicker';
import { useGames } from '@/hooks/work';
import { api } from '@/lib/api';
import { entityRoute } from '@/lib/entities';
import { cn } from '@/lib/utils';
import { useBacklinks, usePage, usePages, usePageTemplates, useRevisions } from './hooks';
import { PageEditor, type PageEditorHandle, type SaveState } from './PageEditor';
import { PagesTree, usePageActions } from './PagesTree';

function PagesShell({ activeId, children }: { activeId?: string; children: ReactNode }) {
  const pages = usePages();
  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-64 shrink-0 overflow-y-auto border-r bg-sidebar/50 px-2 py-4 md:block print:hidden">
        {pages.data ? <PagesTree pages={pages.data} activeId={activeId} /> : <Spinner />}
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto" id="page-scroll">
        {children}
      </div>
    </div>
  );
}

export function PagesHomePage() {
  const pages = usePages();
  const templates = usePageTemplates();
  const actions = usePageActions();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const recent = useMemo(
    () =>
      [...(pages.data ?? [])]
        .sort((a, b) =>
          (b.lastOpenedAt ?? b.updatedAt).localeCompare(a.lastOpenedAt ?? a.updatedAt),
        )
        .slice(0, 8),
    [pages.data],
  );

  const importMarkdown = async (file: File) => {
    const form = new FormData();
    form.append('file', file, file.name);
    try {
      const p = await api<PageData>('/import/markdown', { method: 'POST', body: form });
      await qc.invalidateQueries({ queryKey: ['pages'] });
      void navigate({ to: '/paginas/$pageId', params: { pageId: p.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se ha podido importar el archivo.');
    }
  };

  return (
    <PagesShell>
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <FileText className="size-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold">Páginas</h1>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <FileUp /> Importar Markdown
            </Button>
            <Button onClick={() => void actions.create({})} data-testid="new-page">
              Nueva página
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importMarkdown(f);
            }}
          />
        </div>
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Empezar desde una plantilla
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(templates.data ?? []).map((t) => (
              <button
                key={t.key}
                type="button"
                className="flex items-start gap-3 rounded-lg border bg-card p-4 text-left hover:border-primary/50 hover:bg-accent/40"
                onClick={() => void actions.create({ template: t.key })}
                data-testid={`template-${t.key}`}
              >
                <span className="text-2xl leading-none">{t.icon}</span>
                <span>
                  <span className="block font-medium">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">{t.description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recientes</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay páginas. Para traer tu espacio de Notion, ve a{' '}
              <Link to="/ajustes" search={{ tab: 'importar' }} className="underline">
                Ajustes → Importar
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {recent.map((p) => (
                <li key={p.id}>
                  <Link
                    to="/paginas/$pageId"
                    params={{ pageId: p.id }}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40"
                  >
                    <span>{p.icon ?? '📄'}</span>
                    <span className="min-w-0 flex-1 truncate">{p.title || 'Sin título'}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTimeES(p.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PagesShell>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, { icon: ReactNode; label: string; className?: string }> = {
    saved: { icon: <Check className="size-3.5" />, label: 'Guardado' },
    pending: { icon: <Loader2 className="size-3.5" />, label: 'Cambios sin guardar' },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, label: 'Guardando…' },
    error: {
      icon: <AlertTriangle className="size-3.5" />,
      label: 'No se ha guardado',
      className: 'text-destructive',
    },
    conflict: {
      icon: <AlertTriangle className="size-3.5" />,
      label: 'Cambiada en otra ventana',
      className: 'text-destructive',
    },
  };
  const s = map[state];
  return (
    <span
      className={cn('flex items-center gap-1 text-xs text-muted-foreground', s.className)}
      data-testid="save-state"
      data-state={state}
    >
      {s.icon}
      {s.label}
    </span>
  );
}

function download(name: string, text: string, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function HistorySheet({
  page,
  open,
  onOpenChange,
  onRestored,
}: {
  page: PageData;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onRestored: () => void;
}) {
  const revs = useRevisions(page.id, open);
  const [selected, setSelected] = useState<PageRevision | null>(null);
  const [preview, setPreview] = useState<PageData | null>(null);
  useEffect(() => {
    if (!selected) {
      setPreview(null);
      return;
    }
    void api<{ content: unknown; contentFormat: 'blocks' | 'markdown' }>(
      `/pages/${page.id}/revisions/${selected.id}`,
    ).then((r) =>
      setPreview({
        ...page,
        id: `${page.id}:${selected.id}`,
        content: r.content,
        contentFormat: r.contentFormat,
      }),
    );
  }, [selected, page]);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Historial de versiones"
      className="max-w-5xl"
    >
      <div className="grid min-h-0 gap-4 p-5 md:grid-cols-[14rem_1fr]">
        <ul className="grid content-start gap-1 text-sm">
          {(revs.data ?? []).length === 0 && (
            <li className="text-muted-foreground">
              Aún no hay versiones anteriores. Se guarda una cada 10 minutos de edición.
            </li>
          )}
          {(revs.data ?? []).map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={cn(
                  'w-full rounded-md px-3 py-2 text-left hover:bg-accent',
                  selected?.id === r.id && 'bg-accent',
                )}
                onClick={() => setSelected(r)}
              >
                <span className="block font-medium">{formatDateTimeES(r.createdAt)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {r.title || 'Sin título'}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="min-w-0 rounded-lg border p-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Elige una versión para verla.</p>
          ) : !preview ? (
            <Spinner />
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Versión del {formatDateTimeES(selected.createdAt)}
                </span>
                <Button
                  size="sm"
                  className="ml-auto"
                  onClick={async () => {
                    await api(`/pages/${page.id}/revisions/${selected.id}/restore`, {
                      method: 'POST',
                    });
                    toast.success(
                      'Versión restaurada. La versión que tenías se ha guardado en el historial.',
                    );
                    onOpenChange(false);
                    onRestored();
                  }}
                >
                  <RotateCcw /> Restaurar esta versión
                </Button>
              </div>
              <div className="pl-[54px]">
                <PageEditor key={preview.id} page={preview} editable={false} />
              </div>
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function Backlinks({ pageId }: { pageId: string }) {
  const q = useBacklinks('page', pageId);
  if (!q.data?.length) return null;
  return (
    <section className="mt-10 border-t pt-4 print:hidden">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Mencionada en
      </h2>
      <ul className="flex flex-wrap gap-2">
        {q.data.map((b) => (
          <li key={b.entityId}>
            <Link
              to="/paginas/$pageId"
              params={{ pageId: b.entityId }}
              className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm hover:bg-accent"
            >
              {b.icon ?? '📄'} {b.title || 'Sin título'}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PageViewPage() {
  const { pageId } = useParams({ strict: false }) as { pageId: string };
  const q = usePage(pageId);
  const pages = usePages();
  const games = useGames();
  const qc = useQueryClient();
  const actions = usePageActions();
  const editorRef = useRef<PageEditorHandle>(null);
  const [state, setState] = useState<SaveState>('saved');
  const [title, setTitle] = useState('');
  const [reload, setReload] = useState(0);
  const [history, setHistory] = useState(false);
  const titleTimer = useRef<number | null>(null);

  useEffect(() => {
    if (q.data) setTitle(q.data.title);
    // Solo al cambiar de página o recargar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data?.id, reload]);

  useEffect(() => {
    if (pageId) void api(`/pages/${pageId}/opened`, { method: 'POST' }).catch(() => undefined);
  }, [pageId]);

  const children = useMemo(
    () =>
      (pages.data ?? [])
        .filter((p) => p.parentId === pageId)
        .sort((a, b) => a.position - b.position),
    [pages.data, pageId],
  );

  if (q.isLoading) {
    return (
      <PagesShell activeId={pageId}>
        <div className="p-8">
          <Spinner />
        </div>
      </PagesShell>
    );
  }
  if (!q.data) {
    return (
      <PagesShell activeId={pageId}>
        <p className="p-8 text-muted-foreground">Esta página no existe o está en la papelera.</p>
      </PagesShell>
    );
  }
  const page = q.data;

  const patch = async (body: Record<string, unknown>) => {
    await api(`/pages/${page.id}`, { method: 'PATCH', body });
    await qc.invalidateQueries({ queryKey: ['pages'] });
    await qc.invalidateQueries({ queryKey: ['page', page.id] });
  };

  const reloadPage = async () => {
    await qc.invalidateQueries({ queryKey: ['page', page.id] });
    await q.refetch();
    setReload((n) => n + 1);
    setState('saved');
  };

  const onTitle = (v: string) => {
    setTitle(v);
    if (titleTimer.current) window.clearTimeout(titleTimer.current);
    titleTimer.current = window.setTimeout(() => void patch({ title: v }), 500);
  };

  const exportMarkdown = async () => {
    const ed = editorRef.current?.editor;
    if (!ed) return;
    const md = `# ${title || 'Sin título'}\n\n${ed.blocksToMarkdownLossy(ed.document)}`;
    download(`${(title || 'pagina').replace(/[\\/:*?"<>|]/g, ' ').trim()}.md`, md);
  };

  return (
    <PagesShell activeId={pageId}>
      <div className="mx-auto w-full max-w-4xl px-6 pb-24 pt-4 sm:px-16">
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground print:hidden">
          <nav className="flex min-w-0 flex-1 items-center gap-1 truncate" aria-label="Ruta">
            <Link to="/paginas" className="hover:text-foreground">
              Páginas
            </Link>
            {page.breadcrumbs.map((b) => (
              <span key={b.id} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="size-3.5 shrink-0" />
                <Link
                  to="/paginas/$pageId"
                  params={{ pageId: b.id }}
                  className="truncate hover:text-foreground"
                >
                  {b.icon} {b.title || 'Sin título'}
                </Link>
              </span>
            ))}
          </nav>
          <SaveIndicator state={state} />
          <Button
            variant="ghost"
            size="icon"
            aria-label={page.isFavorite ? 'Quitar de favoritas' : 'Añadir a favoritas'}
            title={page.isFavorite ? 'Quitar de favoritas' : 'Añadir a favoritas'}
            onClick={() => void patch({ isFavorite: !page.isFavorite })}
          >
            <Star className={cn(page.isFavorite && 'fill-amber-400 text-amber-500')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Historial"
            title="Historial de versiones"
            onClick={() => setHistory(true)}
          >
            <History />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Más acciones">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void exportMarkdown()}>
                <Download /> Exportar a Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => window.print()}>
                <Printer /> Imprimir o guardar en PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={async () => {
                  await editorRef.current?.flush();
                  void actions.duplicate(page.id);
                }}
              >
                <Copy /> Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => void actions.remove(page, page.id)}
              >
                <Trash2 /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {state === 'conflict' && (
          <div className="mb-4 flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">
            <AlertTriangle className="size-4 text-destructive" />
            Esta página se ha modificado en otra ventana. Los cambios de aquí no se guardan.
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => void reloadPage()}
            >
              Recargar
            </Button>
          </div>
        )}

        <div className="group mb-2">
          <EmojiPicker value={page.icon} onChange={(icon) => void patch({ icon })}>
            <button
              type="button"
              className={cn(
                'rounded-md text-5xl leading-none hover:bg-accent',
                !page.icon && 'text-base text-muted-foreground opacity-0 group-hover:opacity-100',
              )}
              aria-label="Cambiar icono"
            >
              {page.icon ?? 'Añadir icono'}
            </button>
          </EmojiPicker>
        </div>
        <textarea
          value={title}
          onChange={(e) => onTitle(e.target.value.replace(/\n/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              editorRef.current?.editor.focus();
            }
          }}
          placeholder="Sin título"
          rows={1}
          className="field-sizing-content mb-2 w-full resize-none bg-transparent text-4xl font-bold outline-none placeholder:text-muted-foreground/50"
          aria-label="Título"
          data-testid="page-title"
        />
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground print:hidden">
          <span>Juego:</span>
          <EntitySelect
            className="h-7 w-56"
            options={(games.data ?? []).map((g) => ({ value: g.id, label: g.title }))}
            value={page.gameId}
            onChange={(gameId) => void patch({ gameId })}
            allowEmpty
            emptyLabel="Ninguno"
            placeholder="Vincular a un juego"
          />
          {page.gameId && (
            <Link
              to="/trabajo/juegos/$gameId"
              params={{ gameId: page.gameId }}
              className="text-xs underline"
            >
              Ver ficha
            </Link>
          )}
        </div>

        <PageEditor
          key={`${page.id}:${reload}`}
          ref={editorRef}
          page={page}
          onStateChange={setState}
        />

        {children.length > 0 && (
          <section className="mt-10 border-t pt-4 print:hidden">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Subpáginas
            </h2>
            <ul className="grid gap-1 sm:grid-cols-2">
              {children.map((c) => (
                <li key={c.id}>
                  <Link
                    to="/paginas/$pageId"
                    params={{ pageId: c.id }}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    {c.icon ?? '📄'} <span className="truncate">{c.title || 'Sin título'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <Backlinks pageId={page.id} />
      </div>
      <HistorySheet
        page={page}
        open={history}
        onOpenChange={setHistory}
        onRestored={() => void reloadPage()}
      />
    </PagesShell>
  );
}

/** «Mencionada en»: páginas que mencionan una ficha (para las fichas de juego, cliente…). */
export function MentionedIn({ entityType, entityId }: { entityType: string; entityId: string }) {
  const q = useBacklinks(entityType, entityId);
  const navigate = useNavigate();
  if (!q.data?.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Ninguna página menciona este {entityLabel(entityType).toLowerCase()}. Escribe «@» en una
        página para enlazarlo.
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {q.data.map((b) => (
        <li key={b.entityId}>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm hover:bg-accent"
            onClick={() => {
              const r = entityRoute(b.entityType, b.entityId);
              void navigate({ to: r.to as never, search: r.search as never });
            }}
          >
            {b.icon ?? '📄'} {b.title || 'Sin título'}
          </button>
        </li>
      ))}
    </ul>
  );
}
