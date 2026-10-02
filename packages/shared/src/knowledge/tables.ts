import { z } from 'zod';
import { formatDateES, todayISO } from '../dates';
import { parseFlexibleDate, splitList } from '../import';
import { formatMoney, formatNumber, parseDecimal } from '../money';
import { normalizeForSearch } from '../text';
import { optionalText, patchSchema, requiredText } from '../schemas/common';
import { evaluateFormula, FormulaError, type FormulaValue } from './formula';

/** Tipos de columna de las tablas personalizadas (sustituyen a Google Sheets). */
export const COLUMN_TYPES = [
  { value: 'text', label: 'Texto', icon: 'type' },
  { value: 'number', label: 'Número', icon: 'hash' },
  { value: 'currency', label: 'Moneda', icon: 'euro' },
  { value: 'percent', label: 'Porcentaje', icon: 'percent' },
  { value: 'date', label: 'Fecha', icon: 'calendar' },
  { value: 'checkbox', label: 'Casilla', icon: 'check-square' },
  { value: 'select', label: 'Selección', icon: 'circle-dot' },
  { value: 'multi_select', label: 'Selección múltiple', icon: 'tags' },
  { value: 'url', label: 'Enlace', icon: 'link' },
  { value: 'email', label: 'Correo electrónico', icon: 'at-sign' },
  { value: 'formula', label: 'Fórmula', icon: 'sigma' },
  { value: 'relation', label: 'Relación', icon: 'link-2' },
] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number]['value'];
const COLUMN_TYPE_VALUES = COLUMN_TYPES.map((c) => c.value) as [ColumnType, ...ColumnType[]];

/** Fichas de la app con las que se puede relacionar una fila. */
export const RELATION_TARGETS = [
  { value: 'game', label: 'Juegos' },
  { value: 'client', label: 'Clientes' },
  { value: 'project', label: 'Proyectos' },
  { value: 'job', label: 'Encargos' },
  { value: 'page', label: 'Páginas' },
  { value: 'glossary_term', label: 'Términos del glosario' },
] as const;

