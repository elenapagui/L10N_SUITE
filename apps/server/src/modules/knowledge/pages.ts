import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  PAGE_TEMPLATES,
  blocksToPlainText,
  extractMentions,
  idSchema,
  markdownToPlainText,
  pageInputSchema,
  pageUpdateSchema,
  type Backlink,
  type ContentFormat,
  type Page,
  type PageRevision,
  type PageSummary,
} from '@l10n/shared';
import type { AppContext } from '../../context';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { assertExists } from '../../lib/sql';
import { parse } from '../../lib/validate';
import { logActivity } from '../../services/activity';
import { indexEntity, removeFromIndex } from '../../services/search';
import { moveToTrash, registerTrashable } from '../../services/trash';

/** Cada cuánto se guarda una versión como mínimo mientras se edita. */
const REVISION_INTERVAL_MS = 10 * 60 * 1000;
const MAX_REVISIONS = 50;
const MAX_CONTENT_BYTES = 20 * 1024 * 1024;

/** Páginas ocultas: las de la papelera y todas sus descendientes. */
const HIDDEN_CTE = `WITH RECURSIVE hidden(id) AS (
  SELECT id FROM pages WHERE deleted_at IS NOT NULL
  UNION SELECT p.id FROM pages p JOIN hidden h ON p.parent_id = h.id
)`;

const SUMMARY_SELECT = `p.id, p.parent_id AS parentId, p.title, p.icon, p.game_id AS gameId,
  p.is_favorite AS isFavorite, p.position, p.updated_at AS updatedAt, p.last_opened_at AS lastOpenedAt,
  EXISTS (SELECT 1 FROM pages c WHERE c.parent_id = p.id AND c.deleted_at IS NULL) AS hasChildren`;

type SummaryRow = Omit<PageSummary, 'isFavorite' | 'hasChildren'> & {
  isFavorite: number;
  hasChildren: number;
};

function toSummary(r: SummaryRow): PageSummary {
  return { ...r, isFavorite: r.isFavorite === 1, hasChildren: r.hasChildren === 1 };
}

export function isPageVisible(ctx: AppContext, id: string): boolean {
  return Boolean(
    ctx.sqlite
      .prepare(
        `${HIDDEN_CTE} SELECT 1 FROM pages WHERE id = ? AND id NOT IN (SELECT id FROM hidden)`,
      )
      .get(id),
  );
}

export function listPages(ctx: AppContext, filter: { gameId?: string } = {}): PageSummary[] {
  const where = ['p.id NOT IN (SELECT id FROM hidden)'];
  const params: unknown[] = [];
  if (filter.gameId) {
    where.push('p.game_id = ?');
    params.push(filter.gameId);
  }
  const rows = ctx.sqlite
    .prepare(
      `${HIDDEN_CTE} SELECT ${SUMMARY_SELECT} FROM pages p WHERE ${where.join(' AND ')}
       ORDER BY p.position, p.created_at`,
    )
    .all(...params) as SummaryRow[];
  return rows.map(toSummary);
}

function breadcrumbs(ctx: AppContext, parentId: string | null): Page['breadcrumbs'] {
  const out: Page['breadcrumbs'] = [];
  let current = parentId;
  const seen = new Set<string>();
  while (current && !seen.has(current) && out.length < 50) {
    seen.add(current);
    const row = ctx.sqlite
      .prepare('SELECT id, title, icon, parent_id AS parentId FROM pages WHERE id = ?')
      .get(current) as
      { id: string; title: string; icon: string | null; parentId: string | null } | undefined;
    if (!row) break;
    out.unshift({ id: row.id, title: row.title, icon: row.icon });
    current = row.parentId;
  }
  return out;
}

export function getPage(ctx: AppContext, id: string): Page {
  if (!isPageVisible(ctx, id)) throw new NotFoundError('La página');
  const row = ctx.sqlite
    .prepare(
      `SELECT ${SUMMARY_SELECT}, p.content, p.content_format AS contentFormat, p.version,
        p.created_at AS createdAt FROM pages p WHERE p.id = ?`,
    )
    .get(id) as SummaryRow & {
    content: string;
    contentFormat: ContentFormat;
    version: number;
    createdAt: string;
  };
  let content: unknown = row.content;
  if (row.contentFormat === 'blocks') {
    try {
      content = JSON.parse(row.content);
    } catch {
      content = [];
    }
  }
  return {
    ...toSummary(row),
    content,
    contentFormat: row.contentFormat,
    version: row.version,
    createdAt: row.createdAt,
    breadcrumbs: breadcrumbs(ctx, row.parentId),
  };
}

