import {
  settingsSchema,
  settingsSectionSchemas,
  type Settings,
  type SettingsSection,
} from '@l10n/shared';
import fs from 'node:fs';
import path from 'node:path';
import type { AppContext } from '../context';
import { writeFileAtomic } from '../lib/fs';
import { parse } from '../lib/validate';

/**
 * La carpeta de copias se guarda también fuera de la base de datos: si esta se daña,
 * el modo recuperación tiene que saber dónde buscar las copias.
 */
function backupPrefsFile(ctx: AppContext): string {
  return path.join(ctx.config.dataDir, 'copias-ajustes.json');
}

export function readBackupDirFallback(ctx: AppContext): string | null {
  try {
    const data = JSON.parse(fs.readFileSync(backupPrefsFile(ctx), 'utf8')) as {
      directory?: string | null;
    };
    return data.directory ?? null;
  } catch {
    return null;
  }
}

export function getSettings(ctx: AppContext): Settings {
  const raw: Record<string, unknown> = {};
  try {
    const rows = ctx.sqlite.prepare('SELECT key, value FROM settings').all() as {
      key: string;
      value: string;
    }[];
    for (const row of rows) {
      try {
        raw[row.key] = JSON.parse(row.value);
      } catch {
        // Un valor ilegible se sustituye por los valores por defecto.
      }
    }
  } catch {
    // La tabla aún no existe (base de datos nueva o en recuperación).
  }
  // Se valida sección por sección para que un valor antiguo no invalide todo.
  const merged: Record<string, unknown> = {};
  for (const [section, schema] of Object.entries(settingsSectionSchemas)) {
    const result = schema.safeParse({ ...(raw[section] as object | undefined) });
    merged[section] = result.success ? result.data : schema.parse({});
  }
  return settingsSchema.parse(merged);
}

export function updateSettingsSection<S extends SettingsSection>(
  ctx: AppContext,
  section: S,
  patch: unknown,
): Settings[S] {
  const current = getSettings(ctx)[section];
  const schema = settingsSectionSchemas[section];
  const next = parse(schema, { ...current, ...(patch as object) }) as Settings[S];
  ctx.sqlite
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(section, JSON.stringify(next), ctx.nowISO());
  if (section === 'backups') {
    writeFileAtomic(
      backupPrefsFile(ctx),
      JSON.stringify({ directory: (next as Settings['backups']).directory }),
    );
  }
  return next;
}
