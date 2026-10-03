/**
 * Motor de L10N Suite (API + base de datos) en un proceso aparte (Electron utilityProcess).
 * Recibe peticiones del proceso principal por mensajes, sin abrir ningún puerto de red.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from '@l10n/server';
import type { EngineMessage, EngineRequest } from './protocol';

type ParentPort = {
  on(event: 'message', listener: (e: { data: unknown }) => void): void;
  postMessage(message: EngineMessage): void;
};

const parentPort = (process as unknown as { parentPort: ParentPort }).parentPort;

function rotateLog(file: string, maxBytes = 5 * 1024 * 1024) {
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > maxBytes) {
      fs.renameSync(file, `${file}.1`);
    }
  } catch {
    // Si no se puede rotar, se sigue escribiendo en el mismo archivo.
  }
}

async function main() {
  const dataDir = process.env.L10N_DATA_DIR;
  const migrationsDir = process.env.L10N_MIGRATIONS_DIR;
  if (!dataDir || !migrationsDir) throw new Error('Faltan L10N_DATA_DIR o L10N_MIGRATIONS_DIR');
  const logsDir = path.join(dataDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, 'motor.log');
  rotateLog(logFile);

  const app = await buildApp({
    dataDir,
    migrationsDir,
    appVersion: process.env.L10N_APP_VERSION ?? '0.0.0',
    desktop: true,
    autoBackup: process.env.L10N_AUTO_BACKUP !== '0',
    logger: { level: 'info', file: logFile },
  });
  await app.ready();

  parentPort.on('message', (event) => {
    const msg = event.data as EngineRequest | { type: 'shutdown' };
    if (msg.type === 'request') {
      void handleRequest(msg);
    } else if (msg.type === 'shutdown') {
      void shutdown();
    }
  });

  async function handleRequest(msg: EngineRequest) {
    try {
      const res = await app.inject({
        method: msg.method as 'GET',
        url: msg.url,
        headers: msg.headers,
        payload: msg.body ? Buffer.from(msg.body) : undefined,
      });
      const headers: Record<string, string | string[]> = {};
      for (const [key, value] of Object.entries(res.headers)) {
        if (value === undefined) continue;
        headers[key] = Array.isArray(value) ? value.map(String) : String(value);
      }
      parentPort.postMessage({
        type: 'response',
        id: msg.id,
        status: res.statusCode,
        headers,
        body: new Uint8Array(res.rawPayload),
      });
    } catch (error) {
      app.log.error({ err: error, url: msg.url }, 'Error al atender una petición');
      parentPort.postMessage({
        type: 'response',
        id: msg.id,
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: new TextEncoder().encode(
          JSON.stringify({
            error: 'interno',
            message: 'Error interno del motor de la aplicación.',
          }),
        ),
      });
    }
  }

  async function shutdown() {
    try {
      await app.inject({ method: 'POST', url: '/api/backups/on-close', payload: {} });
    } catch (error) {
      app.log.error({ err: error }, 'Falló la copia al cerrar');
    }
    try {
      await app.inject({ method: 'POST', url: '/api/sync/on-close', payload: {} });
    } catch (error) {
      app.log.error({ err: error }, 'Falló la sincronización al cerrar');
    }
    try {
      await app.close();
    } finally {
      parentPort.postMessage({ type: 'shutdown-done' });
      process.exit(0);
    }
  }

  parentPort.postMessage({ type: 'ready' });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  process.stderr.write(`${message}\n`);
  try {
    parentPort.postMessage({ type: 'fatal', message });
  } finally {
    // postMessage es asíncrono: se espera un momento para que el aviso llegue antes de salir.
    setTimeout(() => process.exit(1), 300);
  }
});
