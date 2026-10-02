import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AtSign,
  Calendar,
  CheckSquare,
  CircleDot,
  Euro,
  Hash,
  Link as LinkIcon,
  Link2,
  Percent,
  Plus,
  Search,
  Sigma,
  Tags,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  CHOICE_COLORS,
  CURRENCIES,
  cellText,
  entityLabel,
  formatNumber,
  normalizeForSearch,
  parseDecimal,
  type CellValue,
  type ColumnChoice,
  type ColumnType,
  type FormulaValue,
  type RelationLabels,
  type SearchResult,
  type TableColumn,
  type TableRow,
} from '@l10n/shared';
import { ColorChip } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useTableRows, useTable } from './hooks';

export const COLUMN_ICONS: Record<ColumnType, LucideIcon> = {
  text: Type,
  number: Hash,
  currency: Euro,
  percent: Percent,
  date: Calendar,
  checkbox: CheckSquare,
  select: CircleDot,
  multi_select: Tags,
  url: LinkIcon,
  email: AtSign,
  formula: Sigma,
  relation: Link2,
};

export const isNumeric = (t: ColumnType) => t === 'number' || t === 'currency' || t === 'percent';

export function newChoiceId(): string {
  return `opt-${Math.random().toString(36).slice(2, 10)}`;
}

/** Abre un enlace fuera de la app (en la de escritorio, en el navegador predeterminado). */
function openExternal(url: string) {
  window.open(url, '_blank', 'noopener');
}

/** Valor de una celda, sin edición. */
export function CellDisplay({
  column,
  value,
  error,
  labels,
  wrap,
}: {
  column: TableColumn;
  value: CellValue | FormulaValue | undefined;
  error?: string;
  labels: RelationLabels;
  wrap?: boolean;
}) {
  if (error) {
    return (
      <span className="font-mono text-xs text-destructive" title={error}>
        #ERROR
      </span>
    );
  }
  if (value == null || value === '') return null;
  switch (column.type) {
    case 'checkbox':
      return (
        <span className="flex w-full justify-center">
          <Checkbox
            checked={value === true}
            tabIndex={-1}
            className="pointer-events-none"
            aria-hidden
          />
        </span>
      );
    case 'select': {
      const c = column.options.choices?.find((x) => x.id === value);
      return c ? <ColorChip color={c.color}>{c.label}</ColorChip> : null;
    }
    case 'multi_select': {
      const ids = Array.isArray(value) ? value : [];
      return (
        <span className={cn('flex gap-1', wrap ? 'flex-wrap' : 'overflow-hidden')}>
          {ids.map((id) => {
            const c = column.options.choices?.find((x) => x.id === id);
            return c ? (
              <ColorChip key={id} color={c.color} className="shrink-0">
                {c.label}
              </ColorChip>
            ) : null;
          })}
        </span>
      );
    }
    case 'relation': {
      const ids = Array.isArray(value) ? value : [];
      return (
        <span className={cn('flex gap-1', wrap ? 'flex-wrap' : 'overflow-hidden')}>
          {ids.map((id) => (
            <span key={id} className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">
              {labels[id] ?? '…'}
            </span>
          ))}
        </span>
      );
    }
    case 'url':
      return (
        <a
          href={String(value)}
          className="truncate text-primary underline-offset-2 hover:underline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openExternal(String(value));
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {String(value)}
        </a>
      );
    case 'email':
      return <span className="truncate">{String(value)}</span>;
    default: {
      const text = cellText(column, value as CellValue, labels);
      const numeric =
        isNumeric(column.type) || (column.type === 'formula' && typeof value === 'number');
      return (
        <span
          className={cn(
            wrap ? 'whitespace-pre-wrap break-words' : 'truncate',
            numeric && 'ml-auto tabular-nums',
          )}
        >
          {text}
        </span>
      );
    }
  }
}

/** Texto inicial del editor de una celda. */
export function editText(column: TableColumn, value: CellValue | undefined): string {
  if (value == null) return '';
  if (column.type === 'currency' && typeof value === 'number')
    return formatNumber(value / 100, 2).replace(/\s/g, '');
  if ((column.type === 'number' || column.type === 'percent') && typeof value === 'number') {
    return String(value).replace('.', ',');
  }
  return String(value);
}

/** Interpreta el texto escrito en el editor. `undefined` = no válido. */
export function parseEdit(column: TableColumn, text: string): CellValue | undefined {
  const s = text.trim();
  if (s === '') return null;
  if (column.type === 'number' || column.type === 'percent') {
    const n = parseDecimal(s.replace('%', ''));
    return n == null ? undefined : n;
  }
  if (column.type === 'currency') {
    const n = parseDecimal(s);
    return n == null ? undefined : Math.round(n * 100);
  }
  return column.type === 'text' ? text : s;
}

