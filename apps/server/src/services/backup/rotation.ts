import type { BackupKind } from '@l10n/shared';

export interface BackupPolicy {
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
}

export interface RotatableBackup {
  fileName: string;
  kind: BackupKind;
  createdAt: string;
}

export const KEEP_MANUAL = 20;
export const KEEP_SAFETY = 5;

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Semana ISO 8601 («2026-W40»). */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** De cada grupo se queda la copia más reciente; y solo los `count` grupos más recientes. */
function keepNewestPerBucket(
  sortedDesc: RotatableBackup[],
  keyOf: (d: Date) => string,
  count: number,
  keep: Set<string>,
): void {
  if (count <= 0) return;
  const seen = new Set<string>();
  for (const b of sortedDesc) {
    const key = keyOf(new Date(b.createdAt));
    if (seen.has(key)) continue;
    seen.add(key);
    keep.add(b.fileName);
    if (seen.size >= count) break;
  }
}

/**
 * Rotación «abuelo-padre-hijo»: la copia más reciente de cada uno de los últimos N días,
 * N semanas y N meses. Las manuales y las de seguridad (antes de migrar, restaurar,
 * importar o sincronizar) se conservan aparte.
 */
export function selectBackupsToDelete(backups: RotatableBackup[], policy: BackupPolicy): string[] {
  const sorted = [...backups].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const keep = new Set<string>();

  const regular = sorted.filter((b) => b.kind === 'auto' || b.kind === 'close');
  if (regular[0]) keep.add(regular[0].fileName);
  keepNewestPerBucket(regular, localDayKey, policy.keepDaily, keep);
  keepNewestPerBucket(regular, isoWeekKey, policy.keepWeekly, keep);
  keepNewestPerBucket(regular, monthKey, policy.keepMonthly, keep);

  sorted
    .filter((b) => b.kind === 'manual')
    .slice(0, KEEP_MANUAL)
    .forEach((b) => keep.add(b.fileName));

  for (const kind of ['pre-migration', 'pre-restore', 'pre-import', 'pre-sync'] as const) {
    sorted
      .filter((b) => b.kind === kind)
      .slice(0, KEEP_SAFETY)
      .forEach((b) => keep.add(b.fileName));
  }

  return sorted.filter((b) => !keep.has(b.fileName)).map((b) => b.fileName);
}
