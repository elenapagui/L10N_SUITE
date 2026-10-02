import fs from 'node:fs';
import type { AppConfig } from './config';
import { checkIntegrity, openDatabase, type DB, type SQLite } from './db/connection';
import { pendingMigrations, runMigrations, schemaVersion } from './db/migrate';
import { removeIfExists } from './lib/fs';

export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };

/**
 * Estado compartido del motor. La conexión puede reabrirse (al restaurar una copia),
 * así que los módulos deben leer siempre `ctx.db` / `ctx.sqlite` en el momento de usarlos.
 */
export class AppContext {
  sqlite!: SQLite;
  db!: DB;
  integrity: 'ok' | 'error' = 'ok';
  maintenance = false;
  readonly startedAt: string;

  constructor(
    readonly config: AppConfig,
    readonly logger: Logger = silentLogger,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.startedAt = this.clock().toISOString();
  }

  now(): Date {
    return this.clock();
  }

  nowISO(): string {
    return this.clock().toISOString();
  }

  /** Abre la base de datos. Si el archivo está dañado, deja el motor en modo recuperación. */
  open(): void {
    try {
      const { sqlite, db } = openDatabase(this.config.dbPath);
      this.sqlite = sqlite;
      this.db = db;
      this.integrity = checkIntegrity(sqlite) ? 'ok' : 'error';
    } catch (error) {
      this.logger.error({ err: error }, 'No se ha podido abrir la base de datos');
      const { sqlite, db } = openDatabase(':memory:');
      this.sqlite = sqlite;
      this.db = db;
      this.integrity = 'error';
    }
  }

  close(): void {
    if (!this.sqlite?.open) return;
    try {
      if (this.integrity === 'ok' && this.sqlite.name !== ':memory:') {
        this.sqlite.pragma('wal_checkpoint(TRUNCATE)');
      }
    } catch (error) {
      this.logger.warn({ err: error }, 'No se ha podido consolidar el WAL');
    }
    this.sqlite.close();
  }

  /** Sustituye el archivo de la base de datos por otro ya verificado y la vuelve a abrir. */
  replaceDatabaseFile(newFile: string): void {
    this.close();
    removeIfExists(`${this.config.dbPath}-wal`);
    removeIfExists(`${this.config.dbPath}-shm`);
    fs.renameSync(newFile, this.config.dbPath);
    this.open();
    if (this.integrity === 'ok') this.migrate();
  }

  migrate(): number {
    const pending = pendingMigrations(this.sqlite, this.config.migrationsDir);
    if (pending > 0) {
      runMigrations(this.db, this.sqlite, this.config.migrationsDir);
      this.logger.info({ pending }, 'Migraciones aplicadas');
    }
    return pending;
  }

  schemaVersion(): number {
    return schemaVersion(this.sqlite);
  }

  /** Ejecuta `fn` en modo mantenimiento: el resto de peticiones reciben un 503 mientras tanto. */
  async withMaintenance<T>(fn: () => Promise<T> | T): Promise<T> {
    if (this.maintenance) throw new Error('Ya hay una operación de mantenimiento en curso.');
    this.maintenance = true;
    try {
      return await fn();
    } finally {
      this.maintenance = false;
    }
  }
}
