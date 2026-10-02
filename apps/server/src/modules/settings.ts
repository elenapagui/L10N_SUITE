import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SETTINGS_SECTIONS } from '@l10n/shared';
import { getSettings, updateSettingsSection } from '../services/settings';
import { parse } from '../lib/validate';

export async function settingsRoutes(app: FastifyInstance) {
  const ctx = app.ctx;

  app.get('/api/settings', async () => getSettings(ctx));

  app.put('/api/settings/:section', async (req) => {
    const { section } = parse(z.object({ section: z.enum(SETTINGS_SECTIONS) }), req.params);
    return updateSettingsSection(ctx, section, req.body ?? {});
  });
}