function plainText(content: unknown, format: ContentFormat): string {
  return format === 'markdown'
    ? markdownToPlainText(String(content ?? ''))
    : blocksToPlainText(content);
}

function serialize(content: unknown, format: ContentFormat): string {
  if (format === 'markdown') {
    if (typeof content !== 'string')
      throw new ValidationError('El contenido en Markdown debe ser texto.');
    return content;
  }
  if (content === undefined || content === null) return '[]';
  if (!Array.isArray(content)) throw new ValidationError('El contenido de la página no es válido.');
  const json = JSON.stringify(content);
  if (json.length > MAX_CONTENT_BYTES) throw new ValidationError('La página es demasiado grande.');
  return json;
}

function indexPage(ctx: AppContext, id: string): void {
  const row = ctx.sqlite
    .prepare('SELECT title, icon, content_text AS text FROM pages WHERE id = ?')
    .get(id) as { title: string; icon: string | null; text: string } | undefined;
  if (!row) return;
  const crumbs = breadcrumbs(
    ctx,
    (
      ctx.sqlite.prepare('SELECT parent_id AS p FROM pages WHERE id = ?').get(id) as {
        p: string | null;
      }
    ).p,
  );
  indexEntity(ctx, {
    entityType: 'page',
    entityId: id,
    title: row.title || 'Sin título',
    subtitle: crumbs.map((c) => c.title || 'Sin título').join(' / ') || null,
    text: row.text,
  });
}

function updateLinks(
  ctx: AppContext,
  pageId: string,
  content: unknown,
  format: ContentFormat,
): void {
  ctx.sqlite.prepare("DELETE FROM links WHERE source_type = 'page' AND source_id = ?").run(pageId);
  if (format !== 'blocks') return;
  const insert = ctx.sqlite.prepare(
    `INSERT OR IGNORE INTO links (source_type, source_id, target_type, target_id, created_at)
     VALUES ('page', ?, ?, ?, ?)`,
  );
  const now = ctx.nowISO();
  for (const m of extractMentions(content).slice(0, 1000)) {
    if (m.entityType === 'page' && m.entityId === pageId) continue;
    insert.run(pageId, m.entityType, m.entityId, now);
  }
}

function siblingsPositions(
  ctx: AppContext,
  parentId: string | null,
  excludeId?: string,
): { id: string; position: number }[] {
  return ctx.sqlite
    .prepare(
      `SELECT id, position FROM pages WHERE deleted_at IS NULL AND parent_id IS ? ${excludeId ? 'AND id <> ?' : ''}
       ORDER BY position, created_at`,
    )
    .all(...(excludeId ? [parentId, excludeId] : [parentId])) as { id: string; position: number }[];
}

/** Posición para colocar una página en el índice `index` entre sus hermanas. */
function positionAt(siblings: { position: number }[], index: number): number {
  if (siblings.length === 0) return 1;
  if (index <= 0) return siblings[0]!.position - 1;
  if (index >= siblings.length) return siblings[siblings.length - 1]!.position + 1;
  return (siblings[index - 1]!.position + siblings[index]!.position) / 2;
}

function assertNoCycle(ctx: AppContext, id: string, newParent: string | null): void {
  let current = newParent;
  const seen = new Set<string>();
  while (current) {
    if (current === id) throw new ValidationError('Una página no puede estar dentro de sí misma.');
    if (seen.has(current)) break;
    seen.add(current);
    const row = ctx.sqlite.prepare('SELECT parent_id AS p FROM pages WHERE id = ?').get(current) as
      { p: string | null } | undefined;
    current = row?.p ?? null;
  }
}

