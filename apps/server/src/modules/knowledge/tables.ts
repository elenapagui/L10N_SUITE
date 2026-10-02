import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { z } from 'zod';
import {
  applyView,
  cellText,
  coerceText,
  columnInputSchema,
  columnUpdateSchema,
  computeRows,
  detectColumnType,
  idSchema,
  normalizeCellValue,
  tableInputSchema,
  tableUpdateSchema,
  todayISO,
  viewConfigSchema,
  viewInputSchema,
  viewUpdateSchema,
  type CellValue,
  type ColumnChoice,
  type ColumnType,
  type CustomTable,
  type CustomTableDetail,
  type RelationLabels,
  type TableColumn,
  type TableRow,
  type TableView,
  type ViewConfig,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { safeFileName } from '../../lib/fs';
import { newId } from '../../lib/ids';
import { assertExists } from '../../lib/sql';
import { decimalText, readSheets } from '../../lib/tabular';
import { parse } from '../../lib/validate';
import { logActivity } from '../../services/activity';
import { indexEntity } from '../../services/search';
import { moveToTrash, registerTrashable } from '../../services/trash';
import { contentDisposition } from '../attachments';

const MAX_COLUMNS = 200;
const ROW_TRASH_DAYS = 30;

type ColumnRow = Omit<TableColumn, 'options'> & { options: string };
type RowRow = Omit<TableRow, 'values'> & { values: string };

function decodeColumn(r: ColumnRow): TableColumn {
  let options = {};
  try {
    options = JSON.parse(r.options);
  } catch {
    /* opciones dañadas: se ignoran */
  }
  return { ...r, options };
}

function decodeRowValues(r: RowRow): TableRow {
  let values: Record<string, CellValue> = {};
  try {
    values = JSON.parse(r.values);
  } catch {
    /* fila dañada */
  }
  return { ...r, values };
}

function tableExists(ctx: AppContext, id: string): void {
  const row = ctx.sqlite
    .prepare('SELECT 1 FROM custom_tables WHERE id = ? AND deleted_at IS NULL')
    .get(id);
  if (!row) throw new NotFoundError('La tabla');
}

export function listColumns(ctx: AppContext, tableId: string): TableColumn[] {
  return (
    ctx.sqlite
      .prepare(
        `SELECT id, table_id AS tableId, name, type, options, width, position
         FROM custom_columns WHERE table_id = ? ORDER BY position, created_at`,
      )
      .all(tableId) as ColumnRow[]
  ).map(decodeColumn);
}

function getColumn(ctx: AppContext, id: string): TableColumn {
  const row = ctx.sqlite
    .prepare(
      `SELECT c.id, c.table_id AS tableId, c.name, c.type, c.options, c.width, c.position
       FROM custom_columns c JOIN custom_tables t ON t.id = c.table_id
       WHERE c.id = ? AND t.deleted_at IS NULL`,
    )
    .get(id) as ColumnRow | undefined;
  if (!row) throw new NotFoundError('La columna');
  return decodeColumn(row);
}

export function listViews(ctx: AppContext, tableId: string): TableView[] {
  return (
    ctx.sqlite
      .prepare(
        `SELECT id, table_id AS tableId, name, type, config, position
         FROM custom_views WHERE table_id = ? ORDER BY position, created_at`,
      )
      .all(tableId) as (Omit<TableView, 'config'> & { config: string })[]
  ).map((v) => {
    let config: ViewConfig;
    try {
      config = viewConfigSchema.parse(JSON.parse(v.config));
    } catch {
      config = viewConfigSchema.parse({});
    }
    return { ...v, config };
  });
}

export function listRows(ctx: AppContext, tableId: string): TableRow[] {
  return (
    ctx.sqlite
      .prepare(
        `SELECT id, table_id AS tableId, "values", position, created_at AS createdAt, updated_at AS updatedAt
         FROM custom_rows WHERE table_id = ? AND deleted_at IS NULL ORDER BY position, created_at`,
      )
      .all(tableId) as RowRow[]
  ).map(decodeRowValues);
}

const TABLE_SELECT = `SELECT t.id, t.name, t.icon, t.description, t.game_id AS gameId,
  t.created_at AS createdAt, t.updated_at AS updatedAt,
  (SELECT COUNT(*) FROM custom_rows r WHERE r.table_id = t.id AND r.deleted_at IS NULL) AS rowCount
  FROM custom_tables t`;

export function listTables(ctx: AppContext, filter: { gameId?: string } = {}): CustomTable[] {
  const where = ['t.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (filter.gameId) {
    where.push('t.game_id = ?');
    params.push(filter.gameId);
  }
  return ctx.sqlite
    .prepare(`${TABLE_SELECT} WHERE ${where.join(' AND ')} ORDER BY lower(t.name)`)
    .all(...params) as CustomTable[];
}

export function getTable(ctx: AppContext, id: string): CustomTableDetail {
  const row = ctx.sqlite
    .prepare(`${TABLE_SELECT} WHERE t.id = ? AND t.deleted_at IS NULL`)
    .get(id) as CustomTable | undefined;
  if (!row) throw new NotFoundError('La tabla');
  return { ...row, columns: listColumns(ctx, id), views: listViews(ctx, id) };
}

function indexTable(ctx: AppContext, id: string): void {
  const t = getTable(ctx, id);
  const first = t.columns[0];
  const sample = first
    ? listRows(ctx, id)
        .slice(0, 2000)
        .map((r) => cellText(first, r.values[first.id] ?? null))
        .join(' ')
    : '';
  indexEntity(ctx, {
    entityType: 'custom_table',
    entityId: id,
    title: t.name,
    subtitle: `${t.rowCount} ${t.rowCount === 1 ? 'fila' : 'filas'}`,
    text: [t.description, t.columns.map((c) => c.name).join(' '), sample].filter(Boolean).join(' '),
  });
}

function touchTable(ctx: AppContext, tableId: string): void {
  ctx.sqlite
    .prepare('UPDATE custom_tables SET updated_at = ? WHERE id = ?')
    .run(ctx.nowISO(), tableId);
}

function insertColumn(
  ctx: AppContext,
  tableId: string,
  col: {
    name: string;
    type: ColumnType;
    options?: object;
    width?: number | null;
    position?: number;
  },
): string {
  const count = (
    ctx.sqlite
      .prepare('SELECT COUNT(*) AS n FROM custom_columns WHERE table_id = ?')
      .get(tableId) as { n: number }
  ).n;
  if (count >= MAX_COLUMNS)
    throw new ValidationError(`Una tabla admite como máximo ${MAX_COLUMNS} columnas.`);
  const max = ctx.sqlite
    .prepare('SELECT MAX(position) AS p FROM custom_columns WHERE table_id = ?')
    .get(tableId) as { p: number | null };
  const id = newId();
  const now = ctx.nowISO();
  ctx.sqlite
    .prepare(
      `INSERT INTO custom_columns (id, table_id, name, type, options, width, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      tableId,
      col.name,
      col.type,
      JSON.stringify(col.options ?? {}),
      col.width ?? null,
      col.position ?? (max.p ?? 0) + 1,
      now,
      now,
    );
  return id;
}

function insertView(
  ctx: AppContext,
  tableId: string,
  name: string,
  type: string,
  config: object,
): string {
  const max = ctx.sqlite
    .prepare('SELECT MAX(position) AS p FROM custom_views WHERE table_id = ?')
    .get(tableId) as { p: number | null };
  const id = newId();
  const now = ctx.nowISO();
  ctx.sqlite
    .prepare(
      `INSERT INTO custom_views (id, table_id, name, type, config, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      tableId,
      name,
      type,
      JSON.stringify(viewConfigSchema.parse(config)),
      (max.p ?? 0) + 1,
      now,
      now,
    );
  return id;
}

export function createTable(
  ctx: AppContext,
  raw: unknown,
  options: { columns?: { name: string; type: ColumnType; options?: object }[] } = {},
): CustomTableDetail {
  const input = parse(tableInputSchema, raw);
  assertExists(ctx, 'games', input.gameId, 'El juego');
  const id = newId();
  const now = ctx.nowISO();
  const tx = ctx.sqlite.transaction(() => {
    ctx.sqlite
      .prepare(
        `INSERT INTO custom_tables (id, name, icon, description, game_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.name, input.icon ?? null, input.description, input.gameId ?? null, now, now);
    const cols = options.columns ?? [
      { name: 'Nombre', type: 'text' as const },
      { name: 'Notas', type: 'text' as const },
    ];
    cols.forEach((c, i) => insertColumn(ctx, id, { ...c, position: i + 1 }));
    insertView(ctx, id, 'Cuadrícula', 'grid', {});
  });
  tx();
  indexTable(ctx, id);
  logActivity(ctx, {
    entityType: 'custom_table',
    entityId: id,
    action: 'crear',
    summary: `Tabla «${input.name}» creada`,
  });
  return getTable(ctx, id);
}

/** Convierte los valores de una columna al cambiar su tipo (sin perder el texto si se puede). */
function convertColumnValues(
  ctx: AppContext,
  before: TableColumn,
  after: TableColumn,
): ColumnChoice[] {
  const rows = ctx.sqlite
    .prepare('SELECT id, "values" FROM custom_rows WHERE table_id = ?')
    .all(before.tableId) as { id: string; values: string }[];
  const update = ctx.sqlite.prepare('UPDATE custom_rows SET "values" = ? WHERE id = ?');
  const choices = [...(after.options.choices ?? [])];
  const target = { ...after, options: { ...after.options, choices } };
  for (const r of rows) {
    const values = decodeRowValues({ values: r.values } as RowRow).values;
    const old = values[before.id];
    if (old === undefined) continue;
    let next: CellValue;
    if (after.type === 'formula') next = null;
    else if (
      before.type === 'currency' &&
      ['number', 'percent'].includes(after.type) &&
      typeof old === 'number'
    )
      next = old / 100;
    else if (
      ['number', 'percent'].includes(before.type) &&
      after.type === 'currency' &&
      typeof old === 'number'
    )
      next = Math.round(old * 100);
    else if (
      ['number', 'percent'].includes(before.type) &&
      ['number', 'percent'].includes(after.type)
    )
      next = old;
    else if (before.type === 'multi_select' && after.type === 'select' && Array.isArray(old))
      next = old[0] ?? null;
    else if (before.type === 'select' && after.type === 'multi_select' && typeof old === 'string')
      next = [old];
    else if (before.type === 'relation' || after.type === 'relation')
      next = before.type === after.type ? old : null;
    else {
      const text = before.type === 'checkbox' ? (old ? 'sí' : '') : cellText(before, old);
      // Para números y monedas se usa el valor sin formato (sin separador de miles).
      const plain =
        typeof old === 'number' && ['number', 'percent'].includes(before.type)
          ? decimalText(old)
          : typeof old === 'number' && before.type === 'currency'
            ? decimalText(old / 100)
            : text;
      const res = coerceText(target, plain, newId);
      if (res.newChoices) choices.push(...res.newChoices);
      next = res.invalid && ['text', 'url', 'email'].includes(after.type) ? text : res.value;
    }
    if (next === null || next === undefined) delete values[before.id];
    else values[before.id] = next;
    update.run(JSON.stringify(values), r.id);
  }
  return choices;
}

export function updateColumn(ctx: AppContext, id: string, raw: unknown): TableColumn {
  const patch = parse(columnUpdateSchema, raw);
  const before = getColumn(ctx, id);
  const tx = ctx.sqlite.transaction(() => {
    const after: TableColumn = {
      ...before,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.options !== undefined ? { options: patch.options } : {}),
      ...(patch.width !== undefined ? { width: patch.width ?? null } : {}),
      ...(patch.position !== undefined ? { position: patch.position } : {}),
    };
    if (after.type === 'formula' && after.options.formula) {
      // Comprueba la sintaxis al guardar.
      const r = computeRows(
        [after],
        [{ id: 'x', tableId: '', values: {}, position: 0, createdAt: '', updatedAt: '' }],
      );
      const err = r[0]?.errors[after.id];
      if (err && !/columna/.test(err)) throw new ValidationError(`La fórmula no es válida: ${err}`);
    }
    if (patch.type !== undefined && patch.type !== before.type) {
      after.options = { ...after.options, choices: convertColumnValues(ctx, before, after) };
    } else if (patch.options?.choices && before.options.choices) {
      // Si se borran opciones, se quitan de las filas.
      const valid = new Set(patch.options.choices.map((c) => c.id));
      const removed = before.options.choices.filter((c) => !valid.has(c.id));
      if (removed.length) removeChoices(ctx, before, valid);
    }
    ctx.sqlite
      .prepare(
        'UPDATE custom_columns SET name = ?, type = ?, options = ?, width = ?, position = ?, updated_at = ? WHERE id = ?',
      )
      .run(
        after.name,
        after.type,
        JSON.stringify(after.options),
        after.width,
        after.position,
        ctx.nowISO(),
        id,
      );
    touchTable(ctx, before.tableId);
  });
  tx();
  indexTable(ctx, before.tableId);
  return getColumn(ctx, id);
}

function removeChoices(ctx: AppContext, column: TableColumn, valid: Set<string>): void {
  const rows = ctx.sqlite
    .prepare('SELECT id, "values" FROM custom_rows WHERE table_id = ?')
    .all(column.tableId) as { id: string; values: string }[];
  const update = ctx.sqlite.prepare('UPDATE custom_rows SET "values" = ? WHERE id = ?');
  for (const r of rows) {
    const values = decodeRowValues({ values: r.values } as RowRow).values;
    const v = values[column.id];
    if (v == null) continue;
    let next: CellValue = v;
    if (typeof v === 'string' && !valid.has(v)) next = null;
    if (Array.isArray(v)) next = v.filter((x) => valid.has(x));
    if (next === v) continue;
    if (next == null) delete values[column.id];
    else values[column.id] = next;
    update.run(JSON.stringify(values), r.id);
  }
}

function deleteColumn(ctx: AppContext, id: string): void {
  const col = getColumn(ctx, id);
  const count = (
    ctx.sqlite
      .prepare('SELECT COUNT(*) AS n FROM custom_columns WHERE table_id = ?')
      .get(col.tableId) as { n: number }
  ).n;
  if (count <= 1) throw new ValidationError('La tabla debe tener al menos una columna.');
  const tx = ctx.sqlite.transaction(() => {
    ctx.sqlite
      .prepare(
        `UPDATE custom_rows SET "values" = json_remove("values", '$.' || json_quote(?)) WHERE table_id = ?`,
      )
      .run(id, col.tableId);
    ctx.sqlite.prepare('DELETE FROM custom_columns WHERE id = ?').run(id);
    touchTable(ctx, col.tableId);
  });
  tx();
}

function validateValues(
  columns: TableColumn[],
  raw: Record<string, unknown>,
): Record<string, CellValue> {
  const byId = new Map(columns.map((c) => [c.id, c]));
  const out: Record<string, CellValue> = {};
  for (const [colId, v] of Object.entries(raw)) {
    const col = byId.get(colId);
    if (!col) throw new ValidationError('Columna desconocida.');
    try {
      out[colId] = normalizeCellValue(col, v);
    } catch (error) {
      throw new ValidationError(`«${col.name}»: ${(error as Error).message}`);
    }
  }
  return out;
}

function mergeValues(
  current: Record<string, CellValue>,
  patch: Record<string, CellValue>,
): Record<string, CellValue> {
  const next = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0))
      delete next[k];
    else next[k] = v;
  }
  return next;
}

function getRow(ctx: AppContext, id: string): TableRow {
  const row = ctx.sqlite
    .prepare(
      `SELECT r.id, r.table_id AS tableId, r."values", r.position, r.created_at AS createdAt, r.updated_at AS updatedAt
       FROM custom_rows r JOIN custom_tables t ON t.id = r.table_id
       WHERE r.id = ? AND r.deleted_at IS NULL AND t.deleted_at IS NULL`,
    )
    .get(id) as RowRow | undefined;
  if (!row) throw new NotFoundError('La fila');
  return decodeRowValues(row);
}

const rowBatchSchema = z.object({
  rows: z
    .array(
      z.object({
        id: idSchema.optional(),
        values: z.record(z.string(), z.unknown()).default({}),
        /** Crear la fila justo después de esta (si no, al final). */
        afterId: idSchema.optional(),
      }),
    )
    .max(20_000),
});

/** Crea o actualiza varias filas a la vez (pegar desde Excel, rellenar hacia abajo…). */
export function upsertRows(ctx: AppContext, tableId: string, raw: unknown): TableRow[] {
  tableExists(ctx, tableId);
  const { rows } = parse(rowBatchSchema, raw);
  const columns = listColumns(ctx, tableId);
  const ids: string[] = [];
  const tx = ctx.sqlite.transaction(() => {
    const now = ctx.nowISO();
    const positions = ctx.sqlite
      .prepare(
        'SELECT id, position FROM custom_rows WHERE table_id = ? AND deleted_at IS NULL ORDER BY position',
      )
      .all(tableId) as { id: string; position: number }[];
    let maxPos = positions.length ? positions[positions.length - 1]!.position : 0;
    const insert = ctx.sqlite.prepare(
      'INSERT INTO custom_rows (id, table_id, "values", position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const update = ctx.sqlite.prepare(
      'UPDATE custom_rows SET "values" = ?, updated_at = ? WHERE id = ?',
    );
    for (const r of rows) {
      const values = validateValues(columns, r.values);
      if (r.id) {
        const current = getRow(ctx, r.id);
        if (current.tableId !== tableId) throw new ValidationError('La fila es de otra tabla.');
        update.run(JSON.stringify(mergeValues(current.values, values)), now, r.id);
        ids.push(r.id);
      } else {
        let position = ++maxPos;
        if (r.afterId) {
          const i = positions.findIndex((p) => p.id === r.afterId);
          if (i >= 0) {
            const next = positions[i + 1];
            position = next
              ? (positions[i]!.position + next.position) / 2
              : positions[i]!.position + 1;
            maxPos = Math.max(maxPos, position);
          }
        }
        const id = newId();
        insert.run(id, tableId, JSON.stringify(mergeValues({}, values)), position, now, now);
        ids.push(id);
      }
    }
    touchTable(ctx, tableId);
  });
  tx();
  const byId = new Map(listRows(ctx, tableId).map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)!).filter(Boolean);
}

/** Etiquetas de las fichas y filas relacionadas en la tabla (id → título). */
export function relationLabels(ctx: AppContext, tableId: string): RelationLabels {
  const columns = listColumns(ctx, tableId).filter(
    (c) => c.type === 'relation' && c.options.target,
  );
  if (!columns.length) return {};
  const rows = listRows(ctx, tableId);
  const labels: RelationLabels = {};
  for (const col of columns) {
    const ids = new Set<string>();
    for (const r of rows) {
      const v = r.values[col.id];
      if (Array.isArray(v)) v.forEach((x) => ids.add(x));
    }
    if (!ids.size) continue;
    const target = col.options.target!;
    if (target.startsWith('table:')) {
      const other = target.slice(6);
      const otherCols = listColumns(ctx, other);
      const first = otherCols[0];
      for (const r of listRows(ctx, other)) {
        if (ids.has(r.id))
          labels[r.id] = first
            ? cellText(first, r.values[first.id] ?? null) || 'Sin título'
            : 'Fila';
      }
    } else {
      const list = [...ids];
      for (let i = 0; i < list.length; i += 500) {
        const chunk = list.slice(i, i + 500);
        const found = ctx.sqlite
          .prepare(
            `SELECT entity_id AS id, title FROM search_index WHERE entity_type = ? AND entity_id IN (${chunk.map(() => '?').join(',')})`,
          )
          .all(target, ...chunk) as { id: string; title: string }[];
        for (const f of found) labels[f.id] = f.title;
      }
    }
  }
  return labels;
}

/** Importa las hojas de un Excel o un CSV como tablas nuevas, detectando el tipo de cada columna. */
export async function importTables(
  ctx: AppContext,
  fileName: string,
  buffer: Buffer,
  options: { gameId?: string | null; name?: string } = {},
): Promise<CustomTableDetail[]> {
  const sheets = await readSheets(fileName, buffer);
  const created: CustomTableDetail[] = [];
  for (const sheet of sheets) {
    if (sheet.headers.length > MAX_COLUMNS) {
      throw new ValidationError(`La hoja «${sheet.name}» tiene más de ${MAX_COLUMNS} columnas.`);
    }
    const baseName = fileName.replace(/\.[^.]+$/, '');
    const name = options.name ?? (sheets.length > 1 ? `${baseName} · ${sheet.name}` : baseName);
    const defs = sheet.headers.map((h, i) => {
      const d = detectColumnType(sheet.rows.map((r) => r[i]));
      return {
        name: h.slice(0, 120),
        type: d.type,
        options: d.currency ? { currency: d.currency } : {},
      };
    });
    const table = createTable(
      ctx,
      { name: name.slice(0, 200), gameId: options.gameId ?? null },
      { columns: defs },
    );
    const columns = table.columns;
    const tx = ctx.sqlite.transaction(() => {
      const now = ctx.nowISO();
      const insert = ctx.sqlite.prepare(
        'INSERT INTO custom_rows (id, table_id, "values", position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      );
      const choiceMap = new Map(columns.map((c) => [c.id, [...(c.options.choices ?? [])]]));
      sheet.rows.forEach((r, n) => {
        const values: Record<string, CellValue> = {};
        columns.forEach((col, i) => {
          const text = r[i] ?? '';
          if (!text) return;
          const live = { ...col, options: { ...col.options, choices: choiceMap.get(col.id) } };
          const res = coerceText(live, text, newId);
          if (res.newChoices) choiceMap.get(col.id)!.push(...res.newChoices);
          const v = res.invalid ? null : res.value;
          if (v !== null && v !== false && !(Array.isArray(v) && v.length === 0))
            values[col.id] = v;
        });
        insert.run(newId(), table.id, JSON.stringify(values), n + 1, now, now);
      });
      for (const col of columns) {
        const choices = choiceMap.get(col.id)!;
        if (choices.length) {
          ctx.sqlite
            .prepare('UPDATE custom_columns SET options = ? WHERE id = ?')
            .run(JSON.stringify({ ...col.options, choices }), col.id);
        }
      }
    });
    tx();
    indexTable(ctx, table.id);
    logActivity(ctx, {
      entityType: 'custom_table',
      entityId: table.id,
      action: 'importar',
      summary: `Tabla «${table.name}» importada (${sheet.rows.length} filas)`,
    });
    created.push(getTable(ctx, table.id));
  }
  return created;
}

/** Exporta una tabla (con los filtros y el orden de una vista) a Excel o CSV. */
export async function exportTable(
  ctx: AppContext,
  tableId: string,
  format: 'xlsx' | 'csv',
  viewId?: string,
): Promise<{ buffer: Buffer; name: string; type: string }> {
  const table = getTable(ctx, tableId);
  const view = viewId ? table.views.find((v) => v.id === viewId) : undefined;
  const labels = relationLabels(ctx, tableId);
  const hidden = new Set(view?.config.hidden ?? []);
  const columns = table.columns.filter((c) => !hidden.has(c.id));
  let rows = computeRows(table.columns, listRows(ctx, tableId), todayISO(ctx.now()));
  if (view) rows = applyView(table.columns, rows, view.config, { labels });
  const name = safeFileName(
    `${table.name}${view && table.views.length > 1 ? ` (${view.name})` : ''}`,
  );
  if (format === 'csv') {
    const data = rows.map((r) =>
      columns.map((c) => cellText(c, r.computed[c.id] as CellValue, labels)),
    );
    const csv = Papa.unparse({ fields: columns.map((c) => c.name), data });
    return {
      buffer: Buffer.from(`\uFEFF${csv}`, 'utf8'),
      name: `${name}.csv`,
      type: 'text/csv; charset=utf-8',
    };
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = 'L10N Suite';
  const ws = wb.addWorksheet(table.name.slice(0, 31).replace(/[\\/*?:[\]]/g, ' ') || 'Tabla');
  ws.columns = columns.map((c) => ({
    header: c.name,
    key: c.id,
    width: Math.min(60, Math.max(10, Math.round((c.width ?? 180) / 7))),
  }));
  for (const r of rows) {
    const record: Record<string, unknown> = {};
    for (const c of columns) {
      const v = r.computed[c.id];
      if (v == null) continue;
      if ((c.type === 'number' || c.type === 'percent') && typeof v === 'number')
        record[c.id] = c.type === 'percent' ? v / 100 : v;
      else if (c.type === 'currency' && typeof v === 'number') record[c.id] = v / 100;
      else if (c.type === 'date' && typeof v === 'string')
        record[c.id] = new Date(`${v}T00:00:00Z`);
      else if (c.type === 'checkbox') record[c.id] = v ? 'Sí' : 'No';
      else if (c.type === 'formula' && typeof v === 'number') record[c.id] = v;
      else record[c.id] = cellText(c, v as CellValue, labels);
    }
    ws.addRow(record);
  }
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.type === 'currency') col.numFmt = `#,##0.00 "${c.options.currency ?? 'EUR'}"`;
    if (c.type === 'percent') col.numFmt = '0.##%';
    if (c.type === 'date') col.numFmt = 'dd/mm/yyyy';
  });
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: Math.max(1, columns.length) },
  };
  return {
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
    name: `${name}.xlsx`,
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

/** Borra definitivamente las filas que llevan más de 30 días eliminadas. */
export function purgeDeletedRows(ctx: AppContext): number {
  const limit = new Date(ctx.now());
  limit.setDate(limit.getDate() - ROW_TRASH_DAYS);
  const exists = ctx.sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'custom_rows'")
    .get();
  if (!exists) return 0;
  return ctx.sqlite
    .prepare('DELETE FROM custom_rows WHERE deleted_at IS NOT NULL AND deleted_at < ?')
    .run(limit.toISOString()).changes;
}

export function registerTableEntity(): void {
  registerTrashable({
    type: 'custom_table',
    table: 'custom_tables',
    titleSql: 'name',
    onRestore: (ctx, id) => indexTable(ctx, id),
    // Columnas, filas y vistas se borran en cascada con la tabla.
  });
}

export async function tableRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });

  app.get('/api/tables', async (req) => {
    const q = parse(z.object({ gameId: idSchema.optional() }), req.query);
    return listTables(ctx, q);
  });

  app.post('/api/tables', async (req, reply) => {
    reply.code(201);
    return createTable(ctx, req.body);
  });

  app.post('/api/tables/import', async (req, reply) => {
    if (!req.isMultipart()) throw new ValidationError('Sube el archivo como multipart/form-data.');
    const part = await req.file();
    if (!part) throw new ValidationError('Falta el archivo.');
    const buffer = await part.toBuffer();
    const fields = part.fields as Record<string, { value?: string } | undefined>;
    const gameId = fields.gameId?.value || null;
    assertExists(ctx, 'games', gameId, 'El juego');
    reply.code(201);
    return importTables(ctx, part.filename, buffer, { gameId });
  });

  app.get('/api/tables/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return getTable(ctx, id);
  });

  app.patch('/api/tables/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    tableExists(ctx, id);
    const patch = parse(tableUpdateSchema, req.body);
    assertExists(ctx, 'games', patch.gameId, 'El juego');
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, value: unknown) => {
      sets.push(`${col} = ?`);
      params.push(value);
    };
    if (patch.name !== undefined) set('name', patch.name);
    if (patch.icon !== undefined) set('icon', patch.icon);
    if (patch.description !== undefined) set('description', patch.description);
    if (patch.gameId !== undefined) set('game_id', patch.gameId);
    if (sets.length) {
      ctx.sqlite
        .prepare(`UPDATE custom_tables SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
        .run(...params, ctx.nowISO(), id);
    }
    indexTable(ctx, id);
    return getTable(ctx, id);
  });

  app.delete('/api/tables/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    tableExists(ctx, id);
    moveToTrash(ctx, 'custom_table', id);
    return { ok: true };
  });

  app.get('/api/tables/:id/rows', async (req) => {
    const { id } = parse(idParam, req.params);
    tableExists(ctx, id);
    return { rows: listRows(ctx, id), labels: relationLabels(ctx, id) };
  });

  app.post('/api/tables/:id/rows', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    reply.code(201);
    return upsertRows(ctx, id, req.body);
  });

  app.post('/api/tables/:id/rows/delete', async (req) => {
    const { id } = parse(idParam, req.params);
    tableExists(ctx, id);
    const { ids } = parse(z.object({ ids: z.array(idSchema).min(1).max(20_000) }), req.body);
    const now = ctx.nowISO();
    const stmt = ctx.sqlite.prepare(
      'UPDATE custom_rows SET deleted_at = ? WHERE id = ? AND table_id = ? AND deleted_at IS NULL',
    );
    let n = 0;
    ctx.sqlite.transaction(() => {
      for (const rowId of ids) n += stmt.run(now, rowId, id).changes;
      touchTable(ctx, id);
    })();
    return { deleted: n };
  });

  app.post('/api/tables/:id/rows/restore', async (req) => {
    const { id } = parse(idParam, req.params);
    tableExists(ctx, id);
    const { ids } = parse(z.object({ ids: z.array(idSchema).min(1).max(20_000) }), req.body);
    const stmt = ctx.sqlite.prepare(
      'UPDATE custom_rows SET deleted_at = NULL WHERE id = ? AND table_id = ?',
    );
    let n = 0;
    ctx.sqlite.transaction(() => {
      for (const rowId of ids) n += stmt.run(rowId, id).changes;
    })();
    return { restored: n };
  });

  app.patch('/api/table-rows/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        values: z.record(z.string(), z.unknown()).optional(),
        position: z.number().optional(),
      }),
      req.body,
    );
    const row = getRow(ctx, id);
    if (body.values) upsertRows(ctx, row.tableId, { rows: [{ id, values: body.values }] });
    if (body.position !== undefined) {
      ctx.sqlite
        .prepare('UPDATE custom_rows SET position = ?, updated_at = ? WHERE id = ?')
        .run(body.position, ctx.nowISO(), id);
    }
    return getRow(ctx, id);
  });

  app.post('/api/tables/:id/columns', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    tableExists(ctx, id);
    const input = parse(columnInputSchema, req.body);
    const colId = insertColumn(ctx, id, { ...input, options: input.options });
    touchTable(ctx, id);
    reply.code(201);
    return getColumn(ctx, colId);
  });

  app.patch('/api/table-columns/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return updateColumn(ctx, id, req.body);
  });

  app.delete('/api/table-columns/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    deleteColumn(ctx, id);
    return { ok: true };
  });

  app.post('/api/tables/:id/views', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    tableExists(ctx, id);
    const input = parse(viewInputSchema, req.body);
    const viewId = insertView(ctx, id, input.name, input.type, input.config);
    reply.code(201);
    return listViews(ctx, id).find((v) => v.id === viewId);
  });

  app.patch('/api/table-views/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(viewUpdateSchema, req.body);
    const view = ctx.sqlite
      .prepare('SELECT table_id AS tableId FROM custom_views WHERE id = ?')
      .get(id) as { tableId: string } | undefined;
    if (!view) throw new NotFoundError('La vista');
    tableExists(ctx, view.tableId);
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, value: unknown) => {
      sets.push(`${col} = ?`);
      params.push(value);
    };
    if (patch.name !== undefined) set('name', patch.name);
    if (patch.type !== undefined) set('type', patch.type);
    if (patch.config !== undefined) set('config', JSON.stringify(patch.config));
    if (sets.length) {
      ctx.sqlite
        .prepare(`UPDATE custom_views SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
        .run(...params, ctx.nowISO(), id);
    }
    return listViews(ctx, view.tableId).find((v) => v.id === id);
  });

  app.delete('/api/table-views/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const view = ctx.sqlite
      .prepare('SELECT table_id AS tableId FROM custom_views WHERE id = ?')
      .get(id) as { tableId: string } | undefined;
    if (!view) throw new NotFoundError('La vista');
    if (listViews(ctx, view.tableId).length <= 1)
      throw new ValidationError('La tabla debe tener al menos una vista.');
    ctx.sqlite.prepare('DELETE FROM custom_views WHERE id = ?').run(id);
    return { ok: true };
  });

  app.get('/api/tables/:id/export', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const q = parse(
      z.object({ format: z.enum(['xlsx', 'csv']).default('xlsx'), viewId: idSchema.optional() }),
      req.query,
    );
    const file = await exportTable(ctx, id, q.format, q.viewId);
    reply
      .type(file.type)
      .header('Content-Disposition', contentDisposition('attachment', file.name));
    return reply.send(file.buffer);
  });
}
