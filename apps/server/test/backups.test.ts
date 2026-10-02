import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { backupFileName, parseBackupFileName } from '../src/services/backup/backups';
import {
  isoWeekKey,
  selectBackupsToDelete,
  type RotatableBackup,
} from '../src/services/backup/rotation';
import {
  createTestApp,
  multipart,
  olderMigrations,
  removeDir,
  tempDir,
  type TestApp,
} from './helpers';

const apps: TestApp[] = [];
async function open(options: Parameters<typeof createTestApp>[0] = {}) {
  const t = await createTestApp(options);
  apps.push(t);
  return t;
}

afterEach(async () => {
  // Primero se cierran todas (varias pueden compartir carpeta) y después se borran.
  const all = apps.splice(0);
  for (const t of all) await t.close();
  for (const t of all) removeDir(t.dataDir);
});

describe('nombres de archivo de copia', () => {
  it('se generan y se interpretan de ida y vuelta', () => {
    const date = new Date('2026-10-02T15:30:12.345Z');
    const name = backupFileName(date, 'pre-migration');
    expect(name).toBe('l10n-2026-10-02_15-30-12-345_pre-migration.sqlite.gz');
    expect(parseBackupFileName(name)).toEqual({
      kind: 'pre-migration',
      createdAt: date.toISOString(),
    });
    expect(parseBackupFileName('otro-archivo.zip')).toBeNull();
  });
});

describe('rotación', () => {
  const policy = { keepDaily: 7, keepWeekly: 4, keepMonthly: 12 };

  function daily(days: number, kind: RotatableBackup['kind'] = 'auto'): RotatableBackup[] {
    const out: RotatableBackup[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(2026, 9, 2, 12, 0, 0);
      d.setDate(d.getDate() - i);
      out.push({ fileName: `${kind}-${i}`, kind, createdAt: d.toISOString() });
    }
    return out;
  }

  it('conserva 7 diarias, 4 semanales y 12 mensuales', () => {
    const backups = daily(400);
    const deleted = new Set(selectBackupsToDelete(backups, policy));
    const kept = backups.filter((b) => !deleted.has(b.fileName));
    // Las 7 más recientes se conservan siempre.
    for (let i = 0; i < 7; i++) expect(kept.map((b) => b.fileName)).toContain(`auto-${i}`);
    // Total razonable: como mucho 7 + 4 + 12.
    expect(kept.length).toBeLessThanOrEqual(23);
    expect(kept.length).toBeGreaterThanOrEqual(12);
    // Hay copias de al menos 11 meses distintos.
    const months = new Set(kept.map((b) => b.createdAt.slice(0, 7)));
    expect(months.size).toBeGreaterThanOrEqual(11);
  });

  it('no mezcla las copias manuales y de seguridad con la rotación diaria', () => {
    const backups = [...daily(3), ...daily(30, 'manual'), ...daily(8, 'pre-migration')];
    const deleted = selectBackupsToDelete(backups, policy);
    expect(deleted.filter((n) => n.startsWith('manual'))).toHaveLength(10);
    expect(deleted.filter((n) => n.startsWith('pre-migration'))).toHaveLength(3);
    expect(deleted.filter((n) => n.startsWith('auto'))).toHaveLength(0);
  });

  it('calcula semanas ISO', () => {
    expect(isoWeekKey(new Date(2026, 0, 1))).toBe('2026-W01');
    expect(isoWeekKey(new Date(2027, 0, 1))).toBe('2026-W53');
  });
});

describe('copias de seguridad', () => {
  it('crea una copia manual verificada y la restaura', async () => {
    const t = await open();
    await t.app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'Antes' } });
    const created = await t.app.inject({ method: 'POST', url: '/api/backups' });
    expect(created.statusCode).toBe(201);
    const backup = created.json();
    expect(backup.kind).toBe('manual');

    await t.app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'Después' } });
    expect((await t.app.inject('/api/tags')).json()).toHaveLength(2);

    const restored = await t.app.inject({
      method: 'POST',
      url: '/api/backups/restore',
      payload: { fileName: backup.fileName },
    });
    expect(restored.statusCode).toBe(200);
    const names = (await t.app.inject('/api/tags')).json().map((x: { name: string }) => x.name);
    expect(names).toEqual(['Antes']);

    // Antes de restaurar se guarda una copia de seguridad de lo que había.
    const list = (await t.app.inject('/api/backups')).json();
    expect(list.items.map((b: { kind: string }) => b.kind)).toContain('pre-restore');
  });

  it('copia los adjuntos a la carpeta de copias y los recupera si faltan', async () => {
    const t = await open();
    const up = await t.app.inject({
      method: 'POST',
      url: '/api/attachments',
      ...multipart([{ filename: 'guia.txt', content: 'guía de estilo' }]),
    });
    const [att] = up.json();
    const backup = (await t.app.inject({ method: 'POST', url: '/api/backups' })).json();
    fs.rmSync(att.absolutePath);
    await t.app.inject({
      method: 'POST',
      url: '/api/backups/restore',
      payload: { fileName: backup.fileName },
    });
    expect(fs.readFileSync(att.absolutePath, 'utf8')).toBe('guía de estilo');
  });

  it('rechaza nombres de copia inventados', async () => {
    const t = await open();
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/backups/restore',
      payload: { fileName: '../../etc/passwd' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('hace copia al cerrar solo si hubo cambios', async () => {
    const t = await open();
    // Las migraciones del arranque cuentan como cambios en una base de datos nueva,
    // así que se reabre para partir de cero.
    await t.close();
    const t2 = await createTestApp({ dataDir: t.dataDir });
    apps.push(t2);
    expect(
      (await t2.app.inject({ method: 'POST', url: '/api/backups/on-close' })).json().backup,
    ).toBeNull();
    await t2.app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'Cambio' } });
    expect(
      (await t2.app.inject({ method: 'POST', url: '/api/backups/on-close' })).json().backup.kind,
    ).toBe('close');
  });

  it('usa la carpeta de copias configurada', async () => {
    const t = await open();
    const custom = tempDir('l10n-copias-');
    await t.app.inject({
      method: 'PUT',
      url: '/api/settings/backups',
      payload: { directory: custom },
    });
    await t.app.inject({ method: 'POST', url: '/api/backups' });
    expect(fs.readdirSync(custom).some((f) => f.endsWith('_manual.sqlite.gz'))).toBe(true);
    removeDir(custom);
  });
});

