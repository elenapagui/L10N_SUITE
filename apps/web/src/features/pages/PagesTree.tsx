import { useMemo, useState, type DragEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Copy,
  CornerLeftUp,
  FilePlus2,
  MoreHorizontal,
  Plus,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Page, PageSummary } from '@l10n/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTrashWithUndo } from '@/hooks/mutations';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { buildTree, type PageNode } from './hooks';

const EXPANDED_KEY = 'l10n-pages-expanded';

function loadExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

type DropZone = 'before' | 'inside' | 'after';

export function usePageActions() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const trash = useTrashWithUndo();
  const refresh = () => qc.invalidateQueries({ queryKey: ['pages'] });
  return {
    create: async (body: Record<string, unknown> = {}) => {
      const p = await api<Page>('/pages', { method: 'POST', body });
      await refresh();
      void navigate({ to: '/paginas/$pageId', params: { pageId: p.id } });
      return p;
    },
    patch: async (id: string, body: Record<string, unknown>) => {
      try {
        await api(`/pages/${id}`, { method: 'PATCH', body });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se ha podido mover la página.');
      }
      await refresh();
      await qc.invalidateQueries({ queryKey: ['page', id] });
    },
    duplicate: async (id: string) => {
      const p = await api<Page>(`/pages/${id}/duplicate`, { method: 'POST' });
      await refresh();
      void navigate({ to: '/paginas/$pageId', params: { pageId: p.id } });
    },
    remove: async (p: PageSummary, activeId?: string) => {
      await trash('page', p.id, p.title || 'Sin título', [['pages']]);
      if (activeId === p.id) void navigate({ to: '/paginas' });
    },
  };
}

function isDescendant(node: PageNode, id: string): boolean {
  return node.children.some((c) => c.id === id || isDescendant(c, id));
}

