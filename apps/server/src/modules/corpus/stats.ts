import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CORPUS_PHASES,
  CORPUS_TEXT_TYPES,
  ENGLISH_STOPWORDS,
  SPANISH_STOPWORDS,
  TRANSLATION_DIRECTIONS,
  corpusFiltersSchema,
  countCharacters,
  labelOf,
  tokenLabel,
  tokenize,
  type CorpusFilters,
  type CorpusStats,
  type FrequencyRow,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { parse } from '../../lib/validate';
import { CORPUS_JOINS, filterSql } from './filters';

function parseFilters(raw: unknown): CorpusFilters {
  if (typeof raw === 'string' && raw) {
    try {
      return parse(corpusFiltersSchema, JSON.parse(raw));
    } catch {
      return parse(corpusFiltersSchema, {});
    }
  }
  return parse(corpusFiltersSchema, raw ?? {});
}

/** Caché de estadísticas: se invalida en cuanto cambia cualquier dato del corpus. */
const cache = new Map<string, { version: string; stats: CorpusStats }>();

function dataVersion(ctx: AppContext): string {
  const r = ctx.sqlite
    .prepare(
      `SELECT (SELECT COUNT(*) || ':' || coalesce(MAX(id), 0) FROM segment_texts) AS t,
         (SELECT coalesce(MAX(updated_at), '') || ':' || COUNT(*) FROM corpus_documents) AS d,
         (SELECT coalesce(MAX(updated_at), '') || ':' || COUNT(*) FROM corpus_profiles) AS p,
         (SELECT COUNT(*) || ':' || coalesce(MAX(updated_at), '') FROM annotations) AS a,
         (SELECT coalesce(MAX(updated_at), '') FROM games) AS g`,
    )
    .get() as Record<string, string>;
  return Object.values(r).join('|');
}

export function corpusStats(ctx: AppContext, filters: CorpusFilters): CorpusStats {
  const key = `${ctx.config.dbPath}|${JSON.stringify(filters)}`;
  const version = dataVersion(ctx);
  const hit = cache.get(key);
  if (hit && hit.version === version) return hit.stats;
  const stats = computeStats(ctx, filters);
  if (cache.size > 50) cache.clear();
  cache.set(key, { version, stats });
  return stats;
}

function computeStats(ctx: AppContext, filters: CorpusFilters): CorpusStats {
  const f = filterSql(ctx, filters);
  const where = f.where.length ? `WHERE ${f.where.join(' AND ')}` : '';
  const base = `FROM segments s ${CORPUS_JOINS} ${where}`;
  const one = (sql: string) => (ctx.sqlite.prepare(sql).get(...f.params) as { n: number }).n;
  const segments = one(`SELECT COUNT(*) AS n ${base}`);
  const documents = one(`SELECT COUNT(DISTINCT d.id) AS n ${base}`);
  const games = one(`SELECT COUNT(DISTINCT g.id) AS n ${base}`);
  const annotations = one(
    `SELECT COUNT(*) AS n FROM annotations a JOIN segments s ON s.id = a.segment_id ${CORPUS_JOINS} ${where}`,
  );

  // Recuento por idioma (caracteres sin espacios, eojeol o palabras, tipos distintos).
  const perLang = new Map<
    string,
    { texts: number; characters: number; tokens: number; types: Set<string> }
  >();
  const textSql = `SELECT st.lang, st.text FROM segment_texts st JOIN segments s ON s.id = st.segment_id ${CORPUS_JOINS} ${where}`;
  for (const r of ctx.sqlite.prepare(textSql).iterate(...f.params) as Iterable<{
    lang: string;
    text: string;
  }>) {
    let e = perLang.get(r.lang);
    if (!e) perLang.set(r.lang, (e = { texts: 0, characters: 0, tokens: 0, types: new Set() }));
    e.texts++;
    e.characters += countCharacters(r.text);
    const toks = tokenize(r.text, r.lang);
    e.tokens += toks.length;
    if (e.types.size < 2_000_000) for (const t of toks) e.types.add(t);
  }

  const dist = (expr: string, label: (k: string) => string) => {
    const sql = `SELECT ${expr} AS k, COUNT(*) AS segments, COUNT(DISTINCT g.id) AS games ${base} GROUP BY k ORDER BY segments DESC`;
    const rows = ctx.sqlite.prepare(sql).all(...f.params) as {
      k: string | number | null;
      segments: number;
      games: number;
    }[];
    return rows.map((r) => ({
      key: String(r.k ?? ''),
      label: r.k == null || r.k === '' ? 'Sin dato' : label(String(r.k)),
      segments: r.segments,
      games: r.games,
    }));
  };
  const jsonDist = (column: string) => {
    const sql = `SELECT je.value AS k, COUNT(*) AS segments, COUNT(DISTINCT g.id) AS games
      FROM segments s ${CORPUS_JOINS} JOIN json_each(g.${column}) je ${where}
      GROUP BY je.value ORDER BY segments DESC`;
    return (
      ctx.sqlite.prepare(sql).all(...f.params) as { k: string; segments: number; games: number }[]
    ).map((r) => ({
      key: r.k,
      label: r.k,
      segments: r.segments,
      games: r.games,
    }));
  };

  return {
    games,
    documents,
    segments,
    annotations,
    languages: [...perLang.entries()]
      .map(([lang, e]) => ({
        lang,
        texts: e.texts,
        characters: e.characters,
        tokens: e.tokens,
        types: e.types.size,
        tokenLabel: tokenLabel(lang),
      }))
      .sort((a, b) => b.texts - a.texts),
    byGenre: jsonDist('genres'),
    byPlatform: jsonDist('platforms'),
    byYear: dist('g.release_year', (k) => k).sort((a, b) => a.key.localeCompare(b.key)),
    byTextType: dist(
      'coalesce(s.text_type, d.text_type)',
      (k) => labelOf(CORPUS_TEXT_TYPES, k as never) || k,
    ),
    byPhase: dist(
      "coalesce(p.phase, 'identified')",
      (k) => labelOf(CORPUS_PHASES, k as never) || k,
    ),
    byDirection: dist(
      "coalesce(p.translation_direction, 'unknown')",
      (k) => labelOf(TRANSLATION_DIRECTIONS, k as never) || k,
    ),
  };
}

