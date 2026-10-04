import { parseISODate, toISODate } from '../dates';

/** Periodo para ver totales: todo, un año, un trimestre o un mes. */
export type PeriodKind = 'all' | 'year' | 'quarter' | 'month';

export interface Period {
  kind: PeriodKind;
  /** Un día cualquiera dentro del periodo (AAAA-MM-DD). */
  anchor: string;
}

export interface PeriodRange {
  /** Primer día (incluido). */
  from: string;
  /** Último día (incluido). */
  to: string;
  label: string;
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export const PERIOD_KINDS: { value: PeriodKind; label: string }[] = [
  { value: 'all', label: 'Total' },
  { value: 'year', label: 'Año' },
  { value: 'quarter', label: 'Trimestre' },
  { value: 'month', label: 'Mes' },
];

/** Primer y último día del periodo, o null para «Total». */
export function periodRange(p: Period): PeriodRange | null {
  if (p.kind === 'all') return null;
  const d = parseISODate(p.anchor);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (p.kind === 'year') return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
  if (p.kind === 'quarter') {
    const q = Math.floor(m / 3);
    return {
      from: toISODate(new Date(y, q * 3, 1)),
      to: toISODate(new Date(y, q * 3 + 3, 0)),
      label: `${q + 1}.er trimestre de ${y}`.replace('2.er', '2.º').replace('4.er', '4.º'),
    };
  }
  return {
    from: toISODate(new Date(y, m, 1)),
    to: toISODate(new Date(y, m + 1, 0)),
    label: `${MONTHS[m]} de ${y}`,
  };
}

/** El periodo anterior (−1) o siguiente (+1) del mismo tipo. */
export function shiftPeriod(p: Period, delta: number): Period {
  if (p.kind === 'all') return p;
  const d = parseISODate(p.anchor);
  const months = p.kind === 'year' ? 12 : p.kind === 'quarter' ? 3 : 1;
  return {
    kind: p.kind,
    anchor: toISODate(new Date(d.getFullYear(), d.getMonth() + delta * months, 1)),
  };
}

export function inPeriod(date: string | null | undefined, range: PeriodRange | null): boolean {
  if (!range) return true;
  if (!date) return false;
  const day = date.slice(0, 10);
  return day >= range.from && day <= range.to;
}

/** ¿Se solapan dos intervalos de fechas (incluidos)? */
export function overlapsPeriod(
  start: string | null | undefined,
  end: string | null | undefined,
  range: PeriodRange | null,
): boolean {
  if (!range) return true;
  const s = (start ?? end)?.slice(0, 10);
  const e = (end ?? start)?.slice(0, 10);
  if (!s || !e) return false;
  return s <= range.to && e >= range.from;
}

/**
 * Fecha de un encargo para los periodos: la de entrega real; si no, la prevista; si no, la de
 * recepción; si no, la de alta.
 */
export function jobDate(j: {
  deliveredAt?: string | null;
  dueDate?: string | null;
  receivedAt?: string | null;
  createdAt?: string | null;
}): string | null {
  return (j.deliveredAt ?? j.dueDate ?? j.receivedAt ?? j.createdAt)?.slice(0, 10) ?? null;
}
