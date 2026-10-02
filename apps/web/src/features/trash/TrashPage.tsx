import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { entityLabel, formatDateTimeES, formatDateES, type TrashItem } from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm';
import { Spinner } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState, Page, PageHeader } from '@/components/layout/PageHeader';
import { api } from '@/lib/api';

export function TrashPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const trash = useQuery({ queryKey: ['trash'], queryFn: () => api<TrashItem[]>('/trash') });

  const refresh = () => {
    // Una ficha restaurada puede aparecer en cualquier listado.
    void qc.invalidateQueries();
  };

  const restore = useMutation({
    mutationFn: (item: TrashItem) =>
      api('/trash/restore', {
        method: 'POST',
        body: { entityType: item.entityType, entityId: item.entityId },
      }),
    onSuccess: (_d, item) => {
      toast.success(`«${item.title}» restaurado`);
      refresh();
    },
  });
  const purge = useMutation({
    mutationFn: (item: TrashItem) =>
      api('/trash/purge', {
        method: 'POST',
        body: { entityType: item.entityType, entityId: item.entityId },
      }),
    onSuccess: refresh,
  });
  const empty = useMutation({
    mutationFn: () => api<{ purged: number }>('/trash/empty', { method: 'POST' }),
    onSuccess: (r) => {
      toast.success(`Papelera vaciada (${r.purged} elementos)`);
      refresh();
    },
  });

  const items = trash.data ?? [];

  return (
    <Page>
      <PageHeader
        title="Papelera"
        icon={<Trash2 />}
        description="Lo que borras se guarda aquí 30 días antes de eliminarse definitivamente."
        actions={
          items.length > 0 && (
            <Button
              variant="outline"
              onClick={async () => {
                if (
                  await confirm({
                    title: '¿Vaciar la papelera?',
                    description: `Se eliminarán definitivamente ${items.length} elementos. No se puede deshacer (salvo restaurando una copia de seguridad).`,
                    confirmLabel: 'Vaciar',
                    destructive: true,
                  })
                )
                  empty.mutate();
              }}
            >
              Vaciar papelera
            </Button>
          )
        }
      />
      {trash.isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon={<Trash2 />} title="La papelera está vacía" />
      ) : (
        <div className="rounded-md border">
          <Table>
            <THead>
              <TR>
                <TH>Elemento</TH>
                <TH>Tipo</TH>
                <TH>Eliminado</TH>
                <TH>Se borrará el</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {items.map((item) => (
                <TR key={`${item.entityType}:${item.entityId}`} data-testid="trash-row">
                  <TD className="font-medium">{item.title}</TD>
                  <TD>
                    <Badge variant="secondary">{entityLabel(item.entityType)}</Badge>
                  </TD>
                  <TD className="text-muted-foreground">{formatDateTimeES(item.deletedAt)}</TD>
                  <TD className="text-muted-foreground">{formatDateES(item.purgeAt)}</TD>
                  <TD className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => restore.mutate(item)}>
                      <RotateCcw />
                      Restaurar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: '¿Eliminar definitivamente?',
                            description: `«${item.title}» se borrará para siempre.`,
                            confirmLabel: 'Eliminar',
                            destructive: true,
                          })
                        )
                          purge.mutate(item);
                      }}
                    >
                      Eliminar
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Page>
  );
}
