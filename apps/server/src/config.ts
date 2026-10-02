import path from 'node:path';
import { ensureDir } from './lib/fs';

export interface AppConfig {
  appVersion: string;
  /** true cuando el motor se ejecuta dentro de la app de escritorio. */
  desktop: boolean;
  dataDir: string;
  dbPath: string;
  attachmentsDir: string;
  defaultBackupsDir: string;
  exportsDir: string;
  tmpDir: string;
  logsDir: string;
  migrationsDir: string;
  /** Carpeta con la interfaz compilada (solo en modo web). */
  webDir: string | null;
}

export interface ConfigOptions {
  dataDir: string;
  migrationsDir: string;
  webDir?: string | null;
  appVersion?: string;
  desktop?: boolean;
}

/**
 * Estructura de la carpeta de datos:
 *   datos/l10n.db        base de datos
 *   datos/adjuntos/      archivos adjuntos (inmutables)
 *   copias/              copias de seguridad (por defecto)
 *   exportaciones/       copias completas exportadas
 *   tmp/, logs/
 */
export function resolveConfig(options: ConfigOptions): AppConfig {
  const dataDir = path.resolve(options.dataDir);
  const config: AppConfig = {
    appVersion: options.appVersion ?? '0.0.0',
    desktop: options.desktop ?? false,
    dataDir,
    dbPath: path.join(dataDir, 'datos', 'l10n.db'),
    attachmentsDir: path.join(dataDir, 'datos', 'adjuntos'),
    defaultBackupsDir: path.join(dataDir, 'copias'),
    exportsDir: path.join(dataDir, 'exportaciones'),
    tmpDir: path.join(dataDir, 'tmp'),
    logsDir: path.join(dataDir, 'logs'),
    migrationsDir: path.resolve(options.migrationsDir),
    webDir: options.webDir ? path.resolve(options.webDir) : null,
  };
  for (const dir of [
    path.dirname(config.dbPath),
    config.attachmentsDir,
    config.defaultBackupsDir,
    config.exportsDir,
    config.tmpDir,
    config.logsDir,
  ]) {
    ensureDir(dir);
  }
  return config;
}