export const CHOICE_COLORS = [
  '#64748b',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const;

const choiceSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type ColumnChoice = z.infer<typeof choiceSchema>;

export const columnOptionsSchema = z
  .object({
    choices: z.array(choiceSchema).max(200).optional(),
    currency: z.string().length(3).optional(),
    decimals: z.number().int().min(0).max(6).optional(),
    formula: z.string().max(2000).optional(),
    /** Destino de una relación: un tipo de ficha o «table:<id>» (filas de otra tabla). */
    target: z.string().max(80).optional(),
  })
  .default({});
export type ColumnOptions = z.infer<typeof columnOptionsSchema>;

export const columnInputSchema = z.object({
  name: requiredText('Nombre de la columna', 120),
  type: z.enum(COLUMN_TYPE_VALUES).default('text'),
  options: columnOptionsSchema,
  width: z.number().int().min(60).max(1000).nullish(),
  position: z.number().optional(),
});
export const columnUpdateSchema = patchSchema(columnInputSchema);

export const tableInputSchema = z.object({
  name: requiredText('Nombre de la tabla', 200),
  icon: z.string().max(16).nullish(),
  description: optionalText(2000),
  gameId: z.string().max(64).nullish(),
});
export const tableUpdateSchema = patchSchema(tableInputSchema);

export const FILTER_OPERATORS = [
  { value: 'contains', label: 'contiene', types: ['text', 'url', 'email', 'formula'] },
  { value: 'not_contains', label: 'no contiene', types: ['text', 'url', 'email', 'formula'] },
  {
    value: 'eq',
    label: 'es',
    types: ['text', 'number', 'currency', 'percent', 'date', 'select', 'url', 'email', 'formula'],
  },
  {
    value: 'neq',
    label: 'no es',
    types: ['text', 'number', 'currency', 'percent', 'date', 'select', 'formula'],
  },
  { value: 'lt', label: 'menor que', types: ['number', 'currency', 'percent', 'formula'] },
  { value: 'gt', label: 'mayor que', types: ['number', 'currency', 'percent', 'formula'] },
  { value: 'before', label: 'antes de', types: ['date'] },
  { value: 'after', label: 'después de', types: ['date'] },
  { value: 'has', label: 'incluye', types: ['multi_select', 'relation'] },
  { value: 'has_not', label: 'no incluye', types: ['multi_select', 'relation'] },
  { value: 'checked', label: 'marcada', types: ['checkbox'] },
  { value: 'unchecked', label: 'sin marcar', types: ['checkbox'] },
  { value: 'empty', label: 'está vacío', types: ['*'] },
  { value: 'not_empty', label: 'no está vacío', types: ['*'] },
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number]['value'];

export function operatorsFor(type: ColumnType) {
  return FILTER_OPERATORS.filter(
    (o) =>
      (o.types as readonly string[]).includes(type) || (o.types as readonly string[]).includes('*'),
  );
}

export const AGGREGATES = [
  { value: 'none', label: 'Ninguno' },
  { value: 'count', label: 'Con valor' },
  { value: 'empty', label: 'Vacías' },
  { value: 'sum', label: 'Suma' },
  { value: 'avg', label: 'Media' },
  { value: 'min', label: 'Mínimo' },
  { value: 'max', label: 'Máximo' },
  { value: 'checked', label: 'Marcadas' },
] as const;
export type Aggregate = (typeof AGGREGATES)[number]['value'];

const filterSchema = z.object({
  columnId: z.string().min(1),
  op: z.enum(FILTER_OPERATORS.map((o) => o.value) as [FilterOperator, ...FilterOperator[]]),
  value: z.unknown().optional(),
});
export type ViewFilter = z.infer<typeof filterSchema>;

export const viewConfigSchema = z
  .object({
    filters: z.array(filterSchema).max(30).default([]),
    filterMode: z.enum(['and', 'or']).default('and'),
    sorts: z
      .array(z.object({ columnId: z.string().min(1), dir: z.enum(['asc', 'desc']) }))
      .max(5)
      .default([]),
    groupBy: z.string().nullish(),
    hidden: z.array(z.string()).max(200).default([]),
    totals: z
      .record(z.string(), z.enum(AGGREGATES.map((a) => a.value) as [Aggregate, ...Aggregate[]]))
      .default({}),
    /** Tablero: columna de selección o casilla que da las columnas del tablero. */
    boardColumnId: z.string().nullish(),
    /** Calendario: columna de fecha. */
    dateColumnId: z.string().nullish(),
  })
  .default({ filters: [], filterMode: 'and', sorts: [], hidden: [], totals: {} });
export type ViewConfig = z.infer<typeof viewConfigSchema>;

export const VIEW_TYPES = [
  { value: 'grid', label: 'Cuadrícula' },
  { value: 'board', label: 'Tablero' },
  { value: 'calendar', label: 'Calendario' },
] as const;
export type ViewType = (typeof VIEW_TYPES)[number]['value'];

export const viewInputSchema = z.object({
  name: requiredText('Nombre de la vista', 120),
  type: z.enum(['grid', 'board', 'calendar']).default('grid'),
  config: viewConfigSchema,
});
export const viewUpdateSchema = patchSchema(viewInputSchema);

export type CellValue = string | number | boolean | string[] | null;

export interface TableColumn {
  id: string;
  tableId: string;
  name: string;
  type: ColumnType;
  options: ColumnOptions;
  width: number | null;
  position: number;
}

export interface TableView {
  id: string;
  tableId: string;
  name: string;
  type: ViewType;
  config: ViewConfig;
  position: number;
}

export interface TableRow {
  id: string;
  tableId: string;
  values: Record<string, CellValue>;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomTable {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  gameId: string | null;
  rowCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomTableDetail extends CustomTable {
  columns: TableColumn[];
  views: TableView[];
}

/** Nombre de la relación resuelta para mostrarla (id → título). */
export type RelationLabels = Record<string, string>;

export function isEmptyValue(v: unknown): boolean {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

const TRUE_WORDS = new Set([
  'si',
  'sí',
  's',
  'yes',
  'y',
  'true',
  'verdadero',
  'x',
  '✓',
  '✔',
  '1',
  'hecho',
  'done',
]);
const FALSE_WORDS = new Set(['no', 'n', 'false', 'falso', '0', '']);

/**
 * Convierte el texto de una celda (al pegar o importar) al valor que guarda la columna.
 * Para las selecciones, devuelve también las opciones nuevas que haya que crear.
 */
export function coerceText(
  column: Pick<TableColumn, 'type' | 'options'>,
  raw: string,
  newId: () => string,
): { value: CellValue; newChoices?: ColumnChoice[]; invalid?: boolean } {
  const s = raw.trim();
  if (s === '') return { value: column.type === 'checkbox' ? false : null };
  switch (column.type) {
    case 'number':
    case 'percent': {
      const n = parseDecimal(s.replace('%', ''));
      return n == null ? { value: null, invalid: true } : { value: n };
    }
    case 'currency': {
      const n = parseDecimal(s.replace(/[A-Z]{3}/g, ''));
      return n == null ? { value: null, invalid: true } : { value: Math.round(n * 100) };
    }
    case 'date': {
      const d = parseFlexibleDate(s);
      return d ? { value: d } : { value: null, invalid: true };
    }
    case 'checkbox': {
      const w = s.toLowerCase();
      if (TRUE_WORDS.has(w)) return { value: true };
      if (FALSE_WORDS.has(w)) return { value: false };
      return { value: false, invalid: true };
    }
    case 'select':
    case 'multi_select': {
      const labels = column.type === 'select' ? [s] : splitList(s);
      const choices = [...(column.options.choices ?? [])];
      const created: ColumnChoice[] = [];
      const ids = labels.map((label) => {
        const key = normalizeForSearch(label);
        let c = choices.find((x) => normalizeForSearch(x.label) === key);
        if (!c) {
          c = {
            id: newId(),
            label,
            color: CHOICE_COLORS[(choices.length + 1) % CHOICE_COLORS.length]!,
          };
          choices.push(c);
          created.push(c);
        }
        return c.id;
      });
      const value = column.type === 'select' ? ids[0]! : [...new Set(ids)];
      return created.length ? { value, newChoices: created } : { value };
    }
    case 'formula':
      return { value: null };
    case 'relation':
      return { value: null, invalid: true };
    default:
      return { value: s };
  }
}

/** Valida y normaliza un valor que llega por la API para una columna. */
export function normalizeCellValue(
  column: Pick<TableColumn, 'type' | 'options'>,
  v: unknown,
): CellValue {
  if (v === undefined || v === null || v === '') return column.type === 'checkbox' ? false : null;
  switch (column.type) {
    case 'number':
    case 'percent': {
      const n = typeof v === 'number' ? v : parseDecimal(String(v));
      if (n == null || !Number.isFinite(n)) throw new Error('Número no válido');
      return n;
    }
    case 'currency': {
      if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error('Importe no válido');
      return v;
    }
    case 'date': {
      const d = parseFlexibleDate(v);
      if (!d) throw new Error('Fecha no válida');
      return d;
    }
    case 'checkbox':
      return Boolean(v);
    case 'select': {
      const id = String(v);
      if (!(column.options.choices ?? []).some((c) => c.id === id))
        throw new Error('Opción desconocida');
      return id;
    }
    case 'multi_select': {
      if (!Array.isArray(v)) throw new Error('Se esperaba una lista');
      const valid = new Set((column.options.choices ?? []).map((c) => c.id));
      return [...new Set(v.map(String))].filter((id) => valid.has(id));
    }
    case 'relation': {
      if (!Array.isArray(v)) throw new Error('Se esperaba una lista');
      return [...new Set(v.map(String))].slice(0, 200);
    }
    case 'formula':
      return null;
    default: {
      const s = String(v);
      if (s.length > 100_000) throw new Error('Texto demasiado largo');
      return s;
    }
  }
}

/** Valor de una columna tal y como lo ve una fórmula. */
function formulaInput(column: TableColumn, v: CellValue): FormulaValue {
  if (v == null) return null;
  if (column.type === 'currency' && typeof v === 'number') return v / 100;
  if (column.type === 'select')
    return column.options.choices?.find((c) => c.id === v)?.label ?? null;
  if (column.type === 'multi_select' && Array.isArray(v)) {
    return v
      .map((id) => column.options.choices?.find((c) => c.id === id)?.label ?? '')
      .filter(Boolean)
      .join(', ');
  }
  if (Array.isArray(v)) return v.length;
  return v;
}

/**
 * Calcula las columnas de fórmula de una fila. Las fórmulas pueden usar otras fórmulas; las
 * referencias circulares dan error.
 */
export function computeFormulas(
  columns: TableColumn[],
  values: Record<string, CellValue>,
  today = todayISO(),
): Record<string, { value: FormulaValue; error?: string }> {
  const byName = new Map(columns.map((c) => [normalizeForSearch(c.name), c]));
  const results: Record<string, { value: FormulaValue; error?: string }> = {};
  const visiting = new Set<string>();

  const valueOf = (col: TableColumn): FormulaValue => {
    if (col.type !== 'formula') return formulaInput(col, values[col.id] ?? null);
    const done = results[col.id];
    if (done) {
      if (done.error) throw new FormulaError(`Error en «${col.name}»`);
      return done.value;
    }
    if (visiting.has(col.id)) throw new FormulaError('Referencia circular');
    visiting.add(col.id);
    const r = evaluateFormula(
      col.options.formula ?? '',
      (name) => {
        const ref = byName.get(normalizeForSearch(name));
        if (!ref) throw new FormulaError(`No hay ninguna columna «${name}»`);
        return valueOf(ref);
      },
      { today },
    );
    visiting.delete(col.id);
    results[col.id] = r.ok ? { value: r.value } : { value: null, error: r.error };
    if (!r.ok) throw new FormulaError(r.error);
    return r.value;
  };

  for (const col of columns) {
    if (col.type !== 'formula' || results[col.id]) continue;
    try {
      valueOf(col);
    } catch (error) {
      if (!results[col.id]) {
        results[col.id] = { value: null, error: error instanceof Error ? error.message : 'Error' };
      }
      visiting.clear();
    }
  }
  return results;
}

/** Texto de una celda para mostrar, buscar, exportar o copiar. */
export function cellText(
  column: Pick<TableColumn, 'type' | 'options'>,
  v: CellValue | FormulaValue | undefined,
  relationLabels: RelationLabels = {},
): string {
  if (v == null || v === '') return '';
  switch (column.type) {
    case 'number':
      return typeof v === 'number' ? formatNumber(v, column.options.decimals ?? 2) : String(v);
    case 'percent':
      return typeof v === 'number'
        ? `${formatNumber(v, column.options.decimals ?? 2)} %`
        : String(v);
    case 'currency':
      return typeof v === 'number' ? formatMoney(v, column.options.currency ?? 'EUR') : String(v);
    case 'date':
      return typeof v === 'string' ? formatDateES(v) : String(v);
    case 'checkbox':
      return v ? 'Sí' : 'No';
    case 'select':
      return column.options.choices?.find((c) => c.id === v)?.label ?? '';
    case 'multi_select':
      return (Array.isArray(v) ? v : [])
        .map((id) => column.options.choices?.find((c) => c.id === id)?.label)
        .filter(Boolean)
        .join(', ');
    case 'relation':
      return (Array.isArray(v) ? v : []).map((id) => relationLabels[id] ?? '…').join(', ');
    case 'formula':
      if (typeof v === 'number') return formatNumber(v, column.options.decimals ?? 2);
      if (typeof v === 'boolean') return v ? 'Sí' : 'No';
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDateES(v);
      return String(v);
    default:
      return String(v);
  }
}

/** Valor comparable para ordenar. */
function sortKey(column: TableColumn, v: unknown): number | string | null {
  if (isEmptyValue(v)) return null;
  switch (column.type) {
    case 'number':
    case 'percent':
    case 'currency':
      return typeof v === 'number' ? v : null;
    case 'checkbox':
      return v ? 1 : 0;
    case 'select': {
      const i = column.options.choices?.findIndex((c) => c.id === v) ?? -1;
      return i < 0 ? null : i;
    }
    case 'formula':
      return typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : String(v);
    default:
      return Array.isArray(v) ? cellText(column, v as CellValue) : String(v);
  }
}

export function compareCells(column: TableColumn, a: unknown, b: unknown): number {
  const ka = sortKey(column, a);
  const kb = sortKey(column, b);
  if (ka == null && kb == null) return 0;
  if (ka == null) return 1; // vacías al final
  if (kb == null) return -1;
  if (typeof ka === 'number' && typeof kb === 'number') return ka - kb;
  return String(ka).localeCompare(String(kb), 'es', { numeric: true, sensitivity: 'base' });
}

export function matchesFilter(
  column: TableColumn,
  f: ViewFilter,
  v: unknown,
  labels: RelationLabels = {},
): boolean {
  const target = f.value;
  switch (f.op) {
    case 'empty':
      return isEmptyValue(v) || v === false;
    case 'not_empty':
      return !isEmptyValue(v) && v !== false;
    case 'checked':
      return v === true;
    case 'unchecked':
      return v !== true;
    case 'contains':
    case 'not_contains': {
      if (isEmptyValue(target)) return true;
      const has = normalizeForSearch(cellText(column, v as CellValue, labels)).includes(
        normalizeForSearch(String(target)),
      );
      return f.op === 'contains' ? has : !has;
    }
    case 'has':
    case 'has_not': {
      if (isEmptyValue(target)) return true;
      const has = Array.isArray(v) && v.includes(String(target));
      return f.op === 'has' ? has : !has;
    }
    case 'eq':
    case 'neq': {
      if (isEmptyValue(target)) return true;
      let same: boolean;
      if (['number', 'percent', 'currency'].includes(column.type) || typeof v === 'number') {
        const t = typeof target === 'number' ? target : parseDecimal(String(target));
        same = typeof v === 'number' && t != null && Math.abs(v - t) < 1e-9;
      } else if (column.type === 'select' || column.type === 'date') {
        same = v === target;
      } else {
        same =
          normalizeForSearch(cellText(column, v as CellValue, labels)) ===
          normalizeForSearch(String(target));
      }
      return f.op === 'eq' ? same : !same;
    }
    case 'lt':
    case 'gt': {
      const t = typeof target === 'number' ? target : parseDecimal(String(target ?? ''));
      if (t == null) return true;
      if (typeof v !== 'number') return false;
      return f.op === 'lt' ? v < t : v > t;
    }
    case 'before':
    case 'after': {
      if (typeof target !== 'string' || !target) return true;
      if (typeof v !== 'string') return false;
      return f.op === 'before' ? v < target : v > target;
    }
  }
  return true;
}

export interface ComputedRow extends TableRow {
  /** Valores con las fórmulas ya calculadas. */
  computed: Record<string, CellValue | FormulaValue>;
  errors: Record<string, string>;
}

export function computeRows(
  columns: TableColumn[],
  rows: TableRow[],
  today = todayISO(),
): ComputedRow[] {
  const hasFormulas = columns.some((c) => c.type === 'formula');
  return rows.map((r) => {
    if (!hasFormulas) return { ...r, computed: r.values, errors: {} };
    const f = computeFormulas(columns, r.values, today);
    const computed: Record<string, CellValue | FormulaValue> = { ...r.values };
    const errors: Record<string, string> = {};
    for (const [id, res] of Object.entries(f)) {
      computed[id] = res.value;
      if (res.error) errors[id] = res.error;
    }
    return { ...r, computed, errors };
  });
}

/** Aplica los filtros y el orden de una vista. */
export function applyView(
  columns: TableColumn[],
  rows: ComputedRow[],
  config: ViewConfig,
  options: { search?: string; labels?: RelationLabels } = {},
): ComputedRow[] {
  const byId = new Map(columns.map((c) => [c.id, c]));
  const filters = config.filters.filter((f) => byId.has(f.columnId));
  const q = options.search ? normalizeForSearch(options.search) : '';
  let out = rows.filter((r) => {
    if (filters.length) {
      const results = filters.map((f) =>
        matchesFilter(byId.get(f.columnId)!, f, r.computed[f.columnId], options.labels),
      );
      const ok = config.filterMode === 'or' ? results.some(Boolean) : results.every(Boolean);
      if (!ok) return false;
    }
    if (q) {
      return columns.some((c) =>
        normalizeForSearch(cellText(c, r.computed[c.id] as CellValue, options.labels)).includes(q),
      );
    }
    return true;
  });
  const sorts = config.sorts.filter((s) => byId.has(s.columnId));
  if (sorts.length) {
    out = [...out].sort((a, b) => {
      for (const s of sorts) {
        const col = byId.get(s.columnId)!;
        const va = a.computed[s.columnId];
        const vb = b.computed[s.columnId];
        // Las vacías siempre al final, también en orden descendente.
        if (isEmptyValue(va) !== isEmptyValue(vb)) return isEmptyValue(va) ? 1 : -1;
        const c = compareCells(col, va, vb);
        if (c !== 0) return s.dir === 'asc' ? c : -c;
      }
      return a.position - b.position;
    });
  }
  return out;
}

export function aggregate(column: TableColumn, values: unknown[], agg: Aggregate): string {
  if (agg === 'none') return '';
  const filled = values.filter(
    (v) => !isEmptyValue(v) && !(column.type === 'checkbox' && v === false),
  );
  if (agg === 'count') return formatNumber(filled.length, 0);
  if (agg === 'empty') return formatNumber(values.length - filled.length, 0);
  if (agg === 'checked') return formatNumber(values.filter((v) => v === true).length, 0);
  const nums = values.filter((v): v is number => typeof v === 'number');
  if (nums.length === 0) return '—';
  let result: number;
  if (agg === 'sum') result = nums.reduce((s, n) => s + n, 0);
  else if (agg === 'avg') result = nums.reduce((s, n) => s + n, 0) / nums.length;
  else if (agg === 'min') result = Math.min(...nums);
  else result = Math.max(...nums);
  if (column.type === 'currency')
    return formatMoney(Math.round(result), column.options.currency ?? 'EUR');
  return cellText({ ...column, type: column.type === 'formula' ? 'number' : column.type }, result);
}

/**
 * Propone el tipo de una columna a partir de sus valores (al importar Excel o CSV).
 * Exige que todos los valores no vacíos encajen, para no perder datos.
 */
export function detectColumnType(values: unknown[]): {
  type: ColumnType;
  currency?: string;
} {
  const s = values
    .map((v) =>
      v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? '' : String(v).trim(),
    )
    .filter((v) => v !== '');
  if (s.length === 0) return { type: 'text' };
  const all = (re: RegExp) => s.every((v) => re.test(v));
  if (
    s.every((v) => TRUE_WORDS.has(v.toLowerCase()) || FALSE_WORDS.has(v.toLowerCase())) &&
    s.some((v) => !/^[01]$/.test(v))
  ) {
    return { type: 'checkbox' };
  }
  if (all(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/) || all(/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/))
    return { type: 'date' };
  if (all(/^-?[\d.,\s]+\s?%$/)) return { type: 'percent' };
  const cur = /^(-?[\d.,\s]+\s?(€|EUR|\$|USD|£|GBP|₩|KRW)|(€|\$|£|₩)\s?-?[\d.,\s]+)$/;
  if (all(cur)) {
    const sym = s.map((v) => /(€|EUR|\$|USD|£|GBP|₩|KRW)/.exec(v)?.[1]);
    const code = { '€': 'EUR', $: 'USD', '£': 'GBP', '₩': 'KRW' }[sym[0] as string] ?? sym[0];
    return { type: 'currency', currency: code ?? 'EUR' };
  }
  if (s.every((v) => /^-?[\d.,]+$/.test(v) && parseDecimal(v) != null)) return { type: 'number' };
  if (all(/^https?:\/\/\S+$/i)) return { type: 'url' };
  if (all(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return { type: 'email' };
  const distinct = new Set(s.map((v) => v.toLowerCase()));
  if (
    s.length >= 4 &&
    distinct.size <= Math.min(12, Math.ceil(s.length / 2)) &&
    s.every((v) => v.length <= 40)
  ) {
    return { type: 'select' };
  }
  return { type: 'text' };
}
