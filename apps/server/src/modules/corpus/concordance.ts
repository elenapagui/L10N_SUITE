import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import {
  CORPUS_TEXT_TYPES,
  SearchSyntaxError,
  compileCondition,
  concordanceQuerySchema,
  escapeLike,
  kwic,
  labelOf,
  langLabel,
  matches,
  type CompiledCondition,
  type ConcordanceHit,
  type ConcordanceQuery,
  type ConcordanceResult,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { ValidationError } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { contentDisposition } from '../attachments';
import { textsFor } from './catalog';
import { CORPUS_JOINS, filterSql } from './filters';

/** Máximo de coincidencias que se guardan para ordenar y paginar (el total se cuenta entero). */
const MAX_HITS = 100_000;
/** Máximo de coincidencias por segmento. */
const MAX_PER_SEGMENT = 50;

interface RawHit {
  segmentId: number;
  start: number;
  end: number;
  left: string;
  match: string;
  right: string;
  docOrder: number;
}

function ftsPhrase(literal: string): string {
  return `"${literal.replace(/"/g, '""')}"`;
}

/** Busca en el corpus. Devuelve las coincidencias de la página pedida, ya con su contexto. */
export function searchCorpus(
  ctx: AppContext,
  raw: unknown,
): ConcordanceResult & { all?: RawHit[]; primaryLang?: string } {
  const started = performance.now();
  const q = parse(concordanceQuerySchema, raw);
  let compiled: CompiledCondition[];
  try {
    compiled = q.conditions.map(compileCondition);
  } catch (error) {
    if (error instanceof SearchSyntaxError) throw new ValidationError(error.message);
    throw error;
  }
  const primary = compiled.find((c) => !c.condition.negate);
  if (!primary)
    throw new ValidationError(
      'Añade al menos una condición que el texto deba cumplir (no solo exclusiones).',
    );
  const others = compiled.filter((c) => c !== primary);
  const f = filterSql(ctx, q.filters);
  const where = ['st.lang = ?', ...f.where];
  const params: unknown[] = [primary.condition.lang, ...f.params];
  let from = `segment_texts st JOIN segments s ON s.id = st.segment_id ${CORPUS_JOINS}`;
  if (primary.ftsLiteral) {
    from = `segment_texts_fts fts JOIN segment_texts st ON st.id = fts.rowid JOIN segments s ON s.id = st.segment_id ${CORPUS_JOINS}`;
    where.unshift('fts.segment_texts_fts MATCH ?');
    params.unshift(ftsPhrase(primary.ftsLiteral));
  } else if (primary.likeLiteral && !primary.condition.caseSensitive) {
    where.push("st.text LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(primary.likeLiteral)}%`);
  } else if (primary.condition.mode === 'regex') {
    where.push(primary.condition.caseSensitive ? 'st.text REGEXP ?' : 'regexp_i(?, st.text)');
    params.push(primary.condition.query);
  }
  const sql = `SELECT s.id AS segmentId, st.text, d.id AS documentId, s.position
    FROM ${from} WHERE ${where.join(' AND ')}
    ORDER BY lower(g.title), d.created_at, s.position`;

  // 1) Coincidencias de la condición principal.
  const candidates: { segmentId: number; text: string }[] = [];
  for (const row of ctx.sqlite.prepare(sql).iterate(...params) as Iterable<{
    segmentId: number;
    text: string;
  }>) {
    if (matches(row.text, primary.regex))
      candidates.push({ segmentId: row.segmentId, text: row.text });
  }

  // 2) Resto de condiciones (en el mismo u otro idioma del segmento).
  let survivors = candidates;
  if (others.length) {
    const texts = textsFor(
      ctx,
      candidates.map((c) => c.segmentId),
    );
    survivors = candidates.filter((c) => {
      const t = texts.get(c.segmentId) ?? {};
      return others.every((o) => {
        const value = t[o.condition.lang] ?? '';
        const ok = matches(value, o.regex);
        return o.condition.negate ? !ok : ok;
      });
    });
  }

  // 3) Líneas KWIC.
  let total = 0;
  const hits: RawHit[] = [];
  survivors.forEach((c, docOrder) => {
    const lines = kwic(c.text, primary.regex, q.contextChars, MAX_PER_SEGMENT);
    total += lines.length;
    for (const l of lines)
      if (hits.length < MAX_HITS) hits.push({ segmentId: c.segmentId, docOrder, ...l });
  });

  if (q.sort !== 'document') {
    // Claves calculadas una sola vez (ordenar por contexto con muchas coincidencias es costoso).
    const collator = new Intl.Collator(primary.condition.lang, {
      sensitivity: 'base',
      numeric: true,
    });
    const keyOf = (h: RawHit) =>
      q.sort === 'left'
        ? [...h.left.trimEnd()].reverse().join('')
        : q.sort === 'right'
          ? h.right.trimStart()
          : h.match;
    const keyed = hits.map((h) => ({ h, k: keyOf(h) }));
    keyed.sort((a, b) => collator.compare(a.k, b.k) || a.h.docOrder - b.h.docOrder);
    keyed.forEach((x, i) => (hits[i] = x.h));
  }

  const page = hits.slice(q.offset, q.offset + q.limit);
  return {
    hits: enrich(ctx, page, primary.condition.lang),
    total,
    segments: survivors.length,
    truncated: total > hits.length,
    elapsedMs: Math.round(performance.now() - started),
    all: hits,
    primaryLang: primary.condition.lang,
  };
}

function enrich(ctx: AppContext, page: RawHit[], lang: string): ConcordanceHit[] {
  if (!page.length) return [];
  const ids = [...new Set(page.map((h) => h.segmentId))];
  const meta = new Map<number, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = ctx.sqlite
      .prepare(
        `SELECT s.id, s.string_id AS stringId, s.speaker, coalesce(s.text_type, d.text_type) AS textType,
           d.id AS documentId, d.title AS documentTitle, g.id AS gameId, g.title AS gameTitle,
           (SELECT COUNT(*) FROM annotations a WHERE a.segment_id = s.id) AS annotationCount
         FROM segments s JOIN corpus_documents d ON d.id = s.document_id JOIN games g ON g.id = d.game_id
         WHERE s.id IN (${chunk.map(() => '?').join(',')})`,
      )
      .all(...chunk) as Record<string, unknown>[];
    for (const r of rows) meta.set(r.id as number, r);
  }
  const texts = textsFor(ctx, ids);
  return page.map((h) => {
    const m = meta.get(h.segmentId)!;
    const parallel = { ...(texts.get(h.segmentId) ?? {}) };
    return {
      segmentId: h.segmentId,
      lang,
      start: h.start,
      end: h.end,
      left: h.left,
      match: h.match,
      right: h.right,
      parallel,
      gameId: m.gameId as string,
      gameTitle: m.gameTitle as string,
      documentId: m.documentId as string,
      documentTitle: m.documentTitle as string,
      stringId: (m.stringId as string | null) ?? null,
      speaker: (m.speaker as string | null) ?? null,
      textType: m.textType as string,
      annotationCount: m.annotationCount as number,
    };
  });
}

/** Exporta todas las coincidencias de una búsqueda a Excel. */
export async function exportConcordance(ctx: AppContext, raw: ConcordanceQuery): Promise<Buffer> {
  const result = searchCorpus(ctx, { ...raw, offset: 0, limit: 1 });
  const all = result.all ?? [];
  const wb = new ExcelJS.Workbook();
  wb.creator = 'L10N Suite';
  const ws = wb.addWorksheet('Concordancias');
  const lang = result.primaryLang!;
  const langs = new Set<string>();
  const hits: ConcordanceHit[] = [];
  for (let i = 0; i < all.length; i += 1000) {
    const chunk = enrich(ctx, all.slice(i, i + 1000), lang);
    chunk.forEach((h) => Object.keys(h.parallel).forEach((l) => langs.add(l)));
    hits.push(...chunk);
  }
  const otherLangs = [...langs].filter((l) => l !== lang);
  ws.columns = [
    { header: 'Juego', key: 'game', width: 24 },
    { header: 'Documento', key: 'doc', width: 22 },
    { header: 'ID de cadena', key: 'sid', width: 18 },
    { header: 'Hablante', key: 'speaker', width: 14 },
    { header: 'Tipo de texto', key: 'type', width: 14 },
    { header: 'Contexto izquierdo', key: 'left', width: 40 },
    { header: 'Coincidencia', key: 'match', width: 18 },
    { header: 'Contexto derecho', key: 'right', width: 40 },
    { header: `Texto completo (${langLabel(lang)})`, key: 'full', width: 50 },
    ...otherLangs.map((l) => ({ header: langLabel(l), key: `t_${l}`, width: 50 })),
  ];
  for (const h of hits) {
    ws.addRow({
      game: h.gameTitle,
      doc: h.documentTitle,
      sid: h.stringId,
      speaker: h.speaker,
      type: labelOf(CORPUS_TEXT_TYPES, h.textType as never),
      left: h.left,
      match: h.match,
      right: h.right,
      full: h.parallel[lang],
      ...Object.fromEntries(otherLangs.map((l) => [`t_${l}`, h.parallel[l] ?? ''])),
    });
  }
  ws.getRow(1).font = { bold: true };
  ws.getColumn('left').alignment = { horizontal: 'right' };
  ws.getColumn('match').font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function concordanceRoutes(app: FastifyInstance) {
  const ctx = app.ctx;

  app.post('/api/corpus/concordance', async (req) => {
    const { all: _all, primaryLang: _l, ...result } = searchCorpus(ctx, req.body);
    void _all;
    void _l;
    return result;
  });

  app.post('/api/corpus/concordance/export', async (req, reply) => {
    const buffer = await exportConcordance(ctx, req.body as ConcordanceQuery);
    reply
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', contentDisposition('attachment', 'Concordancias.xlsx'));
    return reply.send(buffer);
  });
}
