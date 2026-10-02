import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Game, ImportPreview, ImportResult, Task } from '@l10n/shared';
import { createTestApp, multipart, type TestApp } from './helpers';

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: () => new Date('2026-10-02T10:00:00Z') });
});
afterEach(async () => {
  await t.cleanup();
});

async function preview(filename: string, content: Buffer | string): Promise<ImportPreview> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/import/preview',
    ...multipart([{ filename, content }]),
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
}

async function commit(body: Record<string, unknown>): Promise<ImportResult> {
  const res = await t.app.inject({ method: 'POST', url: '/api/import/commit', payload: body });
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
}

const CLICKUP_CSV = [
  'Task ID,Task Name,Task Content,Status,Due Date,Priority,Space Name,List Name,Tags,Parent ID,Time Estimated',
  'a1,Traducir diálogos,Capítulo 3,in progress,1791021600000,high,Trabajo,Encargos de Aether,"[urgente, gacha]",,5400000',
  'a2,Revisar glosario,,to do,,,Trabajo,Encargos de Aether,,a1,',
  'a3,Pagar la cuota,,complete,,low,Administración,,,,',
].join('\n');

describe('importación', () => {
  it('importa tareas de ClickUp con subtareas, etiquetas, estados y listas', async () => {
    const p = await preview('clickup.csv', `\uFEFF${CLICKUP_CSV}`);
    expect(p.totalRows).toBe(3);
    expect(p.headers).toContain('Task Name');
    const r = await commit({
      token: p.token,
      target: 'tasks',
      mapping: {
        title: 'Task Name',
        description: 'Task Content',
        status: 'Status',
        dueDate: 'Due Date',
        priority: 'Priority',
        area: 'Space Name',
        list: 'List Name',
        tags: 'Tags',
        externalId: 'Task ID',
        parentExternalId: 'Parent ID',
        estimate: 'Time Estimated',
      },
    });
    expect(r.created).toBe(3);
    expect(r.errors).toEqual([]);
    const tasks = (await t.app.inject('/api/tasks')).json() as Task[];
    const main = tasks.find((x) => x.title === 'Traducir diálogos')!;
    expect(main.statusCategory).toBe('doing');
    expect(main.priority).toBe(2);
    expect(main.estimateMinutes).toBe(90);
    expect(main.dueDate).toMatch(/^2026-10-0[23]$/);
    expect(main.listName).toBe('Encargos de Aether');
    expect(main.areaName).toBe('Trabajo');
    expect(main.tags.map((x) => x.name).sort()).toEqual(['gacha', 'urgente']);
    expect(main.subtaskCount).toBe(1);
    const sub = tasks.find((x) => x.title === 'Revisar glosario')!;
    expect(sub.parentId).toBe(main.id);
    expect(tasks.find((x) => x.title === 'Pagar la cuota')!.statusCategory).toBe('done');
  });

  it('importa juegos desde Excel y omite los duplicados', async () => {
    await t.app.inject({ method: 'POST', url: '/api/games', payload: { title: 'Ya existe' } });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Juegos');
    ws.addRow(['Título', 'Título original', 'Año', 'Plataformas']);
    ws.addRow(['Crónicas de Aether', '에테르 연대기', 2025, 'PC, Android']);
    ws.addRow(['Ya existe', '', '', '']);
    ws.addRow(['', '', '', '']);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const p = await preview('juegos.xlsx', buffer);
    expect(p.sheetName).toBe('Juegos');
    expect(p.totalRows).toBe(2);
    const r = await commit({
      token: p.token,
      target: 'games',
      mapping: {
        title: 'Título',
        originalTitle: 'Título original',
        releaseYear: 'Año',
        platforms: 'Plataformas',
      },
    });
    expect(r.created).toBe(1);
    expect(r.skipped).toBe(1);
    const games = (await t.app.inject('/api/games')).json() as Game[];
    const aether = games.find((g) => g.title === 'Crónicas de Aether')!;
    expect(aether.originalTitle).toBe('에테르 연대기');
    expect(aether.releaseYear).toBe(2025);
    expect(aether.platforms).toEqual(['PC', 'Android']);
  });

  it('informa de las filas con errores sin bloquear el resto', async () => {
    const p = await preview(
      'clientes.csv',
      'Nombre;País\nAgencia Uno;España\n;Corea\nAgencia Dos;Japón',
    );
    const r = await commit({
      token: p.token,
      target: 'clients',
      mapping: { name: 'Nombre', country: 'País' },
    });
    expect(r.created).toBe(2);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.row).toBe(3);
  });

  it('crea clientes y juegos al importar proyectos y permite deshacer la importación', async () => {
    const p = await preview(
      'proyectos.csv',
      'Proyecto,Cliente,Juego,Origen,Destino\nAether live-ops,Hangul Studio,Aether,ko,es',
    );
    const r = await commit({
      token: p.token,
      target: 'projects',
      mapping: {
        name: 'Proyecto',
        client: 'Cliente',
        game: 'Juego',
        sourceLang: 'Origen',
        targetLang: 'Destino',
      },
    });
    expect(r.created).toBe(1);
    expect((await t.app.inject('/api/clients')).json()).toHaveLength(1);
    expect((await t.app.inject('/api/projects')).json()[0].targetLang).toBe('es');

    const undo = await t.app.inject({
      method: 'POST',
      url: `/api/import/batches/${r.batchId}/undo`,
    });
    expect(undo.statusCode).toBe(200);
    expect((await t.app.inject('/api/projects')).json()).toHaveLength(0);
    expect((await t.app.inject('/api/clients')).json()).toHaveLength(0);
    expect((await t.app.inject('/api/games')).json()).toHaveLength(0);
    const again = await t.app.inject({
      method: 'POST',
      url: `/api/import/batches/${r.batchId}/undo`,
    });
    expect(again.statusCode).toBe(400);
  });

  it('exige las columnas obligatorias y rechaza formatos desconocidos', async () => {
    const p = await preview('t.csv', 'A,B\n1,2');
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/import/commit',
      payload: { token: p.token, target: 'tasks', mapping: {} },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('Título');
    const bad = await t.app.inject({
      method: 'POST',
      url: '/api/import/preview',
      ...multipart([{ filename: 'x.pdf', content: 'x' }]),
    });
    expect(bad.statusCode).toBe(400);
  });
});