export function createPage(ctx: AppContext, raw: unknown): Page {
  const input = parse(pageInputSchema, raw);
  if (input.parentId && !isPageVisible(ctx, input.parentId))
    throw new NotFoundError('La página superior');
  assertExists(ctx, 'games', input.gameId, 'El juego');
  const template = input.template ? PAGE_TEMPLATES.find((t) => t.key === input.template) : null;
  if (input.template && !template) throw new ValidationError('Plantilla desconocida.');
  const format: ContentFormat = template ? 'markdown' : input.contentFormat;
  const content = template
    ? template.markdown
    : (input.content ?? (format === 'markdown' ? '' : []));
  const stored = serialize(content, format);
  const parentId = input.parentId ?? null;
  const siblings = siblingsPositions(ctx, parentId);
  let position: number;
  if (input.afterId) {
    const i = siblings.findIndex((s) => s.id === input.afterId);
    position = positionAt(siblings, i < 0 ? siblings.length : i + 1);
  } else {
    position = positionAt(siblings, siblings.length);
  }
  const id = newId();
  const now = ctx.nowISO();
  const title = input.title || (template ? template.label : '');
  ctx.sqlite
    .prepare(
      `INSERT INTO pages (id, parent_id, title, icon, game_id, content, content_format, content_text,
        is_favorite, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      parentId,
      title,
      input.icon ?? template?.icon ?? null,
      input.gameId ?? null,
      stored,
      format,
      plainText(content, format),
      input.isFavorite ? 1 : 0,
      position,
      now,
      now,
    );
  updateLinks(ctx, id, content, format);
  indexPage(ctx, id);
  logActivity(ctx, {
    entityType: 'page',
    entityId: id,
    action: 'crear',
    summary: `Página «${title || 'Sin título'}» creada`,
  });
  return getPage(ctx, id);
}

function saveRevision(ctx: AppContext, pageId: string, force = false): void {
  const current = ctx.sqlite
    .prepare(
      'SELECT title, content, content_format AS f, content_text AS t FROM pages WHERE id = ?',
    )
    .get(pageId) as { title: string; content: string; f: string; t: string };
  if (!current.t.trim() && !force) return;
  const last = ctx.sqlite
    .prepare(
      'SELECT created_at AS at, content FROM page_revisions WHERE page_id = ? ORDER BY created_at DESC LIMIT 1',
    )
    .get(pageId) as { at: string; content: string } | undefined;
  if (last && last.content === current.content) return;
  if (!force && last && ctx.now().getTime() - Date.parse(last.at) < REVISION_INTERVAL_MS) return;
  ctx.sqlite
    .prepare(
      'INSERT INTO page_revisions (id, page_id, title, content, content_format, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(newId(), pageId, current.title, current.content, current.f, ctx.nowISO());
  ctx.sqlite
    .prepare(
      `DELETE FROM page_revisions WHERE page_id = ? AND id NOT IN (
         SELECT id FROM page_revisions WHERE page_id = ? ORDER BY created_at DESC LIMIT ?)`,
    )
    .run(pageId, pageId, MAX_REVISIONS);
}

export function updatePage(ctx: AppContext, id: string, raw: unknown): Page {
  const patch = parse(pageUpdateSchema, raw);
  if (!isPageVisible(ctx, id)) throw new NotFoundError('La página');
  const current = ctx.sqlite
    .prepare('SELECT parent_id AS parentId, version, content_format AS f FROM pages WHERE id = ?')
    .get(id) as { parentId: string | null; version: number; f: ContentFormat };
  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    params.push(v);
  };
  const tx = ctx.sqlite.transaction(() => {
    if (patch.title !== undefined) set('title', patch.title);
    if (patch.icon !== undefined) set('icon', patch.icon);
    if (patch.isFavorite !== undefined) set('is_favorite', patch.isFavorite ? 1 : 0);
    if (patch.gameId !== undefined) {
      assertExists(ctx, 'games', patch.gameId, 'El juego');
      set('game_id', patch.gameId);
    }
    const moving = patch.parentId !== undefined || patch.index !== undefined;
    if (moving) {
      const parentId = patch.parentId !== undefined ? (patch.parentId ?? null) : current.parentId;
      if (parentId && !isPageVisible(ctx, parentId)) throw new NotFoundError('La página superior');
      assertNoCycle(ctx, id, parentId);
      const siblings = siblingsPositions(ctx, parentId, id);
      set('parent_id', parentId);
      set('position', positionAt(siblings, patch.index ?? siblings.length));
    }
    if (patch.content !== undefined) {
      if (patch.baseVersion !== undefined && patch.baseVersion !== current.version) {
        throw new ConflictError(
          'La página ha cambiado en otra ventana. Vuelve a abrirla para no perder cambios.',
        );
      }
      const format = patch.contentFormat ?? current.f;
      saveRevision(ctx, id);
      set('content', serialize(patch.content, format));
      set('content_format', format);
      set('content_text', plainText(patch.content, format));
      sets.push('version = version + 1');
      updateLinks(ctx, id, patch.content, format);
    }
    if (sets.length === 0) return;
    set('updated_at', ctx.nowISO());
    ctx.sqlite.prepare(`UPDATE pages SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    if (patch.title !== undefined || patch.content !== undefined || moving) indexPage(ctx, id);
    if (moving || patch.title !== undefined) {
      // Las migas de pan de las descendientes cambian.
      for (const d of descendants(ctx, id)) indexPage(ctx, d);
    }
  });
  tx();
  return getPage(ctx, id);
}

