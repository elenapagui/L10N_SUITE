import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type {
  AnnotationTag,
  CorpusDocument,
  CorpusFilters,
  CorpusProfile,
  CorpusStats,
  CorpusVersion,
  ConcordanceQuery,
  FrequencyRow,
  MorphStatus,
  Segment,
} from '@l10n/shared';
import { api } from '@/lib/api';

export const useCorpusProfiles = () =>
  useQuery({
    queryKey: ['corpus-profiles'],
    queryFn: () => api<CorpusProfile[]>('/corpus/profiles'),
  });

export const useCorpusProfile = (gameId: string) =>
  useQuery({
    queryKey: ['corpus-profile', gameId],
    queryFn: () => api<CorpusProfile>(`/corpus/profiles/${gameId}`),
    enabled: Boolean(gameId),
    retry: false,
  });

export const useCorpusDocuments = (gameId?: string) =>
  useQuery({
    queryKey: ['corpus-documents', gameId ?? 'all'],
    queryFn: () => api<CorpusDocument[]>('/corpus/documents', { query: { gameId } }),
  });

export const useCorpusDocument = (id: string) =>
  useQuery({
    queryKey: ['corpus-document', id],
    queryFn: () => api<CorpusDocument>(`/corpus/documents/${id}`),
    enabled: Boolean(id),
  });

export const useSegments = (documentId: string, offset: number, limit: number, q: string) =>
  useQuery({
    queryKey: ['corpus-segments', documentId, offset, limit, q],
    queryFn: () =>
      api<{ items: Segment[]; total: number }>(`/corpus/documents/${documentId}/segments`, {
        query: { offset, limit, q },
      }),
    placeholderData: (prev) => prev,
  });

export const useAnnotationTags = () =>
  useQuery({
    queryKey: ['corpus-tags'],
    queryFn: () => api<AnnotationTag[]>('/corpus/tags'),
    staleTime: 30_000,
  });

export const filtersParam = (f: CorpusFilters) =>
  Object.keys(f).length ? JSON.stringify(f) : undefined;

export const useCorpusStats = (filters: CorpusFilters) =>
  useQuery({
    queryKey: ['corpus-stats', filters],
    queryFn: () => api<CorpusStats>('/corpus/stats', { query: { filters: filtersParam(filters) } }),
    // Al cambiar los filtros se siguen mostrando los datos anteriores: así no se desmonta la
    // lista de frecuencias (y no pierde el idioma ni la unidad elegidos).
    placeholderData: keepPreviousData,
  });

export const useFrequencies = (
  lang: string,
  filters: CorpusFilters,
  opts: { limit: number; minLength: number; stopwords: boolean; unit?: 'word' | 'lemma' },
) =>
  useQuery({
    queryKey: ['corpus-frequencies', lang, filters, opts],
    placeholderData: keepPreviousData,
    queryFn: () =>
      api<{ rows: FrequencyRow[]; tokens: number; types: number }>('/corpus/frequencies', {
        query: { lang, filters: filtersParam(filters), ...opts },
      }),
  });

export const useCorpusVersions = () =>
  useQuery({
    queryKey: ['corpus-versions'],
    queryFn: () => api<CorpusVersion[]>('/corpus/versions'),
  });

export const useSavedSearches = () =>
  useQuery({
    queryKey: ['corpus-saved-searches'],
    queryFn: () =>
      api<{ id: string; name: string; query: ConcordanceQuery; createdAt: string }[]>(
        '/corpus/saved-searches',
      ),
  });

/** Claves que dependen de los datos del corpus. */
export const CORPUS_KEYS = [
  'corpus-profiles',
  'corpus-profile',
  'corpus-documents',
  'corpus-document',
  'corpus-segments',
  'corpus-tags',
  'corpus-stats',
  'corpus-frequencies',
  'corpus-versions',
  'concordance',
];

/** Estado del análisis morfológico del coreano; se actualiza solo mientras descarga o analiza. */
export const useMorphStatus = () =>
  useQuery({
    queryKey: ['corpus-morph'],
    queryFn: () => api<MorphStatus>('/corpus/morph'),
    refetchInterval: (q) => (q.state.data?.downloading || q.state.data?.analyzing ? 1500 : false),
  });
