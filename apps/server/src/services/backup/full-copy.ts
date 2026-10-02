import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import Database from 'better-sqlite3';
import yauzl from 'yauzl';
import yazl from 'yazl';
import type { AppContext } from '../../context';
import { ValidationError } from '../../lib/errors';
import { ensureDir, isInside, removeIfExists } from '../../lib/fs';
import { newId } from '../../lib/ids';
import { createBackup, snapshotDatabase, verifyDatabaseFile } from './backups';

export const EXPORT_FORMAT = 'l10n-suite-copia-completa';
export const EXPORT_FORMAT_VERSION = 1;

interface Manifest {
  format: string;
  formatVersion: number;
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
}

function exportFileName(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `L10N-Suite-copia-completa-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(
    date.getHours(),
  )}-${p(date.getMinutes())}-${p(date.getSeconds())}.zip`;
}

function listFiles(root: string, rel = ''): string[] {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(root, child));
    else if (entry.isFile() && !entry.name.endsWith('.tmp')) out.push(child);
  }
  return out;
}

/** Tablas «de usuario» de una base de datos (sin tablas internas ni índices de búsqueda). */
function userTables(db: Database.Database): string[] {
  const rows = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' AND name NOT LIKE '%search_index%'
       AND sql NOT LIKE 'CREATE VIRTUAL TABLE%' ORDER BY name`,
    )
    .all() as { name: string }[];
  // Las tablas FTS se llaman «*_fts» (y sus tablas internas «*_fts_data», etc.).
  return rows.map((r) => r.name).filter((n) => !/_fts($|_)/.test(n));
}

/**
 * Copia completa en un ZIP: base de datos, adjuntos y una versión legible (JSON por tabla).
 * Sirve para llevar los datos a otro ordenador o guardarlos fuera.
 */
export async function exportFullCopy(
  ctx: AppContext,
  destDir?: string | null,
): Promise<{ path: string; fileName: string; size: number }> {
  const dir = ensureDir(destDir && destDir.trim() !== '' ? destDir : ctx.config.exportsDir);
  const fileName = exportFileName(ctx.now());
  const finalPath = path.join(dir, fileName);
  const partial = `${finalPath}.parcial`;
  const tmpDb = path.join(ctx.config.tmpDir, `exportar-${newId()}.db`);
  try {
    await snapshotDatabase(ctx, tmpDb);
    const manifest: Manifest = {
      format: EXPORT_FORMAT,
      formatVersion: EXPORT_FORMAT_VERSION,
      appVersion: ctx.config.appVersion,
      schemaVersion: ctx.schemaVersion(),
      createdAt: ctx.nowISO(),
    };
    const zip = new yazl.ZipFile();
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), 'manifest.json');
    zip.addFile(tmpDb, 'datos/l10n.db');
    for (const rel of listFiles(ctx.config.attachmentsDir)) {
      zip.addFile(path.join(ctx.config.attachmentsDir, ...rel.split('/')), `adjuntos/${rel}`);
    }
    const snapshot = new Database(tmpDb, { readonly: true });
    try {
      for (const table of userTables(snapshot)) {
        const rows = snapshot.prepare(`SELECT * FROM "${table}"`).all();
        zip.addBuffer(Buffer.from(JSON.stringify(rows, null, 2)), `legible/${table}.json`);
      }
    } finally {
      snapshot.close();
    }
    zip.addBuffer(
      Buffer.from(
        'Copia completa de L10N Suite.\n\n' +
          '- datos/l10n.db: base de datos SQLite.\n' +
          '- adjuntos/: archivos adjuntos.\n' +
          '- legible/: el contenido de cada tabla en JSON, legible sin la app.\n\n' +
          'Para recuperarla: Ajustes → Copias de seguridad → Importar copia completa.\n',
      ),
      'LEEME.txt',
    );
    zip.end();
    await pipeline(zip.outputStream, fs.createWriteStream(partial));
    fs.renameSync(partial, finalPath);
  } finally {
    removeIfExists(tmpDb);
    removeIfExists(partial);
  }
  return { path: finalPath, fileName, size: fs.statSync(finalPath).size };
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err || !zip) reject(err ?? new Error('ZIP no válido'));
      else resolve(zip);
    });
  });
}

/** Recorre las entradas del ZIP; `onEntry` decide si extraer cada una (devolviendo una ruta). */
async function extractEntries(
  zip: yauzl.ZipFile,
  onEntry: (name: string) => string | null,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    zip.on('error', reject);
    zip.on('end', () => resolve());
    zip.on('entry', (entry: yauzl.Entry) => {
      const name = entry.fileName;
      const target = name.endsWith('/') ? null : onEntry(name);
      if (!target) {
        zip.readEntry();
        return;
      }
      zip.openReadStream(entry, (err, stream) => {
        if (err || !stream) {
          reject(err ?? new Error('No se puede leer una entrada del ZIP'));
          return;
        }
        ensureDir(path.dirname(target));
        pipeline(stream, fs.createWriteStream(target))
          .then(() => zip.readEntry())
          .catch(reject);
      });
    });
    zip.readEntry();
  });
}

async function readManifest(file: string): Promise<Manifest> {
  const zip = await openZip(file);
  const tmp = path.join(path.dirname(file), `manifest-${newId()}.json`);
  try {
    await extractEntries(zip, (name) => (name === 'manifest.json' ? tmp : null));
    if (!fs.existsSync(tmp))
      throw new ValidationError('El archivo no es una copia completa de L10N Suite.');
    const manifest = JSON.parse(fs.readFileSync(tmp, 'utf8')) as Manifest;
    if (manifest.format !== EXPORT_FORMAT) {
      throw new ValidationError('El archivo no es una copia completa de L10N Suite.');
    }
    if (manifest.formatVersion > EXPORT_FORMAT_VERSION) {
      throw new ValidationError(
        'La copia procede de una versión más nueva de L10N Suite. Actualiza la app.',
      );
    }
    return manifest;
  } finally {
    zip.close();
    removeIfExists(tmp);
  }
}

/**
 * Sustituye todos los datos por los de una copia completa. Antes se hace una copia de
 * seguridad de los datos actuales, por si hubiera que deshacer la importación.
 */
export async function importFullCopy(ctx: AppContext, zipPath: string): Promise<Manifest> {
  if (!fs.existsSync(zipPath)) throw new ValidationError('No se encuentra el archivo de la copia.');
  const manifest = await readManifest(zipPath);
  return ctx.withMaintenance(async () => {
    const work = ensureDir(path.join(ctx.config.tmpDir, `importar-${newId()}`));
    const newAttachments = path.join(work, 'adjuntos');
    const newDb = path.join(work, 'l10n.db');
    const oldAttachments = `${ctx.config.attachmentsDir}.anterior-${newId()}`;
    try {
      const zip = await openZip(zipPath);
      try {
        await extractEntries(zip, (name) => {
          if (name === 'datos/l10n.db') return newDb;
          if (name.startsWith('adjuntos/')) {
            const target = path.join(newAttachments, ...name.slice('adjuntos/'.length).split('/'));
            return isInside(newAttachments, target) ? target : null;
          }
          return null;
        });
      } finally {
        zip.close();
      }
      if (!fs.existsSync(newDb))
        throw new ValidationError('La copia no contiene la base de datos.');
      verifyDatabaseFile(ctx, newDb);
      if (ctx.integrity === 'ok') await createBackup(ctx, 'pre-import');

      ensureDir(newAttachments);
      fs.renameSync(ctx.config.attachmentsDir, oldAttachments);
      try {
        fs.renameSync(newAttachments, ctx.config.attachmentsDir);
        ctx.replaceDatabaseFile(newDb);
      } catch (error) {
        // Se deja todo como estaba.
        fs.rmSync(ctx.config.attachmentsDir, { recursive: true, force: true });
        fs.renameSync(oldAttachments, ctx.config.attachmentsDir);
        if (!ctx.sqlite.open) ctx.open();
        throw error;
      }
      fs.rmSync(oldAttachments, { recursive: true, force: true });
      ctx.logger.info({ manifest }, 'Copia completa importada');
      return manifest;
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  });
}
