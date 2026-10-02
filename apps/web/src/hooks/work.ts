import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type {
  Area,
  CalendarEvent,
  ChecklistItem,
  Client,
  ClientQuery,
  Comment,
  Contact,
  Dashboard,
  Game,
  Job,
  Project,
  Rate,
  Task,
  TaskList,
  TaskStatus,
  Template,
  TimeEntry,
} from '@l10n/shared';
import { api } from '@/lib/api';

type Query = Record<string, string | number | boolean | null | undefined>;

/** Claves que dependen de los datos de trabajo: se refrescan tras cualquier cambio. */
const WORK_KEYS = [
  'clients',
  'client',
  'games',
  'game',
  'projects',
  'project',
  'jobs',
  'job',
  'tasks',
  'task',
  'dashboard',
  'calendar',
  'time',
  'timer',
  'queries',
  'search',
  'activity',
  'trash',
  'rates',
  'billing-pending',
  'invoices',
  'invoice',
  'expenses',
  'finance-overview',
  'finance-quarter',
  'pages',
  'backlinks',
  'tables',
  'glossary',
  'characters',
  'corpus-profiles',
  'corpus-profile',
  'corpus-documents',
  'corpus-document',
  'corpus-segments',
  'corpus-tags',
  'corpus-stats',
  'corpus-frequencies',
  'corpus-versions',
];

export function useInvalidateWork() {
  const qc = useQueryClient();
  return () => Promise.all(WORK_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

/** Mutación genérica contra la API que refresca los datos de trabajo al terminar. */
export function useApiMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  options: { onSuccess?: (result: TResult, vars: TVars) => void; extraKeys?: QueryKey[] } = {},
) {
  const invalidate = useInvalidateWork();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result, vars) => {
      await invalidate();
      for (const k of options.extraKeys ?? []) await qc.invalidateQueries({ queryKey: k });
      options.onSuccess?.(result, vars);
    },
  });
}

export const useClients = () =>
  useQuery({ queryKey: ['clients'], queryFn: () => api<Client[]>('/clients') });
export const useClient = (id: string) =>
  useQuery({
    queryKey: ['client', id],
    queryFn: () => api<{ client: Client; contacts: Contact[]; rates: Rate[] }>(`/clients/${id}`),
    enabled: Boolean(id),
  });
export const useRates = (clientId?: string) =>
  useQuery({
    queryKey: ['rates', clientId ?? 'all'],
    queryFn: () => api<Rate[]>('/rates', { query: { clientId } }),
  });

export const useGames = () =>
  useQuery({ queryKey: ['games'], queryFn: () => api<Game[]>('/games') });
export const useGame = (id: string) =>
  useQuery({
    queryKey: ['game', id],
    queryFn: () => api<Game>(`/games/${id}`),
    enabled: Boolean(id),
  });

export const useProjects = (query: Query = {}) =>
  useQuery({
    queryKey: ['projects', query],
    queryFn: () => api<Project[]>('/projects', { query }),
  });
export const useProject = (id: string) =>
  useQuery({
    queryKey: ['project', id],
    queryFn: () => api<Project>(`/projects/${id}`),
    enabled: Boolean(id),
  });

export const useJobs = (query: Query = {}) =>
  useQuery({ queryKey: ['jobs', query], queryFn: () => api<Job[]>('/jobs', { query }) });
export const useJob = (id: string) =>
  useQuery({ queryKey: ['job', id], queryFn: () => api<Job>(`/jobs/${id}`), enabled: Boolean(id) });

export const useTasks = (query: Query = {}, enabled = true) =>
  useQuery({
    queryKey: ['tasks', query],
    queryFn: () => api<Task[]>('/tasks', { query }),
    enabled,
  });
export const useTask = (id: string | null) =>
  useQuery({
    queryKey: ['task', id],
    queryFn: () => api<Task>(`/tasks/${id}`),
    enabled: Boolean(id),
  });

export const useStatuses = () =>
  useQuery({
    queryKey: ['task-statuses'],
    queryFn: () => api<TaskStatus[]>('/task-statuses'),
    staleTime: 60_000,
  });
export const useAreas = () =>
  useQuery({ queryKey: ['areas'], queryFn: () => api<Area[]>('/areas'), staleTime: 60_000 });
export const useTaskLists = () =>
  useQuery({
    queryKey: ['task-lists'],
    queryFn: () => api<TaskList[]>('/task-lists'),
    staleTime: 60_000,
  });
export const useTemplates = (kind?: 'project' | 'job') =>
  useQuery({
    queryKey: ['templates', kind ?? 'all'],
    queryFn: () => api<Template[]>('/templates', { query: { kind } }),
  });

export const useChecklist = (entityType: string, entityId: string) =>
  useQuery({
    queryKey: ['checklist', entityType, entityId],
    queryFn: () => api<ChecklistItem[]>('/checklist', { query: { entityType, entityId } }),
  });
export const useComments = (entityType: string, entityId: string) =>
  useQuery({
    queryKey: ['comments', entityType, entityId],
    queryFn: () => api<Comment[]>('/comments', { query: { entityType, entityId } }),
  });

export const useTimeEntries = (query: Query = {}) =>
  useQuery({
    queryKey: ['time', query],
    queryFn: () => api<TimeEntry[]>('/time-entries', { query }),
  });
export const useTimer = () =>
  useQuery({
    queryKey: ['timer'],
    queryFn: () => api<{ running: TimeEntry | null }>('/timer'),
    refetchInterval: 60_000,
  });

export const useQueries = (query: Query = {}) =>
  useQuery({
    queryKey: ['queries', query],
    queryFn: () => api<ClientQuery[]>('/client-queries', { query }),
  });

export const useDashboard = () =>
  useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('/dashboard'),
    refetchInterval: 5 * 60_000,
  });

export const useCalendar = (from: string, to: string) =>
  useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () => api<CalendarEvent[]>('/calendar', { query: { from, to } }),
  });
