import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Tag } from '@l10n/shared';
import { createTestApp, multipart, type TestApp } from './helpers';

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.cleanup();
});

describe('sistema', () => {
  it('arranca con la base de datos migrada e íntegra', async () => {
    const res = await t.app.inject('/api/app-info');
    expect(res.statusCode).toBe(200);
    const info = res.json();
    expect(info.integrity).toBe('ok');
    expect(info.schemaVersion).toBeGreaterThanOrEqual(2);
    expect(fs.existsSync(path.join(t.dataDir, 'datos', 'l10n.db'))).toBe(true);
  });

  it('responde 404 en español a rutas desconocidas', async () => {
    const res = await t.app.inject('/api/no-existe');
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe('Ruta no encontrada.');
  });
});

describe('ajustes', () => {
  it('devuelve valores por defecto y guarda cambios por sección', async () => {
    const defaults = (await t.app.inject('/api/settings')).json();
    expect(defaults.preferences.baseCurrency).toBe('EUR');
    expect(defaults.preferences.defaultVatPct).toBe(21);

    const res = await t.app.inject({
      method: 'PUT',
      url: '/api/settings/preferences',
      payload: { defaultIrpfPct: 7, theme: 'dark' },
    });
    expect(res.statusCode).toBe(200);
    const after = (await t.app.inject('/api/settings')).json();
    expect(after.preferences.defaultIrpfPct).toBe(7);
    expect(after.preferences.theme).toBe('dark');
    expect(after.preferences.defaultVatPct).toBe(21);
  });

  it('rechaza valores no válidos con un mensaje claro', async () => {
    const res = await t.app.inject({
      method: 'PUT',
      url: '/api/settings/preferences',
      payload: { defaultVatPct: 250 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('validacion');
  });
});

describe('etiquetas, búsqueda y papelera', () => {
  async function createTag(name: string): Promise<Tag> {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/tags',
      payload: { name, color: '#ff0000' },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  it('crea etiquetas sin duplicados (sin distinguir mayúsculas)', async () => {
    await createTag('Urgente');
    const dup = await t.app.inject({
      method: 'POST',
      url: '/api/tags',
      payload: { name: 'urgente' },
    });
    expect(dup.statusCode).toBe(409);
  });

  it('etiqueta fichas y cuenta los usos', async () => {
    const tag = await createTag('Gacha');
    const res = await t.app.inject({
      method: 'PUT',
      url: '/api/taggings',
      payload: { entityType: 'game', entityId: 'juego-1', tagIds: [tag.id] },
    });
    expect(res.json()).toHaveLength(1);
    const tags = (await t.app.inject('/api/tags')).json() as Tag[];
    expect(tags[0]?.usageCount).toBe(1);
  });

  it('encuentra fichas por subcadena, sin tildes y en coreano', async () => {
    await createTag('Acción épica');
    await createTag('마법사의 탑');
    const accents = (await t.app.inject('/api/search?q=accion')).json();
    expect(accents.map((r: { title: string }) => r.title)).toContain('Acción épica');
    const korean = (await t.app.inject(`/api/search?q=${encodeURIComponent('마법')}`)).json();
    expect(korean.map((r: { title: string }) => r.title)).toContain('마법사의 탑');
  });

  it('envía a la papelera, restaura y borra definitivamente', async () => {
    const tag = await createTag('Temporal');
    expect((await t.app.inject({ method: 'DELETE', url: `/api/tags/${tag.id}` })).statusCode).toBe(
      200,
    );
    expect((await t.app.inject('/api/tags')).json()).toHaveLength(0);
    expect((await t.app.inject('/api/search?q=temporal')).json()).toHaveLength(0);

    const trash = (await t.app.inject('/api/trash')).json();
    expect(trash).toHaveLength(1);
    expect(trash[0].title).toBe('Temporal');

    await t.app.inject({
      method: 'POST',
      url: '/api/trash/restore',
      payload: { entityType: 'tag', entityId: tag.id },
    });
    expect((await t.app.inject('/api/tags')).json()).toHaveLength(1);
    expect((await t.app.inject('/api/search?q=temporal')).json()).toHaveLength(1);

    await t.app.inject({ method: 'DELETE', url: `/api/tags/${tag.id}` });
    const purge = await t.app.inject({
      method: 'POST',
      url: '/api/trash/purge',
      payload: { entityType: 'tag', entityId: tag.id },
    });
    expect(purge.statusCode).toBe(200);
    expect((await t.app.inject('/api/trash')).json()).toHaveLength(0);
  });

  it('borra de la papelera lo que lleva más de 30 días al arrancar', async () => {
    const tag = await createTag('Antigua');
    await t.app.inject({ method: 'DELETE', url: `/api/tags/${tag.id}` });
    t.app.ctx.sqlite.prepare("UPDATE tags SET deleted_at = '2000-01-01T00:00:00.000Z'").run();
    await t.close();
    const again = await createTestApp({ dataDir: t.dataDir });
    expect((await again.app.inject('/api/trash')).json()).toHaveLength(0);
    await again.close();
  });
});

describe('adjuntos', () => {
  it('sube, descarga, renombra y envía a la papelera', async () => {
    const body = multipart([
      { filename: '계약서 NDA.pdf', content: 'contenido-de-prueba', type: 'application/pdf' },
    ]);
    const up = await t.app.inject({
      method: 'POST',
      url: '/api/attachments?entityType=client&entityId=c1',
      ...body,
    });
    expect(up.statusCode).toBe(201);
    const [att] = up.json();
    expect(att.fileName).toBe('계약서 NDA.pdf');
    expect(att.size).toBe(19);
    expect(fs.existsSync(att.absolutePath)).toBe(true);

    const content = await t.app.inject(`/api/attachments/${att.id}/content`);
    expect(content.body).toBe('contenido-de-prueba');
    expect(content.headers['content-type']).toContain('application/pdf');

    const list = (await t.app.inject('/api/attachments?entityType=client&entityId=c1')).json();
    expect(list).toHaveLength(1);

    const renamed = await t.app.inject({
      method: 'PATCH',
      url: `/api/attachments/${att.id}`,
      payload: { fileName: 'NDA firmado.pdf' },
    });
    expect(renamed.json().fileName).toBe('NDA firmado.pdf');

    await t.app.inject({ method: 'DELETE', url: `/api/attachments/${att.id}` });
    await t.app.inject({
      method: 'POST',
      url: '/api/trash/purge',
      payload: { entityType: 'attachment', entityId: att.id },
    });
    expect(fs.existsSync(att.absolutePath)).toBe(false);
  });
});
