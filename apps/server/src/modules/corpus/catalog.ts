import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CORPUS_TEXT_TYPES,
  annotationInputSchema,
  annotationTagInputSchema,
  annotationTagUpdateSchema,
  annotationUpdateSchema,
  concordanceQuerySchema,
  corpusProfileInputSchema,
  corpusProfileUpdateSchema,
  documentUpdateSchema,
  idSchema,
  labelOf,
  segmentUpdateSchema,
  toNFC,
  type AnnotationTag,
  type CorpusDocument,
  type CorpusProfile,
  type Segment,
  type SegmentAnnotation,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { parse } from '../../lib/validate';
import { logActivity } from '../../services/activity';
import { indexEntity } from '../../services/search';
import { moveToTrash, registerTrashable } from '../../services/trash';

const PROFILE_SELECT = `SELECT g.id AS gameId, g.title AS gameTitle, g.original_title AS originalTitle,
  g.release_year AS releaseYear, g.genres, g.platforms,
  p.phase, p.game_version AS gameVersion, p.text_date AS textDate, p.acquisition_method AS acquisitionMethod,
  p.languages, p.translation_direction AS translationDirection, p.localization_company AS localizationCompany,
  p.rights, p.rights_notes AS rightsNotes, p.method_notes AS methodNotes, p.restricted,
  p.created_at AS createdAt, p.updated_at AS updatedAt,
  (SELECT COUNT(*) FROM corpus_documents d WHERE d.game_id = g.id AND d.deleted_at IS NULL) AS documentCount,
  (SELECT COUNT(*) FROM segments s JOIN corpus_documents d ON d.id = s.document_id
     WHERE d.game_id = g.id AND d.deleted_at IS NULL) AS segmentCount
  FROM corpus_profiles p JOIN games g ON g.id = p.game_id`;

function decodeProfile(r: Record<string, unknown>): CorpusProfile {
  const json = (v: unknown) => {
    try {
      return JSON.parse(String(v ?? '[]')) as string[];
    } catch {
      return [];
    }
  };
  return {
    ...(r as unknown as CorpusProfile),
    genres: json(r.genres),
    platforms: json(r.platforms),
    languages: json(r.languages),
    restricted: r.restricted === 1,
  };
}

export function listProfiles(ctx: AppContext): CorpusProfile[] {
  return (
    ctx.sqlite
      .prepare(`${PROFILE_SELECT} WHERE g.deleted_at IS NULL ORDER BY lower(g.title)`)
      .all() as Record<string, unknown>[]
  ).map(decodeProfile);
}

export function getProfile(ctx: AppContext, gameId: string): CorpusProfile {
  const row = ctx.sqlite
    .prepare(`${PROFILE_SELECT} WHERE g.id = ? AND g.deleted_at IS NULL`)
    .get(gameId);
  if (!row) throw new NotFoundError('La ficha de corpus');
  return decodeProfile(row as Record<string, unknown>);
}

/** Crea la ficha de corpus del juego si no existe (al importar el primer texto, por ejemplo). */
export function ensureProfile(ctx: AppContext, gameId: string): void {
  const game = ctx.sqlite
    .prepare('SELECT 1 FROM games WHERE id = ? AND deleted_at IS NULL')
    .get(gameId);
  if (!game) throw new NotFoundError('El juego');
  const now = ctx.nowISO();
  ctx.sqlite
    .prepare(
      'INSERT OR IGNORE INTO corpus_profiles (game_id, created_at, updated_at) VALUES (?, ?, ?)',
    )
    .run(gameId, now, now);
}

const PROFILE_COLS: Record<string, string> = {
  phase: 'phase',
  gameVersion: 'game_version',
  textDate: 'text_date',
  acquisitionMethod: 'acquisition_method',
  languages: 'languages',
  translationDirection: 'translation_direction',
  localizationCompany: 'localization_company',
  rights: 'rights',
  rightsNotes: 'rights_notes',
  methodNotes: 'method_notes',
  restricted: 'restricted',
};

function saveProfile(ctx: AppContext, gameId: string, values: Record<string, unknown>): void {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(values)) {
    const col = PROFILE_COLS[k];
    if (!col || v === undefined) continue;
    sets.push(`${col} = ?`);
    params.push(k === 'languages' ? JSON.stringify(v) : k === 'restricted' ? (v ? 1 : 0) : v);
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  params.push(ctx.nowISO());
  ctx.sqlite
    .prepare(`UPDATE corpus_profiles SET ${sets.join(', ')} WHERE game_id = ?`)
    .run(...params, gameId);
}

