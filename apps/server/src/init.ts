import fs from 'node:fs';
import type { AppContext } from './context';
import { pendingMigrations, schemaVersion } from './db/migrate';
import { registerAttachmentEntity } from './services/attachments';
import { createBackup } from './services/backup/backups';
import { purgeExpired } from './services/trash';
import { registerTagEntity } from './modules/tags';

/** Registra en la papelera, la búsqueda, etc. todos los tipos de ficha de los módulos. */
export function registerEntities(): void {
  registerAttachmentEntity();
  registerTagEntity();
}

/**
 * Arranque del motor: abre la base de datos, comprueba su integridad, hace una copia de
 * seguridad si hay migraciones pendientes, migra y vacía lo caducado de la papelera.
 */
export async function initContext(ctx: AppContext): Promise<void> {
  const existed = fs.existsSync(ctx.config.dbPath);
  ctx.open();
  if (ctx.integrity !== 'ok') {
    ctx.logger.error(
      {},
      'La base de datos no supera la comprobación de integridad: modo recuperación',
    );
    return;
  }
  const pending = pendingMigrations(ctx.sqlite, ctx.config.migrationsDir);
  if (existed && pending > 0 && schemaVersion(ctx.sqlite) > 0) {
    await createBackup(ctx, 'pre-migration');
  }
  ctx.migrate();
  const purged = purgeExpired(ctx);
  if (purged > 0) ctx.logger.info({ purged }, 'Papelera: elementos caducados eliminados');
}
