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

describe('sincronización: casos límite', () => {
  it('las búsquedas no cuentan como cambios y lo escrito durante un envío sigue pendiente', async () => {
    const cloud = tempDir('l10n-nube-');
    dirs.push(cloud);
    const pc = await computer();
    await pc.req('PUT', '/api/sync', { directory: cloud });
    await pc.req('POST', '/api/clients', { name: 'Antes del envío' });
    let s = (await pc.req<SyncStatus>('POST', '/api/sync/push', {})).body;
    expect(s.dirty).toBe(false);

    // Una búsqueda en el corpus (POST de solo lectura) no deja cambios pendientes.
    await pc.req('POST', '/api/corpus/concordance', {
      conditions: [{ lang: 'ko', query: '마법' }],
    });
    expect((await pc.req<SyncStatus>('GET', '/api/sync')).body.dirty).toBe(false);

    // Un cambio guardado mientras se envía la copia no se da por enviado.
    const push = pc.req<SyncStatus>('POST', '/api/sync/push', { force: true });
    await pc.req('POST', '/api/clients', { name: 'Durante el envío' });
    await push;
    s = (await pc.req<SyncStatus>('GET', '/api/sync')).body;
    expect(s.dirty).toBe(true);

    // Dos envíos a la vez se hacen uno detrás de otro y la copia queda íntegra.
    const [a, b] = await Promise.all([
      pc.req<SyncStatus>('POST', '/api/sync/push', { force: true }),
      pc.req<SyncStatus>('POST', '/api/sync/push', { force: true }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(b.body.remote!.seq).toBeGreaterThan(a.body.remote!.seq);
    const other = await computer();
    await other.req('PUT', '/api/sync', { directory: cloud });
    const pulled = await other.req<SyncStatus>('POST', '/api/sync/pull', { force: true });
    expect(pulled.status).toBe(200);
    expect(await names(other)).toEqual(['Antes del envío', 'Durante el envío']);
  });

  it('si los dos ordenadores envían a la vez sin verse, se pide elegir en vez de perder datos', async () => {
    const cloud = tempDir('l10n-nube-');
    dirs.push(cloud);
    const folder = path.join(cloud, 'L10N Suite - sincronizacion');
    const a = await computer();
    const b = await computer();
    await a.req('PUT', '/api/sync', { directory: cloud, deviceName: 'A' });
    await b.req('PUT', '/api/sync', { directory: cloud, deviceName: 'B' });
    await a.req('POST', '/api/clients', { name: 'Común' });
    await a.req('POST', '/api/sync/push', {});
    await b.req('POST', '/api/sync/pull', { force: true });

    // Los dos trabajan sin conexión: cada uno envía a «su» copia de la carpeta.
    const snapshot = tempDir('l10n-nube-copia-');
    dirs.push(snapshot);
    fs.cpSync(folder, snapshot, { recursive: true });
    await a.req('POST', '/api/clients', { name: 'Solo en A' });
    await a.req('POST', '/api/sync/push', {});
    const fromA = tempDir('l10n-nube-a-');
    dirs.push(fromA);
    fs.cpSync(folder, fromA, { recursive: true });
    fs.rmSync(folder, { recursive: true });
    fs.cpSync(snapshot, folder, { recursive: true });
    await b.req('POST', '/api/clients', { name: 'Solo en B' });
    expect((await b.req<SyncStatus>('POST', '/api/sync/push', {})).body.conflict).toBe(false);
    // El servicio en la nube se queda con la versión de A (el mismo número de secuencia).
    fs.rmSync(folder, { recursive: true });
    fs.cpSync(fromA, folder, { recursive: true });

    const s = (await b.req<SyncStatus>('GET', '/api/sync')).body;
    expect(s).toMatchObject({ incoming: true, conflict: true, dirty: false });
    // Al abrir B no se carga sola la versión de A (perdería «Solo en B»).
    expect((await b.req<SyncStatus>('POST', '/api/sync/pull', {})).body.conflict).toBe(true);
    expect(await names(b)).toContain('Solo en B');
  });
});
