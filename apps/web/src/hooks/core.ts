import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppInfo, Settings, SettingsSection, Tag } from '@l10n/shared';
import { api } from '@/lib/api';

export const queryKeys = {
  appInfo: ['app-info'] as const,
  settings: ['settings'] as const,
  tags: ['tags'] as const,
  taggings: (entityType: string, entityId: string) => ['taggings', entityType, entityId] as const,
  attachments: (entityType?: string, entityId?: string) =>
    ['attachments', entityType ?? '', entityId ?? ''] as const,
  backups: ['backups'] as const,
  trash: ['trash'] as const,
  activity: ['activity'] as const,
};

export function useAppInfo() {
  return useQuery({
    queryKey: queryKeys.appInfo,
    queryFn: () => api<AppInfo>('/app-info'),
    staleTime: 60_000,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => api<Settings>('/settings'),
    staleTime: 60_000,
  });
}

export function useUpdateSettings<S extends SettingsSection>(section: S) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings[S]>) =>
      api<Settings[S]>(`/settings/${section}`, { method: 'PUT', body: patch }),
    onSuccess: (value) => {
      qc.setQueryData<Settings>(queryKeys.settings, (old) =>
        old ? { ...old, [section]: value } : old,
      );
    },
  });
}

export function useTags() {
  return useQuery({ queryKey: queryKeys.tags, queryFn: () => api<Tag[]>('/tags') });
}
