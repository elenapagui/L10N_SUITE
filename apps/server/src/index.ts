/**
 * Modo web (desarrollo y pruebas): el motor como servidor HTTP local en 127.0.0.1.
 * En la app de escritorio el motor se ejecuta en un proceso aparte sin abrir puertos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(serverRoot, '..', '..');
const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
  version: string;
};

const port = Number(process.env.PORT ?? 4317);
const host = process.env.HOST ?? '127.0.0.1';

const app = await buildApp({
  dataDir: process.env.L10N_DATA_DIR ?? path.join(repoRoot, '.data'),
  migrationsDir: process.env.L10N_MIGRATIONS_DIR ?? path.join(serverRoot, 'drizzle'),
  webDir: process.env.L10N_WEB_DIR ?? path.join(repoRoot, 'apps', 'web', 'dist'),
  appVersion: rootPackage.version,
  autoBackup: process.env.L10N_AUTO_BACKUP !== '0',
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
});

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port, host });
app.log.info(`L10N Suite (modo web) en http://${host}:${port}`);
