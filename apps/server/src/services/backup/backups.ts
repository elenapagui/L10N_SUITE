import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import type { BackupInfo, BackupKind } from '@l10n/shared';
import type { AppContext } from '../../context';
import { checkFileIntegrity } from '../../db/connection';
import { migrationCount, schemaVersion } from '../../db/migrate';
import Database from 'better-sqlite3';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { ensureDir, isInside, removeIfExists } from '../../lib/fs';
import { newId } from '../../lib/ids';
import { getSettings, readBackupDirFallback } from '../settings';
import { selectBackupsToDelete } from './rotation';

const KINDS: BackupKind[] = [
  'auto',
  'manual',
  'pre-migration',
  'close',
  'pre-restore',
  'pre-import',
  'pre-sync',
];
const NAME_RE =
  /^l10n-(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})-(\d{3})_([a-z-]+)\.sqlite\.gz$/;
export const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function backupsDir(ctx: AppContext): string {
  const configured =
    ctx.integrity === 'ok' ? getSettings(ctx).backups.directory : readBackupDirFallback(ctx);
  return ensureDir(
    configured && configured.trim() !== '' ? configured : ctx.config.defaultBackupsDir,
  );
}

export function backupFileName(date: Date, kind: BackupKind): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `l10n-${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}_${p(
    date.getUTCHours(),
  )}-${p(date.getUTCMinutes())}-${p(date.getUTCSeconds())}-${p(date.getUTCMilliseconds(), 3)}_${kind}.sqlite.gz`;
}

export function parseBackupFileName(
  fileName: string,
): { kind: BackupKind; createdAt: string } | null {
  const m = NAME_RE.exec(fileName);
  if (!m) return null;
  const kind = m[8] as BackupKind;
  if (!KINDS.includes(kind)) return null;
  const [, y, mo, d, h, mi, s, ms] = m.map(Number);
  const date = new Date(Date.UTC(y!, mo! - 1, d!, h!, mi!, s!, ms!));
  return { kind, createdAt: date.toISOString() };
}