const DOC_SELECT = `SELECT d.id, d.game_id AS gameId, g.title AS gameTitle, d.title, d.text_type AS textType,
  d.source_file AS sourceFile, d.notes, d.created_at AS createdAt, d.updated_at AS updatedAt,
  (SELECT COUNT(*) FROM segments s WHERE s.document_id = d.id) AS segmentCount,
  (SELECT COUNT(*) FROM annotations a JOIN segments s ON s.id = a.segment_id WHERE s.document_id = d.id) AS annotationCount,
  (SELECT json_group_array(DISTINCT st.lang) FROM segment_texts st JOIN segments s ON s.id = st.segment_id
     WHERE s.document_id = d.id) AS languages
  FROM corpus_documents d JOIN games g ON g.id = d.game_id`;

function decodeDoc(r: Record<string, unknown>): CorpusDocument {
  let languages: string[] = [];
  try {
    languages = (JSON.parse(String(r.languages ?? '[]')) as (string | null)[]).filter(
      (x): x is string => Boolean(x),
    );
  } catch {
    /* vacío */
  }
  return { ...(r as unknown as CorpusDocument), languages };
}

export function listDocuments(ctx: AppContext, gameId?: string): CorpusDocument[] {
  const where = ['d.deleted_at IS NULL', 'g.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (gameId) {
    where.push('d.game_id = ?');
    params.push(gameId);
  }
  return (
    ctx.sqlite
      .prepare(`${DOC_SELECT} WHERE ${where.join(' AND ')} ORDER BY lower(g.title), lower(d.title)`)
      .all(...params) as Record<string, unknown>[]
  ).map(decodeDoc);
}

export function getDocument(ctx: AppContext, id: string): CorpusDocument {
  const row = ctx.sqlite.prepare(`${DOC_SELECT} WHERE d.id = ? AND d.deleted_at IS NULL`).get(id);
  if (!row) throw new NotFoundError('El documento');
  return decodeDoc(row as Record<string, unknown>);
}

export function indexDocument(ctx: AppContext, id: string): void {
  const d = getDocument(ctx, id);
  indexEntity(ctx, {
    entityType: 'corpus_document',
    entityId: id,
    title: d.title,
    subtitle: [
      'Corpus',
      d.gameTitle,
      labelOf(CORPUS_TEXT_TYPES, d.textType),
      `${d.segmentCount} segmentos`,
    ].join(' · '),
  });
}

const ANNOTATION_SELECT = `SELECT a.id, a.segment_id AS segmentId, a.tag_id AS tagId, t.name AS tagName, t.color AS tagColor,
  a.lang, a.start, a."end", a.quote, a.comment
  FROM annotations a JOIN annotation_tags t ON t.id = a.tag_id`;

export function annotationsFor(
  ctx: AppContext,
  segmentIds: number[],
): Map<number, SegmentAnnotation[]> {
  const out = new Map<number, SegmentAnnotation[]>();
  for (let i = 0; i < segmentIds.length; i += 500) {
    const chunk = segmentIds.slice(i, i + 500);
    const rows = ctx.sqlite
      .prepare(
        `${ANNOTATION_SELECT} WHERE a.segment_id IN (${chunk.map(() => '?').join(',')}) ORDER BY a.start`,
      )
      .all(...chunk) as SegmentAnnotation[];
    for (const r of rows) {
      if (!out.has(r.segmentId)) out.set(r.segmentId, []);
      out.get(r.segmentId)!.push(r);
    }
  }
  return out;
}

export function textsFor(
  ctx: AppContext,
  segmentIds: number[],
): Map<number, Record<string, string>> {
  const out = new Map<number, Record<string, string>>();
  for (let i = 0; i < segmentIds.length; i += 500) {
    const chunk = segmentIds.slice(i, i + 500);
    const rows = ctx.sqlite
      .prepare(
        `SELECT segment_id AS id, lang, text FROM segment_texts WHERE segment_id IN (${chunk.map(() => '?').join(',')})`,
      )
      .all(...chunk) as { id: number; lang: string; text: string }[];
    for (const r of rows) {
      if (!out.has(r.id)) out.set(r.id, {});
      out.get(r.id)![r.lang] = r.text;
    }
  }
  return out;
}

