import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '../lib/errors';
import { isInside, removeIfExists } from '../lib/fs';
import { newId } from '../lib/ids';
import { parse } from '../lib/validate';
import {
  backupOnClose,
  backupsDir,
  createBackup,
  listBackups,
  restoreBackup,
} from '../services/backup/backups';
import { exportFullCopy, importFullCopy } from '../services/backup/full-copy';
import { contentDisposition } from './attachments';

export async function backupRoutes(app: FastifyInstance) {
  const ctx = app.ctx;

  app.get('/api/backups', async () => ({ directory: backupsDir(ctx), items: listBackups(ctx) }));

  app.post('/api/backups', async (_req, reply) => {
    reply.code(201);
    return createBackup(ctx, 'manual');
  });

  app.post('/api/backups/restore', async (req) => {
    const { fileName } = parse(z.object({ fileName: z.string().min(1).max(200) }), req.body);
    await restoreBackup(ctx, fileName);
    return { ok: true };
  });

  app.post('/api/backups/on-close', async () => ({ backup: await backupOnClose(ctx) }));

  app.post('/api/backups/export', async (req) => {
    const body = parse(z.object({ destDir: z.string().max(1000).nullish() }), req.body ?? {});
    return exportFullCopy(ctx, body.destDir ?? null);
  });

  app.get('/api/backups/exports/:fileName', async (req, reply) => {
    const { fileName } = parse(z.object({ fileName: z.string().min(1).max(200) }), req.params);
    const file = path.join(ctx.config.exportsDir, fileName);
    if (!isInside(ctx.config.exportsDir, file) || !fs.existsSync(file))
      throw new NotFoundError('La exportación');
    reply
      .type('application/zip')
      .header('Content-Disposition', contentDisposition('attachment', fileName));
    return reply.send(fs.createReadStream(file));
  });

  /** Importa una copia completa: subida como archivo (multipart) o indicando su ruta en el equipo. */
  app.post('/api/backups/import', async (req) => {
    if (req.isMultipart()) {
      const part = await req.file();
      if (!part) throw new ValidationError('No se ha recibido ningún archivo.');
      const tmp = path.join(ctx.config.tmpDir, `subida-${newId()}.zip`);
      try {
        await pipeline(part.file, fs.createWriteStream(tmp));
        const manifest = await importFullCopy(ctx, tmp);
        return { ok: true, manifest };
      } finally {
        removeIfExists(tmp);
      }
    }
    const body = parse(z.object({ path: z.string().min(1).max(2000) }), req.body);
    const manifest = await importFullCopy(ctx, body.path);
    return { ok: true, manifest };
  });
}
