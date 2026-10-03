import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import type { SyncRemoteState, SyncStatus } from '@l10n/shared';
import type { AppContext } from '../context';
import { ValidationError } from '../lib/errors';
import { ensureDir, removeIfExists, replaceFile } from '../lib/fs';
import { newId } from '../lib/ids';
import { getSettings, updateSettingsSection } from './settings';
import {
  createBackup,
  extractBackupToTemp,
  mirrorAttachments,
  restoreMissingAttachments,
  snapshotDatabase,
} from './backup/backups';

/**
 * Sincronización «de relevo» entre dos ordenadores a través de una carpeta en la nube
 * (OneDrive, iCloud, Dropbox…). La base de datos de trabajo nunca está en la nube: al cerrar se
 * deja allí una copia y, al abrir en el otro ordenador, se carga si es más reciente.
 *
 * El estado de la sincronización de cada ordenador vive en un archivo local, fuera de la base
 * de datos, para que no viaje con ella.
 */
export const SYNC_FOLDER = 'L10N Suite - sincronizacion';
const STATE_FILE = 'estado.json';
const DB_FILE = 'datos.sqlite.gz';
const FORMAT = 'l10n-suite-sincronizacion';

interface LocalState {
  directory: string | null;
  deviceId: string;
  deviceName: string;
  /** Secuencia del último estado enviado o recibido. */
  lastSeq: number;
  /** Hash de la última versión enviada o recibida (la «base» de este ordenador). */
  lastSha: string | null;
  lastSyncAt: string | null;
  /** Hay cambios en este ordenador desde la última sincronización. */
  dirty: boolean;
  /** Resultado de la última comprobación al abrir (para avisar en la interfaz). */
  lastEvent: SyncStatus['lastEvent'];
}

function statePath(ctx: AppContext) {
  return path.join(ctx.config.dataDir, 'sincronizacion.json');
}

export function readLocalState(ctx: AppContext): LocalState {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(ctx), 'utf8')) as Partial<LocalState>;
    return {
      directory: raw.directory ?? null,
      deviceId: raw.deviceId ?? newId(),
      deviceName: raw.deviceName || os.hostname() || 'Este ordenador',
      lastSeq: raw.lastSeq ?? 0,
      lastSha: raw.lastSha ?? null,
      lastSyncAt: raw.lastSyncAt ?? null,
      dirty: raw.dirty ?? false,
      lastEvent: raw.lastEvent ?? null,
    };
  } catch {
    const fresh: LocalState = {
      directory: null,
      deviceId: newId(),
      deviceName: os.hostname() || 'Este ordenador',
      lastSeq: 0,
      lastSha: null,
      lastSyncAt: null,
      dirty: false,
      lastEvent: null,
    };
    writeLocalState(ctx, fresh);
    return fresh;
  }
}

