import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse } from '../lib/validate';
import {
  acknowledgeSyncEvent,
  configureSync,
  pullSync,
  pushSync,
  syncOnClose,
  syncStatus,
} from '../services/sync';

export async function syncRoutes(app: FastifyInstance) {
  const ctx = app.ctx;

  app.get('/api/sync', async () => syncStatus(ctx));

  app.put('/api/sync', async (req) =>
    configureSync(
      ctx,
      parse(
        z.object({
          directory: z.string().max(2000).nullable().optional(),
          deviceName: z.string().max(100).optional(),
        }),
        req.body ?? {},
      ),
    ),
  );

  const forceBody = z.object({ force: z.boolean().optional() });
  app.post('/api/sync/push', async (req) => pushSync(ctx, parse(forceBody, req.body ?? {})));
  app.post('/api/sync/pull', async (req) => pullSync(ctx, parse(forceBody, req.body ?? {})));
  app.post('/api/sync/ack', async () => {
    acknowledgeSyncEvent(ctx);
    return { ok: true };
  });
  app.post('/api/sync/on-close', async () => {
    await syncOnClose(ctx);
    return { ok: true };
  });
}
