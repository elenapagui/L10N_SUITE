import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Client, SyncStatus } from '@l10n/shared';
import { createTestApp, removeDir, tempDir, type TestApp } from './helpers';

const open: TestApp[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const t of open.splice(0)) await t.cleanup();
  for (const d of dirs.splice(0)) removeDir(d);
});

async function computer(dataDir?: string) {
  const t = await createTestApp({ dataDir });
  open.push(t);
  const req = async <T>(method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => {
    const res = await t.app.inject({ method, url, payload: payload as object });
    return { status: res.statusCode, body: res.json() as T };
  };
  return { t, req };
}

const names = async (c: Awaited<ReturnType<typeof computer>>) =>
  (await c.req<Client[]>('GET', '/api/clients')).body.map((x) => x.name).sort();

describe('sincronización por carpeta en la nube', () => {
  it('pasa los datos de un ordenador a otro y detecta los cambios en los dos', async () => {
    const cloud = tempDir('l10n-nube-');
    dirs.push(cloud);
    const main = await computer();
    const laptop = await computer();
    await main.req('PUT', '/api/sync', { directory: cloud, deviceName: 'Sobremesa' });
    await laptop.req('PUT', '/api/sync', { directory: cloud, deviceName: 'Portátil' });
    await laptop.req('PUT', '/api/settings/backups', {
      directory: path.join(laptop.t.dataDir, 'mis-copias'),
    });

    // El sobremesa trabaja y envía.
    await main.req('POST', '/api/clients', { name: 'Cliente del sobremesa' });
    let s = (await main.req<SyncStatus>('GET', '/api/sync')).body;
    expect(s.dirty).toBe(true);
    s = (await main.req<SyncStatus>('POST', '/api/sync/push', {})).body;
    expect(s).toMatchObject({ dirty: false, remote: { seq: 1, deviceName: 'Sobremesa' } });
    expect(fs.existsSync(path.join(cloud, 'L10N Suite - sincronizacion', 'datos.sqlite.gz'))).toBe(
      true,
    );

    // El portátil (con cambios propios) ve que hay algo nuevo, pero hay conflicto.
    s = (await laptop.req<SyncStatus>('GET', '/api/sync')).body;
    expect(s).toMatchObject({ incoming: true, conflict: true });
    expect((await laptop.req<SyncStatus>('POST', '/api/sync/pull', {})).body.conflict).toBe(true);
    // Elige la versión del sobremesa: se carga y conserva su carpeta de copias.
    s = (await laptop.req<SyncStatus>('POST', '/api/sync/pull', { force: true })).body;
    expect(s).toMatchObject({ incoming: false, dirty: false, lastEvent: { kind: 'received' } });
    expect(await names(laptop)).toEqual(['Cliente del sobremesa']);
    const settings = (await laptop.req<{ backups: { directory: string } }>('GET', '/api/settings'))
      .body;
    expect(settings.backups.directory).toBe(path.join(laptop.t.dataDir, 'mis-copias'));
    const backups = (await laptop.req<{ items: { kind: string }[] }>('GET', '/api/backups')).body;
    expect(backups.items.map((b) => b.kind)).toContain('pre-sync');

    // El portátil trabaja y envía; el sobremesa no puede pisarlo sin cargarlo antes.
    await laptop.req('POST', '/api/clients', { name: 'Cliente del portátil' });
    await laptop.req('POST', '/api/sync/push', {});
    await main.req('POST', '/api/clients', { name: 'Otro del sobremesa' });
    s = (await main.req<SyncStatus>('POST', '/api/sync/push', {})).body;
    expect(s.conflict).toBe(true);

    // Al reabrir el sobremesa sin cambios, la versión del portátil se carga sola.
    const mainDir = main.t.dataDir;
    await main.req('POST', '/api/sync/pull', { force: true });
    await main.t.close();
    open.splice(open.indexOf(main.t), 1);
    // Ahora el portátil cambia algo más y envía; el sobremesa no tiene cambios.
    await laptop.req('POST', '/api/clients', { name: 'Último del portátil' });
    await laptop.req('POST', '/api/sync/push', {});
    const reopened = await computer(mainDir);
    expect(await names(reopened)).toEqual([
      'Cliente del portátil',
      'Cliente del sobremesa',
      'Último del portátil',
    ]);
    s = (await reopened.req<SyncStatus>('GET', '/api/sync')).body;
    expect(s.lastEvent).toMatchObject({ kind: 'received', deviceName: 'Portátil' });
  });

  it('no carga una copia incompleta (la nube aún no ha terminado de sincronizar)', async () => {
    const cloud = tempDir('l10n-nube-');
    dirs.push(cloud);
    const a = await computer();
    const b = await computer();
    await a.req('PUT', '/api/sync', { directory: cloud });
    await b.req('PUT', '/api/sync', { directory: cloud });
    await a.req('POST', '/api/clients', { name: 'X' });
    await a.req('POST', '/api/sync/push', {});
    const gz = path.join(cloud, 'L10N Suite - sincronizacion', 'datos.sqlite.gz');
    fs.truncateSync(gz, Math.floor(fs.statSync(gz).size / 2));
    const res = await b.req<{ message: string }>('POST', '/api/sync/pull', { force: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('aún no ha terminado de llegar');
  });
});
