import type { FastifyInstance } from 'fastify';
import { entityRefSchema } from '@l10n/shared';
import { parse } from '../lib/validate';
import {
  emptyTrash,
  listTrash,
  moveToTrash,
  purgeFromTrash,
  restoreFromTrash,
} from '../services/trash';

export async function trashRoutes(app: FastifyInstance) {
  const ctx = app.ctx;

  app.get('/api/trash', async () => listTrash(ctx));

  app.post('/api/trash/move', async (req) => {
    const ref = parse(entityRefSchema, req.body);
    moveToTrash(ctx, ref.entityType, ref.entityId);
    return { ok: true };
  });

  app.post('/api/trash/restore', async (req) => {
    const ref = parse(entityRefSchema, req.body);
    restoreFromTrash(ctx, ref.entityType, ref.entityId);
    return { ok: true };
  });

  app.post('/api/trash/purge', async (req) => {
    const ref = parse(entityRefSchema, req.body);
    purgeFromTrash(ctx, ref.entityType, ref.entityId);
    return { ok: true };
  });

  app.post('/api/trash/empty', async () => ({ purged: emptyTrash(ctx) }));
}
