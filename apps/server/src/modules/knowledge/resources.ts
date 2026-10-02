import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import {
  ADDRESS_FORMS,
  GRAMMATICAL_GENDERS,
  KO_SPEECH_LEVELS,
  TERM_CATEGORIES,
  TERM_STATUSES,
  characterInputSchema,
  characterUpdateSchema,
  glossaryTermInputSchema,
  glossaryTermUpdateSchema,
  idSchema,
  labelOf,
  normalizeForSearch,
  toNFC,
  type Character,
  type GlossaryTerm,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { safeFileName } from '../../lib/fs';
import { assertExists, columns, decodeRow, insertRow, selectList, updateRow } from '../../lib/sql';
import { readSheets } from '../../lib/tabular';
import { parse } from '../../lib/validate';
import { logActivity } from '../../services/activity';
import { indexEntity } from '../../services/search';
import { moveToTrash, registerTrashable } from '../../services/trash';
import { contentDisposition } from '../attachments';
import { recordImportBatch } from '../import';

const TERM_COLUMNS = columns({
  id: 'id',
  gameId: 'game_id',
  termKo: 'term_ko',
  termEs: 'term_es',
  termEn: 'term_en',
  category: 'category',
  status: 'status',
  context: 'context',
  source: 'source',
  notes: 'notes',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

const CHARACTER_COLUMNS = columns({
  id: 'id',
  gameId: 'game_id',
  nameKo: 'name_ko',
  nameEs: 'name_es',
  nameEn: 'name_en',
  gender: 'gender',
  addressForm: 'address_form',
  koSpeechLevel: 'ko_speech_level',
  speechStyle: 'speech_style',
  description: 'description',
  notes: 'notes',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

const TERM_SELECT = `SELECT ${selectList(TERM_COLUMNS, 't')}, g.title AS "gameTitle"
  FROM glossary_terms t LEFT JOIN games g ON g.id = t.game_id`;

function termTitle(t: Pick<GlossaryTerm, 'termKo' | 'termEs' | 'termEn'>): string {
  const src = t.termKo ?? t.termEn ?? '';
  return [src, t.termEs].filter(Boolean).join(' → ') || 'Término sin texto';
}

function indexTerm(ctx: AppContext, t: GlossaryTerm) {
  indexEntity(ctx, {
    entityType: 'glossary_term',
    entityId: t.id,
    title: termTitle(t),
    subtitle: ['Glosario', t.gameTitle, labelOf(TERM_STATUSES, t.status)]
      .filter(Boolean)
      .join(' · '),
    text: [t.termEn, t.context, t.notes].filter(Boolean).join(' '),
  });
}

export function getTerm(ctx: AppContext, id: string): GlossaryTerm {
  const row = ctx.sqlite.prepare(`${TERM_SELECT} WHERE t.id = ? AND t.deleted_at IS NULL`).get(id);
  if (!row) throw new NotFoundError('El término');
  return decodeRow<GlossaryTerm>(TERM_COLUMNS, row as Record<string, unknown>);
}

export function listTerms(
  ctx: AppContext,
  filter: { gameId?: string; q?: string },
): GlossaryTerm[] {
  const where = ['t.deleted_at IS NULL', '(g.deleted_at IS NULL OR g.id IS NULL)'];
  const params: unknown[] = [];
  if (filter.gameId) {
    where.push('t.game_id = ?');
    params.push(filter.gameId);
  }
  let rows = (
    ctx.sqlite
      .prepare(
        `${TERM_SELECT} WHERE ${where.join(' AND ')} ORDER BY lower(coalesce(t.term_ko, t.term_en, t.term_es))`,
      )
      .all(...params) as Record<string, unknown>[]
  ).map((r) => decodeRow<GlossaryTerm>(TERM_COLUMNS, r));
  if (filter.q) {
    const q = normalizeForSearch(filter.q);
    rows = rows.filter((t) =>
      normalizeForSearch(
        [t.termKo, t.termEs, t.termEn, t.context, t.notes].filter(Boolean).join(' '),
      ).includes(q),
    );
  }
  return rows;
}

function cleanTerm<
  T extends { termKo?: string | null; termEs?: string | null; termEn?: string | null },
>(t: T): T {
  return {
    ...t,
    ...(t.termKo !== undefined ? { termKo: t.termKo ? toNFC(t.termKo) : t.termKo } : {}),
    ...(t.termEs !== undefined ? { termEs: t.termEs ? toNFC(t.termEs) : t.termEs } : {}),
    ...(t.termEn !== undefined ? { termEn: t.termEn ? toNFC(t.termEn) : t.termEn } : {}),
  };
}

export function createTerm(ctx: AppContext, raw: unknown): GlossaryTerm {
  const input = cleanTerm(parse(glossaryTermInputSchema, raw));
  if (!input.termKo && !input.termEs && !input.termEn) {
    throw new ValidationError('Escribe el término en al menos un idioma.');
  }
  assertExists(ctx, 'games', input.gameId, 'El juego');
  const id = insertRow(ctx, 'glossary_terms', TERM_COLUMNS, input);
  const term = getTerm(ctx, id);
  indexTerm(ctx, term);
  return term;
}

const CHARACTER_SELECT = `SELECT ${selectList(CHARACTER_COLUMNS, 'c')} FROM characters c`;

function indexCharacter(ctx: AppContext, c: Character) {
  const game = ctx.sqlite.prepare('SELECT title FROM games WHERE id = ?').get(c.gameId) as
    { title: string } | undefined;
  indexEntity(ctx, {
    entityType: 'character',
    entityId: c.id,
    title: c.nameEs,
    subtitle: ['Personaje', game?.title, c.nameKo].filter(Boolean).join(' · '),
    text: [c.nameEn, c.speechStyle, c.description, c.notes].filter(Boolean).join(' '),
  });
}

export function getCharacter(ctx: AppContext, id: string): Character {
  const row = ctx.sqlite
    .prepare(`${CHARACTER_SELECT} WHERE c.id = ? AND c.deleted_at IS NULL`)
    .get(id);
  if (!row) throw new NotFoundError('El personaje');
  return decodeRow<Character>(CHARACTER_COLUMNS, row as Record<string, unknown>);
}

export function listCharacters(ctx: AppContext, gameId?: string): Character[] {
  const where = ['c.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (gameId) {
    where.push('c.game_id = ?');
    params.push(gameId);
  }
  return (
    ctx.sqlite
      .prepare(`${CHARACTER_SELECT} WHERE ${where.join(' AND ')} ORDER BY lower(c.name_es)`)
      .all(...params) as Record<string, unknown>[]
  ).map((r) => decodeRow<Character>(CHARACTER_COLUMNS, r));
}

const HEADER_ALIASES: Record<string, string[]> = {
  termKo: ['ko', 'kor', 'korean', 'coreano', 'origen', 'source', '한국어', '원문', 'ko-kr', 'kr'],
  termEs: [
    'es',
    'spa',
    'spanish',
    'espanol',
    'español',
    'destino',
    'target',
    'traduccion',
    'traducción',
    'es-es',
    '스페인어',
    '번역',
  ],
  termEn: ['en', 'eng', 'english', 'ingles', 'inglés', 'en-us', 'en-gb', '영어'],
  category: ['categoria', 'categoría', 'category', 'tipo', 'type', '분류'],
  status: ['estado', 'status'],
  context: ['contexto', 'context', 'descripcion', 'descripción', 'description', '설명'],
  source: ['fuente', 'source of term', 'referencia'],
  notes: ['notas', 'notes', 'comentarios', 'comments', 'nota', '비고'],
};

function mapHeaders(headers: string[]): Record<string, number> | null {
  const mapping: Record<string, number> = {};
  headers.forEach((h, i) => {
    const key = normalizeForSearch(h);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (mapping[field] === undefined && aliases.some((a) => normalizeForSearch(a) === key)) {
        mapping[field] = i;
        return;
      }
    }
  });
  return mapping.termKo !== undefined ||
    mapping.termEs !== undefined ||
    mapping.termEn !== undefined
    ? mapping
    : null;
}

function matchOption<T extends string>(
  list: readonly { value: T; label: string }[],
  text: string,
): T | null {
  const key = normalizeForSearch(text);
  if (!key) return null;
  return list.find((o) => normalizeForSearch(o.label) === key || o.value === key)?.value ?? null;
}

/**
 * Importa un glosario de Excel o CSV. Reconoce las cabeceras habituales (Coreano, Español,
 * Inglés, Contexto…); si no hay cabeceras, la columna A es el coreano y la B el español.
 * Los términos que ya existen (mismo coreano y español) no se duplican.
 */
export async function importGlossary(
  ctx: AppContext,
  gameId: string,
  fileName: string,
  buffer: Buffer,
): Promise<{ created: number; skipped: number; batchId: string | null }> {
  assertExists(ctx, 'games', gameId, 'El juego');
  const [sheet] = await readSheets(fileName, buffer);
  if (!sheet) throw new ValidationError('El archivo está vacío.');
  let mapping = mapHeaders(sheet.headers);
  let rows = sheet.rows;
  if (!mapping) {
    // Sin cabeceras: la primera fila también es un término.
    mapping = { termKo: 0, termEs: 1 };
    rows = [sheet.headers.map((h) => (/^Columna \d+$/.test(h) ? '' : h)), ...rows];
  }
  const existing = new Set(
    listTerms(ctx, { gameId }).map(
      (t) => `${normalizeForSearch(t.termKo ?? '')}|${normalizeForSearch(t.termEs ?? '')}`,
    ),
  );
  let skipped = 0;
  const created: { entityType: string; entityId: string }[] = [];
  const get = (r: string[], field: string) => {
    const i = mapping![field];
    return i === undefined ? '' : (r[i] ?? '').trim();
  };
  const tx = ctx.sqlite.transaction(() => {
    for (const r of rows) {
      const termKo = get(r, 'termKo');
      const termEs = get(r, 'termEs');
      const termEn = get(r, 'termEn');
      if (!termKo && !termEs && !termEn) continue;
      const key = `${normalizeForSearch(termKo)}|${normalizeForSearch(termEs)}`;
      if (existing.has(key)) {
        skipped++;
        continue;
      }
      existing.add(key);
      const t = createTerm(ctx, {
        gameId,
        termKo: termKo.slice(0, 500),
        termEs: termEs.slice(0, 500),
        termEn: termEn.slice(0, 500),
        category: matchOption(TERM_CATEGORIES, get(r, 'category')),
        status: matchOption(TERM_STATUSES, get(r, 'status')) ?? 'proposed',
        context: get(r, 'context').slice(0, 5000),
        source: get(r, 'source').slice(0, 500),
        notes: get(r, 'notes').slice(0, 5000),
      });
      created.push({ entityType: 'glossary_term', entityId: t.id });
    }
  });
  tx();
  const batchId = created.length ? recordImportBatch(ctx, 'Glosario', fileName, created) : null;
  if (created.length) {
    logActivity(ctx, {
      entityType: 'game',
      entityId: gameId,
      action: 'importar',
      summary: `Glosario importado: ${created.length} términos`,
    });
  }
  return { created: created.length, skipped, batchId };
}

/** Exporta el glosario de un juego a Excel (columna A coreano, B español, C inglés…). */
export async function exportGlossary(
  ctx: AppContext,
  gameId: string,
): Promise<{ buffer: Buffer; name: string }> {
  const game = ctx.sqlite
    .prepare('SELECT title FROM games WHERE id = ? AND deleted_at IS NULL')
    .get(gameId) as { title: string } | undefined;
  if (!game) throw new NotFoundError('El juego');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'L10N Suite';
  const ws = wb.addWorksheet('Glosario');
  ws.columns = [
    { header: 'Coreano', key: 'ko', width: 28 },
    { header: 'Español', key: 'es', width: 28 },
    { header: 'Inglés', key: 'en', width: 28 },
    { header: 'Categoría', key: 'category', width: 16 },
    { header: 'Estado', key: 'status', width: 12 },
    { header: 'Contexto', key: 'context', width: 40 },
    { header: 'Fuente', key: 'source', width: 20 },
    { header: 'Notas', key: 'notes', width: 40 },
  ];
  for (const t of listTerms(ctx, { gameId })) {
    ws.addRow({
      ko: t.termKo,
      es: t.termEs,
      en: t.termEn,
      category: t.category ? labelOf(TERM_CATEGORIES, t.category) : null,
      status: labelOf(TERM_STATUSES, t.status),
      context: t.context,
      source: t.source,
      notes: t.notes,
    });
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = 'A1:H1';
  const characters = listCharacters(ctx, gameId);
  if (characters.length) {
    const cs = wb.addWorksheet('Personajes');
    cs.columns = [
      { header: 'Coreano', key: 'ko', width: 20 },
      { header: 'Español', key: 'es', width: 20 },
      { header: 'Inglés', key: 'en', width: 20 },
      { header: 'Género gramatical', key: 'gender', width: 22 },
      { header: 'Tratamiento', key: 'address', width: 22 },
      { header: 'Nivel de habla (KO)', key: 'level', width: 20 },
      { header: 'Forma de hablar', key: 'style', width: 40 },
      { header: 'Descripción', key: 'desc', width: 40 },
    ];
    for (const c of characters) {
      cs.addRow({
        ko: c.nameKo,
        es: c.nameEs,
        en: c.nameEn,
        gender: labelOf(GRAMMATICAL_GENDERS, c.gender),
        address: c.addressForm ? labelOf(ADDRESS_FORMS, c.addressForm) : null,
        level: c.koSpeechLevel ? labelOf(KO_SPEECH_LEVELS, c.koSpeechLevel) : null,
        style: c.speechStyle,
        desc: c.description,
      });
    }
    cs.getRow(1).font = { bold: true };
    cs.views = [{ state: 'frozen', ySplit: 1 }];
  }
  return {
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
    name: `${safeFileName(`Glosario ${game.title}`)}.xlsx`,
  };
}

export function registerResourceEntities(): void {
  registerTrashable({
    type: 'glossary_term',
    table: 'glossary_terms',
    titleSql:
      "coalesce(term_ko, term_en, '') || CASE WHEN term_es IS NULL THEN '' ELSE ' → ' || term_es END",
    onRestore: (ctx, id) => indexTerm(ctx, getTerm(ctx, id)),
  });
  registerTrashable({
    type: 'character',
    table: 'characters',
    titleSql: 'name_es',
    onRestore: (ctx, id) => indexCharacter(ctx, getCharacter(ctx, id)),
  });
}

export async function resourceRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });

  app.get('/api/glossary', async (req) => {
    const q = parse(
      z.object({ gameId: idSchema.optional(), q: z.string().max(200).optional() }),
      req.query,
    );
    return listTerms(ctx, q);
  });

  app.post('/api/glossary', async (req, reply) => {
    reply.code(201);
    return createTerm(ctx, req.body);
  });

  app.patch('/api/glossary/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = cleanTerm(parse(glossaryTermUpdateSchema, req.body));
    updateRow(ctx, 'glossary_terms', TERM_COLUMNS, id, patch, { what: 'El término' });
    const term = getTerm(ctx, id);
    if (!term.termKo && !term.termEs && !term.termEn) {
      throw new ValidationError('Escribe el término en al menos un idioma.');
    }
    indexTerm(ctx, term);
    return term;
  });

  app.delete('/api/glossary/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    getTerm(ctx, id);
    moveToTrash(ctx, 'glossary_term', id);
    return { ok: true };
  });

  app.post('/api/glossary/import', async (req) => {
    if (!req.isMultipart()) throw new ValidationError('Sube el archivo como multipart/form-data.');
    const part = await req.file();
    if (!part) throw new ValidationError('Falta el archivo.');
    const buffer = await part.toBuffer();
    const fields = part.fields as Record<string, { value?: string } | undefined>;
    const gameId = fields.gameId?.value;
    if (!gameId) throw new ValidationError('Elige un juego.');
    return importGlossary(ctx, gameId, part.filename, buffer);
  });

  app.get('/api/glossary/export', async (req, reply) => {
    const q = parse(z.object({ gameId: idSchema }), req.query);
    const file = await exportGlossary(ctx, q.gameId);
    reply
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', contentDisposition('attachment', file.name));
    return reply.send(file.buffer);
  });

  app.get('/api/characters', async (req) => {
    const q = parse(z.object({ gameId: idSchema.optional() }), req.query);
    return listCharacters(ctx, q.gameId);
  });

  app.post('/api/characters', async (req, reply) => {
    const input = parse(characterInputSchema, req.body);
    assertExists(ctx, 'games', input.gameId, 'El juego');
    const id = insertRow(ctx, 'characters', CHARACTER_COLUMNS, {
      ...input,
      nameKo: input.nameKo ? toNFC(input.nameKo) : null,
    });
    const c = getCharacter(ctx, id);
    indexCharacter(ctx, c);
    reply.code(201);
    return c;
  });

  app.patch('/api/characters/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(characterUpdateSchema, req.body);
    updateRow(ctx, 'characters', CHARACTER_COLUMNS, id, patch, { what: 'El personaje' });
    const c = getCharacter(ctx, id);
    indexCharacter(ctx, c);
    return c;
  });

  app.delete('/api/characters/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    getCharacter(ctx, id);
    moveToTrash(ctx, 'character', id);
    return { ok: true };
  });
}
