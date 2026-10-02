import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';

/**
 * Envía una ficha a la papelera y muestra un aviso con «Deshacer».
 * `invalidate` son las claves de consulta que hay que refrescar.
 */
export function useTrashWithUndo() {
  const qc = useQueryClient();
  return async (
    entityType: string,
    entityId: string,
    label: string,
    invalidate: readonly unknown[][] = [],
  ) => {
    await api('/trash/move', { method: 'POST', body: { entityType, entityId } });
    const refresh = () => {
      for (const key of invalidate) void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ['trash'] });
      void qc.invalidateQueries({ queryKey: ['search'] });
    };
    refresh();
    toast(`«${label}» se ha enviado a la papelera`, {
      action: {
        label: 'Deshacer',
        onClick: () => {
          void api('/trash/restore', { method: 'POST', body: { entityType, entityId } }).then(
            refresh,
          );
        },
      },
    });
  };
}
