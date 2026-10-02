import { useQuery } from '@tanstack/react-query';
import type {
  Journal,
  Publication,
  Reference,
  ReferenceCollection,
  ReferenceQuote,
  Submission,
} from '@l10n/shared';
import { api } from '@/lib/api';

export const usePublications = () =>
  useQuery({ queryKey: ['publications'], queryFn: () => api<Publication[]>('/publications') });

export const usePublication = (id: string) =>
  useQuery({
    queryKey: ['publication', id],
    queryFn: () => api<Publication>(`/publications/${id}`),
    enabled: Boolean(id),
  });

export const useSubmissions = (publicationId: string) =>
  useQuery({
    queryKey: ['submissions', publicationId],
    queryFn: () => api<Submission[]>('/submissions', { query: { publicationId } }),
    enabled: Boolean(publicationId),
  });

export const useJournals = () =>
  useQuery({ queryKey: ['journals'], queryFn: () => api<Journal[]>('/journals') });

export interface ReferenceFilters {
  q?: string;
  collectionId?: string;
  readStatus?: string;
  gameId?: string;
  publicationId?: string;
}

export const useReferences = (filters: ReferenceFilters) =>
  useQuery({
    queryKey: ['references', filters],
    queryFn: () => api<Reference[]>('/references', { query: { ...filters } }),
    placeholderData: (prev) => prev,
  });

export const useReference = (id: string | null) =>
  useQuery({
    queryKey: ['reference', id],
    queryFn: () => api<Reference>(`/references/${id}`),
    enabled: Boolean(id),
  });

export const useCollections = () =>
  useQuery({
    queryKey: ['reference-collections'],
    queryFn: () => api<ReferenceCollection[]>('/reference-collections'),
  });

export const useQuotes = (referenceId: string) =>
  useQuery({
    queryKey: ['quotes', referenceId],
    queryFn: () => api<ReferenceQuote[]>(`/references/${referenceId}/quotes`),
    enabled: Boolean(referenceId),
  });

/** Copia como texto con formato (cursivas) y como texto plano. */
export async function copyRich(html: string, text: string): Promise<void> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return;
    }
  } catch {
    /* sin portapapeles con formato: se copia el texto */
  }
  await navigator.clipboard.writeText(text);
}
