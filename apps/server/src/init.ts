import fs from 'node:fs';
import type { AppContext } from './context';
import { pendingMigrations, schemaVersion } from './db/migrate';
import { registerAttachmentEntity } from './services/attachments';
import { createBackup } from './services/backup/backups';
import { purgeExpired } from './services/trash';
import { registerTagEntity } from './modules/tags';
import { registerClientEntities } from './modules/work/clients';
import { registerGameEntity } from './modules/work/games';
import { registerJobEntity } from './modules/work/jobs';
import { registerProjectEntity } from './modules/work/projects';
import { registerQueryEntity } from './modules/work/queries';
import { registerTaskEntities } from './modules/work/tasks';
import { registerTemplateEntity } from './modules/work/templates';
import { registerTimeEntity } from './modules/work/time';
import { registerInvoiceEntity } from './modules/finance/invoices';
import { registerExpenseEntity } from './modules/finance/expenses';
import { registerAcademicEntities } from './modules/academic/publications';
import { registerReferenceEntity } from './modules/academic/references';
import { registerCareerEntities } from './modules/career/applications';
import { registerCorpusEntities } from './modules/corpus/catalog';
import { registerPageEntity } from './modules/knowledge/pages';
import { registerResourceEntities } from './modules/knowledge/resources';
import { purgeDeletedRows, registerTableEntity } from './modules/knowledge/tables';

/** Registra en la papelera, la búsqueda, etc. todos los tipos de ficha de los módulos. */
export function registerEntities(): void {
  registerAttachmentEntity();
  registerTagEntity();
  registerClientEntities();
  registerGameEntity();
  registerProjectEntity();
  registerJobEntity();
  registerTaskEntities();
  registerTimeEntity();
  registerQueryEntity();
  registerTemplateEntity();
  registerInvoiceEntity();
  registerExpenseEntity();
  registerPageEntity();
  registerTableEntity();
  registerResourceEntities();
  registerCorpusEntities();
  registerAcademicEntities();
  registerReferenceEntity();
  registerCareerEntities();
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
  const purged = purgeExpired(ctx) + purgeDeletedRows(ctx);
  if (purged > 0) ctx.logger.info({ purged }, 'Papelera: elementos caducados eliminados');
}