export function listSegments(
  ctx: AppContext,
  documentId: string,
  opts: { offset: number; limit: number; q?: string },
): { items: Segment[]; total: number } {
  getDocument(ctx, documentId);
  const where = ['s.document_id = ?'];
  const params: unknown[] = [documentId];
  if (opts.q?.trim()) {
    where.push(
      '(EXISTS (SELECT 1 FROM segment_texts st WHERE st.segment_id = s.id AND st.text LIKE ?) OR s.string_id LIKE ? OR s.speaker LIKE ?)',
    );
    const like = `%${opts.q.trim()}%`;
    params.push(like, like, like);
  }
  const total = (
    ctx.sqlite
      .prepare(`SELECT COUNT(*) AS n FROM segments s WHERE ${where.join(' AND ')}`)
      .get(...params) as { n: number }
  ).n;
  const rows = ctx.sqlite
    .prepare(
      `SELECT s.id, s.document_id AS documentId, s.position, s.string_id AS stringId, s.speaker, s.context,
         s.text_type AS textType, s.notes
       FROM segments s WHERE ${where.join(' AND ')} ORDER BY s.position LIMIT ? OFFSET ?`,
    )
    .all(...params, opts.limit, opts.offset) as Omit<Segment, 'texts' | 'annotations'>[];
  const ids = rows.map((r) => r.id);
  const texts = textsFor(ctx, ids);
  const anns = annotationsFor(ctx, ids);
  return {
    items: rows.map((r) => ({
      ...r,
      texts: texts.get(r.id) ?? {},
      annotations: anns.get(r.id) ?? [],
    })),
    total,
  };
}

function segmentDocument(ctx: AppContext, segmentId: number): string {
  const row = ctx.sqlite
    .prepare(
      `SELECT s.document_id AS d FROM segments s JOIN corpus_documents d ON d.id = s.document_id
       WHERE s.id = ? AND d.deleted_at IS NULL`,
    )
    .get(segmentId) as { d: string } | undefined;
  if (!row) throw new NotFoundError('El segmento');
  return row.d;
}

export function listTags(ctx: AppContext): AnnotationTag[] {
  return ctx.sqlite
    .prepare(
      `SELECT t.id, t.parent_id AS parentId, t.name, t.color, t.description, t.position,
         (SELECT COUNT(*) FROM annotations a WHERE a.tag_id = t.id) AS count
       FROM annotation_tags t ORDER BY t.position, lower(t.name)`,
    )
    .all() as AnnotationTag[];
}

export function registerCorpusEntities(): void {
  registerTrashable({
    type: 'corpus_document',
    table: 'corpus_documents',
    titleSql: 'title',
    onRestore: (ctx, id) => indexDocument(ctx, id),
    // Los segmentos, sus textos (y el índice FTS, por los disparadores) y sus anotaciones se
    // borran en cascada con el documento.
  });
}

