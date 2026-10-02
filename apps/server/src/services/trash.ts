import type { TrashItem } from '@l10n/shared';
import type { AppContext } from '../context';
import { NotFoundError, ValidationError } from '../lib/errors';
import { logActivity } from './activity';
import { removeFromIndex } from './search';

export const TRASH_RETENTION_DAYS = 30;

export interface TrashableEntity {
  type: string;
  table: string;
  /** Expresión SQL que da el título visible de la ficha. */
  titleSql: string;
  /** Se ejecuta tras restaurar (p. ej. para volver a indexar). */
  onRestore?: (ctx: AppContext, id: string) => void;
  /** Se ejecuta justo antes del borrado definitivo (p. ej. para borrar archivos). */
  onPurge?: (ctx: AppContext, id: string) => void;
  /** Se ejecuta tras enviar a la papelera (p. ej. para enviar también las fichas hijas). */
  onTrash?: (ctx: AppContext, id: string) => void;
}

const registry = new Map<string, TrashableEntity>();

export function registerTrashable(def: TrashableEntity): void {
  registry.set(def.type, def);
}

function getDef(type: string): TrashableEntity {
  const def = registry.get(type);
  if (!def) throw new ValidationError('Este tipo de ficha no admite papelera.');
  return def;
}

function titleOf(ctx: AppContext, def: TrashableEntity, id: string): string | null {
  const row = ctx.sqlite
    .prepare(`SELECT ${def.titleSql} AS title FROM ${def.table} WHERE id = ?`)
    .get(id) as { title: string | null } | undefined;
  return row ? (row.title ?? '(sin título)') : null;
}

/** Envía una ficha a la papelera (borrado lógico). */
export function moveToTrash(ctx: AppContext, type: string, id: string): void {
  const def = getDef(type);
  const title = titleOf(ctx, def, id);
  if (title == null) throw new NotFoundError();
  const tx = ctx.sqlite.transaction(() => {
    const now = ctx.nowISO();
    ctx.sqlite
      .prepare(
        `UPDATE ${def.table} SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(now, now, id);
    removeFromIndex(ctx, type, id);
    def.onTrash?.(ctx, id);
    logActivity(ctx, {
      entityType: type,
      entityId: id,
      action: 'eliminar',
      summary: `«${title}» enviado a la papelera`,
    });
  });
  tx();
}

export function restoreFromTrash(ctx: AppContext, type: string, id: string): void {
  const def = getDef(type);
  const title = titleOf(ctx, def, id);
  if (title == null) throw new NotFoundError();
  const tx = ctx.sqlite.transaction(() => {
    ctx.sqlite
      .prepare(`UPDATE ${def.table} SET deleted_at = NULL, updated_at = ? WHERE id = ?`)
      .run(ctx.nowISO(), id);
    def.onRestore?.(ctx, id);
    logActivity(ctx, {
      entityType: type,
      entityId: id,
      action: 'restaurar',
      summary: `«${title}» restaurado`,
    });
  });
  tx();
}

export function purgeFromTrash(ctx: AppContext, type: string, id: string): void {
  const def = getDef(type);
  const row = ctx.sqlite
    .prepare(`SELECT deleted_at AS deletedAt FROM ${def.table} WHERE id = ?`)
    .get(id) as { deletedAt: string | null } | undefined;
  if (!row) throw new NotFoundError();
  if (!row.deletedAt)
    throw new ValidationError('Solo se pueden borrar definitivamente las fichas de la papelera.');
  const tx = ctx.sqlite.transaction(() => {
    def.onPurge?.(ctx, id);
    ctx.sqlite.prepare(`DELETE FROM ${def.table} WHERE id = ?`).run(id);
    ctx.sqlite
      .prepare('DELETE FROM taggings WHERE entity_type = ? AND entity_id = ?')
      .run(type, id);
  });
  tx();
}

export function listTrash(ctx: AppContext): TrashItem[] {
  const items: TrashItem[] = [];
  for (const def of registry.values()) {
    const rows = ctx.sqlite
      .prepare(
        `SELECT id, ${def.titleSql} AS title, deleted_at AS deletedAt FROM ${def.table} WHERE deleted_at IS NOT NULL`,
      )
      .all() as { id: string; title: string | null; deletedAt: string }[];
    for (const row of rows) {
      const purge = new Date(row.deletedAt);
      purge.setDate(purge.getDate() + TRASH_RETENTION_DAYS);
      items.push({
        entityType: def.type,
        entityId: row.id,
        title: row.title ?? '(sin título)',
        deletedAt: row.deletedAt,
        purgeAt: purge.toISOString(),
      });
    }
  }
  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/** Borra definitivamente lo que lleva más de 30 días en la papelera. */
export function purgeExpired(ctx: AppContext): number {
  const limit = new Date(ctx.now());
  limit.setDate(limit.getDate() - TRASH_RETENTION_DAYS);
  const cutoff = limit.toISOString();
  let count = 0;
  for (const item of listTrash(ctx)) {
    if (item.deletedAt < cutoff) {
      try {
        purgeFromTrash(ctx, item.entityType, item.entityId);
        count++;
      } catch (error) {
        ctx.logger.warn({ err: error, item }, 'No se ha podido vaciar un elemento de la papelera');
      }
    }
  }
  return count;
}

export function emptyTrash(ctx: AppContext): number {
  let count = 0;
  for (const item of listTrash(ctx)) {
    purgeFromTrash(ctx, item.entityType, item.entityId);
    count++;
  }
  return count;
}
