import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export type DB = BetterSQLite3Database<typeof schema>;
export type SQLite = Database.Database;

const regexCache = new Map<string, RegExp | null>();

function compile(pattern: string, flags: string): RegExp | null {
  const key = `${flags}/${pattern}`;
  if (regexCache.has(key)) return regexCache.get(key) ?? null;
  let re: RegExp | null;
  try {
    re = new RegExp(pattern, flags);
  } catch {
    re = null;
  }
  if (regexCache.size > 200) regexCache.clear();
  regexCache.set(key, re);
  return re;
}

export function openDatabase(
  file: string,
  options: { readonly?: boolean } = {},
): {
  sqlite: SQLite;
  db: DB;
} {
  const sqlite = new Database(file, {
    readonly: options.readonly ?? false,
    fileMustExist: options.readonly ?? false,
  });
  try {
    if (!options.readonly) {
      sqlite.pragma('journal_mode = WAL');
      sqlite.pragma('synchronous = NORMAL');
    }
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('busy_timeout = 5000');
    sqlite.pragma('temp_store = MEMORY');
  } catch (error) {
    // Un archivo dañado se abre pero falla al configurarlo: se cierra para no dejarlo bloqueado
    // (en Windows impediría sustituirlo al restaurar una copia).
    sqlite.close();
    throw error;
  }
  // X REGEXP Y → regexp(Y, X). Una expresión no válida simplemente no coincide.
  sqlite.function('regexp', { deterministic: true }, (pattern: unknown, value: unknown) => {
    if (typeof pattern !== 'string' || typeof value !== 'string') return 0;
    return compile(pattern, 'u')?.test(value) ? 1 : 0;
  });
  sqlite.function('regexp_i', { deterministic: true }, (pattern: unknown, value: unknown) => {
    if (typeof pattern !== 'string' || typeof value !== 'string') return 0;
    return compile(pattern, 'iu')?.test(value) ? 1 : 0;
  });
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

/** PRAGMA quick_check: comprobación rápida de integridad. */
export function checkIntegrity(sqlite: SQLite): boolean {
  try {
    const rows = sqlite.pragma('quick_check') as { quick_check: string }[];
    return rows.length === 1 && rows[0]?.quick_check === 'ok';
  } catch {
    return false;
  }
}

export function checkFileIntegrity(file: string): boolean {
  let sqlite: SQLite | null = null;
  try {
    sqlite = new Database(file, { readonly: true, fileMustExist: true });
    return checkIntegrity(sqlite);
  } catch {
    return false;
  } finally {
    sqlite?.close();
  }
}
