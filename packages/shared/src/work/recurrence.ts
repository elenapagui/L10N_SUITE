import { addDaysISO, parseISODate, toISODate } from '../dates';

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  /** Mensual: el mismo día del mes o el último día laborable del mes. */
  monthlyMode?: 'same_day' | 'last_weekday';
  /**
   * Día del mes de referencia (mensual y anual): un 31 que cae en un mes más corto vuelve al 31
   * en cuanto se puede (31/01 → 28/02 → 31/03), en lugar de quedarse en el 28.
   */
  dayOfMonth?: number;
}

export const RECURRENCE_LABELS: Record<RecurrenceRule['freq'], string> = {
  daily: 'Cada día',
  weekly: 'Cada semana',
  monthly: 'Cada mes',
  yearly: 'Cada año',
};

export function describeRecurrence(rule: RecurrenceRule | null | undefined): string {
  if (!rule) return 'No se repite';
  const base =
    rule.interval > 1
      ? `Cada ${rule.interval} ${{ daily: 'días', weekly: 'semanas', monthly: 'meses', yearly: 'años' }[rule.freq]}`
      : RECURRENCE_LABELS[rule.freq];
  return rule.freq === 'monthly' && rule.monthlyMode === 'last_weekday'
    ? `${base} (último día laborable)`
    : base;
}

function lastWeekdayOfMonth(year: number, month: number): Date {
  const d = new Date(year, month + 1, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

/** Día que se repite: el de referencia si la fecha actual es un último de mes recortado. */
function anchorDay(d: Date, rule: RecurrenceRule): number {
  const day = d.getDate();
  const a = rule.dayOfMonth;
  return a && a > day && day === daysInMonth(d.getFullYear(), d.getMonth()) ? a : day;
}

/** Regla que se guarda en la siguiente repetición (con su día de referencia). */
export function nextRecurrenceRule(dateISO: string, rule: RecurrenceRule): RecurrenceRule {
  if (rule.freq === 'daily' || rule.freq === 'weekly' || rule.monthlyMode === 'last_weekday')
    return rule;
  return { ...rule, dayOfMonth: anchorDay(parseISODate(dateISO), rule) };
}

/** Fecha de la siguiente repetición a partir de la fecha actual de la tarea. */
export function nextOccurrence(dateISO: string, rule: RecurrenceRule): string {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  switch (rule.freq) {
    case 'daily':
      return addDaysISO(dateISO, interval);
    case 'weekly':
      return addDaysISO(dateISO, 7 * interval);
    case 'monthly': {
      const d = parseISODate(dateISO);
      if (rule.monthlyMode === 'last_weekday') {
        return toISODate(lastWeekdayOfMonth(d.getFullYear(), d.getMonth() + interval));
      }
      const day = anchorDay(d, rule);
      const target = new Date(d.getFullYear(), d.getMonth() + interval, 1);
      target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())));
      return toISODate(target);
    }
    case 'yearly': {
      const d = parseISODate(dateISO);
      const target = new Date(d.getFullYear() + interval, d.getMonth(), 1);
      target.setDate(
        Math.min(anchorDay(d, rule), daysInMonth(target.getFullYear(), target.getMonth())),
      );
      return toISODate(target);
    }
  }
}