/** Editor en línea para texto, números, fechas, enlaces y correos. */
export function TextCellEditor({
  column,
  initial,
  onCommit,
  onCancel,
}: {
  column: TableColumn;
  initial: string;
  onCommit: (text: string, move: 'down' | 'right' | 'none') => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const done = useRef(false);
  // Si el editor desaparece sin perder el foco (p. ej., al llegar datos nuevos), se guarda igualmente.
  const latest = useRef({ text, onCommit });
  latest.current = { text, onCommit };
  useEffect(
    () => () => {
      if (!done.current) {
        done.current = true;
        latest.current.onCommit(latest.current.text, 'none');
      }
    },
    [],
  );
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (column.type !== 'date') {
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
  }, [column.type]);
  const commit = (move: 'down' | 'right' | 'none') => {
    if (done.current) return;
    done.current = true;
    onCommit(text, move);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      done.current = true;
      onCancel();
    } else if (e.key === 'Enter' && !(column.type === 'text' && e.shiftKey)) {
      e.preventDefault();
      commit('down');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commit('right');
    }
  };
  const multiline = column.type === 'text' && (text.includes('\n') || text.length > 40);
  if (multiline) {
    return (
      <Textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit('none')}
        rows={Math.min(8, Math.max(3, text.split('\n').length))}
        className="absolute left-0 top-0 z-20 min-h-full w-[max(100%,320px)] rounded-sm shadow-lg"
      />
    );
  }
  return (
    <Input
      ref={ref}
      type={column.type === 'date' ? 'date' : 'text'}
      inputMode={isNumeric(column.type) ? 'decimal' : undefined}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => commit('none')}
      className={cn(
        'absolute inset-0 z-20 h-full rounded-sm px-2 shadow-lg',
        isNumeric(column.type) && 'text-right',
      )}
    />
  );
}

/** Lista de opciones de una selección (con búsqueda y alta de opciones nuevas). */
export function ChoicePicker({
  column,
  value,
  onChange,
}: {
  column: TableColumn;
  value: CellValue | undefined;
  onChange: (value: CellValue, newChoices?: ColumnChoice[]) => void;
}) {
  const multi = column.type === 'multi_select';
  const [q, setQ] = useState('');
  const choices = column.options.choices ?? [];
  const selected = new Set(
    multi ? (Array.isArray(value) ? value : []) : value ? [String(value)] : [],
  );
  const filtered = choices.filter((c) =>
    normalizeForSearch(c.label).includes(normalizeForSearch(q)),
  );
  const exact = choices.some((c) => normalizeForSearch(c.label) === normalizeForSearch(q.trim()));
  const toggle = (id: string, extra?: ColumnChoice[]) => {
    if (!multi) {
      onChange(selected.has(id) ? null : id, extra);
      return;
    }
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next], extra);
  };
  return (
    <div className="grid gap-2" onKeyDown={(e) => e.stopPropagation()}>
      <Input
        autoFocus
        placeholder={multi ? 'Buscar o crear opciones…' : 'Buscar o crear una opción…'}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (filtered[0] && (exact || !q.trim())) toggle(filtered[0].id);
            else if (q.trim()) {
              const c = {
                id: newChoiceId(),
                label: q.trim(),
                color: CHOICE_COLORS[(choices.length + 1) % CHOICE_COLORS.length]!,
              };
              toggle(c.id, [c]);
              setQ('');
            }
          }
        }}
      />
      <ul className="max-h-60 overflow-y-auto">
        {filtered.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => toggle(c.id)}
            >
              {multi && (
                <Checkbox
                  checked={selected.has(c.id)}
                  tabIndex={-1}
                  className="pointer-events-none"
                />
              )}
              <ColorChip color={c.color}>{c.label}</ColorChip>
              {!multi && selected.has(c.id) && (
                <span className="ml-auto text-xs text-muted-foreground">Elegida</span>
              )}
            </button>
          </li>
        ))}
        {q.trim() && !exact && (
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                const c = {
                  id: newChoiceId(),
                  label: q.trim(),
                  color: CHOICE_COLORS[(choices.length + 1) % CHOICE_COLORS.length]!,
                };
                toggle(c.id, [c]);
                setQ('');
              }}
            >
              <Plus className="size-4" /> Crear «{q.trim()}»
            </button>
          </li>
        )}
        {!filtered.length && !q.trim() && (
          <li className="px-2 py-1.5 text-sm text-muted-foreground">
            Escribe para crear la primera opción.
          </li>
        )}
      </ul>
      {!multi && value != null && (
        <button
          type="button"
          className="text-left text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onChange(null)}
        >
          Vaciar
        </button>
      )}
    </div>
  );
}

