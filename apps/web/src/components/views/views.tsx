import { useMemo, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GanttChart,
  Kanban,
  LayoutGrid,
  ListTree,
  Table2,
} from 'lucide-react';
import {
  PERIOD_KINDS,
  addDaysISO,
  diffDaysISO,
  formatDateES,
  periodRange,
  shiftPeriod,
  todayISO,
  type Period,
  type PeriodRange,
} from '@l10n/shared';
import { NativeSelect } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ── Estado guardado por página ─────────────────────────────────────────────
function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** useState que recuerda el valor entre sesiones (por ejemplo, la vista elegida). */
export function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback));
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* sin almacenamiento */
    }
  };
  return [value, set] as const;
}

// ── Vistas ─────────────────────────────────────────────────────────────────
export type ViewKind = 'table' | 'cards' | 'board' | 'grouped' | 'timeline';

const VIEW_META: Record<ViewKind, { label: string; icon: ReactNode }> = {
  table: { label: 'Tabla', icon: <Table2 className="size-4" /> },
  cards: { label: 'Tarjetas', icon: <LayoutGrid className="size-4" /> },
  board: { label: 'Tablero', icon: <Kanban className="size-4" /> },
  grouped: { label: 'Agrupada', icon: <ListTree className="size-4" /> },
  timeline: { label: 'Línea de tiempo', icon: <GanttChart className="size-4" /> },
};

export function ViewSwitcher({
  views,
  value,
  onChange,
}: {
  views: ViewKind[];
  value: ViewKind;
  onChange: (v: ViewKind) => void;
}) {
  return (
    <div className="flex rounded-md border p-0.5" role="radiogroup" aria-label="Vista">
      {views.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          title={VIEW_META[v].label}
          className={cn(
            'flex items-center gap-1 rounded px-2 py-1 text-sm',
            value === v ? 'bg-accent font-medium' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => onChange(v)}
          data-testid={`view-${v}`}
        >
          {VIEW_META[v].icon}
          <span className="hidden lg:inline">{VIEW_META[v].label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Periodo ────────────────────────────────────────────────────────────────
/** Fecha de referencia de cada página mientras la app está abierta (al abrirla, hoy). */
const periodAnchors = new Map<string, string>();

/**
 * Periodo elegido y su rango de fechas. Se recuerda el tipo (mes, año…) entre sesiones; la
 * fecha, solo durante la sesión, para que «Mes» sea el mes actual al volver otro día.
 */
export function usePeriod(key: string) {
  const [kind, setKind] = usePersistentState<Period['kind']>(`l10n-period-kind-${key}`, 'all');
  const [anchor, setAnchor] = useState(() => periodAnchors.get(key) ?? todayISO());
  const period = useMemo<Period>(
    () => ({ kind: PERIOD_KINDS.some((k) => k.value === kind) ? kind : 'all', anchor }),
    [kind, anchor],
  );
  const setPeriod = (p: Period) => {
    setKind(p.kind);
    setAnchor(p.anchor);
    periodAnchors.set(key, p.anchor);
  };
  const range = useMemo(() => periodRange(period), [period]);
  return { period, setPeriod, range };
}

export function PeriodPicker({
  period,
  onChange,
  range,
}: {
  period: Period;
  onChange: (p: Period) => void;
  range: PeriodRange | null;
}) {
  return (
    <div className="flex items-center gap-1" data-testid="period-picker">
      <CalendarRange className="size-4 text-muted-foreground" />
      <NativeSelect
        className="h-9 w-32"
        value={period.kind}
        onChange={(e) =>
          onChange({ kind: e.target.value as Period['kind'], anchor: period.anchor || todayISO() })
        }
        aria-label="Periodo"
        data-testid="period-kind"
      >
        {PERIOD_KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </NativeSelect>
      {range && (
        <>
          <button
            type="button"
            className="rounded p-1.5 hover:bg-accent"
            aria-label="Periodo anterior"
            onClick={() => onChange(shiftPeriod(period, -1))}
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-36 text-center text-sm font-medium" data-testid="period-label">
            {range.label.charAt(0).toUpperCase() + range.label.slice(1)}
          </span>
          <button
            type="button"
            className="rounded p-1.5 hover:bg-accent"
            aria-label="Periodo siguiente"
            onClick={() => onChange(shiftPeriod(period, 1))}
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            onClick={() => onChange({ kind: period.kind, anchor: todayISO() })}
          >
            Hoy
          </button>
        </>
      )}
    </div>
  );
}

// ── Tarjetas ───────────────────────────────────────────────────────────────
export function CardGrid<T>({
  items,
  getId,
  renderCard,
  onClick,
  empty = 'No hay nada que mostrar.',
}: {
  items: T[];
  getId: (t: T) => string;
  renderCard: (t: T) => ReactNode;
  onClick?: (t: T) => void;
  empty?: string;
}) {
  if (!items.length)
    return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      data-testid="card-grid"
    >
      {items.map((t) => (
        <div
          key={getId(t)}
          role={onClick ? 'button' : undefined}
          tabIndex={onClick ? 0 : undefined}
          onClick={() => onClick?.(t)}
          onKeyDown={(e) => e.key === 'Enter' && onClick?.(t)}
          className={cn(
            'grid content-start gap-2 rounded-lg border bg-card p-4 text-sm shadow-xs',
            onClick && 'cursor-pointer transition-colors hover:bg-accent/30',
          )}
          data-testid="view-card"
        >
          {renderCard(t)}
        </div>
      ))}
    </div>
  );
}

// ── Tablero por estado ─────────────────────────────────────────────────────
export interface BoardColumn {
  value: string;
  label: string;
  color?: string;
}

function BoardCard({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn('cursor-grab', isDragging && 'opacity-30')}
      data-testid="board-card"
    >
      {children}
    </div>
  );
}

function BoardColumnView({
  column,
  count,
  footer,
  children,
}: {
  column: BoardColumn;
  count: number;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.value });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-64 shrink-0 flex-col rounded-lg bg-muted/50 p-2',
        isOver && 'bg-primary/5 ring-2 ring-primary/30',
      )}
      data-testid={`board-column-${column.value}`}
    >
      <div className="mb-2 flex items-center gap-2 px-1 text-sm font-medium">
        {column.color && (
          <span className="size-2.5 rounded-full" style={{ background: column.color }} />
        )}
        {column.label}
        <span className="text-xs font-normal text-muted-foreground">{count}</span>
      </div>
      <div className="grid min-h-16 content-start gap-2">{children}</div>
      {footer && <div className="mt-2 px-1 text-xs text-muted-foreground">{footer}</div>}
    </div>
  );
}

