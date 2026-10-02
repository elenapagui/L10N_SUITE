import { useQuery } from '@tanstack/react-query';
import type { Backlink, Page, PageRevision, PageSummary } from '@l10n/shared';
import { api } from '@/lib/api';

export const usePages = () =>
  useQuery({ queryKey: ['pages'], queryFn: () => api<PageSummary[]>('/pages') });

export const usePage = (id: string) =>
  useQuery({
    queryKey: ['page', id],
    queryFn: () => api<Page>(`/pages/${id}`),
    enabled: Boolean(id),
    // El editor es la fuente de verdad mientras está abierto.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

export const usePageTemplates = () =>
  useQuery({
    queryKey: ['page-templates'],
    queryFn: () =>
      api<{ key: string; label: string; icon: string; description: string }[]>('/page-templates'),
    staleTime: Infinity,
  });

export const useRevisions = (pageId: string, enabled: boolean) =>
  useQuery({
    queryKey: ['page-revisions', pageId],
    queryFn: () => api<PageRevision[]>(`/pages/${pageId}/revisions`),
    enabled,
  });

export const useBacklinks = (entityType: string, entityId: string) =>
  useQuery({
    queryKey: ['backlinks', entityType, entityId],
    queryFn: () => api<Backlink[]>('/backlinks', { query: { entityType, entityId } }),
    enabled: Boolean(entityId),
  });

/** Árbol a partir de la lista plana. */
export interface PageNode extends PageSummary {
  children: PageNode[];
}

export function buildTree(pages: PageSummary[]): PageNode[] {
  const byId = new Map<string, PageNode>();
  for (const p of pages) byId.set(p.id, { ...p, children: [] });
  const roots: PageNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (nodes: PageNode[]) => {
    nodes.sort((a, b) => a.position - b.position);
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}
