import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { z } from 'zod';
import {
  IMPORT_TARGETS,
  idSchema,
  importCommitSchema,
  normalizeForSearch,
  parseDurationMinutes,
  parseFlexibleDate,
  splitList,
  type ImportBatch,
  type ImportPreview,
  type ImportResult,
  type ImportTarget,
} from '@l10n/shared';
import type { AppContext } from '../context';
import { NotFoundError, ValidationError } from '../lib/errors';
import { newId } from '../lib/ids';
import { parse } from '../lib/validate';
import { logActivity } from '../services/activity';
import { removeFromIndex } from '../services/search';
import { createClient } from './work/clients';
import { createGame } from './work/games';
import { createProject } from './work/projects';
import { createTask, listAreas, listStatuses, listTaskLists } from './work/tasks';

interface ParsedFile {
  fileName: string;
  sheetName: string | null;
  headers: string[];
  rows: Record<string, string>[];
  createdAt: number;
}

/** Archivos leídos pendientes de confirmar (se descartan a la hora). */
const pending = new Map<string, ParsedFile>();
const MAX_ROWS = 50_000;

function cleanup() {
  const limit = Date.now() - 60 * 60 * 1000;
  for (const [k, v] of pending) if (v.createdAt < limit) pending.delete(k);
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('text' in value) return String(value.text);
    if ('hyperlink' in value) return String((value as { hyperlink: string }).hyperlink);
    return '';
  }
  return String(value);
}

function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const base = h.trim() || `Columna ${i + 1}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base} (${n + 1})`;
  });
}

export async function parseTabularFile(
  fileName: string,
  buffer: Buffer,
): Promise<Omit<ParsedFile, 'createdAt'>> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
    if (!ws) throw new ValidationError('El libro de Excel está vacío.');
    const headerRow = ws.getRow(1);
    const width = Math.max(headerRow.cellCount, ws.actualColumnCount);
    const headers = uniqueHeaders(
      Array.from({ length: width }, (_, i) => cellText(headerRow.getCell(i + 1).value)),
    );
    const rows: Record<string, string>[] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1 || rows.length >= MAX_ROWS) return;
      const rec: Record<string, string> = {};
      let any = false;
      headers.forEach((h, i) => {
        const v = cellText(row.getCell(i + 1).value).trim();
        rec[h] = v;
        if (v) any = true;
      });
      if (any) rows.push(rec);
    });
    return { fileName, sheetName: ws.name, headers, rows };
  }
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const result = Papa.parse<string[]>(text, {
      skipEmptyLines: 'greedy',
      delimiter: lower.endsWith('.tsv') ? '\t' : '',
    });
    const [head, ...body] = result.data;
    if (!head) throw new ValidationError('El archivo está vacío.');
    const headers = uniqueHeaders(head.map(String));
    const rows = body
      .slice(0, MAX_ROWS)
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? '').trim()])));
    return { fileName, sheetName: null, headers, rows };
  }
  throw new ValidationError(
    'Formato no admitido. Usa un archivo .csv o .xlsx (en Google Sheets: Archivo → Descargar).',
  );
}

type Created = { entityType: string; entityId: string };

function val(row: Record<string, string>, mapping: Record<string, string>, field: string): string {
  const col = mapping[field];
  return col ? (row[col] ?? '').trim() : '';
}

function priorityOf(text: string): number {
  const t = normalizeForSearch(text);
  if (!t) return 3;
  if (['1', 'urgent', 'urgente'].includes(t)) return 1;
  if (['2', 'high', 'alta'].includes(t)) return 2;
  if (['4', 'low', 'baja'].includes(t)) return 4;
  return 3;
}

/**
 * Crea las fichas de la importación en una única transacción: o se importa todo lo válido
 * o, si algo falla de forma inesperada, no se importa nada.
 */
