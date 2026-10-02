import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  entityRefSchema,
  idSchema,
  tagInputSchema,
  tagUpdateSchema,
  taggingInputSchema,
  type Tag,
} from '@l10n/shared';
import type { AppContext } from '../context';
import { ConflictError, NotFoundError } from '../lib/errors';
import { newId } from '../lib/ids';
import { parse } from '../lib/validate';
import { indexEntity } from '../services/search';
import { moveToTrash, registerTrashable } from '../services/trash';

const SELECT = `SELECT t.id, t.name, t.color, t.created_at AS createdAt, t.updated_at AS updatedAt,
  (SELECT COUNT(*) FROM taggings g WHERE g.tag_id = t.id) AS usageCount FROM tags t`;

export function registerTagEntity(): void {
  registerTrashable({
    type: 'tag',
    table: 'tags',
    titleSql: 'name',
    onRestore: (ctx, id) => {
      const tag = getTag(ctx, id);
      indexEntity(ctx, { entityType: 'tag', entityId: id, title: tag.name, subtitle: 'Etiqueta' });
    },
  });
}

export function getTag(ctx: AppContext, id: string): Tag {
  const row = ctx.sqlite.prepare(`${SELECT} WHERE t.id = ? AND t.deleted_at IS NULL`).get(id) as
    Tag | undefined;
  if (!row) throw new NotFoundError('La etiqueta');
  return row;
}

function assertUniqueName(ctx: AppContext, name: string, exceptId?: string) {
  const dup = ctx.sqlite
    .prepare(
      'SELECT id FROM tags WHERE lower(name) = lower(?) AND deleted_at IS NULL AND id IS NOT ?',
    )
    .get(name, exceptId ?? null);
  if (dup) throw new ConflictError(`Ya existe una etiqueta llamada «${name}».`);
}

export function listTagsFor(ctx: AppContext, entityType: string, entityId: string): Tag[] {
  return ctx.sqlite
    .prepare(
      `${SELECT} JOIN taggings x ON x.tag_id = t.id
       WHERE x.entity_type = ? AND x.entity_id = ? AND t.deleted_at IS NULL ORDER BY t.name`,
    )
    .all(entityType, entityId) as Tag[];
}

export function setTagsFor(
  ctx: AppContext,
  entityType: string,
  entityId: string,
  tagIds: string[],
): Tag[] {
  const tx = ctx.sqlite.transaction(() => {
    ctx.sqlite
      .prepare('DELETE FROM taggings WHERE entity_type = ? AND entity_id = ?')
      .run(entityType, entityId);
    const insert = ctx.sqlite.prepare(
      'INSERT OR IGNORE INTO taggings (tag_id, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?)',
    );
    for (const tagId of new Set(tagIds)) {
      getTag(ctx, tagId);
      insert.run(tagId, entityType, entityId, ctx.nowISO());
    }
  });
  tx();
  return listTagsFor(ctx, entityType, entityId);
}

export async function tagRoutes(app: FastifyInstance) {
  const ctx = app.ctx;

  app.get(
    '/api/tags',
    async () =>
      ctx.sqlite
        .prepare(`${SELECT} WHERE t.deleted_at IS NULL ORDER BY lower(t.name)`)
        .all() as Tag[],
  );

  app.post('/api/tags', async (req, reply) => {
    const input = parse(tagInputSchema, req.body);
    assertUniqueName(ctx, input.name);
    const id = newId();
    const now = ctx.nowISO();
    ctx.sqlite
      .prepare('INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, input.name, input.color, now, now);
    indexEntity(ctx, { entityType: 'tag', entityId: id, title: input.name, subtitle: 'Etiqueta' });
    reply.code(201);
    return getTag(ctx, id);
  });

  app.patch('/api/tags/:id', async (req) => {
    const { id } = parse(z.object({ id: idSchema }), req.params);
    const input = parse(tagUpdateSchema, req.body);
    const current = getTag(ctx, id);
    if (input.name) assertUniqueName(ctx, input.name, id);
    ctx.sqlite
      .prepare('UPDATE tags SET name = ?, color = ?, updated_at = ? WHERE id = ?')
      .run(input.name ?? current.name, input.color ?? current.color, ctx.nowISO(), id);
    const tag = getTag(ctx, id);
    indexEntity(ctx, { entityType: 'tag', entityId: id, title: tag.name, subtitle: 'Etiqueta' });
    return tag;
  });

  app.delete('/api/tags/:id', async (req) => {
    const { id } = parse(z.object({ id: idSchema }), req.params);
    moveToTrash(ctx, 'tag', id);
    return { ok: true };
  });

  app.get('/api/taggings', async (req) => {
    const ref = parse(entityRefSchema, req.query);
    return listTagsFor(ctx, ref.entityType, ref.entityId);
  });

  app.put('/api/taggings', async (req) => {
    const input = parse(taggingInputSchema, req.body);
    return setTagsFor(ctx, input.entityType, input.entityId, input.tagIds);
  });
}
