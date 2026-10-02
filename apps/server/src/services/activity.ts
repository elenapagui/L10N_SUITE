import type { ActivityEntry } from '@l10n/shared';
import type { AppContext } from '../context';
import { newId } from '../lib/ids';

export type ActivityAction = 'crear' | 'editar' | 'eliminar' | 'restaurar' | 'importar' | 'estado';

export function logActivity(
  ctx: AppContext,
  entry: { entityType: string; entityId: string; action: ActivityAction; summary: string },
): void {
  ctx.sqlite
    .prepare(
      'INSERT INTO activity_log (id, entity_type, entity_id, action, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(newId(), entry.entityType, entry.entityId, entry.action, entry.summary, ctx.nowISO());
}

export function listActivity(
  ctx: AppContext,
  options: { limit?: number; entityType?: string; entityId?: string } = {},
): ActivityEntry[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (options.entityType) {
    where.push('entity_type = ?');
    params.push(options.entityType);
  }
  if (options.entityId) {
    where.push('entity_id = ?');
    params.push(options.entityId);
  }
  const sql = `SELECT id, entity_type AS entityType, entity_id AS entityId, action, summary, created_at AS createdAt
     FROM activity_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY created_at DESC, id DESC LIMIT ?`;
  return ctx.sqlite.prepare(sql).all(...params, options.limit ?? 50) as ActivityEntry[];
}
