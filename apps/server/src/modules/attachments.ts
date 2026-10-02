import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { entityTypeSchema, idSchema } from '@l10n/shared';
import { ValidationError } from '../lib/errors';
import { parse } from '../lib/validate';
import {
  getAttachment,
  listAttachments,
  renameAttachment,
  saveAttachment,
} from '../services/attachments';
import { moveToTrash } from '../services/trash';

export function contentDisposition(kind: 'inline' | 'attachment', fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function attachmentRoutes(app: FastifyInstance) {
  const ctx = app.ctx;

  app.get('/api/attachments', async (req) => {
    const q = parse(
      z.object({ entityType: entityTypeSchema.optional(), entityId: idSchema.optional() }),
      req.query,
    );
    return listAttachments(ctx, q.entityType, q.entityId);
  });

  /** Subida de uno o varios archivos (multipart). La ficha a la que se vinculan va en la URL. */
  app.post('/api/attachments', async (req, reply) => {
    const q = parse(
      z.object({ entityType: entityTypeSchema.optional(), entityId: idSchema.optional() }),
      req.query,
    );
    if (!req.isMultipart())
      throw new ValidationError('Hay que enviar los archivos como multipart/form-data.');
    const saved = [];
    for await (const part of req.files()) {
      saved.push(
        await saveAttachment(ctx, {
          fileName: part.filename,
          mimeType: part.mimetype,
          source: part.file,
          entityType: q.entityType ?? null,
          entityId: q.entityId ?? null,
        }),
      );
    }
    if (saved.length === 0) throw new ValidationError('No se ha recibido ningún archivo.');
    reply.code(201);
    return saved;
  });

  app.get('/api/attachments/:id', async (req) => {
    const { id } = parse(z.object({ id: idSchema }), req.params);
    return getAttachment(ctx, id);
  });

  app.get('/api/attachments/:id/content', async (req, reply) => {
    const { id } = parse(z.object({ id: idSchema }), req.params);
    const { download } = parse(z.object({ download: z.string().optional() }), req.query);
    const a = getAttachment(ctx, id);
    if (!fs.existsSync(a.absolutePath)) {
      throw new ValidationError(
        'El archivo no se encuentra en la carpeta de datos. Prueba a restaurar una copia.',
      );
    }
    reply
      .type(a.mimeType)
      .header(
        'Content-Disposition',
        contentDisposition(download ? 'attachment' : 'inline', a.fileName),
      )
      .header('Cache-Control', 'private, max-age=3600');
    return reply.send(fs.createReadStream(a.absolutePath));
  });

  app.patch('/api/attachments/:id', async (req) => {
    const { id } = parse(z.object({ id: idSchema }), req.params);
    const body = parse(z.object({ fileName: z.string().trim().min(1).max(180) }), req.body);
    return renameAttachment(ctx, id, body.fileName);
  });

  app.delete('/api/attachments/:id', async (req) => {
    const { id } = parse(z.object({ id: idSchema }), req.params);
    moveToTrash(ctx, 'attachment', id);
    return { ok: true };
  });
}