/** Columnas por estado; al soltar una tarjeta en otra columna se llama a `onMove`. */
export function StatusBoard<T>({
  items,
  columns,
  getId,
  getStatus,
  renderCard,
  onMove,
  onOpen,
  columnFooter,
}: {
  items: T[];
  columns: BoardColumn[];
  getId: (t: T) => string;
  getStatus: (t: T) => string;
  renderCard: (t: T) => ReactNode;
  onMove: (t: T, status: string) => void;
  onOpen?: (t: T) => void;
  columnFooter?: (items: T[]) => ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [active, setActive] = useState<string | null>(null);
  const activeItem = active ? items.find((t) => getId(t) === active) : undefined;
  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActive(String(e.active.id))}
      onDragCancel={() => setActive(null)}
      onDragEnd={(e) => {
        setActive(null);
        const to = e.over?.id ? String(e.over.id) : null;
        const item = items.find((t) => getId(t) === e.active.id);
        if (item && to && to !== getStatus(item)) onMove(item, to);
      }}
    >
      <div className="flex gap-3 overflow-x-auto pb-3">
        {columns.map((c) => {
          const list = items.filter((t) => getStatus(t) === c.value);
          return (
            <BoardColumnView
              key={c.value}
              column={c}
              count={list.length}
              footer={list.length && columnFooter ? columnFooter(list) : undefined}
            >
              {list.map((t) => (
                <BoardCard key={getId(t)} id={getId(t)}>
                  <div
                    className="grid gap-1 rounded-md border bg-card p-2.5 text-sm shadow-xs"
                    onClick={() => onOpen?.(t)}
                  >
                    {renderCard(t)}
                  </div>
                </BoardCard>
              ))}
            </BoardColumnView>
          );
        })}
      </div>
      <DragOverlay>
        {activeItem && (
          <div className="grid rotate-1 gap-1 rounded-md border bg-card p-2.5 text-sm shadow-lg ring-2 ring-primary/40">
            {renderCard(activeItem)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ── Agrupada ───────────────────────────────────────────────────────────────
export interface GroupOption<T> {
  value: string;
  label: string;
  /** Clave y nombre del grupo de cada elemento (pueden ser varios: plataformas…). */
  get: (t: T) => string | string[] | null;
}

export function GroupedList<T>({
  items,
  options,
  groupBy,
  onGroupByChange,
  render,
  subtotal,
}: {
  items: T[];
  options: GroupOption<T>[];
  groupBy: string;
  onGroupByChange: (v: string) => void;
  /** Cómo se muestran los elementos de un grupo (normalmente, la tabla de la página). */
  render: (items: T[]) => ReactNode;
  subtotal?: (items: T[]) => ReactNode;
}) {
  const option = options.find((o) => o.value === groupBy) ?? options[0]!;
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const groups = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const t of items) {
      const raw = option.get(t);
      const keys = (Array.isArray(raw) ? raw : [raw]).map((k) => k || 'Sin indicar');
      for (const k of keys.length ? keys : ['Sin indicar']) {
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(t);
      }
    }
    return [...map].sort(([a], [b]) =>
      a === 'Sin indicar' ? 1 : b === 'Sin indicar' ? -1 : a.localeCompare(b, 'es'),
    );
  }, [items, option]);
  return (
    <div className="grid gap-3" data-testid="grouped-view">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Agrupar por</span>
        <NativeSelect
          className="h-8 w-44"
          value={option.value}
          onChange={(e) => onGroupByChange(e.target.value)}
          data-testid="group-by"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {groups.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">No hay nada que mostrar.</p>
      )}
      {groups.map(([key, list]) => {
        const isClosed = closed.has(key);
        return (
          <section key={key} className="rounded-lg border" data-testid="group">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-t-lg bg-muted/40 px-3 py-2 text-left text-sm"
              onClick={() =>
                setClosed((s) => {
                  const n = new Set(s);
                  if (n.has(key)) n.delete(key);
                  else n.add(key);
                  return n;
                })
              }
            >
              <ChevronDown
                className={cn('size-4 transition-transform', isClosed && '-rotate-90')}
              />
              <span className="font-medium">{key}</span>
              <span className="text-muted-foreground">{list.length}</span>
              {subtotal && (
                <span className="ml-auto text-muted-foreground" data-testid="group-subtotal">
                  {subtotal(list)}
                </span>
              )}
            </button>
            {!isClosed && <div className="p-2">{render(list)}</div>}
          </section>
        );
      })}
    </div>
  );
}