export async function catalogRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const gameParam = z.object({ gameId: idSchema });
  const idParam = z.object({ id: idSchema });
  const segParam = z.object({ id: z.coerce.number().int().positive() });

  app.get('/api/corpus/profiles', async () => listProfiles(ctx));

  app.get('/api/corpus/profiles/:gameId', async (req) => {
    const { gameId } = parse(gameParam, req.params);
    return getProfile(ctx, gameId);
  });

  app.put('/api/corpus/profiles/:gameId', async (req) => {
    const { gameId } = parse(gameParam, req.params);
    const exists = ctx.sqlite
      .prepare('SELECT 1 FROM corpus_profiles WHERE game_id = ?')
      .get(gameId);
    const values = exists
      ? parse(corpusProfileUpdateSchema, req.body)
      : parse(corpusProfileInputSchema, req.body ?? {});
    ctx.sqlite.transaction(() => {
      ensureProfile(ctx, gameId);
      saveProfile(ctx, gameId, values);
    })();
    if (!exists) {
      logActivity(ctx, {
        entityType: 'game',
        entityId: gameId,
        action: 'crear',
        summary: 'Juego añadido al corpus',
      });
    }
    return getProfile(ctx, gameId);
  });

  app.delete('/api/corpus/profiles/:gameId', async (req) => {
    const { gameId } = parse(gameParam, req.params);
    const docs = ctx.sqlite
      .prepare(
        'SELECT COUNT(*) AS n FROM corpus_documents WHERE game_id = ? AND deleted_at IS NULL',
      )
      .get(gameId) as { n: number };
    if (docs.n > 0)
      throw new ValidationError('Antes de quitar el juego del corpus, elimina sus documentos.');
    ctx.sqlite.prepare('DELETE FROM corpus_profiles WHERE game_id = ?').run(gameId);
    return { ok: true };
  });

  app.get('/api/corpus/documents', async (req) => {
    const q = parse(z.object({ gameId: idSchema.optional() }), req.query);
    return listDocuments(ctx, q.gameId);
  });

  app.get('/api/corpus/documents/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return getDocument(ctx, id);
  });

  app.patch('/api/corpus/documents/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    getDocument(ctx, id);
    const patch = parse(documentUpdateSchema, req.body);
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.title !== undefined) {
      sets.push('title = ?');
      params.push(patch.title);
    }
    if (patch.textType !== undefined) {
      sets.push('text_type = ?');
      params.push(patch.textType);
    }
    if (patch.notes !== undefined) {
      sets.push('notes = ?');
      params.push(patch.notes);
    }
    if (sets.length) {
      ctx.sqlite
        .prepare(`UPDATE corpus_documents SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
        .run(...params, ctx.nowISO(), id);
    }
    indexDocument(ctx, id);
    return getDocument(ctx, id);
  });

  app.delete('/api/corpus/documents/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    getDocument(ctx, id);
    moveToTrash(ctx, 'corpus_document', id);
    return { ok: true };
  });

  app.get('/api/corpus/documents/:id/segments', async (req) => {
    const { id } = parse(idParam, req.params);
    const q = parse(
      z.object({
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(1000).default(200),
        q: z.string().max(200).optional(),
      }),
      req.query,
    );
    return listSegments(ctx, id, q);
  });

  app.patch('/api/corpus/segments/:id', async (req) => {
    const { id } = parse(segParam, req.params);
    const documentId = segmentDocument(ctx, id);
    const patch = parse(segmentUpdateSchema, req.body);
    ctx.sqlite.transaction(() => {
      const cols: [string, unknown][] = [];
      if (patch.stringId !== undefined) cols.push(['string_id', patch.stringId]);
      if (patch.speaker !== undefined) cols.push(['speaker', patch.speaker]);
      if (patch.context !== undefined) cols.push(['context', patch.context]);
      if (patch.notes !== undefined) cols.push(['notes', patch.notes]);
      if (cols.length) {
        ctx.sqlite
          .prepare(`UPDATE segments SET ${cols.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`)
          .run(...cols.map(([, v]) => v), id);
      }
      for (const [lang, raw] of Object.entries(patch.texts ?? {})) {
        const text = toNFC(raw).trim();
        if (!text)
          ctx.sqlite
            .prepare('DELETE FROM segment_texts WHERE segment_id = ? AND lang = ?')
            .run(id, lang);
        else {
          ctx.sqlite
            .prepare(
              `INSERT INTO segment_texts (segment_id, lang, text) VALUES (?, ?, ?)
               ON CONFLICT(segment_id, lang) DO UPDATE SET text = excluded.text`,
            )
            .run(id, lang, text);
        }
      }
      ctx.sqlite
        .prepare('UPDATE corpus_documents SET updated_at = ? WHERE id = ?')
        .run(ctx.nowISO(), documentId);
    })();
    return { ok: true, texts: textsFor(ctx, [id]).get(id) ?? {} };
  });

  app.delete('/api/corpus/segments/:id', async (req) => {
    const { id } = parse(segParam, req.params);
    segmentDocument(ctx, id);
    ctx.sqlite.prepare('DELETE FROM segments WHERE id = ?').run(id);
    return { ok: true };
  });

  // Esquema de anotación
  app.get('/api/corpus/tags', async () => listTags(ctx));

  app.post('/api/corpus/tags', async (req, reply) => {
    const input = parse(annotationTagInputSchema, req.body);
    if (
      input.parentId &&
      !ctx.sqlite.prepare('SELECT 1 FROM annotation_tags WHERE id = ?').get(input.parentId)
    ) {
      throw new NotFoundError('La etiqueta superior');
    }
    const id = newId();
    const now = ctx.nowISO();
    const max = ctx.sqlite.prepare('SELECT MAX(position) AS p FROM annotation_tags').get() as {
      p: number | null;
    };
    ctx.sqlite
      .prepare(
        'INSERT INTO annotation_tags (id, parent_id, name, color, description, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        input.parentId ?? null,
        input.name,
        input.color,
        input.description,
        input.position ?? (max.p ?? 0) + 1,
        now,
        now,
      );
    reply.code(201);
    return listTags(ctx).find((t) => t.id === id);
  });

  app.patch('/api/corpus/tags/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().min(1).max(64) }), req.params);
    const patch = parse(annotationTagUpdateSchema, req.body);
    if (patch.parentId) {
      // Sin ciclos: la nueva etiqueta superior no puede estar dentro de esta.
      let cur: string | null = patch.parentId;
      while (cur) {
        if (cur === id)
          throw new ValidationError('Una etiqueta no puede estar dentro de sí misma.');
        cur =
          (
            ctx.sqlite
              .prepare('SELECT parent_id AS p FROM annotation_tags WHERE id = ?')
              .get(cur) as { p: string | null } | undefined
          )?.p ?? null;
      }
    }
    const map: Record<string, string> = {
      name: 'name',
      parentId: 'parent_id',
      color: 'color',
      description: 'description',
      position: 'position',
    };
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || !map[k]) continue;
      sets.push(`${map[k]} = ?`);
      params.push(v);
    }
    if (sets.length) {
      const res = ctx.sqlite
        .prepare(`UPDATE annotation_tags SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
        .run(...params, ctx.nowISO(), id);
      if (!res.changes) throw new NotFoundError('La etiqueta');
    }
    return listTags(ctx).find((t) => t.id === id);
  });

  app.delete('/api/corpus/tags/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().min(1).max(64) }), req.params);
    const res = ctx.sqlite.prepare('DELETE FROM annotation_tags WHERE id = ?').run(id);
    if (!res.changes) throw new NotFoundError('La etiqueta');
    return { ok: true };
  });

  // Anotaciones
  app.post('/api/corpus/annotations', async (req, reply) => {
    const input = parse(annotationInputSchema, req.body);
    segmentDocument(ctx, input.segmentId);
    if (!ctx.sqlite.prepare('SELECT 1 FROM annotation_tags WHERE id = ?').get(input.tagId))
      throw new NotFoundError('La etiqueta');
    let quote: string | null = null;
    if (input.lang && input.start != null && input.end != null) {
      const row = ctx.sqlite
        .prepare('SELECT text FROM segment_texts WHERE segment_id = ? AND lang = ?')
        .get(input.segmentId, input.lang) as { text: string } | undefined;
      if (!row) throw new ValidationError('El segmento no tiene texto en ese idioma.');
      if (input.end > row.text.length)
        throw new ValidationError('El fragmento anotado no es válido');
      quote = row.text.slice(input.start, input.end);
    }
    const id = newId();
    const now = ctx.nowISO();
    ctx.sqlite
      .prepare(
        `INSERT INTO annotations (id, segment_id, tag_id, lang, start, "end", quote, comment, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.segmentId,
        input.tagId,
        input.lang ?? null,
        input.start ?? null,
        input.end ?? null,
        quote,
        input.comment,
        now,
        now,
      );
    reply.code(201);
    return ctx.sqlite.prepare(`${ANNOTATION_SELECT} WHERE a.id = ?`).get(id) as SegmentAnnotation;
  });

  app.patch('/api/corpus/annotations/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(annotationUpdateSchema, req.body);
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.tagId !== undefined) {
      sets.push('tag_id = ?');
      params.push(patch.tagId);
    }
    if (patch.comment !== undefined) {
      sets.push('comment = ?');
      params.push(patch.comment);
    }
    if (sets.length) {
      const res = ctx.sqlite
        .prepare(`UPDATE annotations SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
        .run(...params, ctx.nowISO(), id);
      if (!res.changes) throw new NotFoundError('La anotación');
    }
    return ctx.sqlite.prepare(`${ANNOTATION_SELECT} WHERE a.id = ?`).get(id);
  });

  app.delete('/api/corpus/annotations/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const res = ctx.sqlite.prepare('DELETE FROM annotations WHERE id = ?').run(id);
    if (!res.changes) throw new NotFoundError('La anotación');
    return { ok: true };
  });

  // Búsquedas guardadas
  app.get('/api/corpus/saved-searches', async () =>
    (
      ctx.sqlite
        .prepare(
          'SELECT id, name, query, created_at AS createdAt FROM saved_searches ORDER BY lower(name)',
        )
        .all() as {
        id: string;
        name: string;
        query: string;
        createdAt: string;
      }[]
    ).map((r) => ({ ...r, query: JSON.parse(r.query) as unknown })),
  );

  app.post('/api/corpus/saved-searches', async (req, reply) => {
    const body = parse(
      z.object({ name: z.string().trim().min(1).max(200), query: concordanceQuerySchema }),
      req.body,
    );
    const id = newId();
    const now = ctx.nowISO();
    ctx.sqlite
      .prepare(
        'INSERT INTO saved_searches (id, name, query, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, body.name, JSON.stringify(body.query), now, now);
    reply.code(201);
    return { id, name: body.name, query: body.query, createdAt: now };
  });

  app.delete('/api/corpus/saved-searches/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    ctx.sqlite.prepare('DELETE FROM saved_searches WHERE id = ?').run(id);
    return { ok: true };
  });
}