/** Buscador de fichas o filas para una columna de relación. */
export function RelationPicker({
  column,
  value,
  labels,
  onChange,
}: {
  column: TableColumn;
  value: CellValue | undefined;
  labels: RelationLabels;
  onChange: (ids: string[], labels: RelationLabels) => void;
}) {
  const target = column.options.target ?? 'game';
  const otherTableId = target.startsWith('table:') ? target.slice(6) : '';
  const other = useTable(otherTableId);
  const otherRows = useTableRows(otherTableId);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const ids = Array.isArray(value) ? value : [];

  useEffect(() => {
    if (otherTableId) return;
    const handle = window.setTimeout(() => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      void api<SearchResult[]>('/search', { query: { q, types: target, limit: 20 } }).then(
        setResults,
      );
    }, 150);
    return () => window.clearTimeout(handle);
  }, [q, target, otherTableId]);

  const rowOptions = useMemo(() => {
    if (!otherTableId || !other.data || !otherRows.data) return [];
    const first = other.data.columns[0];
    return otherRows.data.rows
      .map((r: TableRow) => ({
        entityId: r.id,
        title: first ? cellText(first, r.values[first.id] ?? null) || 'Sin título' : 'Fila',
      }))
      .filter((r) => !q.trim() || normalizeForSearch(r.title).includes(normalizeForSearch(q)))
      .slice(0, 50);
  }, [otherTableId, other.data, otherRows.data, q]);

  const options = otherTableId
    ? rowOptions
    : results.map((r) => ({ entityId: r.entityId, title: r.title }));
  const toggle = (id: string, title: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    onChange(next, { [id]: title });
  };

  return (
    <div className="grid gap-2" onKeyDown={(e) => e.stopPropagation()}>
      {ids.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ids.map((id) => (
            <span
              key={id}
              className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs"
            >
              {labels[id] ?? '…'}
              <button
                type="button"
                aria-label="Quitar"
                onClick={() =>
                  onChange(
                    ids.filter((x) => x !== id),
                    {},
                  )
                }
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
        <Input
          autoFocus
          className="pl-8"
          placeholder={
            otherTableId
              ? `Buscar en «${other.data?.name ?? 'la tabla'}»…`
              : `Buscar ${entityLabel(target).toLowerCase()}…`
          }
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <ul className="max-h-60 overflow-y-auto">
        {options.map((o) => (
          <li key={o.entityId}>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => toggle(o.entityId, o.title)}
            >
              <Checkbox
                checked={ids.includes(o.entityId)}
                tabIndex={-1}
                className="pointer-events-none"
              />
              <span className="truncate">{o.title}</span>
            </button>
          </li>
        ))}
        {!otherTableId && !q.trim() && (
          <li className="px-2 py-1.5 text-sm text-muted-foreground">Escribe para buscar.</li>
        )}
      </ul>
    </div>
  );
}

/** Editor de un campo en el formulario de la fila (panel lateral). */
export function FieldEditor({
  column,
  value,
  computed,
  error,
  labels,
  onChange,
}: {
  column: TableColumn;
  value: CellValue | undefined;
  computed?: CellValue | FormulaValue;
  error?: string;
  labels: RelationLabels;
  onChange: (
    value: CellValue,
    extra?: { newChoices?: ColumnChoice[]; labels?: RelationLabels },
  ) => void;
}) {
  const [text, setText] = useState(editText(column, value));
  useEffect(() => setText(editText(column, value)), [column, value]);
  switch (column.type) {
    case 'formula':
      return (
        <div className="flex min-h-9 items-center rounded-md bg-muted/40 px-3 text-sm">
          <CellDisplay column={column} value={computed} error={error} labels={labels} />
        </div>
      );
    case 'checkbox':
      return <Checkbox checked={value === true} onCheckedChange={(v) => onChange(v === true)} />;
    case 'select':
    case 'multi_select':
      return (
        <div className="rounded-md border p-2">
          <ChoicePicker
            column={column}
            value={value}
            onChange={(v, newChoices) => onChange(v, { newChoices })}
          />
        </div>
      );
    case 'relation':
      return (
        <div className="rounded-md border p-2">
          <RelationPicker
            column={column}
            value={value}
            labels={labels}
            onChange={(ids, l) => onChange(ids, { labels: l })}
          />
        </div>
      );
    case 'text':
      return (
        <Textarea
          value={text}
          rows={Math.min(10, Math.max(2, text.split('\n').length))}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== editText(column, value) && onChange(text || null)}
        />
      );
    default: {
      const commit = () => {
        if (text === editText(column, value)) return;
        const v = parseEdit(column, text);
        if (v === undefined) {
          setText(editText(column, value));
          return;
        }
        onChange(v);
      };
      return (
        <div className="relative">
          <Input
            type={column.type === 'date' ? 'date' : column.type === 'email' ? 'email' : 'text'}
            inputMode={isNumeric(column.type) ? 'decimal' : undefined}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={cn(isNumeric(column.type) && 'pr-12 text-right')}
          />
          {(column.type === 'currency' || column.type === 'percent') && (
            <span className="pointer-events-none absolute right-3 top-2 text-sm text-muted-foreground">
              {column.type === 'percent'
                ? '%'
                : (CURRENCIES.find((c) => c.code === column.options.currency)?.code ?? 'EUR')}
            </span>
          )}
        </div>
      );
    }
  }
}