/** Lista de frecuencias (eojeol en coreano, palabras en otros idiomas). */
export function frequencyList(
  ctx: AppContext,
  opts: {
    lang: string;
    filters: CorpusFilters;
    limit: number;
    minLength: number;
    stopwords: boolean;
  },
): { rows: FrequencyRow[]; tokens: number; types: number } {
  const f = filterSql(ctx, opts.filters);
  const where = ['st.lang = ?', ...f.where];
  const sql = `SELECT st.segment_id AS id, st.text FROM segment_texts st JOIN segments s ON s.id = st.segment_id ${CORPUS_JOINS}
    WHERE ${where.join(' AND ')}`;
  const counts = new Map<string, { count: number; segments: number; last: number }>();
  const stop = opts.stopwords
    ? opts.lang === 'es'
      ? SPANISH_STOPWORDS
      : opts.lang === 'en'
        ? ENGLISH_STOPWORDS
        : null
    : null;
  let tokens = 0;
  for (const r of ctx.sqlite.prepare(sql).iterate(opts.lang, ...f.params) as Iterable<{
    id: number;
    text: string;
  }>) {
    for (const t of tokenize(r.text, opts.lang)) {
      tokens++;
      if ([...t].length < opts.minLength || stop?.has(t)) continue;
      const e = counts.get(t);
      if (e) {
        e.count++;
        if (e.last !== r.id) {
          e.segments++;
          e.last = r.id;
        }
      } else counts.set(t, { count: 1, segments: 1, last: r.id });
    }
  }
  const rows = [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], opts.lang))
    .slice(0, opts.limit)
    .map(([token, e]) => ({ token, count: e.count, segments: e.segments }));
  return { rows, tokens, types: counts.size };
}

export async function statsRoutes(app: FastifyInstance) {
  const ctx = app.ctx;

  app.get('/api/corpus/stats', async (req) => {
    const q = parse(z.object({ filters: z.string().optional() }), req.query);
    return corpusStats(ctx, parseFilters(q.filters));
  });

  app.get('/api/corpus/frequencies', async (req) => {
    const q = parse(
      z.object({
        lang: z.string().min(2).max(10),
        filters: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(20_000).default(500),
        minLength: z.coerce.number().int().min(1).max(20).default(1),
        stopwords: z
          .enum(['true', 'false'])
          .default('false')
          .transform((v) => v === 'true'),
      }),
      req.query,
    );
    return frequencyList(ctx, { ...q, filters: parseFilters(q.filters) });
  });
}

export { parseFilters };
