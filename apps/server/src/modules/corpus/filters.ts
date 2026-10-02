import { escapeLike, type CorpusFilters } from '@l10n/shared';
import type { AppContext } from '../../context';

/**
 * Condiciones SQL para un subcorpus. Supone los alias s (segments), d (corpus_documents),
 * g (games) y p (corpus_profiles), unidos con `CORPUS_JOINS`.
 */
export const CORPUS_JOINS = `JOIN corpus_documents d ON d.id = s.document_id AND d.deleted_at IS NULL
  JOIN games g ON g.id = d.game_id AND g.deleted_at IS NULL
  LEFT JOIN corpus_profiles p ON p.game_id = g.id`;

const marks = (n: number) => Array.from({ length: n }, () => '?').join(', ');

export function filterSql(
  ctx: AppContext,
  f: CorpusFilters,
): { where: string[]; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!f.includeRestricted) where.push('coalesce(p.restricted, 0) = 0');
  if (f.gameIds?.length) {
    where.push(`g.id IN (${marks(f.gameIds.length)})`);
    params.push(...f.gameIds);
  }
  if (f.documentIds?.length) {
    where.push(`d.id IN (${marks(f.documentIds.length)})`);
    params.push(...f.documentIds);
  }
  if (f.genres?.length) {
    where.push(
      `EXISTS (SELECT 1 FROM json_each(g.genres) je WHERE je.value IN (${marks(f.genres.length)}))`,
    );
    params.push(...f.genres);
  }
  if (f.platforms?.length) {
    where.push(
      `EXISTS (SELECT 1 FROM json_each(g.platforms) je WHERE je.value IN (${marks(f.platforms.length)}))`,
    );
    params.push(...f.platforms);
  }
  if (f.yearFrom != null) {
    where.push('g.release_year >= ?');
    params.push(f.yearFrom);
  }
  if (f.yearTo != null) {
    where.push('g.release_year <= ?');
    params.push(f.yearTo);
  }
  if (f.textTypes?.length) {
    where.push(`coalesce(s.text_type, d.text_type) IN (${marks(f.textTypes.length)})`);
    params.push(...f.textTypes);
  }
  if (f.directions?.length) {
    where.push(`coalesce(p.translation_direction, 'unknown') IN (${marks(f.directions.length)})`);
    params.push(...f.directions);
  }
  if (f.phases?.length) {
    where.push(`coalesce(p.phase, 'identified') IN (${marks(f.phases.length)})`);
    params.push(...f.phases);
  }
  if (f.speaker?.trim()) {
    where.push("s.speaker LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(f.speaker.trim())}%`);
  }
  if (f.tagIds?.length) {
    // La etiqueta y todas sus subetiquetas.
    const ids = tagWithDescendants(ctx, f.tagIds);
    where.push(
      `EXISTS (SELECT 1 FROM annotations a WHERE a.segment_id = s.id AND a.tag_id IN (${marks(ids.length)}))`,
    );
    params.push(...ids);
  }
  return { where, params };
}

export function tagWithDescendants(ctx: AppContext, ids: string[]): string[] {
  const rows = ctx.sqlite
    .prepare(
      `WITH RECURSIVE t(id) AS (
         SELECT id FROM annotation_tags WHERE id IN (${marks(ids.length)})
         UNION SELECT a.id FROM annotation_tags a JOIN t ON a.parent_id = t.id)
       SELECT id FROM t`,
    )
    .all(...ids) as { id: string }[];
  return rows.length ? rows.map((r) => r.id) : ids;
}
