import { useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { normalizeForSearch } from '@l10n/shared';
import { cn } from '@/lib/utils';

export type { ColumnDef };

/**
 * Tabla común: ordenación por columnas, filtro de texto, clic en fila y fila de totales.
 * La usan todos los listados para que se comporten igual.
 */
export function DataTable<T>({
  data,
  columns,
  filter = '',
  onRowClick,
  empty,
  footer,
  initialSorting = [],
  rowClassName,
  testId,
}: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  filter?: string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  footer?: ReactNode;
  initialSorting?: SortingState;
  rowClassName?: (row: T) => string | undefined;
  testId?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, value: string) => {
      const q = normalizeForSearch(value);
      if (!q) return true;
      const text = row
        .getAllCells()
        .map((c) => {
          const v = c.getValue();
          return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
        })
        .join(' ');
      return normalizeForSearch(text).includes(q);
    },
  });
  const rows = table.getRowModel().rows;

  return (
    <div className="overflow-hidden rounded-lg border bg-card" data-testid={testId}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sortable = h.column.getCanSort();
                  const dir = h.column.getIsSorted();
                  const align = (h.column.columnDef.meta as { align?: string } | undefined)?.align;
                  return (
                    <th
                      key={h.id}
                      className={cn(
                        'h-9 whitespace-nowrap px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground',
                        align === 'right' && 'text-right',
                        sortable && 'cursor-pointer select-none hover:text-foreground',
                      )}
                      onClick={sortable ? h.column.getToggleSortingHandler() : undefined}
                      style={{ width: h.getSize() !== 150 ? h.getSize() : undefined }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {dir === 'asc' && <ArrowUp className="size-3" />}
                        {dir === 'desc' && <ArrowDown className="size-3" />}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  {empty ?? 'No hay elementos.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    'border-b transition-colors last:border-0 hover:bg-muted/40',
                    onRowClick && 'cursor-pointer',
                    rowClassName?.(row.original),
                  )}
                  data-testid="table-row"
                >
                  {row.getVisibleCells().map((cell) => {
                    const align = (cell.column.columnDef.meta as { align?: string } | undefined)
                      ?.align;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'px-3 py-2 align-middle',
                          align === 'right' && 'text-right tabular-nums',
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
          {footer && rows.length > 0 && (
            <tfoot className="border-t bg-muted/30 text-sm font-medium">{footer}</tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
