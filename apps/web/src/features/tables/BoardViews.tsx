import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  addDaysISO,
  cellText,
  todayISO,
  type CellValue,
  type ComputedRow,
  type RelationLabels,
  type TableColumn,
  type TableView,
} from '@l10n/shared';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { CellDisplay } from './cells';
import type { useTableActions } from './hooks';

function rowTitle(columns: TableColumn[], row: ComputedRow, labels: RelationLabels): string {
  const first = columns[0];
  return (first && cellText(first, row.computed[first.id] as CellValue, labels)) || 'Sin título';
}

function RowCard({
  row,
  columns,
  labels,
  skip,
  onOpen,
  dragging,
}: {
  row: ComputedRow;
  columns: TableColumn[];
  labels: RelationLabels;
  skip: string[];
  onOpen?: () => void;
  dragging?: boolean;
}) {
  const fields = columns
    .slice(1)
    .filter((c) => !skip.includes(c.id))
    .filter((c) => {
      const v = row.computed[c.id];
      return v != null && v !== '' && v !== false && !(Array.isArray(v) && !v.length);
    })
    .slice(0, 3);
  return (
    <div
      className={cn(
        'grid gap-1.5 rounded-md border bg-card p-2.5 text-sm shadow-xs',
        onOpen && 'cursor-pointer hover:border-primary/40',
        dragging && 'rotate-1 shadow-lg ring-2 ring-primary/40',
      )}
      onClick={onOpen}
      data-testid="board-card"
    >
      <div className="font-medium leading-snug">{rowTitle(columns, row, labels)}</div>
      {fields.map((c) => (
        <div key={c.id} className="flex min-w-0 items-center gap-2 text-xs">
          <span className="shrink-0 text-muted-foreground">{c.name}</span>
          <span className="flex min-w-0 flex-1 justify-end">
            <CellDisplay
              column={c}
              value={row.computed[c.id]}
              error={row.errors[c.id]}
              labels={labels}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

function DraggableCard(props: Parameters<typeof RowCard>[0] & { id: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn(isDragging && 'opacity-30')}>
      <RowCard {...props} />
    </div>
  );
}

function Column({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(className, isOver && 'bg-primary/5 ring-2 ring-primary/30')}
    >
      {children}
    </div>
  );
}

const sensorsOptions = { activationConstraint: { distance: 6 } };

/** Tablero: una columna por cada opción de una selección (o marcada / sin marcar). */
export function BoardView({
  view,
  columns,
  allColumns,
  rows,
  labels,
  actions,
  onOpenRow,
}: {
  view: TableView;
  columns: TableColumn[];
  allColumns: TableColumn[];
  rows: ComputedRow[];
  labels: RelationLabels;
  actions: ReturnType<typeof useTableActions>;
  onOpenRow: (id: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, sensorsOptions));
  const [active, setActive] = useState<string | null>(null);
  const candidates = allColumns.filter((c) => c.type === 'select' || c.type === 'checkbox');
  const boardCol = allColumns.find((c) => c.id === view.config.boardColumnId) ?? candidates[0];

  const lanes = useMemo(() => {
    if (!boardCol) return [];
    if (boardCol.type === 'checkbox') {
      return [
        {
          key: 'false',
          label: 'Sin marcar',
          color: '#64748b',
          value: false as CellValue,
          rows: rows.filter((r) => r.values[boardCol.id] !== true),
        },
        {
          key: 'true',
          label: 'Marcadas',
          color: '#22c55e',
          value: true as CellValue,
          rows: rows.filter((r) => r.values[boardCol.id] === true),
        },
      ];
    }
    const choices = boardCol.options.choices ?? [];
    return [
      {
        key: '',
        label: 'Sin valor',
        color: '#94a3b8',
        value: null as CellValue,
        rows: rows.filter((r) => !choices.some((c) => c.id === r.values[boardCol.id])),
      },
      ...choices.map((c) => ({
        key: c.id,
        label: c.label,
        color: c.color,
        value: c.id as CellValue,
        rows: rows.filter((r) => r.values[boardCol.id] === c.id),
      })),
    ];
  }, [boardCol, rows]);

  if (!boardCol) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Para ver el tablero, añade a la tabla una columna de tipo «Selección» o «Casilla».
      </p>
    );
  }

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const lane = lanes.find((l) => `lane:${l.key}` === e.over?.id);
    const row = rows.find((r) => r.id === e.active.id);
    if (!lane || !row) return;
    const v = row.values[boardCol.id];
    const currentKey =
      boardCol.type === 'checkbox'
        ? String(v === true)
        : (boardCol.options.choices ?? []).some((c) => c.id === v)
          ? String(v)
          : '';
    if (currentKey === lane.key) return;
    void actions.upsert([{ id: row.id, values: { [boardCol.id]: lane.value } }]);
  };

  const activeRow = active ? rows.find((r) => r.id === active) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        Columnas según
        <NativeSelect
          className="h-8 w-auto"
          value={boardCol.id}
          onChange={(e) =>
            void actions.patchView(view, { config: { boardColumnId: e.target.value } })
          }
          aria-label="Columna del tablero"
        >
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setActive(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
      >
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-3 pb-3">
          {lanes.map((lane) => (
            <Column
              key={lane.key}
              id={`lane:${lane.key}`}
              className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/50 p-2"
            >
              <div className="mb-2 flex items-center gap-2 px-1 text-sm font-medium">
                <span className="size-2.5 rounded-full" style={{ background: lane.color }} />
                {lane.label}
                <span className="text-xs font-normal text-muted-foreground">
                  {lane.rows.length}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="ml-auto size-7"
                  aria-label={`Nueva fila en ${lane.label}`}
                  onClick={async () => {
                    const [created] = await actions.upsert([
                      {
                        values:
                          lane.value == null || lane.value === false
                            ? {}
                            : { [boardCol.id]: lane.value },
                      },
                    ]);
                    if (created) onOpenRow(created.id);
                  }}
                >
                  <Plus />
                </Button>
              </div>
              <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto">
                {lane.rows.map((r) => (
                  <DraggableCard
                    key={r.id}
                    id={r.id}
                    row={r}
                    columns={columns}
                    labels={labels}
                    skip={[boardCol.id]}
                    onOpen={() => onOpenRow(r.id)}
                  />
                ))}
              </div>
            </Column>
          ))}
        </div>
        <DragOverlay>
          {activeRow && (
            <RowCard
              row={activeRow}
              columns={columns}
              labels={labels}
              skip={[boardCol.id]}
              dragging
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const d = new Date(`${first}T12:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  const start = addDaysISO(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDaysISO(start, i));
}

function DayCell({
  day,
  children,
  muted,
  today,
  onAdd,
}: {
  day: string;
  children: React.ReactNode;
  muted: boolean;
  today: boolean;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group flex min-h-24 flex-col gap-1 border-b border-r p-1',
        muted && 'bg-muted/30',
        isOver && 'bg-primary/10',
      )}
    >
      <div className="flex items-center">
        <span
          className={cn(
            'flex size-6 items-center justify-center rounded-full text-xs',
            today && 'bg-primary font-semibold text-primary-foreground',
            muted && 'text-muted-foreground',
          )}
        >
          {Number(day.slice(8))}
        </span>
        <button
          type="button"
          className="ml-auto hidden rounded p-0.5 text-muted-foreground hover:bg-accent group-hover:block"
          onClick={onAdd}
          aria-label={`Nueva fila el ${day}`}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

function CalendarChip({
  row,
  title,
  onOpen,
}: {
  row: ComputedRow;
  title: string;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.id });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      className={cn(
        'truncate rounded bg-primary/10 px-1.5 py-0.5 text-left text-xs text-foreground hover:bg-primary/20',
        isDragging && 'opacity-30',
      )}
      onClick={onOpen}
    >
      {title}
    </button>
  );
}

/** Calendario mensual según una columna de fecha. */
export function CalendarView({
  view,
  columns,
  allColumns,
  rows,
  labels,
  actions,
  onOpenRow,
}: {
  view: TableView;
  columns: TableColumn[];
  allColumns: TableColumn[];
  rows: ComputedRow[];
  labels: RelationLabels;
  actions: ReturnType<typeof useTableActions>;
  onOpenRow: (id: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, sensorsOptions));
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const dateCols = allColumns.filter((c) => c.type === 'date');
  const dateCol = allColumns.find((c) => c.id === view.config.dateColumnId) ?? dateCols[0];
  const days = useMemo(() => monthGrid(month), [month]);
  const byDay = useMemo(() => {
    const m = new Map<string, ComputedRow[]>();
    if (!dateCol) return m;
    for (const r of rows) {
      const d = r.values[dateCol.id];
      if (typeof d !== 'string') continue;
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(r);
    }
    return m;
  }, [rows, dateCol]);

  if (!dateCol) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Para ver el calendario, añade a la tabla una columna de tipo «Fecha».
      </p>
    );
  }
  const shift = (n: number) => {
    const d = new Date(`${month}-15T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const label = new Intl.DateTimeFormat('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-15T12:00:00Z`));
  const today = todayISO();
  const undated = rows.filter((r) => typeof r.values[dateCol.id] !== 'string').length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={() => shift(-1)}
          aria-label="Mes anterior"
        >
          <ChevronLeft />
        </Button>
        <span className="w-40 text-center font-medium">
          {label.charAt(0).toUpperCase() + label.slice(1)}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={() => shift(1)}
          aria-label="Mes siguiente"
        >
          <ChevronRight />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMonth(today.slice(0, 7))}>
          Hoy
        </Button>
        <span className="ml-4 text-muted-foreground">Fecha:</span>
        <NativeSelect
          className="h-8 w-auto"
          value={dateCol.id}
          onChange={(e) =>
            void actions.patchView(view, { config: { dateColumnId: e.target.value } })
          }
          aria-label="Columna de fecha"
        >
          {dateCols.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        {undated > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{undated} sin fecha</span>
        )}
      </div>
      <DndContext
        sensors={sensors}
        onDragEnd={(e) => {
          const day = String(e.over?.id ?? '');
          if (!day.startsWith('day:')) return;
          const row = rows.find((r) => r.id === e.active.id);
          if (row && row.values[dateCol.id] !== day.slice(4))
            void actions.upsert([{ id: row.id, values: { [dateCol.id]: day.slice(4) } }]);
        }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <div className="grid grid-cols-7 border-l border-t">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="border-b border-r bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground"
              >
                {w}
              </div>
            ))}
            {days.map((day) => (
              <DayCell
                key={day}
                day={day}
                muted={!day.startsWith(month)}
                today={day === today}
                onAdd={async () => {
                  const [created] = await actions.upsert([{ values: { [dateCol.id]: day } }]);
                  if (created) onOpenRow(created.id);
                }}
              >
                {(byDay.get(day) ?? []).slice(0, 6).map((r) => (
                  <CalendarChip
                    key={r.id}
                    row={r}
                    title={rowTitle(columns, r, labels)}
                    onOpen={() => onOpenRow(r.id)}
                  />
                ))}
                {(byDay.get(day)?.length ?? 0) > 6 && (
                  <span className="px-1 text-xs text-muted-foreground">
                    +{byDay.get(day)!.length - 6} más
                  </span>
                )}
              </DayCell>
            ))}
          </div>
        </div>
      </DndContext>
    </div>
  );
}
