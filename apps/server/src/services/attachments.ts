import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type { Attachment } from '@l10n/shared';
import type { AppContext } from '../context';
import { NotFoundError } from '../lib/errors';
import { ensureDir, safeFileName } from '../lib/fs';
import { newId } from '../lib/ids';
import { indexEntity } from './search';
import { registerTrashable } from './trash';

interface AttachmentRow {
  id: string;
  entityType: string | null;
  entityId: string | null;
  fileName: string;
  storagePath: string;
  mimeType: string;
  size: number;
  sha256: string;
  createdAt: string;
}

const SELECT = `SELECT id, entity_type AS entityType, entity_id AS entityId, file_name AS fileName,
  storage_path AS storagePath, mime_type AS mimeType, size, sha256, created_at AS createdAt FROM attachments`;

export function attachmentAbsolutePath(ctx: AppContext, storagePath: string): string {
  return path.join(ctx.config.attachmentsDir, ...storagePath.split('/'));
}

function toAttachment(ctx: AppContext, row: AttachmentRow): Attachment {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    sha256: row.sha256,
    absolutePath: attachmentAbsolutePath(ctx, row.storagePath),
    createdAt: row.createdAt,
  };
}

export function registerAttachmentEntity(): void {
  registerTrashable({
    type: 'attachment',
    table: 'attachments',
    titleSql: 'file_name',
    onRestore: (ctx, id) => {
      const a = getAttachment(ctx, id);
      indexEntity(ctx, { entityType: 'attachment', entityId: id, title: a.fileName });
    },
    onPurge: (ctx, id) => {
      const row = ctx.sqlite
        .prepare('SELECT storage_path AS p FROM attachments WHERE id = ?')
        .get(id) as { p: string } | undefined;
      if (row) fs.rmSync(attachmentAbsolutePath(ctx, row.p), { force: true });
    },
  });
}

/** Guarda un archivo en la carpeta de adjuntos calculando su huella SHA-256. */
export async function saveAttachment(
  ctx: AppContext,
  input: {
    fileName: string;
    mimeType?: string | null;
    source: Readable | Buffer;
    entityType?: string | null;
    entityId?: string | null;
  },
): Promise<Attachment> {
  const id = newId();
  const fileName = safeFileName(input.fileName || 'archivo');
  const ext = path.extname(fileName).toLowerCase().slice(0, 12);
  const now = ctx.now();
  const folder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  const storagePath = `${folder}/${id}${ext}`;
  const finalPath = attachmentAbsolutePath(ctx, storagePath);
  ensureDir(path.dirname(finalPath));
  const tmpPath = `${finalPath}.tmp`;
  const hash = crypto.createHash('sha256');
  let size = 0;
  try {
    if (Buffer.isBuffer(input.source)) {
      hash.update(input.source);
      size = input.source.length;
      fs.writeFileSync(tmpPath, input.source);
    } else {
      const out = fs.createWriteStream(tmpPath);
      input.source.on('data', (chunk: Buffer) => {
        hash.update(chunk);
        size += chunk.length;
      });
      await pipeline(input.source, out);
    }
    fs.renameSync(tmpPath, finalPath);
  } catch (error) {
    fs.rmSync(tmpPath, { force: true });
    throw error;
  }
  const iso = ctx.nowISO();
  const row: AttachmentRow = {
    id,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    fileName,
    storagePath,
    mimeType: input.mimeType || 'application/octet-stream',
    size,
    sha256: hash.digest('hex'),
    createdAt: iso,
  };
  ctx.sqlite
    .prepare(
      `INSERT INTO attachments (id, entity_type, entity_id, file_name, storage_path, mime_type, size, sha256, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.entityType,
      row.entityId,
      row.fileName,
      row.storagePath,
      row.mimeType,
      row.size,
      row.sha256,
      iso,
      iso,
    );
  indexEntity(ctx, { entityType: 'attachment', entityId: id, title: fileName });
  return toAttachment(ctx, row);
}

export function getAttachment(
  ctx: AppContext,
  id: string,
  options: { includeDeleted?: boolean } = {},
): Attachment {
  const row = ctx.sqlite
    .prepare(`${SELECT} WHERE id = ? ${options.includeDeleted ? '' : 'AND deleted_at IS NULL'}`)
    .get(id) as AttachmentRow | undefined;
  if (!row) throw new NotFoundError('El adjunto');
  return toAttachment(ctx, row);
}

export function listAttachments(
  ctx: AppContext,
  entityType?: string,
  entityId?: string,
): Attachment[] {
  const rows = (
    entityType && entityId
      ? ctx.sqlite
          .prepare(
            `${SELECT} WHERE deleted_at IS NULL AND entity_type = ? AND entity_id = ? ORDER BY created_at DESC`,
          )
          .all(entityType, entityId)
      : ctx.sqlite
          .prepare(`${SELECT} WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 500`)
          .all()
  ) as AttachmentRow[];
  return rows.map((r) => toAttachment(ctx, r));
}

export function renameAttachment(ctx: AppContext, id: string, fileName: string): Attachment {
  getAttachment(ctx, id);
  const safe = safeFileName(fileName);
  ctx.sqlite
    .prepare('UPDATE attachments SET file_name = ?, updated_at = ? WHERE id = ?')
    .run(safe, ctx.nowISO(), id);
  indexEntity(ctx, { entityType: 'attachment', entityId: id, title: safe });
  return getAttachment(ctx, id);
}