export function descendants(ctx: AppContext, id: string): string[] {
  return (
    ctx.sqlite
      .prepare(
        `WITH RECURSIVE d(id) AS (SELECT id FROM pages WHERE parent_id = ?
           UNION SELECT p.id FROM pages p JOIN d ON p.parent_id = d.id)
         SELECT id FROM d`,
      )
      .all(id) as { id: string }[]
  ).map((r) => r.id);
}

export function listRevisions(ctx: AppContext, pageId: string): PageRevision[] {
  if (!isPageVisible(ctx, pageId)) throw new NotFoundError('La página');
  return ctx.sqlite
    .prepare(
      `SELECT id, page_id AS pageId, title, created_at AS createdAt, length(content) AS size
       FROM page_revisions WHERE page_id = ? ORDER BY created_at DESC`,
    )
    .all(pageId) as PageRevision[];
}

export function restoreRevision(ctx: AppContext, pageId: string, revisionId: string): Page {
  const rev = ctx.sqlite
    .prepare(
      'SELECT title, content, content_format AS f FROM page_revisions WHERE id = ? AND page_id = ?',
    )
    .get(revisionId, pageId) as { title: string; content: string; f: ContentFormat } | undefined;
  if (!rev) throw new NotFoundError('La versión');
  const content = rev.f === 'blocks' ? (JSON.parse(rev.content) as unknown) : rev.content;
  const tx = ctx.sqlite.transaction(() => {
    saveRevision(ctx, pageId, true);
    updatePage(ctx, pageId, { content, contentFormat: rev.f });
  });
  tx();
  logActivity(ctx, {
    entityType: 'page',
    entityId: pageId,
    action: 'editar',
    summary: 'Versión anterior restaurada',
  });
  return getPage(ctx, pageId);
}

/** Páginas que mencionan una ficha. */
export function listBacklinks(ctx: AppContext, targetType: string, targetId: string): Backlink[] {
  return ctx.sqlite
    .prepare(
      `${HIDDEN_CTE} SELECT 'page' AS entityType, p.id AS entityId, p.title, p.icon
       FROM links l JOIN pages p ON p.id = l.source_id
       WHERE l.source_type = 'page' AND l.target_type = ? AND l.target_id = ?
         AND p.id NOT IN (SELECT id FROM hidden)
       ORDER BY p.updated_at DESC`,
    )
    .all(targetType, targetId) as Backlink[];
}

export function duplicatePage(ctx: AppContext, id: string): Page {
  const page = getPage(ctx, id);
  return createPage(ctx, {
    title: `${page.title || 'Sin título'} (copia)`,
    icon: page.icon,
    parentId: page.parentId,
    gameId: page.gameId,
    content: page.content,
    contentFormat: page.contentFormat,
    afterId: page.id,
  });
}

