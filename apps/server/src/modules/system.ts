import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppInfo } from '@l10n/shared';
import { backupsDir } from '../services/backup/backups';
import { listActivity } from '../services/activity';
import { searchIndex } from '../services/search';
import { parse } from '../lib/validate';

export async function systemRoutes(app: FastifyInstance) {
  const ctx = app.ctx;

  app.get('/api/health', async () => ({
    ok: true,
    integrity: ctx.integrity,
    maintenance: ctx.maintenance,
  }));

  app.get('/api/app-info', async (): Promise<AppInfo> => ({
    name: 'L10N Suite',
    version: ctx.config.appVersion,
    schemaVersion: ctx.integrity === 'ok' ? ctx.schemaVersion() : 0,
    dataDir: ctx.config.dataDir,
    dbPath: ctx.config.dbPath,
    backupsDir: backupsDir(ctx),
    desktop: ctx.config.desktop,
    integrity: ctx.integrity,
    startedAt: ctx.startedAt,
  }));

  app.get('/api/search', async (req) => {
    const q = parse(
      z.object({
        q: z.string().max(200).default(''),
        types: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      }),
      req.query,
    );
    return searchIndex(ctx, q.q, {
      limit: q.limit,
      entityTypes: q.types?.split(',').filter(Boolean),
    });
  });

  app.get('/api/activity', async (req) => {
    const q = parse(
      z.object({
        limit: z.coerce.number().int().min(1).max(500).default(50),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
      }),
      req.query,
    );
    return listActivity(ctx, q);
  });
}
