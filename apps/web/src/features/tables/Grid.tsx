import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  EyeOff,
  Maximize2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  AGGREGATES,
  aggregate,
  cellText,
  coerceText,
  type Aggregate,
  type CellValue,
  type ColumnChoice,
  type ComputedRow,
  type RelationLabels,
  type TableColumn,
  type TableView,
} from '@l10n/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/components/ui/confirm';
import { Checkbox } from '@/components/ui/misc';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  CellDisplay,
  ChoicePicker,
  COLUMN_ICONS,
  RelationPicker,
  TextCellEditor,
  editText,
  isNumeric,
  newChoiceId,
  parseEdit,
} from './cells';
import type { useTableActions } from './hooks';

const ROW_H = 34;
const GROUP_H = 38;
const NUM_W = 64;
const DEFAULT_W = 180;

type Pos = { r: number; c: number };
type Item =
  | { kind: 'group'; key: string; label: string; count: number; color?: string }
  | { kind: 'row'; row: ComputedRow; index: number };

/** Interpreta texto copiado de Excel o Google Sheets (TSV con comillas). */
export function parseTSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let quoted = false;
  const s = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  while (i < s.length) {
    const ch = s[i]!;
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        quoted = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell === '') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === '\t') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
    i++;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function toTSVCell(s: string): string {
  return /[\t\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function groupKey(column: TableColumn, v: unknown, labels: RelationLabels): string {
  if (column.type === 'checkbox') return v ? 'true' : 'false';
  if (column.type === 'select') return typeof v === 'string' ? v : '';
  return cellText(column, (v ?? null) as CellValue, labels);
}

export function Grid({
  view,
  columns,
  rows,
  labels,
  actions,
  onOpenRow,
  onEditColumn,
  canAddRows = true,
}: {
  view: TableView;
  columns: TableColumn[];
  rows: ComputedRow[];
  labels: RelationLabels;
  actions: ReturnType<typeof useTableActions>;
  onOpenRow: (rowId: string) => void;
  onEditColumn: (col: TableColumn | null) => void;
  canAddRows?: boolean;
}) {
  const confirm = useConfirm();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Pos | null>(null);
  const [focus, setFocus] = useState<Pos | null>(null);
  const [editing, setEditing] = useState<{ pos: Pos; initial: string } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [widths, setWidths] = useState<Record<string, number>>({});
  const dragging = useRef(false);
  const undoStack = useRef<{ id: string; values: Record<string, CellValue> }[][]>([]);
  /** Celda a seleccionar cuando aparezca (p. ej., tras crear una fila). */
  const pendingFocus = useRef<Pos | null>(null);

  const groupCol = view.config.groupBy
    ? columns.find((c) => c.id === view.config.groupBy)
    : undefined;

  // Elementos (cabeceras de grupo y filas) y filas visibles en orden.
  const { items, visibleRows } = useMemo(() => {
    if (!groupCol) {
      return {
        items: rows.map((row, index) => ({ kind: 'row', row, index }) as Item),
        visibleRows: rows,
      };
    }
    const groups = new Map<string, ComputedRow[]>();
    for (const r of rows) {
      const k = groupKey(groupCol, r.computed[groupCol.id], labels);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    let keys = [...groups.keys()];
    if (groupCol.type === 'select') {
      const order = (groupCol.options.choices ?? []).map((c) => c.id);
      keys.sort((a, b) => (a === '' ? 1 : b === '' ? -1 : order.indexOf(a) - order.indexOf(b)));
    } else if (groupCol.type === 'checkbox') keys = keys.sort().reverse();
    else
      keys.sort((a, b) =>
        a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'es', { numeric: true }),
      );
    const out: Item[] = [];
    const visible: ComputedRow[] = [];
    for (const k of keys) {
      const list = groups.get(k)!;
      const choice =
        groupCol.type === 'select' ? groupCol.options.choices?.find((c) => c.id === k) : undefined;
      const label =
        groupCol.type === 'checkbox'
          ? k === 'true'
            ? 'Marcadas'
            : 'Sin marcar'
          : (choice?.label ?? (k || 'Sin valor'));
      out.push({ kind: 'group', key: k, label, count: list.length, color: choice?.color });
      if (collapsed.has(k)) continue;
      for (const row of list) {
        out.push({ kind: 'row', row, index: visible.length });
        visible.push(row);
      }
    }
    return { items: out, visibleRows: visible };
  }, [rows, groupCol, labels, collapsed]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i]?.kind === 'group' ? GROUP_H : ROW_H),
    overscan: 12,
  });

  const width = (c: TableColumn) => widths[c.id] ?? c.width ?? DEFAULT_W;
  const template = `${NUM_W}px ${columns.map((c) => `${width(c)}px`).join(' ')} 44px`;
  const totalWidth = NUM_W + columns.reduce((s, c) => s + width(c), 0) + 44;

  const range = useMemo(() => {
    if (!anchor || !focus) return null;
    return {
      r0: Math.min(anchor.r, focus.r),
      r1: Math.max(anchor.r, focus.r),
      c0: Math.min(anchor.c, focus.c),
      c1: Math.max(anchor.c, focus.c),
    };
  }, [anchor, focus]);

  const clamp = useCallback(
    (p: Pos): Pos => ({
      r: Math.max(0, Math.min(visibleRows.length - 1, p.r)),
      c: Math.max(0, Math.min(columns.length - 1, p.c)),
    }),
    [visibleRows.length, columns.length],
  );

  const scrollToRow = (r: number) => {
    const i = items.findIndex((it) => it.kind === 'row' && it.index === r);
    if (i >= 0) virtualizer.scrollToIndex(i, { align: 'auto' });
  };

  const select = (p: Pos, extend = false) => {
    const q = clamp(p);
    setFocus(q);
    if (!extend || !anchor) setAnchor(q);
    scrollToRow(q.r);
  };

  /** Aplica cambios con posibilidad de deshacer (Ctrl+Z). */
  const apply = async (
    changes: { id: string; values: Record<string, CellValue> }[],
    extra?: { labels?: RelationLabels },
  ) => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const undo = changes.map((ch) => ({
      id: ch.id,
      values: Object.fromEntries(
        Object.keys(ch.values).map((k) => [k, byId.get(ch.id)?.values[k] ?? null]),
      ),
    }));
    undoStack.current.push(undo);
    if (undoStack.current.length > 50) undoStack.current.shift();
    await actions.upsert(changes, extra?.labels).catch(() => undoStack.current.pop());
  };

  const setCell = async (
    pos: Pos,
    value: CellValue,
    extra?: { newChoices?: ColumnChoice[]; labels?: RelationLabels },
  ) => {
    const row = visibleRows[pos.r];
    const col = columns[pos.c];
    if (!row || !col || col.type === 'formula') return;
    if (extra?.newChoices?.length) await actions.addChoices(col, extra.newChoices);
    await apply([{ id: row.id, values: { [col.id]: value } }], extra);
  };

  const startEdit = (pos: Pos, typed?: string) => {
    const row = visibleRows[pos.r];
    const col = columns[pos.c];
    if (!row || !col || col.type === 'formula') return;
    if (col.type === 'checkbox') {
      void setCell(pos, !(row.values[col.id] === true));
      return;
    }
    setEditing({ pos, initial: typed ?? editText(col, row.values[col.id]) });
  };

  const stopEdit = () => {
    setEditing(null);
    scrollRef.current?.focus({ preventScroll: true });
  };

  const clearRange = () => {
    if (!range) return;
    const changes: { id: string; values: Record<string, CellValue> }[] = [];
    for (let r = range.r0; r <= range.r1; r++) {
      const row = visibleRows[r];
      if (!row) continue;
      const values: Record<string, CellValue> = {};
      for (let c = range.c0; c <= range.c1; c++) {
        const col = columns[c]!;
        if (col.type !== 'formula' && row.values[col.id] != null) values[col.id] = null;
      }
      if (Object.keys(values).length) changes.push({ id: row.id, values });
    }
    if (changes.length) void apply(changes);
  };

  const copyText = (): string => {
    if (!range) return '';
    const lines: string[] = [];
    for (let r = range.r0; r <= range.r1; r++) {
      const row = visibleRows[r];
      if (!row) continue;
      const cells: string[] = [];
      for (let c = range.c0; c <= range.c1; c++) {
        const col = columns[c]!;
        cells.push(toTSVCell(cellText(col, row.computed[col.id] as CellValue, labels)));
      }
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  };

  const paste = async (text: string) => {
    if (!focus || !range) return;
    const data = parseTSV(text);
    if (!data.length) return;
    const single = data.length === 1 && data[0]!.length === 1;
    const start = { r: range.r0, c: range.c0 };
    const height = single ? range.r1 - range.r0 + 1 : data.length;
    const widthN = single ? range.c1 - range.c0 + 1 : Math.max(...data.map((d) => d.length));
    const pending = new Map<string, ColumnChoice[]>();
    const liveCol = (col: TableColumn): TableColumn => ({
      ...col,
      options: {
        ...col.options,
        choices: [...(col.options.choices ?? []), ...(pending.get(col.id) ?? [])],
      },
    });
    const updates: { id: string; values: Record<string, CellValue> }[] = [];
    const creates: Record<string, CellValue>[] = [];
    let invalid = 0;
    for (let dr = 0; dr < height; dr++) {
      const values: Record<string, CellValue> = {};
      for (let dc = 0; dc < widthN; dc++) {
        const col = columns[start.c + dc];
        if (!col || col.type === 'formula' || col.type === 'relation') continue;
        const raw = single ? data[0]![0]! : (data[dr]?.[dc] ?? '');
        const res = coerceText(liveCol(col), raw, newChoiceId);
        if (res.newChoices)
          pending.set(col.id, [...(pending.get(col.id) ?? []), ...res.newChoices]);
        if (res.invalid) invalid++;
        values[col.id] = res.invalid ? null : res.value;
      }
      const row = visibleRows[start.r + dr];
      if (row) updates.push({ id: row.id, values });
      else if (canAddRows) creates.push(values);
    }
    for (const [colId, choices] of pending) {
      const col = columns.find((c) => c.id === colId)!;
      await actions.addChoices(col, choices);
    }
    if (updates.length) await apply(updates);
    if (creates.length) await actions.upsert(creates.map((values) => ({ values })));
    setAnchor(start);
    setFocus(clamp({ r: start.r + height - 1, c: start.c + widthN - 1 }));
    if (invalid) {
      const { toast } = await import('sonner');
      toast.warning(
        `${invalid} ${invalid === 1 ? 'valor no encajaba' : 'valores no encajaban'} con el tipo de su columna y se han dejado vacíos.`,
      );
    }
  };

  const undo = async () => {
    const last = undoStack.current.pop();
    if (last) await actions.upsert(last);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing || !focus) return;
    const mod = e.metaKey || e.ctrlKey;
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      if (mod) {
        const target = {
          r: dr ? (dr > 0 ? visibleRows.length - 1 : 0) : focus.r,
          c: dc ? (dc > 0 ? columns.length - 1 : 0) : focus.c,
        };
        select(target, e.shiftKey);
      } else select({ r: focus.r + dr, c: focus.c + dc }, e.shiftKey);
    };
    switch (e.key) {
      case 'ArrowUp':
        return move(-1, 0);
      case 'ArrowDown':
        return move(1, 0);
      case 'ArrowLeft':
        return move(0, -1);
      case 'ArrowRight':
        return move(0, 1);
      case 'Tab':
        e.preventDefault();
        return select({ r: focus.r, c: focus.c + (e.shiftKey ? -1 : 1) });
      case 'Enter':
      case 'F2':
        e.preventDefault();
        if (e.key === 'Enter' && e.shiftKey) return select({ r: focus.r - 1, c: focus.c });
        return startEdit(focus);
      case 'Escape':
        setAnchor(focus);
        setSelectedRows(new Set());
        return;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        return clearRange();
      case ' ':
        if (columns[focus.c]?.type === 'checkbox') {
          e.preventDefault();
          return startEdit(focus);
        }
        break;
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setAnchor({ r: 0, c: 0 });
      setFocus({ r: visibleRows.length - 1, c: columns.length - 1 });
      return;
    }
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      void undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'c') {
      const text = copyText();
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      return;
    }
    if (!mod && !e.altKey && e.key.length === 1) {
      const col = columns[focus.c];
      if (col && ['text', 'number', 'currency', 'percent', 'url', 'email'].includes(col.type)) {
        e.preventDefault();
        startEdit(focus, e.key);
      } else if (col && ['select', 'multi_select', 'relation', 'date'].includes(col.type)) {
        e.preventDefault();
        startEdit(focus);
      }
    }
  };

  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  useEffect(() => {
    const p = pendingFocus.current;
    if (p && p.r < visibleRows.length) {
      pendingFocus.current = null;
      setAnchor(p);
      setFocus(p);
      const i = items.findIndex((it) => it.kind === 'row' && it.index === p.r);
      if (i >= 0) virtualizer.scrollToIndex(i, { align: 'auto' });
    }
  }, [visibleRows.length, items, virtualizer]);

  // Si cambian las filas (filtro, orden), la selección no puede quedar fuera.
  useEffect(() => {
    if (focus && (focus.r >= visibleRows.length || focus.c >= columns.length)) {
      setFocus(null);
      setAnchor(null);
      setEditing(null);
    }
  }, [visibleRows.length, columns.length, focus]);

  const resize = (col: TableColumn, startX: number) => {
    const start = width(col);
    const onMove = (ev: MouseEvent) =>
      setWidths((w) => ({
        ...w,
        [col.id]: Math.max(70, Math.min(800, start + ev.clientX - startX)),
      }));
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const w = Math.max(70, Math.min(800, start + ev.clientX - startX));
      void actions.patchColumn(col.id, { width: Math.round(w) });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const moveColumn = (col: TableColumn, dir: -1 | 1) => {
    const i = columns.findIndex((c) => c.id === col.id);
    const j = i + dir;
    if (j < 0 || j >= columns.length) return;
    const neighbor = columns[j]!;
    const beyond = columns[j + dir];
    const position = beyond ? (neighbor.position + beyond.position) / 2 : neighbor.position + dir;
    void actions.patchColumn(col.id, { position });
  };

  const sortBy = (col: TableColumn, dir: 'asc' | 'desc') =>
    void actions.patchView(view, { config: { sorts: [{ columnId: col.id, dir }] } });

  const setTotal = (col: TableColumn, agg: Aggregate) =>
    void actions.patchView(view, { config: { totals: { ...view.config.totals, [col.id]: agg } } });

  const allSelected = visibleRows.length > 0 && visibleRows.every((r) => selectedRows.has(r.id));

  const renderCell = (row: ComputedRow, r: number, col: TableColumn, c: number) => {
    const inRange = range && r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1;
    const isFocus = focus?.r === r && focus?.c === c;
    const isEditing = editing?.pos.r === r && editing?.pos.c === c;
    const value = row.computed[col.id] as CellValue;
    const picker = col.type === 'select' || col.type === 'multi_select' || col.type === 'relation';
    return (
      <div
        key={col.id}
        role="gridcell"
        aria-selected={Boolean(inRange)}
        data-col={col.name}
        className={cn(
          'relative flex h-full min-w-0 items-center border-b border-r px-2 text-sm',
          inRange && 'bg-primary/[0.06]',
          isFocus && 'outline-2 -outline-offset-2 outline-primary',
          col.type === 'formula' && 'bg-muted/30',
        )}
        onMouseDown={(e) => {
          if (e.button !== 0 || isEditing) return;
          e.preventDefault();
          scrollRef.current?.focus({ preventScroll: true });
          dragging.current = true;
          if (e.shiftKey && anchor) setFocus({ r, c });
          else {
            setAnchor({ r, c });
            setFocus({ r, c });
          }
          if (col.type === 'checkbox' && isFocus && !e.shiftKey) startEdit({ r, c });
        }}
        onMouseEnter={() => {
          if (dragging.current) setFocus({ r, c });
        }}
        onDoubleClick={() => startEdit({ r, c })}
      >
        {isEditing && !picker ? (
          <TextCellEditor
            column={col}
            initial={editing.initial}
            onCancel={stopEdit}
            onCommit={(text, move) => {
              const v = parseEdit(col, text);
              if (v !== undefined && text !== editText(col, row.values[col.id]))
                void setCell({ r, c }, v);
              stopEdit();
              if (move === 'down') select({ r: r + 1, c });
              else if (move === 'right') select({ r, c: c + 1 });
            }}
          />
        ) : (
          <CellDisplay column={col} value={value} error={row.errors[col.id]} labels={labels} />
        )}
        {isEditing && picker && (
          <Popover open onOpenChange={(o) => !o && stopEdit()}>
            <PopoverAnchor className="absolute inset-0" />
            <PopoverContent className="w-80" onOpenAutoFocus={(e) => e.preventDefault()}>
              {col.type === 'relation' ? (
                <RelationPicker
                  column={col}
                  value={row.values[col.id]}
                  labels={labels}
                  onChange={(ids, newLabels) => void setCell({ r, c }, ids, { labels: newLabels })}
                />
              ) : (
                <ChoicePicker
                  column={col}
                  value={row.values[col.id]}
                  onChange={(v, newChoices) => {
                    void setCell({ r, c }, v, { newChoices });
                    if (col.type === 'select') stopEdit();
                  }}
                />
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
    );
  };

  const vItems = virtualizer.getVirtualItems();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {selectedRows.size > 0 && (
        <div className="flex items-center gap-3 border-b bg-accent/40 px-3 py-1.5 text-sm">
          {selectedRows.size}{' '}
          {selectedRows.size === 1 ? 'fila seleccionada' : 'filas seleccionadas'}
          <button
            type="button"
            className="flex items-center gap-1 text-destructive hover:underline"
            onClick={async () => {
              if (
                selectedRows.size > 20 &&
                !(await confirm({
                  title: `¿Eliminar ${selectedRows.size} filas?`,
                  description: 'Puedes deshacerlo justo después.',
                  confirmLabel: 'Eliminar',
                  destructive: true,
                }))
              )
                return;
              void actions.deleteRows([...selectedRows]);
              setSelectedRows(new Set());
            }}
            data-testid="delete-rows"
          >
            <Trash2 className="size-4" /> Eliminar
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:underline"
            onClick={() => setSelectedRows(new Set())}
          >
            Cancelar
          </button>
        </div>
      )}
      <div
        ref={scrollRef}
        tabIndex={0}
        role="grid"
        aria-rowcount={visibleRows.length}
        aria-colcount={columns.length}
        className="relative min-h-0 flex-1 overflow-auto outline-none"
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          if (editing || !focus) return;
          e.preventDefault();
          void paste(e.clipboardData.getData('text/plain'));
        }}
        onCopy={(e) => {
          if (editing || !range) return;
          e.preventDefault();
          e.clipboardData.setData('text/plain', copyText());
        }}
        data-testid="grid"
      >
        <div style={{ width: totalWidth, minWidth: '100%' }}>
          {/* Cabecera */}
          <div
            className="sticky top-0 z-20 grid h-9 border-b bg-muted/80 text-xs font-medium text-muted-foreground backdrop-blur"
            style={{ gridTemplateColumns: template }}
          >
            <div className="sticky left-0 z-10 flex items-center justify-center border-r bg-muted">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) =>
                  setSelectedRows(v ? new Set(visibleRows.map((r) => r.id)) : new Set())
                }
                aria-label="Seleccionar todas las filas"
              />
            </div>
            {columns.map((col) => {
              const Icon = COLUMN_ICONS[col.type];
              return (
                <div key={col.id} className="relative flex min-w-0 items-center border-r">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2 text-left hover:bg-accent"
                        data-testid={`col-${col.name}`}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        <span className="truncate">{col.name}</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onSelect={() => onEditColumn(col)}>
                        <Pencil /> Editar columna…
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => sortBy(col, 'asc')}>
                        <ArrowUp /> Ordenar de menor a mayor
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => sortBy(col, 'desc')}>
                        <ArrowDown /> Ordenar de mayor a menor
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => moveColumn(col, -1)}>
                        <ArrowLeft /> Mover a la izquierda
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => moveColumn(col, 1)}>
                        <ArrowRight /> Mover a la derecha
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          void actions.patchView(view, {
                            config: { hidden: [...view.config.hidden, col.id] },
                          })
                        }
                      >
                        <EyeOff /> Ocultar en esta vista
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={async () => {
                          if (
                            await confirm({
                              title: `¿Eliminar la columna «${col.name}»?`,
                              description:
                                'Se borran sus valores en todas las filas. No se puede deshacer.',
                              confirmLabel: 'Eliminar',
                              destructive: true,
                            })
                          ) {
                            void actions.deleteColumn(col.id);
                          }
                        }}
                      >
                        <Trash2 /> Eliminar columna
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div
                    className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-primary/30"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      resize(col, e.clientX);
                    }}
                    aria-hidden
                  />
                </div>
              );
            })}
            <button
              type="button"
              className="flex items-center justify-center hover:bg-accent"
              onClick={() => onEditColumn(null)}
              aria-label="Añadir columna"
              title="Añadir columna"
              data-testid="add-column"
            >
              <Plus className="size-4" />
            </button>
          </div>

          {/* Filas virtualizadas */}
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {vItems.map((v) => {
              const item = items[v.index]!;
              if (item.kind === 'group') {
                const isCollapsed = collapsed.has(item.key);
                return (
                  <div
                    key={`g-${item.key}`}
                    className="absolute left-0 flex w-full items-end border-b bg-background px-2 pb-1.5"
                    style={{ top: v.start, height: GROUP_H }}
                  >
                    <button
                      type="button"
                      className="sticky left-2 flex items-center gap-2 text-sm font-medium"
                      onClick={() =>
                        setCollapsed((s) => {
                          const n = new Set(s);
                          if (n.has(item.key)) n.delete(item.key);
                          else n.add(item.key);
                          return n;
                        })
                      }
                    >
                      <ChevronRight
                        className={cn('size-4 transition-transform', !isCollapsed && 'rotate-90')}
                      />
                      {item.color && (
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: item.color }}
                        />
                      )}
                      {item.label}
                      <span className="text-xs font-normal text-muted-foreground">
                        {item.count}
                      </span>
                    </button>
                  </div>
                );
              }
              const { row, index: r } = item;
              const checked = selectedRows.has(row.id);
              return (
                <div
                  key={row.id}
                  role="row"
                  className="group absolute left-0 grid"
                  style={{
                    top: v.start,
                    height: ROW_H,
                    gridTemplateColumns: template,
                    width: totalWidth,
                  }}
                  data-testid="grid-row"
                >
                  <div className="sticky left-0 z-10 flex items-center gap-1 border-b border-r bg-background px-1.5 text-xs text-muted-foreground group-hover:bg-muted">
                    {checked || selectedRows.size > 0 ? (
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(on) =>
                          setSelectedRows((s) => {
                            const n = new Set(s);
                            if (on) n.add(row.id);
                            else n.delete(row.id);
                            return n;
                          })
                        }
                        aria-label={`Seleccionar fila ${r + 1}`}
                      />
                    ) : (
                      <>
                        <span className="w-6 text-right tabular-nums group-hover:hidden">
                          {r + 1}
                        </span>
                        <span className="hidden group-hover:block">
                          <Checkbox
                            checked={false}
                            onCheckedChange={() => setSelectedRows(new Set([row.id]))}
                            aria-label={`Seleccionar fila ${r + 1}`}
                          />
                        </span>
                      </>
                    )}
                    <button
                      type="button"
                      className="ml-auto hidden rounded p-0.5 hover:bg-accent group-hover:block"
                      onClick={() => onOpenRow(row.id)}
                      aria-label="Abrir fila"
                      title="Abrir fila"
                    >
                      <Maximize2 className="size-3.5" />
                    </button>
                  </div>
                  {columns.map((col, c) => renderCell(row, r, col, c))}
                  <div className="border-b" />
                </div>
              );
            })}
          </div>

          {canAddRows && (
            <button
              type="button"
              className="sticky left-0 flex h-9 w-full max-w-[100vw] items-center gap-2 border-b px-3 text-sm text-muted-foreground hover:bg-accent/40"
              onClick={() => {
                pendingFocus.current = { r: visibleRows.length, c: 0 };
                void actions.upsert([{ values: {} }]);
                scrollRef.current?.focus({ preventScroll: true });
              }}
              data-testid="add-row"
            >
              <Plus className="size-4" /> Nueva fila
            </button>
          )}

          {/* Totales */}
          <div
            className="sticky bottom-0 z-20 grid h-8 border-t bg-muted/90 text-xs backdrop-blur"
            style={{ gridTemplateColumns: template }}
          >
            <div className="sticky left-0 flex items-center border-r bg-muted px-2 text-muted-foreground">
              {visibleRows.length}
            </div>
            {columns.map((col) => {
              const agg = view.config.totals[col.id] ?? 'none';
              const result =
                agg === 'none'
                  ? ''
                  : aggregate(
                      col,
                      rows.map((r) => r.computed[col.id]),
                      agg,
                    );
              const options = AGGREGATES.filter((a) => {
                if (a.value === 'checked') return col.type === 'checkbox';
                if (['sum', 'avg', 'min', 'max'].includes(a.value))
                  return isNumeric(col.type) || col.type === 'formula';
                return true;
              });
              return (
                <DropdownMenu key={col.id}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="group/total flex min-w-0 items-center justify-end gap-1 border-r px-2 text-right hover:bg-accent"
                    >
                      {agg !== 'none' ? (
                        <>
                          <span className="text-muted-foreground">
                            {AGGREGATES.find((a) => a.value === agg)?.label}
                          </span>
                          <span
                            className="truncate font-medium tabular-nums"
                            data-testid={`total-${col.name}`}
                          >
                            {result}
                          </span>
                        </>
                      ) : (
                        <span className="invisible text-muted-foreground group-hover/total:visible">
                          Calcular
                        </span>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {options.map((a) => (
                      <DropdownMenuItem key={a.value} onSelect={() => setTotal(col, a.value)}>
                        {a.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
            <div />
          </div>
        </div>
      </div>
    </div>
  );
}
