import { toast } from 'sonner';
import { useApiMutation } from '@/hooks/work';
import { api } from '@/lib/api';

/** Arrancar y parar el cronómetro (solo hay uno en marcha). */
export function useTimerControls() {
  const startM = useApiMutation((body: Record<string, string | null | undefined>) =>
    api('/timer/start', { method: 'POST', body }),
  );
  const stopM = useApiMutation(() => api('/timer/stop', { method: 'POST' }));
  return {
    start: (
      links: { taskId?: string | null; jobId?: string | null; projectId?: string | null },
      label?: string,
    ) =>
      startM.mutate(links, {
        onSuccess: () =>
          toast.success(label ? `Cronómetro en marcha: ${label}` : 'Cronómetro en marcha'),
      }),
    stop: () => stopM.mutate(undefined, { onSuccess: () => toast.success('Tiempo registrado') }),
    pending: startM.isPending || stopM.isPending,
  };
}
