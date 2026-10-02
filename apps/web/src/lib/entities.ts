import { ENTITY_TYPES, type EntityType } from '@l10n/shared';
import { api, apiUrl } from './api';
import { desktop } from './desktop';
import type { Attachment } from '@l10n/shared';

/** Ruta de la interfaz para abrir una ficha. Los módulos añaden aquí sus fichas de detalle. */
export function entityRoute(
  type: string,
  id: string,
): { to: string; search?: Record<string, string> } {
  switch (type) {
    case 'tag':
      return { to: '/ajustes', search: { tab: 'etiquetas' } };
    case 'attachment':
      return { to: '/ajustes', search: { tab: 'acerca' } };
    case 'task':
      return { to: '/trabajo/tareas', search: { tarea: id } };
    case 'client_query':
      return { to: '/trabajo/consultas' };
    case 'time_entry':
      return { to: '/trabajo/tiempo' };
    case 'invoice':
      return { to: '/finanzas/facturas', search: { factura: id } };
    case 'expense':
      return { to: '/finanzas/gastos' };
    case 'contact':
    case 'rate':
      return { to: '/trabajo/clientes' };
    default: {
      const def = (ENTITY_TYPES as Record<string, { route: string }>)[type as EntityType];
      return { to: def ? `${def.route}/${id}` : '/' };
    }
  }
}

/** Abre un adjunto con la aplicación predeterminada (escritorio) o en una pestaña nueva (web). */
export async function openAttachment(id: string): Promise<void> {
  if (desktop) {
    const attachment = await api<Attachment>(`/attachments/${id}`);
    const error = await desktop.openPath(attachment.absolutePath);
    if (error) throw new Error(error);
    return;
  }
  window.open(apiUrl(`/attachments/${id}/content`), '_blank', 'noopener');
}
