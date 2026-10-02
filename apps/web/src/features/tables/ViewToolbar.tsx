import { ArrowUpDown, Columns3, Download, Filter, Group, Plus, Search, X } from 'lucide-react';
import {
  operatorsFor,
  type FilterOperator,
  type TableColumn,
  type TableView,
  type ViewFilter,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/misc';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { apiUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { useTableActions } from './hooks';

const NO_VALUE_OPS: FilterOperator[] = ['empty', 'not_empty', 'checked', 'unchecked'];

function FilterValue({
  column,
  filter,
  onChange,
}: {
  column: TableColumn;
  filter: ViewFilter;
  onChange: (v: unknown) => void;
}) {
  if (NO_VALUE_OPS.includes(filter.op)) return null;
  if (column.type === 'select' || column.type === 'multi_select') {
    return (
      <NativeSelect
        className="h-8"
        value={String(filter.value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {(column.options.choices ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </NativeSelect>
    );
  }
  return (
    <Input
      className="h-8"
      type={column.type === 'date' ? 'date' : 'text'}
      value={String(filter.value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Valor"
    />
  );
}

export function ViewToolbar({
  tableId,
  view,
  columns,
  allColumns,
  search,
  onSearch,
  actions,
  extra,
}: {
  tableId: string;
  view: TableView;
  columns: TableColumn[];
  allColumns: TableColumn[];
  search: string;
  onSearch: (s: string) => void;
  actions: ReturnType<typeof useTableActions>;
  extra?: React.ReactNode;
}) {
  const cfg = view.config;
  const byId = new Map(allColumns.map((c) => [c.id, c]));
  const setConfig = (patch: Partial<typeof cfg>) => void actions.patchView(view, { config: patch });
  const groupable = allColumns.filter(
    (c) =>
      ['select', 'checkbox', 'text', 'date', 'relation', 'multi_select'].includes(c.type) &&
      c.type !== 'multi_select',
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2 size-4 text-muted-foreground" />
        <Input
          className="h-8 w-52 pl-8"
          placeholder="Buscar en la tabla…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          data-testid="table-search"
        />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className={cn(cfg.filters.length && 'text-primary')}>
            <Filter /> Filtrar{cfg.filters.length ? ` (${cfg.filters.length})` : ''}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[34rem]">
          <div className="grid gap-2">
            {cfg.filters.length > 1 && (
              <div className="flex items-center gap-2 text-sm">
                Cumplir
                <NativeSelect
                  className="h-8 w-auto"
                  value={cfg.filterMode}
                  onChange={(e) => setConfig({ filterMode: e.target.value as 'and' | 'or' })}
                >
                  <option value="and">todas las condiciones</option>
                  <option value="or">alguna condición</option>
                </NativeSelect>
              </div>
            )}
            {cfg.filters.map((f, i) => {
              const col = byId.get(f.columnId);
              if (!col) return null;
              const update = (patch: Partial<ViewFilter>) =>
                setConfig({
                  filters: cfg.filters.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                });
              return (
                <div key={i} className="grid grid-cols-[1fr_9rem_1fr_auto] items-center gap-1.5">
                  <NativeSelect
                    className="h-8"
                    value={f.columnId}
                    onChange={(e) => {
                      const nc = byId.get(e.target.value)!;
                      update({
                        columnId: nc.id,
                        op: operatorsFor(nc.type)[0]!.value,
                        value: undefined,
                      });
                    }}
                  >
                    {allColumns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    className="h-8"
                    value={f.op}
                    onChange={(e) => update({ op: e.target.value as FilterOperator })}
                  >
                    {operatorsFor(col.type).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                  <FilterValue column={col} filter={f} onChange={(value) => update({ value })} />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={() => setConfig({ filters: cfg.filters.filter((_, j) => j !== i) })}
                    aria-label="Quitar filtro"
                  >
                    <X />
                  </Button>
                </div>
              );
            })}
            <div>
              <Button
                size="sm"
                variant="outline"
                disabled={!allColumns.length}
                onClick={() => {
                  const c = allColumns[0]!;
                  setConfig({
                    filters: [
                      ...cfg.filters,
                      { columnId: c.id, op: operatorsFor(c.type)[0]!.value },
                    ],
                  });
                }}
              >
                <Plus /> Añadir filtro
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className={cn(cfg.sorts.length && 'text-primary')}>
            <ArrowUpDown /> Ordenar{cfg.sorts.length ? ` (${cfg.sorts.length})` : ''}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96">
          <div className="grid gap-2">
            {cfg.sorts.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_9rem_auto] gap-1.5">
                <NativeSelect
                  className="h-8"
                  value={s.columnId}
                  onChange={(e) =>
                    setConfig({
                      sorts: cfg.sorts.map((x, j) =>
                        j === i ? { ...x, columnId: e.target.value } : x,
                      ),
                    })
                  }
                >
                  {allColumns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  className="h-8"
                  value={s.dir}
                  onChange={(e) =>
                    setConfig({
                      sorts: cfg.sorts.map((x, j) =>
                        j === i ? { ...x, dir: e.target.value as 'asc' | 'desc' } : x,
                      ),
                    })
                  }
                >
                  <option value="asc">Ascendente</option>
                  <option value="desc">Descendente</option>
                </NativeSelect>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => setConfig({ sorts: cfg.sorts.filter((_, j) => j !== i) })}
                  aria-label="Quitar orden"
                >
                  <X />
                </Button>
              </div>
            ))}
            <div>
              <Button
                size="sm"
                variant="outline"
                disabled={cfg.sorts.length >= 5 || !allColumns.length}
                onClick={() =>
                  setConfig({ sorts: [...cfg.sorts, { columnId: allColumns[0]!.id, dir: 'asc' }] })
                }
              >
                <Plus /> Añadir orden
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {view.type === 'grid' && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={cn(cfg.groupBy && 'text-primary')}>
              <Group /> Agrupar
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <NativeSelect
              value={cfg.groupBy ?? ''}
              onChange={(e) => setConfig({ groupBy: e.target.value || null })}
              aria-label="Agrupar por"
            >
              <option value="">Sin agrupar</option>
              {groupable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </PopoverContent>
        </Popover>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className={cn(cfg.hidden.length && 'text-primary')}>
            <Columns3 /> Columnas{cfg.hidden.length ? ` (${cfg.hidden.length} ocultas)` : ''}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <ul className="grid gap-1">
            {allColumns.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!cfg.hidden.includes(c.id)}
                    onCheckedChange={(on) =>
                      setConfig({
                        hidden: on ? cfg.hidden.filter((x) => x !== c.id) : [...cfg.hidden, c.id],
                      })
                    }
                  />
                  {c.name}
                </label>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>

      <div className="ml-auto flex items-center gap-1.5">
        {extra}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm">
              <Download /> Exportar
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60" align="end">
            <p className="mb-2 text-xs text-muted-foreground">
              Con los filtros y el orden de esta vista ({columns.length} columnas).
            </p>
            <div className="grid gap-1">
              <a
                className="rounded px-2 py-1.5 text-sm hover:bg-accent"
                href={apiUrl(`/tables/${tableId}/export`, { format: 'xlsx', viewId: view.id })}
              >
                Excel (.xlsx)
              </a>
              <a
                className="rounded px-2 py-1.5 text-sm hover:bg-accent"
                href={apiUrl(`/tables/${tableId}/export`, { format: 'csv', viewId: view.id })}
              >
                CSV
              </a>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