export function registerPageEntity(): void {
  registerTrashable({
    type: 'page',
    table: 'pages',
    titleSql: "CASE WHEN title = '' THEN 'Sin título' ELSE title END",
    onTrash: (ctx, id) => {
      for (const d of descendants(ctx, id)) removeFromIndex(ctx, 'page', d);
    },
    onRestore: (ctx, id) => {
      // Si la página superior sigue en la papelera, se restaura en la raíz.
      const row = ctx.sqlite.prepare('SELECT parent_id AS p FROM pages WHERE id = ?').get(id) as {
        p: string | null;
      };
      if (row.p && !isPageVisible(ctx, row.p)) {
        const siblings = siblingsPositions(ctx, null, id);
        ctx.sqlite
          .prepare('UPDATE pages SET parent_id = NULL, position = ? WHERE id = ?')
          .run(positionAt(siblings, siblings.length), id);
      }
      for (const d of [id, ...descendants(ctx, id)]) {
        if (isPageVisible(ctx, d)) indexPage(ctx, d);
      }
    },
    onPurge: (ctx, id) => {
      const all = [id, ...descendants(ctx, id)];
      const del = ctx.sqlite.prepare(
        "DELETE FROM links WHERE source_type = 'page' AND source_id = ?",
      );
      const delTargets = ctx.sqlite.prepare(
        "DELETE FROM links WHERE target_type = 'page' AND target_id = ?",
      );
      for (const p of all) {
        del.run(p);
        delTargets.run(p);
        removeFromIndex(ctx, 'page', p);
      }
      // Las descendientes y sus versiones se borran en cascada con la página.
    },
  });
}

export async function pageRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });

  app.get('/api/pages', async (req) => {
    const q = parse(z.object({ gameId: idSchema.optional() }), req.query);
    return listPages(ctx, q);
  });

  app.get('/api/page-templates', async () =>
    PAGE_TEMPLATES.map(({ key, label, icon, description }) => ({ key, label, icon, description })),
  );

  app.get('/api/pages/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return getPage(ctx, id);
  });

  app.post('/api/pages', async (req, reply) => {
    reply.code(201);
    return createPage(ctx, req.body);
  });

  app.patch('/api/pages/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return updatePage(ctx, id, req.body);
  });

  app.post('/api/pages/:id/opened', async (req) => {
    const { id } = parse(idParam, req.params);
    if (!isPageVisible(ctx, id)) throw new NotFoundError('La página');
    ctx.sqlite.prepare('UPDATE pages SET last_opened_at = ? WHERE id = ?').run(ctx.nowISO(), id);
    return { ok: true };
  });

  app.post('/api/pages/:id/duplicate', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    reply.code(201);
    return duplicatePage(ctx, id);
  });

  app.get('/api/pages/:id/revisions', async (req) => {
    const { id } = parse(idParam, req.params);
    return listRevisions(ctx, id);
  });

  app.get('/api/pages/:id/revisions/:revisionId', async (req) => {
    const { id, revisionId } = parse(z.object({ id: idSchema, revisionId: idSchema }), req.params);
    const rev = ctx.sqlite
      .prepare(
        `SELECT id, page_id AS pageId, title, content, content_format AS contentFormat, created_at AS createdAt
         FROM page_revisions WHERE id = ? AND page_id = ?`,
      )
      .get(revisionId, id) as { content: string; contentFormat: ContentFormat } | undefined;
    if (!rev) throw new NotFoundError('La versión');
    return {
      ...rev,
      content: rev.contentFormat === 'blocks' ? JSON.parse(rev.content) : rev.content,
    };
  });

  app.post('/api/pages/:id/revisions/:revisionId/restore', async (req) => {
    const { id, revisionId } = parse(z.object({ id: idSchema, revisionId: idSchema }), req.params);
    return restoreRevision(ctx, id, revisionId);
  });

  app.get('/api/backlinks', async (req) => {
    const q = parse(
      z.object({ entityType: z.string().min(1).max(40), entityId: idSchema }),
      req.query,
    );
    return listBacklinks(ctx, q.entityType, q.entityId);
  });

  app.delete('/api/pages/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    if (!isPageVisible(ctx, id)) throw new NotFoundError('La página');
    moveToTrash(ctx, 'page', id);
    return { ok: true };
  });
}