export function listBackups(ctx: AppContext): BackupInfo[] {
  const dir = backupsDir(ctx);
  const items: BackupInfo[] = [];
  for (const fileName of fs.readdirSync(dir)) {
    const parsed = parseBackupFileName(fileName);
    if (!parsed) continue;
    const stat = fs.statSync(path.join(dir, fileName));
    items.push({ fileName, kind: parsed.kind, createdAt: parsed.createdAt, size: stat.size });
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Copia instantánea y coherente de la base de datos (API de copia de SQLite) en `dest`. */
export async function snapshotDatabase(ctx: AppContext, dest: string): Promise<void> {
  ensureDir(path.dirname(dest));
  removeIfExists(dest);
  await ctx.sqlite.backup(dest);
  if (!checkFileIntegrity(dest)) {
    removeIfExists(dest);
    throw new Error('La copia generada no ha superado la comprobación de integridad.');
  }
}

/** Copia a la carpeta de copias los adjuntos que aún no estén allí (son inmutables). */
export function mirrorAttachments(ctx: AppContext, dir: string): number {
  const source = ctx.config.attachmentsDir;
  const target = path.join(dir, 'adjuntos');
  let copied = 0;
  const walk = (rel: string) => {
    const abs = path.join(source, rel);
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const relChild = path.join(rel, entry.name);
      if (entry.isDirectory()) walk(relChild);
      else if (entry.isFile() && !entry.name.endsWith('.tmp')) {
        const dest = path.join(target, relChild);
        const srcStat = fs.statSync(path.join(source, relChild));
        if (!fs.existsSync(dest) || fs.statSync(dest).size !== srcStat.size) {
          ensureDir(path.dirname(dest));
          fs.copyFileSync(path.join(source, relChild), dest);
          copied++;
        }
      }
    }
  };
  walk('');
  return copied;
}

/** Recupera desde la carpeta de copias los adjuntos que falten. */
export function restoreMissingAttachments(ctx: AppContext, dir: string): number {
  const rows = ctx.sqlite.prepare('SELECT storage_path AS p FROM attachments').all() as {
    p: string;
  }[];
  let restored = 0;
  for (const { p } of rows) {
    const dest = path.join(ctx.config.attachmentsDir, ...p.split('/'));
    if (fs.existsSync(dest)) continue;
    const src = path.join(dir, 'adjuntos', ...p.split('/'));
    if (fs.existsSync(src)) {
      ensureDir(path.dirname(dest));
      fs.copyFileSync(src, dest);
      restored++;
    }
  }
  return restored;
}

export function rotateBackups(ctx: AppContext): string[] {
  const dir = backupsDir(ctx);
  const policy = getSettings(ctx).backups;
  const toDelete = selectBackupsToDelete(listBackups(ctx), policy);
  for (const fileName of toDelete) removeIfExists(path.join(dir, fileName));
  return toDelete;
}

export async function createBackup(ctx: AppContext, kind: BackupKind): Promise<BackupInfo> {
  if (ctx.integrity !== 'ok') {
    throw new ValidationError('No se puede hacer una copia de una base de datos dañada.');
  }
  const dir = backupsDir(ctx);
  const date = ctx.now();
  const fileName = backupFileName(date, kind);
  const tmpDb = path.join(ctx.config.tmpDir, `copia-${newId()}.db`);
  const finalPath = path.join(dir, fileName);
  const partial = `${finalPath}.parcial`;
  try {
    await snapshotDatabase(ctx, tmpDb);
    await pipeline(
      fs.createReadStream(tmpDb),
      zlib.createGzip({ level: 6 }),
      fs.createWriteStream(partial),
    );
    fs.renameSync(partial, finalPath);
  } finally {
    removeIfExists(tmpDb);
    removeIfExists(partial);
  }
  try {
    mirrorAttachments(ctx, dir);
  } catch (error) {
    ctx.logger.warn({ err: error }, 'No se han podido copiar los adjuntos a la carpeta de copias');
  }
  rotateBackups(ctx);
  ctx.logger.info({ fileName }, 'Copia de seguridad creada');
  return { fileName, kind, createdAt: date.toISOString(), size: fs.statSync(finalPath).size };
}

export function lastRegularBackupAt(ctx: AppContext): Date | null {
  const last = listBackups(ctx).find(
    (b) => b.kind === 'auto' || b.kind === 'close' || b.kind === 'manual',
  );
  return last ? new Date(last.createdAt) : null;
}

/** Copia automática si la última tiene más de 24 horas. */
export async function maybeAutoBackup(ctx: AppContext): Promise<BackupInfo | null> {
  if (ctx.integrity !== 'ok') return null;
  const last = lastRegularBackupAt(ctx);
  if (last && ctx.now().getTime() - last.getTime() < AUTO_BACKUP_INTERVAL_MS) return null;
  return createBackup(ctx, 'auto');
}

/** Copia al cerrar la app, solo si ha habido cambios desde que se abrió. */
export async function backupOnClose(ctx: AppContext): Promise<BackupInfo | null> {
  if (ctx.integrity !== 'ok' || !getSettings(ctx).backups.onClose) return null;
  const row = ctx.sqlite.prepare('SELECT total_changes() AS n').get() as { n: number };
  if (row.n === 0) return null;
  return createBackup(ctx, 'close');
}

/** Descomprime una copia en un archivo temporal y comprueba que es válida para esta versión. */
export async function extractBackupToTemp(ctx: AppContext, gzPath: string): Promise<string> {
  const tmp = path.join(ctx.config.tmpDir, `restaurar-${newId()}.db`);
  try {
    await pipeline(fs.createReadStream(gzPath), zlib.createGunzip(), fs.createWriteStream(tmp));
  } catch {
    removeIfExists(tmp);
    throw new ValidationError('El archivo de copia no se puede leer o está dañado.');
  }
  try {
    verifyDatabaseFile(ctx, tmp);
  } catch (error) {
    // Copia de una versión más nueva o que no es una base de datos: no se deja el temporal.
    removeIfExists(tmp);
    throw error;
  }
  return tmp;
}

/** Comprueba integridad y que la versión del esquema no sea más nueva que la de esta app. */
export function verifyDatabaseFile(ctx: AppContext, file: string): void {
  if (!checkFileIntegrity(file)) {
    removeIfExists(file);
    throw new ValidationError('La copia está dañada: no supera la comprobación de integridad.');
  }
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const version = schemaVersion(db);
    if (version > migrationCount(ctx.config.migrationsDir)) {
      throw new ValidationError(
        'La copia procede de una versión más nueva de L10N Suite. Actualiza la app antes de restaurarla.',
      );
    }
  } finally {
    db.close();
  }
}

export async function restoreBackup(ctx: AppContext, fileName: string): Promise<void> {
  const dir = backupsDir(ctx);
  const file = path.join(dir, fileName);
  if (!parseBackupFileName(fileName) || !isInside(dir, file) || !fs.existsSync(file)) {
    throw new NotFoundError('La copia de seguridad');
  }
  await ctx.withMaintenance(async () => {
    const tmp = await extractBackupToTemp(ctx, file);
    try {
      if (ctx.integrity === 'ok') await createBackup(ctx, 'pre-restore');
      ctx.replaceDatabaseFile(tmp);
    } finally {
      removeIfExists(tmp);
    }
    restoreMissingAttachments(ctx, dir);
    ctx.logger.info({ fileName }, 'Copia restaurada');
  });
}
