import fs from 'node:fs';
import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { DB, SQLite } from './connection';

interface Journal {
  entries: { idx: number; tag: string }[];
}

export function migrationCount(migrationsDir: string): number {
  const journalPath = path.join(migrationsDir, 'meta', '_journal.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as Journal;
  return journal.entries.length;
}

/** Número de migraciones aplicadas (versión del esquema). */
export function schemaVersion(sqlite: SQLite): number {
  const exists = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
    .get();
  if (!exists) return 0;
  const row = sqlite.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get() as {
    n: number;
  };
  return row.n;
}

export function pendingMigrations(sqlite: SQLite, migrationsDir: string): number {
  return Math.max(0, migrationCount(migrationsDir) - schemaVersion(sqlite));
}

/**
 * Aplica las migraciones pendientes. Las claves foráneas se desactivan mientras tanto
 * (SQLite ignora PRAGMA foreign_keys dentro de una transacción) y después se verifica
 * que no haya quedado ninguna referencia rota.
 */
export function runMigrations(db: DB, sqlite: SQLite, migrationsDir: string): void {
  sqlite.pragma('foreign_keys = OFF');
  try {
    migrate(db, { migrationsFolder: migrationsDir });
    const broken = sqlite.pragma('foreign_key_check') as unknown[];
    if (broken.length > 0) {
      throw new Error(`La migración ha dejado ${broken.length} referencias rotas.`);
    }
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
}