function writeLocalState(ctx: AppContext, state: LocalState) {
  const file = statePath(ctx);
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

function syncDir(state: LocalState): string | null {
  return state.directory ? path.join(state.directory, SYNC_FOLDER) : null;
}

export function readRemoteState(state: LocalState): SyncRemoteState | null {
  const dir = syncDir(state);
  if (!dir) return null;
  try {
    const remote = JSON.parse(
      fs.readFileSync(path.join(dir, STATE_FILE), 'utf8'),
    ) as SyncRemoteState;
    return remote.format === FORMAT ? remote : null;
  } catch {
    return null;
  }
}

async function sha256(file: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

/**
 * Seguimiento de escrituras en memoria. `writes` cuenta las peticiones que han cambiado datos;
 * al enviar se compara con el valor del momento de la copia para no dar por enviados los
 * cambios hechos mientras se enviaba. `fileDirty` evita reescribir el archivo de estado.
 */
interface Tracker {
  writes: number;
  fileDirty: boolean;
  /** Cola de operaciones de sincronización (envío, carga, cierre): nunca a la vez. */
  queue: Promise<unknown>;
}
const trackers = new WeakMap<AppContext, Tracker>();
function tracker(ctx: AppContext): Tracker {
  let t = trackers.get(ctx);
  if (!t) {
    t = { writes: 0, fileDirty: false, queue: Promise.resolve() };
    trackers.set(ctx, t);
  }
  return t;
}

function withSyncLock<T>(ctx: AppContext, fn: () => Promise<T>): Promise<T> {
  const t = tracker(ctx);
  const run = t.queue.then(fn, fn);
  t.queue = run.catch(() => undefined);
  return run;
}

/** Marca que hay cambios locales (se llama tras cada petición que ha modificado datos). */
export function markDirty(ctx: AppContext) {
  const t = tracker(ctx);
  t.writes++;
  if (t.fileDirty) return;
  const state = readLocalState(ctx);
  if (!state.dirty) writeLocalState(ctx, { ...state, dirty: true });
  t.fileDirty = true;
}

/**
 * Hay una versión del otro ordenador que aquí no se ha cargado: su hash no es el último que
 * conoce este ordenador. Con `fastForward`, esa versión parte de la que tenía este ordenador,
 * así que cargarla no pierde nada (si aquí no hay cambios).
 */
function compare(state: LocalState, remote: SyncRemoteState | null) {
  if (!remote || remote.deviceId === state.deviceId || remote.sha256 === state.lastSha)
    return { incoming: false, fastForward: false };
  const fastForward =
    remote.baseSha !== undefined
      ? remote.baseSha === state.lastSha
      : // Copias de la v0.3.0, sin base: se decide por el número de secuencia.
        state.lastSha === null || remote.seq > state.lastSeq;
  return { incoming: true, fastForward };
}

export function syncStatus(ctx: AppContext): SyncStatus {
  const state = readLocalState(ctx);
  const remote = readRemoteState(state);
  const { incoming, fastForward } = compare(state, remote);
  return {
    configured: Boolean(state.directory),
    directory: state.directory,
    folder: syncDir(state),
    deviceName: state.deviceName,
    lastSyncAt: state.lastSyncAt,
    dirty: state.dirty,
    remote,
    incoming,
    conflict: incoming && (state.dirty || !fastForward),
    lastEvent: state.lastEvent,
  };
}

export function configureSync(
  ctx: AppContext,
  input: { directory?: string | null; deviceName?: string },
): SyncStatus {
  const state = readLocalState(ctx);
  if (input.directory !== undefined) {
    const dir = input.directory?.trim() || null;
    if (dir && !fs.existsSync(dir))
      throw new ValidationError(
        'La carpeta no existe. Elige una carpeta sincronizada que ya exista.',
      );
    state.directory = dir;
    // Con una carpeta nueva se empieza de cero: lo que haya allí se tratará como del otro ordenador.
    state.lastSeq = 0;
    state.lastSha = null;
    state.lastSyncAt = null;
    state.dirty = true;
    tracker(ctx).fileDirty = true;
  }
  if (input.deviceName !== undefined)
    state.deviceName = input.deviceName.trim() || state.deviceName;
  writeLocalState(ctx, state);
  return syncStatus(ctx);
}

/**
 * Deja en la carpeta la copia de este ordenador. No pisa cambios del otro ordenador que aún no
 * se han cargado aquí, salvo con `force` (cuando la usuaria elige quedarse con esta versión).
 */
export function pushSync(
  ctx: AppContext,
  options: { force?: boolean; onlyIfDirty?: boolean } = {},
): Promise<SyncStatus> {
  return withSyncLock(ctx, () => pushUnlocked(ctx, options));
}

async function pushUnlocked(
  ctx: AppContext,
  options: { force?: boolean; onlyIfDirty?: boolean },
): Promise<SyncStatus> {
  const state = readLocalState(ctx);
  const dir = syncDir(state);
  if (!dir) throw new ValidationError('Elige primero la carpeta de sincronización.');
  if (ctx.integrity !== 'ok') throw new ValidationError('La base de datos no está en buen estado.');
  const remote = readRemoteState(state);
  if (compare(state, remote).incoming && !options.force)
    return { ...syncStatus(ctx), conflict: true };
  if (options.onlyIfDirty && !state.dirty && (!remote || remote.sha256 === state.lastSha))
    return syncStatus(ctx);

  ensureDir(dir);
  const id = newId();
  const tmpDb = path.join(ctx.config.tmpDir, `sincronizar-${id}.db`);
  const partial = path.join(dir, `${DB_FILE}.${id}.parcial`);
  const tmpState = path.join(dir, `${STATE_FILE}.${id}.tmp`);
  const t = tracker(ctx);
  try {
    // Las escrituras posteriores a este momento no van en la copia: siguen pendientes.
    const writesAtSnapshot = t.writes;
    await snapshotDatabase(ctx, tmpDb);
    await pipeline(
      fs.createReadStream(tmpDb),
      zlib.createGzip({ level: 6 }),
      fs.createWriteStream(partial),
    );
    const hash = await sha256(partial);
    const size = fs.statSync(partial).size;
    replaceFile(partial, path.join(dir, DB_FILE));
    mirrorAttachments(ctx, dir);
    const seq = Math.max(state.lastSeq, remote?.seq ?? 0) + 1;
    const next: SyncRemoteState = {
      format: FORMAT,
      version: 1,
      seq,
      deviceId: state.deviceId,
      deviceName: state.deviceName,
      savedAt: ctx.nowISO(),
      schemaVersion: ctx.schemaVersion(),
      appVersion: ctx.config.appVersion,
      sha256: hash,
      baseSha: state.lastSha,
      size,
    };
    fs.writeFileSync(tmpState, JSON.stringify(next, null, 2));
    replaceFile(tmpState, path.join(dir, STATE_FILE));
    const stillClean = t.writes === writesAtSnapshot;
    t.fileDirty = !stillClean;
    // Se relee el estado: pudo cambiar mientras se enviaba (por ejemplo, el nombre).
    writeLocalState(ctx, {
      ...readLocalState(ctx),
      lastSeq: seq,
      lastSha: hash,
      lastSyncAt: next.savedAt,
      dirty: !stillClean,
      lastEvent: { kind: 'sent', at: next.savedAt, deviceName: state.deviceName },
    });
    ctx.logger.info({ seq }, 'Sincronización enviada');
  } finally {
    removeIfExists(tmpDb);
    removeIfExists(partial);
    removeIfExists(tmpState);
  }
  return syncStatus(ctx);
}

/**
 * Carga la versión del otro ordenador. Antes hace una copia de seguridad de la de aquí y
 * conserva los ajustes propios de este ordenador (la carpeta de copias).
 */
export function pullSync(ctx: AppContext, options: { force?: boolean } = {}): Promise<SyncStatus> {
  return withSyncLock(ctx, () => pullUnlocked(ctx, options));
}

async function pullUnlocked(ctx: AppContext, options: { force?: boolean }): Promise<SyncStatus> {
  const state = readLocalState(ctx);
  const dir = syncDir(state);
  const remote = readRemoteState(state);
  if (!dir || !remote)
    throw new ValidationError('No hay ninguna versión en la carpeta de sincronización.');
  const { fastForward } = compare(state, remote);
  if ((state.dirty || !fastForward) && !options.force)
    return { ...syncStatus(ctx), conflict: true };
  const gz = path.join(dir, DB_FILE);
  if (
    !fs.existsSync(gz) ||
    fs.statSync(gz).size !== remote.size ||
    (await sha256(gz)) !== remote.sha256
  )
    throw new ValidationError(
      'La copia del otro ordenador aún no ha terminado de llegar a esta carpeta. Espera a que el servicio en la nube termine de sincronizar y vuelve a intentarlo.',
    );
  await ctx.withMaintenance(async () => {
    const tmp = await extractBackupToTemp(ctx, gz);
    try {
      const localBackups = ctx.integrity === 'ok' ? getSettings(ctx).backups : null;
      if (ctx.integrity === 'ok') await createBackup(ctx, 'pre-sync');
      ctx.replaceDatabaseFile(tmp);
      if (localBackups && ctx.integrity === 'ok')
        updateSettingsSection(ctx, 'backups', { directory: localBackups.directory });
    } finally {
      removeIfExists(tmp);
    }
    restoreMissingAttachments(ctx, dir);
  });
  const t = tracker(ctx);
  t.fileDirty = false;
  writeLocalState(ctx, {
    ...readLocalState(ctx),
    lastSeq: Math.max(state.lastSeq, remote.seq),
    lastSha: remote.sha256,
    lastSyncAt: ctx.nowISO(),
    dirty: false,
    lastEvent: { kind: 'received', at: ctx.nowISO(), deviceName: remote.deviceName },
  });
  ctx.logger.info({ seq: remote.seq, from: remote.deviceName }, 'Sincronización recibida');
  return syncStatus(ctx);
}

/** Al abrir la app: si hay una versión nueva del otro ordenador y aquí no hay cambios, se carga. */
export async function syncOnStartup(ctx: AppContext): Promise<void> {
  try {
    const status = syncStatus(ctx);
    if (!status.configured || !status.incoming) return;
    if (status.conflict) {
      const state = readLocalState(ctx);
      writeLocalState(ctx, {
        ...state,
        lastEvent: { kind: 'conflict', at: ctx.nowISO(), deviceName: status.remote!.deviceName },
      });
      return;
    }
    await pullSync(ctx);
  } catch (error) {
    ctx.logger.warn({ err: error }, 'No se ha podido sincronizar al abrir');
    const state = readLocalState(ctx);
    writeLocalState(ctx, {
      ...state,
      lastEvent: {
        kind: 'error',
        at: ctx.nowISO(),
        deviceName: null,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

/** Al cerrar la app: deja la copia de este ordenador si ha habido cambios. */
export async function syncOnClose(ctx: AppContext): Promise<void> {
  const state = readLocalState(ctx);
  if (!state.directory || !state.dirty) return;
  try {
    await pushSync(ctx, { onlyIfDirty: true });
  } catch (error) {
    ctx.logger.warn({ err: error }, 'No se ha podido sincronizar al cerrar');
  }
}

/** Para que la interfaz no repita el aviso de la última comprobación. */
export function acknowledgeSyncEvent(ctx: AppContext): void {
  const state = readLocalState(ctx);
  if (state.lastEvent) writeLocalState(ctx, { ...state, lastEvent: null });
}