export function PagesTree({ pages, activeId }: { pages: PageSummary[]; activeId?: string }) {
  const tree = useMemo(() => buildTree(pages), [pages]);
  const byId = useMemo(() => {
    const m = new Map<string, PageNode>();
    const walk = (nodes: PageNode[]) =>
      nodes.forEach((n) => {
        m.set(n.id, n);
        walk(n.children);
      });
    walk(tree);
    return m;
  }, [tree]);
  const [expanded, setExpanded] = useState(loadExpanded);
  const [drag, setDrag] = useState<{ id: string; over?: string; zone?: DropZone } | null>(null);
  const actions = usePageActions();

  // Despliega la rama de la página activa.
  const activePath = useMemo(() => {
    const path = new Set<string>();
    let cur = activeId ? byId.get(activeId) : undefined;
    while (cur?.parentId) {
      path.add(cur.parentId);
      cur = byId.get(cur.parentId);
    }
    return path;
  }, [activeId, byId]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
      } catch {
        /* sin almacenamiento local */
      }
      return next;
    });

  const onDrop = async (target: PageNode, zone: DropZone) => {
    const dragged = drag?.id ? byId.get(drag.id) : null;
    setDrag(null);
    if (!dragged || dragged.id === target.id || isDescendant(dragged, target.id)) return;
    if (zone === 'inside') {
      if (!expanded.has(target.id)) toggle(target.id);
      await actions.patch(dragged.id, { parentId: target.id, index: target.children.length });
      return;
    }
    const siblings = (target.parentId ? byId.get(target.parentId)?.children : tree) ?? [];
    const without = siblings.filter((s) => s.id !== dragged.id);
    const i = without.findIndex((s) => s.id === target.id);
    await actions.patch(dragged.id, {
      parentId: target.parentId,
      index: zone === 'before' ? i : i + 1,
    });
  };

  const zoneOf = (e: DragEvent<HTMLElement>): DropZone => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside';
  };

  const renderNode = (node: PageNode, depth: number) => {
    const open = expanded.has(node.id) || activePath.has(node.id);
    const isOver = drag?.over === node.id;
    return (
      <li key={node.id}>
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', node.id);
            setDrag({ id: node.id });
          }}
          onDragEnd={() => setDrag(null)}
          onDragOver={(e) => {
            if (!drag || drag.id === node.id) return;
            e.preventDefault();
            const zone = zoneOf(e);
            if (drag.over !== node.id || drag.zone !== zone)
              setDrag({ ...drag, over: node.id, zone });
          }}
          onDrop={(e) => {
            e.preventDefault();
            void onDrop(node, zoneOf(e));
          }}
          className={cn(
            'group relative flex h-8 items-center gap-1 rounded-md pr-1 text-sm hover:bg-accent',
            node.id === activeId && 'bg-accent font-medium text-accent-foreground',
            isOver && drag?.zone === 'inside' && 'ring-2 ring-primary/60',
          )}
          style={{ paddingLeft: depth * 14 + 4 }}
          data-testid={`page-node-${node.title}`}
        >
          {isOver && drag?.zone !== 'inside' && (
            <span
              className={cn(
                'pointer-events-none absolute right-1 h-0.5 rounded bg-primary',
                drag?.zone === 'before' ? 'top-0' : 'bottom-0',
              )}
              style={{ left: depth * 14 + 4 }}
            />
          )}
          <button
            type="button"
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background/60',
              !node.hasChildren && 'invisible',
            )}
            onClick={() => toggle(node.id)}
            aria-label={open ? 'Plegar' : 'Desplegar'}
          >
            <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
          </button>
          <Link
            to="/paginas/$pageId"
            params={{ pageId: node.id }}
            className="flex min-w-0 flex-1 items-center gap-1.5 truncate"
            draggable={false}
          >
            <span className="w-4 shrink-0 text-center">{node.icon ?? '📄'}</span>
            <span className="truncate">{node.title || 'Sin título'}</span>
          </Link>
          <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-background/60"
                  aria-label="Más acciones"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onSelect={() => void actions.patch(node.id, { isFavorite: !node.isFavorite })}
                >
                  {node.isFavorite ? <StarOff /> : <Star />}
                  {node.isFavorite ? 'Quitar de favoritas' : 'Añadir a favoritas'}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void actions.duplicate(node.id)}>
                  <Copy /> Duplicar
                </DropdownMenuItem>
                {node.parentId && (
                  <DropdownMenuItem
                    onSelect={() => void actions.patch(node.id, { parentId: null })}
                  >
                    <CornerLeftUp /> Mover a la raíz
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onSelect={() => void actions.remove(node, activeId)}
                >
                  <Trash2 /> Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-background/60"
              aria-label="Nueva subpágina"
              title="Nueva subpágina"
              onClick={() => {
                if (!expanded.has(node.id)) toggle(node.id);
                void actions.create({ parentId: node.id });
              }}
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>
        {open && node.children.length > 0 && (
          <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul>
        )}
      </li>
    );
  };

  const favorites = pages.filter((p) => p.isFavorite);

  return (
    <nav className="grid gap-4 text-sm" aria-label="Páginas">
      {favorites.length > 0 && (
        <div>
          <h3 className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Favoritas
          </h3>
          <ul>
            {favorites.map((p) => (
              <li key={p.id}>
                <Link
                  to="/paginas/$pageId"
                  params={{ pageId: p.id }}
                  className={cn(
                    'flex h-8 items-center gap-1.5 truncate rounded-md px-2 hover:bg-accent',
                    p.id === activeId && 'bg-accent font-medium',
                  )}
                >
                  <span className="w-4 text-center">{p.icon ?? '📄'}</span>
                  <span className="truncate">{p.title || 'Sin título'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <div className="mb-1 flex items-center px-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Páginas
          </h3>
          <button
            type="button"
            className="ml-auto flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent"
            aria-label="Nueva página"
            title="Nueva página"
            onClick={() => void actions.create({})}
            data-testid="tree-new-page"
          >
            <FilePlus2 className="size-4" />
          </button>
        </div>
        {tree.length === 0 ? (
          <p className="px-2 py-2 text-muted-foreground">Aún no hay páginas.</p>
        ) : (
          <ul
            onDragOver={(e) => {
              if (drag) e.preventDefault();
            }}
          >
            {tree.map((n) => renderNode(n, 0))}
          </ul>
        )}
      </div>
    </nav>
  );
}
