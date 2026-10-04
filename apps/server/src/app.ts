import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { resolveConfig, type ConfigOptions } from './config';
import { AppContext } from './context';
import { initContext, registerEntities } from './init';
import { AppError, MaintenanceError } from './lib/errors';
import { maybeAutoBackup } from './services/backup/backups';
import { attachmentRoutes } from './modules/attachments';
import { backupRoutes } from './modules/backups';
import { settingsRoutes } from './modules/settings';
import { systemRoutes } from './modules/system';
import { tagRoutes } from './modules/tags';
import { trashRoutes } from './modules/trash';
import { importRoutes } from './modules/import';
import { expenseRoutes } from './modules/finance/expenses';
import { invoiceRoutes } from './modules/finance/invoices';
import { reportRoutes } from './modules/finance/reports';
import { reviewRoutes } from './modules/review';
import { syncRoutes } from './modules/sync';
import { markDirty, syncOnStartup } from './services/sync';
import { isModelInstalled, kickAnalysis } from './services/morph';
import { summaryRoutes } from './modules/finance/summary';
import { clientRoutes } from './modules/work/clients';
import { dashboardRoutes } from './modules/work/dashboard';
import { gameRoutes } from './modules/work/games';
import { jobRoutes } from './modules/work/jobs';
import { projectRoutes } from './modules/work/projects';
import { queryRoutes } from './modules/work/queries';
import { taskRoutes } from './modules/work/tasks';
import { templateRoutes } from './modules/work/templates';
import { timeRoutes } from './modules/work/time';
import { publicationRoutes } from './modules/academic/publications';
import { applicationRoutes } from './modules/career/applications';
import { referenceRoutes } from './modules/academic/references';
import { catalogRoutes } from './modules/corpus/catalog';
import { concordanceRoutes } from './modules/corpus/concordance';
import { exportRoutes } from './modules/corpus/export';
import { corpusImportRoutes } from './modules/corpus/import';
import { statsRoutes } from './modules/corpus/stats';
import { notionRoutes } from './modules/knowledge/notion';
import { pageRoutes } from './modules/knowledge/pages';
import { resourceRoutes } from './modules/knowledge/resources';
import { tableRoutes } from './modules/knowledge/tables';
import './types';

export interface BuildOptions extends ConfigOptions {
  logger?: FastifyServerOptions['logger'] | FastifyServerOptions['loggerInstance'];
  /** Reloj inyectable (pruebas). */
  now?: () => Date;
  /** Copia automática diaria tras arrancar (desactivada en pruebas). */
  autoBackup?: boolean;
}

export type { AppContext };

