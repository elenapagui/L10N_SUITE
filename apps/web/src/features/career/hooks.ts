import { useQuery } from '@tanstack/react-query';
import type { ApplicationEvent, JobApplication } from '@l10n/shared';
import { api } from '@/lib/api';

export const useApplications = () =>
  useQuery({
    queryKey: ['job-applications'],
    queryFn: () => api<JobApplication[]>('/job-applications'),
  });

export const useApplication = (id: string) =>
  useQuery({
    queryKey: ['job-application', id],
    queryFn: () => api<JobApplication>(`/job-applications/${id}`),
    enabled: Boolean(id),
  });

export const useApplicationEvents = (id: string) =>
  useQuery({
    queryKey: ['job-application-events', id],
    queryFn: () => api<ApplicationEvent[]>(`/job-applications/${id}/events`),
    enabled: Boolean(id),
  });

/** Claves que hay que refrescar tras cambiar una candidatura o su historial. */
export const applicationKeys = (id: string) => [
  ['job-applications'],
  ['job-application', id],
  ['job-application-events', id],
  ['calendar'],
  ['reminders'],
];