export function commitImport(
  ctx: AppContext,
  input: z.input<typeof importCommitSchema>,
): ImportResult {
  const opts = parse(importCommitSchema, input);
  const file = pending.get(opts.token);
  if (!file) throw new ValidationError('La vista previa ha caducado. Vuelve a subir el archivo.');
  const def = IMPORT_TARGETS[opts.target];
  for (const f of def.fields) {
    if ('required' in f && f.required && !opts.mapping[f.key]) {
      throw new ValidationError(`Falta indicar la columna de «${f.label}».`);
    }
  }
  const created: Created[] = [];
  const errors: { row: number; message: string }[] = [];
  let skipped = 0;
  const m = opts.mapping;

  const tx = ctx.sqlite.transaction(() => {
    const findOrCreateTag = (name: string): string => {
      const row = ctx.sqlite
        .prepare('SELECT id FROM tags WHERE lower(name) = lower(?) AND deleted_at IS NULL')
        .get(name) as { id: string } | undefined;
      if (row) return row.id;
      const id = newId();
      const now = ctx.nowISO();
      ctx.sqlite
        .prepare(
          'INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(id, name.slice(0, 60), '#6b7280', now, now);
      created.push({ entityType: 'tag', entityId: id });
      return id;
    };
    const byName = (table: string, col: string, name: string): string | null => {
      if (!name) return null;
      const row = ctx.sqlite
        .prepare(`SELECT id FROM ${table} WHERE lower(${col}) = lower(?) AND deleted_at IS NULL`)
        .get(name) as { id: string } | undefined;
      return row?.id ?? null;
    };

    // Datos auxiliares para tareas
    const statuses = listStatuses(ctx);
    const statusOf = (name: string): string => {
      const n = normalizeForSearch(name);
      const exact = statuses.find((s) => normalizeForSearch(s.name) === n);
      if (exact) return exact.id;
      const cat = /complet|done|hech|cerrad|closed|finish|termin/.test(n)
        ? 'done'
        : /progres|curso|review|revision|doing|working/.test(n)
          ? 'doing'
          : 'todo';
      return statuses.find((s) => s.category === cat)!.id;
    };
    const areas = listAreas(ctx);
    const areaOf = (name: string): string | null => {
      if (!name) return null;
      const n = normalizeForSearch(name);
      const hit = areas.find((a) => normalizeForSearch(a.name) === n);
      if (hit) return hit.id;
      const id = newId();
      ctx.sqlite
        .prepare('INSERT INTO areas (id, name, color, sort_order) VALUES (?, ?, ?, ?)')
        .run(id, name.slice(0, 60), '#64748b', areas.length + 1);
      areas.push({ id, name, color: '#64748b', sortOrder: areas.length + 1 });
      created.push({ entityType: 'area', entityId: id });
      return id;
    };
    const lists = listTaskLists(ctx);
    const listOf = (name: string, areaId: string): string | null => {
      if (!name) return null;
      const n = normalizeForSearch(name);
      const hit = lists.find((l) => l.areaId === areaId && normalizeForSearch(l.name) === n);
      if (hit) return hit.id;
      const id = newId();
      const now = ctx.nowISO();
      ctx.sqlite
        .prepare(
          'INSERT INTO task_lists (id, area_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(id, areaId, name.slice(0, 100), lists.length + 1, now, now);
      lists.push({ id, areaId, name, color: null, sortOrder: lists.length + 1 });
      created.push({ entityType: 'task_list', entityId: id });
      return id;
    };
    const externalToId = new Map<string, string>();
    const parentLinks: { id: string; parentExternal: string }[] = [];

    file.rows.forEach((row, index) => {
      const rowNumber = index + 2; // fila 1 = encabezados
      const sp = `imp_${index}`;
      ctx.sqlite.exec(`SAVEPOINT ${sp}`);
      try {
        switch (opts.target) {
          case 'clients': {
            const name = val(row, m, 'name');
            if (opts.skipDuplicates && byName('clients', 'name', name)) {
              skipped++;
              break;
            }
            const kindText = normalizeForSearch(val(row, m, 'kind'));
            const kind = /estudio|studio|desarroll/.test(kindText)
              ? 'studio'
              : /editor|publisher/.test(kindText)
                ? 'publisher'
                : /particular|individual/.test(kindText)
                  ? 'individual'
                  : 'agency';
            const currency = val(row, m, 'currency').toUpperCase();
            const c = createClient(ctx, {
              name,
              kind,
              country: val(row, m, 'country'),
              email: val(row, m, 'email'),
              website: val(row, m, 'website'),
              taxId: val(row, m, 'taxId'),
              platform: val(row, m, 'platform'),
              notes: val(row, m, 'notes'),
              ...(currency.length === 3 ? { currency } : {}),
            });
            created.push({ entityType: 'client', entityId: c.id });
            break;
          }
          case 'games': {
            const title = val(row, m, 'title');
            if (opts.skipDuplicates && byName('games', 'title', title)) {
              skipped++;
              break;
            }
            const year = Number(val(row, m, 'releaseYear'));
            const g = createGame(ctx, {
              title,
              originalTitle: val(row, m, 'originalTitle'),
              titleEs: val(row, m, 'titleEs'),
              titleEn: val(row, m, 'titleEn'),
              developer: val(row, m, 'developer'),
              publisher: val(row, m, 'publisher'),
              releaseYear: Number.isInteger(year) && year > 1950 ? year : null,
              genres: splitList(val(row, m, 'genres')),
              platforms: splitList(val(row, m, 'platforms')),
              notes: val(row, m, 'notes'),
            });
            created.push({ entityType: 'game', entityId: g.id });
            break;
          }
          case 'projects': {
            const name = val(row, m, 'name');
            if (opts.skipDuplicates && byName('projects', 'name', name)) {
              skipped++;
              break;
            }
            let clientId = byName('clients', 'name', val(row, m, 'client'));
            if (!clientId && val(row, m, 'client')) {
              clientId = createClient(ctx, { name: val(row, m, 'client') }).id;
              created.push({ entityType: 'client', entityId: clientId });
            }
            let gameId = byName('games', 'title', val(row, m, 'game'));
            if (!gameId && val(row, m, 'game')) {
              gameId = createGame(ctx, { title: val(row, m, 'game') }).id;
              created.push({ entityType: 'game', entityId: gameId });
            }
            const st = normalizeForSearch(val(row, m, 'status'));
            const status = /complet|termin|done|cerrad/.test(st)
              ? 'completed'
              : /pausa|paused|hold/.test(st)
                ? 'paused'
                : /archiv/.test(st)
                  ? 'archived'
                  : /prospect|presupuesto/.test(st)
                    ? 'prospect'
                    : 'active';
            const lang = (v: string) => (/^[a-z]{2}$/i.test(v) ? v.toLowerCase() : null);
            const p = createProject(ctx, {
              name,
              clientId,
              gameId,
              status,
              sourceLang: lang(val(row, m, 'sourceLang')),
              targetLang: lang(val(row, m, 'targetLang')),
              notes: val(row, m, 'notes'),
            });
            created.push({ entityType: 'project', entityId: p.id });
            break;
          }
          case 'tasks': {
            const title = val(row, m, 'title');
            const areaId = areaOf(val(row, m, 'area'));
            const listName = val(row, m, 'list');
            const listId = listName
              ? listOf(listName, areaId ?? areaOf('Trabajo') ?? 'area-work')
              : null;
            const estimateRaw = val(row, m, 'estimate');
            // ClickUp exporta «Time Estimated» en milisegundos.
            const estimate = /^\d{5,}$/.test(estimateRaw)
              ? Math.round(Number(estimateRaw) / 60000)
              : parseDurationMinutes(estimateRaw);
            const statusId = val(row, m, 'status') ? statusOf(val(row, m, 'status')) : undefined;
            const t = createTask(ctx, {
              title,
              description: val(row, m, 'description'),
              statusId,
              priority: priorityOf(val(row, m, 'priority')),
              areaId:
                areaId ?? (listId ? lists.find((l) => l.id === listId)?.areaId : null) ?? null,
              listId,
              projectId: byName('projects', 'name', val(row, m, 'project')),
              dueDate: parseFlexibleDate(val(row, m, 'dueDate'), opts.dateFormat),
              startDate: parseFlexibleDate(val(row, m, 'startDate'), opts.dateFormat),
              estimateMinutes: estimate,
            });
            for (const tag of splitList(val(row, m, 'tags'))) {
              ctx.sqlite
                .prepare(
                  'INSERT OR IGNORE INTO taggings (tag_id, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?)',
                )
                .run(findOrCreateTag(tag), 'task', t.id, ctx.nowISO());
            }
            const ext = val(row, m, 'externalId');
            if (ext) externalToId.set(ext, t.id);
            const parentExt = val(row, m, 'parentExternalId');
            if (parentExt) parentLinks.push({ id: t.id, parentExternal: parentExt });
            created.push({ entityType: 'task', entityId: t.id });
            break;
          }
        }
        ctx.sqlite.exec(`RELEASE ${sp}`);
      } catch (error) {
        ctx.sqlite.exec(`ROLLBACK TO ${sp}`);
        ctx.sqlite.exec(`RELEASE ${sp}`);
        errors.push({ row: rowNumber, message: (error as Error).message });
      }
    });

    for (const link of parentLinks) {
      const parentId = externalToId.get(link.parentExternal);
      if (parentId && parentId !== link.id)
        ctx.sqlite.prepare('UPDATE tasks SET parent_id = ? WHERE id = ?').run(parentId, link.id);
    }

    const batchId = newId();
    ctx.sqlite
      .prepare(
        'INSERT INTO import_batches (id, kind, file_name, row_count, items, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        batchId,
        opts.target,
        file.fileName,
        created.length,
        JSON.stringify(created),
        ctx.nowISO(),
      );
    return batchId;
  });

  const batchId = tx();
  pending.delete(opts.token);
  const count = created.filter(
    (c) =>
      c.entityType ===
      ({ clients: 'client', games: 'game', projects: 'project', tasks: 'task' } as const)[
        opts.target
      ],
  ).length;
  logActivity(ctx, {
    entityType: 'import',
    entityId: batchId,
    action: 'importar',
    summary: `Importación de ${def.label.toLowerCase()} desde «${file.fileName}»: ${count} creados`,
  });
  return { batchId, created: count, skipped, errors };
}

/** Deshace una importación: borra definitivamente las fichas que creó. */
/** Registra una importación para poder deshacerla de una vez desde Ajustes → Importar. */
export function recordImportBatch(
  ctx: AppContext,
  kind: string,
  fileName: string | null,
  items: Created[],
): string {
  const id = newId();
  ctx.sqlite
    .prepare(
      'INSERT INTO import_batches (id, kind, file_name, row_count, items, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(id, kind, fileName, items.length, JSON.stringify(items), ctx.nowISO());
  return id;
}

export function undoImport(ctx: AppContext, batchId: string): number {
  const row = ctx.sqlite
    .prepare('SELECT items, undone_at AS undoneAt FROM import_batches WHERE id = ?')
    .get(batchId) as { items: string; undoneAt: string | null } | undefined;
  if (!row) throw new NotFoundError('La importación');
  if (row.undoneAt) throw new ValidationError('Esta importación ya se deshizo.');
  const items = JSON.parse(row.items) as Created[];
  const tables: Record<string, string> = {
    task: 'tasks',
    project: 'projects',
    game: 'games',
    client: 'clients',
    tag: 'tags',
    task_list: 'task_lists',
    area: 'areas',
    page: 'pages',
    custom_table: 'custom_tables',
    glossary_term: 'glossary_terms',
    character: 'characters',
    corpus_document: 'corpus_documents',
    reference: 'bib_references',
  };
  const order = [
    'reference',
    'corpus_document',
    'glossary_term',
    'character',
    'page',
    'custom_table',
    'task',
    'project',
    'game',
    'client',
    'tag',
    'task_list',
    'area',
  ];
  const tx = ctx.sqlite.transaction(() => {
    for (const type of order) {
      for (const item of items.filter((i) => i.entityType === type)) {
        const table = tables[type]!;
        if (type === 'task') {
          ctx.sqlite
            .prepare("DELETE FROM checklist_items WHERE entity_type = 'task' AND entity_id = ?")
            .run(item.entityId);
          ctx.sqlite
            .prepare('UPDATE tasks SET parent_id = NULL WHERE parent_id = ?')
            .run(item.entityId);
        }
        if (type === 'area') {
          // Las tareas que se hayan movido a esa área después se quedan sin área.
          ctx.sqlite
            .prepare('UPDATE tasks SET area_id = NULL WHERE area_id = ?')
            .run(item.entityId);
        }
        if (type === 'page') {
          ctx.sqlite
            .prepare("DELETE FROM links WHERE source_type = 'page' AND source_id = ?")
            .run(item.entityId);
        }
        ctx.sqlite
          .prepare('DELETE FROM taggings WHERE entity_type = ? AND entity_id = ?')
          .run(type, item.entityId);
        ctx.sqlite.prepare(`DELETE FROM ${table} WHERE id = ?`).run(item.entityId);
        removeFromIndex(ctx, type, item.entityId);
      }
    }
    ctx.sqlite
      .prepare('UPDATE import_batches SET undone_at = ? WHERE id = ?')
      .run(ctx.nowISO(), batchId);
  });
  tx();
  return items.length;
}

export async function importRoutes(app: FastifyInstance) {
  const ctx = app.ctx;

  app.post('/api/import/preview', async (req): Promise<ImportPreview> => {
    cleanup();
    if (!req.isMultipart()) throw new ValidationError('Sube el archivo como multipart/form-data.');
    const part = await req.file();
    if (!part) throw new ValidationError('No se ha recibido ningún archivo.');
    const buffer = await part.toBuffer();
    const parsed = await parseTabularFile(part.filename, buffer);
    const token = newId();
    pending.set(token, { ...parsed, createdAt: Date.now() });
    return {
      token,
      fileName: parsed.fileName,
      sheetName: parsed.sheetName,
      headers: parsed.headers,
      rows: parsed.rows.slice(0, 20),
      totalRows: parsed.rows.length,
    };
  });

  app.post('/api/import/commit', async (req) =>
    commitImport(ctx, req.body as z.input<typeof importCommitSchema>),
  );

  app.get(
    '/api/import/batches',
    async () =>
      ctx.sqlite
        .prepare(
          `SELECT id, kind, file_name AS fileName, row_count AS rowCount, created_at AS createdAt, undone_at AS undoneAt
         FROM import_batches ORDER BY created_at DESC LIMIT 50`,
        )
        .all() as ImportBatch[],
  );

  app.post('/api/import/batches/:id/undo', async (req) => {
    const { id } = parse(z.object({ id: idSchema }), req.params);
    return { removed: undoImport(ctx, id) };
  });
}

export type { ImportTarget };
