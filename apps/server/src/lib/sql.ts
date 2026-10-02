import type { AppContext } from '../context';
import { NotFoundError } from './errors';
import { newId } from './ids';

/** Correspondencia campo (camelCase) → columna SQL, con conversión de JSON y booleanos. */
export type ColumnMap = Record<string, { col: string; json?: boolean; bool?: boolean }>;

export function columns(
  map: Record<string, string | { col: string; json?: boolean; bool?: boolean }>,
): ColumnMap {
  return Object.fromEntries(
    Object.entries(map).map(([key, def]) => [key, typeof def === 'string' ? { col: def } : def]),
  );
}

/** «t.col AS key, …» para un SELECT. */
export function selectList(map: ColumnMap, alias: string): string {
  return Object.entries(map)
    .map(([key, def]) => `${alias}.${def.col} AS "${key}"`)
    .join(', ');
}

function encode(def: { json?: boolean; bool?: boolean }, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (def.json) return JSON.stringify(value);
  if (def.bool) return value ? 1 : 0;
  return value;
}

/** Convierte una fila leída (JSON en texto, booleanos como 0/1) a su forma final. */
export function decodeRow<T>(map: ColumnMap, row: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...row };
  for (const [key, def] of Object.entries(map)) {
    if (!(key in out)) continue;
    const v = out[key];
    if (def.json) {
      if (typeof v === 'string') {
        try {
          out[key] = JSON.parse(v);
        } catch {
          out[key] = null;
        }
      }
    } else if (def.bool) {
      out[key] = v === 1 || v === true;
    }
  }
  return out as T;
}

export function insertRow(
  ctx: AppContext,
  table: string,
  map: ColumnMap,
  values: Record<string, unknown>,
  options: { id?: string; timestamps?: boolean } = {},
): string {
  const id = options.id ?? newId();
  const cols = ['id'];
  const params: unknown[] = [id];
  for (const [key, def] of Object.entries(map)) {
    if (key === 'id' || !(key in values)) continue;
    const v = encode(def, values[key]);
    if (v === undefined) continue;
    cols.push(def.col);
    params.push(v);
  }
  if (options.timestamps !== false) {
    const now = ctx.nowISO();
    cols.push('created_at', 'updated_at');
    params.push(now, now);
  }
  ctx.sqlite
    .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...params);
  return id;
}

/** Actualiza solo los campos presentes en `patch`. Devuelve true si la fila existe. */
export function updateRow(
  ctx: AppContext,
  table: string,
  map: ColumnMap,
  id: string,
  patch: Record<string, unknown>,
  options: { timestamps?: boolean; what?: string } = {},
): void {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const def = map[key];
    if (!def || key === 'id' || value === undefined) continue;
    sets.push(`${def.col} = ?`);
    params.push(encode(def, value));
  }
  if (options.timestamps !== false) {
    sets.push('updated_at = ?');
    params.push(ctx.nowISO());
  }
  if (sets.length === 0) return;
  const res = ctx.sqlite
    .prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`)
    .run(...params, id);
  if (res.changes === 0) throw new NotFoundError(options.what);
}

export function assertExists(
  ctx: AppContext,
  table: string,
  id: string | null | undefined,
  what: string,
): void {
  if (!id) return;
  const row = ctx.sqlite
    .prepare(`SELECT 1 FROM ${table} WHERE id = ? AND deleted_at IS NULL`)
    .get(id);
  if (!row) throw new NotFoundError(what);
}

export function placeholders(values: unknown[]): string {
  return values.map(() => '?').join(', ');
}
