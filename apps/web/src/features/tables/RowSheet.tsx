import { Trash2 } from 'lucide-react';
import {
  cellText,
  type CellValue,
  type ComputedRow,
  type RelationLabels,
  type TableColumn,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { FieldEditor, COLUMN_ICONS } from './cells';
import type { useTableActions } from './hooks';

/** Ficha de una fila con todos sus campos (también los ocultos en la vista). */
export function RowSheet({
  row,
  columns,
  labels,
  actions,
  onClose,
}: {
  row: ComputedRow | null;
  columns: TableColumn[];
  labels: RelationLabels;
  actions: ReturnType<typeof useTableActions>;
  onClose: () => void;
}) {
  const first = columns[0];
  const title =
    row && first
      ? cellText(first, row.computed[first.id] as CellValue, labels) || 'Sin título'
      : 'Fila';
  return (
    <Sheet
      open={row !== null}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      headerActions={
        row && (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Eliminar fila"
            onClick={() => {
              void actions.deleteRows([row.id]);
              onClose();
            }}
          >
            <Trash2 />
          </Button>
        )
      }
    >
      {row && (
        <div className="grid gap-4 p-5" data-testid="row-sheet">
          {columns.map((col) => {
            const Icon = COLUMN_ICONS[col.type];
            return (
              <div key={col.id} className="grid gap-1.5">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Icon className="size-3.5" /> {col.name}
                </span>
                <FieldEditor
                  column={col}
                  value={row.values[col.id]}
                  computed={row.computed[col.id]}
                  error={row.errors[col.id]}
                  labels={labels}
                  onChange={async (value, extra) => {
                    if (extra?.newChoices?.length) await actions.addChoices(col, extra.newChoices);
                    await actions.upsert(
                      [{ id: row.id, values: { [col.id]: value } }],
                      extra?.labels,
                    );
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