describe('copia completa', () => {
  it('exporta e importa todos los datos y adjuntos en otro equipo', async () => {
    const origin = await open();
    await origin.app.inject({
      method: 'POST',
      url: '/api/tags',
      payload: { name: 'Del equipo principal' },
    });
    await origin.app.inject({
      method: 'POST',
      url: '/api/attachments',
      ...multipart([{ filename: 'glosario.txt', content: '스킬 = habilidad' }]),
    });
    const exported = (
      await origin.app.inject({ method: 'POST', url: '/api/backups/export', payload: {} })
    ).json();
    expect(exported.fileName).toMatch(/^L10N-Suite-copia-completa-.*\.zip$/);
    expect(fs.existsSync(exported.path)).toBe(true);

    const other = await open();
    await other.app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'Del portátil' } });
    const imported = await other.app.inject({
      method: 'POST',
      url: '/api/backups/import',
      payload: { path: exported.path },
    });
    expect(imported.statusCode).toBe(200);
    const names = (await other.app.inject('/api/tags')).json().map((x: { name: string }) => x.name);
    expect(names).toEqual(['Del equipo principal']);
    const [att] = (await other.app.inject('/api/attachments')).json();
    expect(fs.readFileSync(att.absolutePath, 'utf8')).toBe('스킬 = habilidad');
    expect(att.absolutePath.startsWith(other.dataDir)).toBe(true);
    const list = (await other.app.inject('/api/backups')).json();
    expect(list.items.map((b: { kind: string }) => b.kind)).toContain('pre-import');
  });

  it('acepta la copia subida como archivo y rechaza ZIP ajenos', async () => {
    const origin = await open();
    const exported = (
      await origin.app.inject({ method: 'POST', url: '/api/backups/export', payload: {} })
    ).json();
    const other = await open();
    const ok = await other.app.inject({
      method: 'POST',
      url: '/api/backups/import',
      ...multipart([
        { filename: 'copia.zip', content: fs.readFileSync(exported.path), type: 'application/zip' },
      ]),
    });
    expect(ok.statusCode).toBe(200);

    const fake = path.join(other.dataDir, 'falso.zip');
    fs.writeFileSync(fake, 'no es un zip');
    const bad = await other.app.inject({
      method: 'POST',
      url: '/api/backups/import',
      payload: { path: fake },
    });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe('arranque', () => {
  it('hace una copia antes de migrar una base de datos antigua', async () => {
    // Base de datos creada por una «versión anterior» (solo con las dos primeras migraciones).
    const old = olderMigrations(2);
    const t = await open({ migrationsDir: old });
    await t.app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'Dato antiguo' } });
    expect(t.app.ctx.schemaVersion()).toBe(2);
    await t.close();
    removeDir(old);

    const again = await open({ dataDir: t.dataDir });
    expect(again.app.ctx.schemaVersion()).toBeGreaterThan(2);
    const list = (await again.app.inject('/api/backups')).json();
    expect(list.items.map((b: { kind: string }) => b.kind)).toContain('pre-migration');
    expect((await again.app.inject('/api/tags')).json()).toHaveLength(1);
  });

  it('entra en modo recuperación si la base de datos está dañada', async () => {
    const t = await open();
    await t.close();
    const dbPath = path.join(t.dataDir, 'datos', 'l10n.db');
    fs.rmSync(`${dbPath}-wal`, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
    fs.writeFileSync(dbPath, Buffer.alloc(8192, 7));
    const broken = await open({ dataDir: t.dataDir });
    const info = (await broken.app.inject('/api/app-info')).json();
    expect(info.integrity).toBe('error');
  });
});
