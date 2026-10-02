import { escapeLike, normalizeForSearch, type SearchResult } from '@l10n/shared';
import type { AppContext } from '../context';

/**
 * Índice de búsqueda global (FTS5 con tokenizador trigram). Guarda el texto ya normalizado
 * (minúsculas, sin tildes) y se consulta con LIKE: con 3 o más caracteres SQLite usa el
 * índice trigram; con menos (frecuente en coreano: «마법») recorre la tabla.
 */
export function indexEntity(
  ctx: AppContext,
  entry: {
    entityType: string;
    entityId: string;
    title: string;
    subtitle?: string | null;
    text?: string | null;
  },
): void {
  const text = normalizeForSearch(
    [entry.title, entry.subtitle, entry.text].filter(Boolean).join(' \n '),
  );
  const tx = ctx.sqlite.transaction(() => {
    ctx.sqlite
      .prepare('DELETE FROM search_index WHERE entity_type = ? AND entity_id = ?')
      .run(entry.entityType, entry.entityId);
    ctx.sqlite
      .prepare(
        'INSERT INTO search_index (entity_type, entity_id, title, subtitle, text) VALUES (?, ?, ?, ?, ?)',
      )
      .run(entry.entityType, entry.entityId, entry.title, entry.subtitle ?? null, text);
  });
  tx();
}

export function removeFromIndex(ctx: AppContext, entityType: string, entityId: string): void {
  ctx.sqlite
    .prepare('DELETE FROM search_index WHERE entity_type = ? AND entity_id = ?')
    .run(entityType, entityId);
}

export function searchIndex(
  ctx: AppContext,
  query: string,
  options: { limit?: number; entityTypes?: string[] } = {},
): SearchResult[] {
  const q = normalizeForSearch(query);
  if (q === '') return [];
  const terms = q.split(' ').filter(Boolean).slice(0, 8);
  const where = terms.map(() => "text LIKE ? ESCAPE '\\'");
  const params: unknown[] = terms.map((t) => `%${escapeLike(t)}%`);
  if (options.entityTypes?.length) {
    where.push(`entity_type IN (${options.entityTypes.map(() => '?').join(',')})`);
    params.push(...options.entityTypes);
  }
  const rows = ctx.sqlite
    .prepare(
      `SELECT entity_type AS entityType, entity_id AS entityId, title, subtitle
       FROM search_index WHERE ${where.join(' AND ')}
       ORDER BY (CASE WHEN lower(title) LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END), length(title)
       LIMIT ?`,
    )
    .all(...params, `%${escapeLike(terms[0] ?? '')}%`, options.limit ?? 30) as SearchResult[];
  return rows;
}
