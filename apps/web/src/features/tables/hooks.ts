import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  CellValue,
  ColumnChoice,
  CustomTable,
  CustomTableDetail,
  RelationLabels,
  TableColumn,
  TableRow,
  TableView,
  ViewConfig,
} from '@l10n/shared';
import { api } from '@/lib/api';

export const useTables = (gameId?: string) =>
  useQuery({
    queryKey: ['tables', gameId ?? 'all'],
    queryFn: () => api<CustomTable[]>('/tables', { query: { gameId } }),
  });

export const useTable = (id: string) =>
  useQuery({
    queryKey: ['table', id],
    queryFn: () => api<CustomTableDetail>(`/tables/${id}`),
    enabled: Boolean(id),
  });

export interface RowsData {
  rows: TableRow[];
  labels: RelationLabels;
}

export const useTableRows = (id: string) =>
  useQuery({
    queryKey: ['table-rows', id],
    queryFn: () => api<RowsData>(`/tables/${id}/rows`),
    enabled: Boolean(id),
    staleTime: 30_000,
  });

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'No se ha podido guardar.');

/** Operaciones sobre una tabla con actualización optimista de la caché. */
export function useTableActions(tableId: string) {
  const qc = useQueryClient();
  const rowsKey = ['table-rows', tableId];
  const tableKey = ['table', tableId];

  const refreshAll = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: tableKey });
    await qc.invalidateQueries({ queryKey: rowsKey });
    await qc.invalidateQueries({ queryKey: ['tables'] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, tableId]);

  /** Crea o actualiza filas. Las actualizaciones se ven al momento; si fallan, se deshacen. */
  const upsert = useCallback(
    async (
      changes: { id?: string; values: Record<string, CellValue>; afterId?: string }[],
      newLabels?: RelationLabels,
    ): Promise<TableRow[]> => {
      if (!changes.length) return [];
      const prev = qc.getQueryData<RowsData>(rowsKey);
      if (prev && newLabels) {
        qc.setQueryData<RowsData>(rowsKey, { ...prev, labels: { ...prev.labels, ...newLabels } });
      }
      if (prev) {
        const byId = new Map(changes.filter((c) => c.id).map((c) => [c.id!, c.values]));
        qc.setQueryData<RowsData>(rowsKey, {
          ...prev,
          labels: { ...prev.labels, ...newLabels },
          rows: prev.rows.map((r) => {
            const v = byId.get(r.id);
            if (!v) return r;
            const values = { ...r.values };
            for (const [k, val] of Object.entries(v)) {
              if (
                val === null ||
                val === '' ||
                val === false ||
                (Array.isArray(val) && !val.length)
              )
                delete values[k];
              else values[k] = val;
            }
            return { ...r, values };
          }),
        });
      }
      try {
        const saved = await api<TableRow[]>(`/tables/${tableId}/rows`, {
          method: 'POST',
          body: { rows: changes },
        });
        const current = qc.getQueryData<RowsData>(rowsKey);
        if (current) {
          const savedById = new Map(saved.map((r) => [r.id, r]));
          const existing = new Set(current.rows.map((r) => r.id));
          const rows = current.rows.map((r) => savedById.get(r.id) ?? r);
          for (const r of saved) if (!existing.has(r.id)) rows.push(r);
          rows.sort((a, b) => a.position - b.position);
          qc.setQueryData<RowsData>(rowsKey, { ...current, rows });
        }
        if (changes.some((c) => Object.keys(c.values).length && !c.id))
          void qc.invalidateQueries({ queryKey: ['tables'] });
        return saved;
      } catch (error) {
        if (prev) qc.setQueryData(rowsKey, prev);
        toast.error(errorMessage(error));
        throw error;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, tableId],
  );

  const deleteRows = useCallback(
    async (ids: string[]) => {
      const prev = qc.getQueryData<RowsData>(rowsKey);
      if (prev)
        qc.setQueryData<RowsData>(rowsKey, {
          ...prev,
          rows: prev.rows.filter((r) => !ids.includes(r.id)),
        });
      try {
        await api(`/tables/${tableId}/rows/delete`, { method: 'POST', body: { ids } });
        void qc.invalidateQueries({ queryKey: ['tables'] });
        toast(`${ids.length === 1 ? 'Fila eliminada' : `${ids.length} filas eliminadas`}`, {
          action: {
            label: 'Deshacer',
            onClick: () =>
              void api(`/tables/${tableId}/rows/restore`, { method: 'POST', body: { ids } }).then(
                () => qc.invalidateQueries({ queryKey: rowsKey }),
              ),
          },
        });
      } catch (error) {
        if (prev) qc.setQueryData(rowsKey, prev);
        toast.error(errorMessage(error));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, tableId],
  );

  const patchColumn = useCallback(
    async (
      id: string,
      body: Partial<Pick<TableColumn, 'name' | 'type' | 'options' | 'width' | 'position'>>,
    ) => {
      const prev = qc.getQueryData<CustomTableDetail>(tableKey);
      if (prev && body.type === undefined) {
        qc.setQueryData<CustomTableDetail>(tableKey, {
          ...prev,
          columns: prev.columns.map((c) => (c.id === id ? { ...c, ...body } : c)),
        });
      }
      try {
        await api(`/table-columns/${id}`, { method: 'PATCH', body });
        await qc.invalidateQueries({ queryKey: tableKey });
        if (body.type !== undefined || body.options?.choices)
          await qc.invalidateQueries({ queryKey: rowsKey });
      } catch (error) {
        if (prev) qc.setQueryData(tableKey, prev);
        toast.error(errorMessage(error));
        throw error;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, tableId],
  );

  /** Añade opciones nuevas a una columna de selección (al escribir o pegar valores nuevos). */
  const addChoices = useCallback(
    async (column: TableColumn, choices: ColumnChoice[]) => {
      if (!choices.length) return;
      await patchColumn(column.id, {
        options: { ...column.options, choices: [...(column.options.choices ?? []), ...choices] },
      });
    },
    [patchColumn],
  );

  const createColumn = useCallback(
    async (body: { name: string; type: string; options?: object }) => {
      try {
        const col = await api<TableColumn>(`/tables/${tableId}/columns`, { method: 'POST', body });
        await qc.invalidateQueries({ queryKey: tableKey });
        return col;
      } catch (error) {
        toast.error(errorMessage(error));
        throw error;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, tableId],
  );

  const deleteColumn = useCallback(
    async (id: string) => {
      try {
        await api(`/table-columns/${id}`, { method: 'DELETE' });
        await refreshAll();
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },
    [refreshAll],
  );

  const patchView = useCallback(
    async (
      view: TableView,
      body: { name?: string; type?: string; config?: Partial<ViewConfig> },
    ) => {
      const prev = qc.getQueryData<CustomTableDetail>(tableKey);
      const config = body.config ? { ...view.config, ...body.config } : undefined;
      if (prev) {
        qc.setQueryData<CustomTableDetail>(tableKey, {
          ...prev,
          views: prev.views.map((v) =>
            v.id === view.id
              ? {
                  ...v,
                  ...(body.name ? { name: body.name } : {}),
                  ...(body.type ? { type: body.type as TableView['type'] } : {}),
                  ...(config ? { config } : {}),
                }
              : v,
          ),
        });
      }
      try {
        await api(`/table-views/${view.id}`, {
          method: 'PATCH',
          body: { ...body, ...(config ? { config } : {}) },
        });
      } catch (error) {
        if (prev) qc.setQueryData(tableKey, prev);
        toast.error(errorMessage(error));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, tableId],
  );

  return {
    upsert,
    deleteRows,
    patchColumn,
    addChoices,
    createColumn,
    deleteColumn,
    patchView,
    refreshAll,
  };
}
