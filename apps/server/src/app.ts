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
import { clientRoutes } from './modules/work/clients';
import { dashboardRoutes } from './modules/work/dashboard';
import { gameRoutes } from './modules/work/games';
import { jobRoutes } from './modules/work/jobs';
import { projectRoutes } from './modules/work/projects';
import { queryRoutes } from './modules/work/queries';
import { taskRoutes } from './modules/work/tasks';
import { templateRoutes } from './modules/work/templates';
import { timeRoutes } from './modules/work/time';
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