export async function buildApp(options: BuildOptions): Promise<FastifyInstance> {
  const config = resolveConfig(options);
  const loggerOption = options.logger ?? false;
  const app = Fastify({
    ...(typeof loggerOption === 'object' && loggerOption !== null && 'child' in loggerOption
      ? { loggerInstance: loggerOption as FastifyServerOptions['loggerInstance'] }
      : { logger: loggerOption as FastifyServerOptions['logger'] }),
    bodyLimit: 50 * 1024 * 1024,
  });

  const ctx = new AppContext(config, app.log, options.now);
  registerEntities();
  await initContext(ctx);
  app.decorate('ctx', ctx);

  await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 50 } });

  app.addHook('onRequest', async (req) => {
    if (ctx.maintenance && req.url.startsWith('/api/') && !req.url.startsWith('/api/health')) {
      throw new MaintenanceError();
    }
  });

  app.setErrorHandler(
    (error: Error & { code?: string; statusCode?: number; validation?: unknown }, req, reply) => {
      if (error instanceof AppError) {
        return reply
          .status(error.statusCode)
          .send({ error: error.code, message: error.message, details: error.details ?? null });
      }
      if (typeof error.code === 'string' && error.code.startsWith('SQLITE_CONSTRAINT')) {
        req.log.warn({ err: error }, 'Restricción de la base de datos');
        const message =
          error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY'
            ? 'No se puede completar la operación porque hay fichas relacionadas.'
            : 'La operación entra en conflicto con datos existentes.';
        return reply.status(409).send({ error: 'conflicto', message, details: null });
      }
      if (error.code === 'FST_REQ_FILE_TOO_LARGE' || error.statusCode === 413) {
        return reply.status(413).send({
          error: 'demasiado_grande',
          message: 'El archivo es demasiado grande.',
          details: null,
        });
      }
      if (
        error.validation ||
        (error.statusCode && error.statusCode >= 400 && error.statusCode < 500)
      ) {
        return reply.status(error.statusCode ?? 400).send({
          error: 'solicitud_no_valida',
          message: 'La solicitud no es válida.',
          details: error.message,
        });
      }
      req.log.error({ err: error, url: req.url }, 'Error inesperado');
      return reply.status(500).send({
        error: 'interno',
        message:
          'Se ha producido un error inesperado. Los detalles se han guardado en el registro.',
        details: null,
      });
    },
  );

  // Sincronización: cualquier escritura correcta (salvo las de la propia sincronización) deja
  // cambios pendientes de enviar, y al arrancar se carga la versión del otro ordenador si toca.
  // Se compara el contador de cambios de SQLite antes y después de cada petición: así solo
  // cuentan las que de verdad modifican datos (una búsqueda o una exportación no).
  const changesAt = new WeakMap<object, number>();
  const totalChanges = () => {
    try {
      return (ctx.sqlite.prepare('SELECT total_changes() AS n').get() as { n: number }).n;
    } catch {
      return null; // La base de datos se está cerrando o sustituyendo.
    }
  };
  app.addHook('onRequest', async (req) => {
    if (req.method === 'GET' || !req.url.startsWith('/api/') || req.url.startsWith('/api/sync'))
      return;
    const n = totalChanges();
    if (n !== null) changesAt.set(req, n);
  });
  app.addHook('onResponse', async (req, reply) => {
    const before = changesAt.get(req);
    if (before === undefined || reply.statusCode >= 400) return;
    const after = totalChanges();
    // Distinto (no solo mayor): restaurar una copia sustituye la conexión y el contador vuelve a 0.
    if (after !== null && after !== before) markDirty(ctx);
  });
  let morphTimer: NodeJS.Timeout | null = null;
  app.addHook('onReady', async () => {
    await syncOnStartup(ctx);
    // Si el analizador del coreano está instalado, se termina de analizar lo pendiente.
    if (isModelInstalled(ctx)) morphTimer = setTimeout(() => kickAnalysis(ctx), 5000);
  });
  app.addHook('onClose', async () => {
    if (morphTimer) clearTimeout(morphTimer);
  });

  await app.register(systemRoutes);
  await app.register(settingsRoutes);
  await app.register(tagRoutes);
  await app.register(attachmentRoutes);
  await app.register(backupRoutes);
  await app.register(trashRoutes);
  await app.register(clientRoutes);
  await app.register(gameRoutes);
  await app.register(projectRoutes);
  await app.register(jobRoutes);
  await app.register(taskRoutes);
  await app.register(timeRoutes);
  await app.register(queryRoutes);
  await app.register(templateRoutes);
  await app.register(dashboardRoutes);
  await app.register(importRoutes);
  await app.register(invoiceRoutes);
  await app.register(pageRoutes);
  await app.register(tableRoutes);
  await app.register(resourceRoutes);
  await app.register(notionRoutes);
  await app.register(catalogRoutes);
  await app.register(corpusImportRoutes);
  await app.register(concordanceRoutes);
  await app.register(statsRoutes);
  await app.register(exportRoutes);
  await app.register(publicationRoutes);
  await app.register(referenceRoutes);
  await app.register(applicationRoutes);
  await app.register(expenseRoutes);
  await app.register(reportRoutes);
  await app.register(reviewRoutes);
  await app.register(syncRoutes);
  await app.register(summaryRoutes);

  if (config.webDir && fs.existsSync(path.join(config.webDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: config.webDir, prefix: '/', index: 'index.html' });
  }

  app.setNotFoundHandler((req, reply) => {
    if (!req.url.startsWith('/api/') && config.webDir && req.method === 'GET') {
      return reply.sendFile('index.html');
    }
    return reply
      .status(404)
      .send({ error: 'no_encontrado', message: 'Ruta no encontrada.', details: null });
  });

  let autoBackupTimer: NodeJS.Timeout | null = null;
  if (options.autoBackup) {
    autoBackupTimer = setTimeout(() => {
      maybeAutoBackup(ctx).catch((err: unknown) =>
        app.log.error({ err }, 'Falló la copia automática'),
      );
    }, 3000);
  }

  app.addHook('onClose', async () => {
    if (autoBackupTimer) clearTimeout(autoBackupTimer);
    ctx.close();
  });

  return app;
}
