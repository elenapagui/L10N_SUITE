import { diffDaysISO, formatDateES, todayISO } from '@l10n/shared';

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 60) return seconds ? '< 1 min' : '0 min';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatHours(seconds: number): string {
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(seconds / 3600)} h`;
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'normal' | 'none';

export function dueTone(date: string | null | undefined, done = false): DueTone {
  if (!date || done) return 'none';
  const d = diffDaysISO(todayISO(), date);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d <= 2) return 'soon';
  return 'normal';
}

/** «Hoy», «Mañana», «Ayer», «Hace 3 días», «En 5 días» o la fecha. */
export function relativeDate(date: string | null | undefined): string {
  if (!date) return 'Sin fecha';
  const d = diffDaysISO(todayISO(), date);
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  if (d === -1) return 'Ayer';
  if (d < 0 && d > -7) return `Hace ${-d} días`;
  if (d > 0 && d < 7) {
    const s = new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(
      new Date(`${date}T12:00:00`),
    );
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return formatDateES(date);
}

export const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: 'text-destructive font-medium',
  today: 'text-amber-600 dark:text-warning font-medium',
  soon: 'text-amber-600/90 dark:text-warning/90',
  normal: 'text-muted-foreground',
  none: 'text-muted-foreground',
};