// ── Línea de tiempo ────────────────────────────────────────────────────────
export function Timeline<T>({
  items,
  getId,
  getStart,
  getEnd,
  getLabel,
  getSublabel,
  getColor,
  onOpen,
  range,
}: {
  items: T[];
  getId: (t: T) => string;
  getStart: (t: T) => string | null;
  getEnd: (t: T) => string | null;
  getLabel: (t: T) => string;
  getSublabel?: (t: T) => string | null;
  getColor?: (t: T) => string | null;
  onOpen?: (t: T) => void;
  /** Con un periodo elegido, la escala es la del periodo. */
  range: PeriodRange | null;
}) {
  const [zoom, setZoom] = usePersistentState<'week' | 'month'>('l10n-timeline-zoom', 'week');
  const today = todayISO();
  const rows = items
    .map((t) => {
      const s = getStart(t) ?? getEnd(t);
      const e = getEnd(t) ?? getStart(t);
      return s && e ? { t, start: s <= e ? s : e, end: s <= e ? e : s } : null;
    })
    .filter((r): r is { t: T; start: string; end: string } => r !== null)
    .sort((a, b) => a.start.localeCompare(b.start));
  const from =
    range?.from ??
    (rows.length ? rows.reduce((m, r) => (r.start < m ? r.start : m), rows[0]!.start) : today);
  const to =
    range?.to ??
    (rows.length ? rows.reduce((m, r) => (r.end > m ? r.end : m), rows[0]!.end) : today);
  const start = addDaysISO(from < today || range ? from : today, -2);
  const end = addDaysISO(to > today || range ? to : today, 2);
  const days = Math.max(7, diffDaysISO(start, end) + 1);
  const px = zoom === 'week' ? 22 : 7;
  const width = days * px;
  const x = (d: string) => Math.max(0, Math.min(days, diffDaysISO(start, d))) * px;

  // Marcas: inicio de cada mes y, con zoom semanal, cada lunes.
  const marks: { x: number; label: string; strong: boolean }[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDaysISO(start, i);
    const date = new Date(`${d}T12:00:00`);
    if (d.endsWith('-01'))
      marks.push({
        x: i * px,
        label: new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' }).format(date),
        strong: true,
      });
    else if (zoom === 'week' && date.getDay() === 1)
      marks.push({ x: i * px, label: d.slice(8, 10), strong: false });
  }

  if (!rows.length)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay fechas que mostrar en la línea de tiempo.
      </p>
    );
  return (
    <div className="grid gap-2" data-testid="timeline">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Escala</span>
        <NativeSelect
          className="h-8 w-32"
          value={zoom}
          onChange={(e) => setZoom(e.target.value as 'week' | 'month')}
        >
          <option value="week">Semanas</option>
          <option value="month">Meses</option>
        </NativeSelect>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <div className="grid" style={{ gridTemplateColumns: `14rem ${width}px` }}>
          <div className="sticky left-0 z-10 border-b bg-card" />
          <div className="relative h-8 border-b bg-card text-xs text-muted-foreground">
            {marks.map((m) => (
              <span
                key={m.x}
                className={cn('absolute top-1.5 -translate-x-1/2', m.strong && 'font-medium')}
                style={{ left: m.x }}
              >
                {m.label}
              </span>
            ))}
          </div>
          {rows.map(({ t, start: s, end: e }) => (
            <TimelineRow
              key={getId(t)}
              label={getLabel(t)}
              sublabel={getSublabel?.(t) ?? null}
              left={x(s)}
              width={Math.max(px, x(addDaysISO(e, 1)) - x(s))}
              color={getColor?.(t) ?? null}
              title={`${getLabel(t)}: ${formatDateES(s)}${s !== e ? ` – ${formatDateES(e)}` : ''}`}
              marks={marks}
              todayX={today >= start && today <= end ? x(today) + px / 2 : null}
              onOpen={onOpen ? () => onOpen(t) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({
  label,
  sublabel,
  left,
  width,
  color,
  title,
  marks,
  todayX,
  onOpen,
}: {
  label: string;
  sublabel: string | null;
  left: number;
  width: number;
  color: string | null;
  title: string;
  marks: { x: number; strong: boolean }[];
  todayX: number | null;
  onOpen?: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="sticky left-0 z-10 truncate border-b bg-card px-3 py-1.5 text-left text-sm hover:bg-accent"
        onClick={onOpen}
        title={label}
      >
        <div className="truncate font-medium">{label}</div>
        {sublabel && <div className="truncate text-xs text-muted-foreground">{sublabel}</div>}
      </button>
      <div className="relative border-b">
        {marks
          .filter((m) => m.strong)
          .map((m) => (
            <span
              key={m.x}
              className="absolute inset-y-0 border-l border-dashed"
              style={{ left: m.x }}
            />
          ))}
        {todayX !== null && (
          <span
            className="absolute inset-y-0 border-l-2 border-primary/60"
            style={{ left: todayX }}
          />
        )}
        <button
          type="button"
          title={title}
          onClick={onOpen}
          className="absolute top-1/2 h-5 -translate-y-1/2 rounded-md opacity-90 hover:opacity-100"
          style={{ left, width, background: color ?? 'var(--color-primary, #6366f1)' }}
          data-testid="timeline-bar"
        />
      </div>
    </>
  );
}
