import ExcelJS from 'exceljs';
import yazl from 'yazl';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  Character,
  CustomTableDetail,
  GlossaryTerm,
  Page,
  PageSummary,
  TableColumn,
  TableRow,
} from '@l10n/shared';
import { createTestApp, multipart, type TestApp } from './helpers';

let t: TestApp;
let clock = new Date('2026-10-02T10:00:00Z');
beforeEach(async () => {
  clock = new Date('2026-10-02T10:00:00Z');
  t = await createTestApp({ now: () => clock });
});
afterEach(async () => {
  await t.cleanup();
});

async function req<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
  status?: number,
): Promise<T> {
  const res = await t.app.inject({ method, url, payload: payload as object });
  if (status) expect(res.statusCode, res.body).toBe(status);
  else expect(res.statusCode, res.body).toBeLessThan(300);
  return res.json() as T;
}

const paragraph = (text: string, extra: object[] = []) => ({
  type: 'paragraph',
  props: {},
  content: [{ type: 'text', text, styles: {} }, ...extra],
  children: [],
});

describe('páginas', () => {
  it('árbol, contenido, búsqueda, menciones y enlaces inversos', async () => {
    const game = await req<{ id: string }>('POST', '/api/games', { title: 'Crónicas de Aether' });
    const parent = await req<Page>('POST', '/api/pages', { title: 'Proyectos', icon: '📁' }, 201);
    const child = await req<Page>(
      'POST',
      '/api/pages',
      { title: 'Guía de Aether', parentId: parent.id },
      201,
    );
    expect(child.breadcrumbs.map((b) => b.title)).toEqual(['Proyectos']);

    const saved = await req<Page>('PATCH', `/api/pages/${child.id}`, {
      content: [
        paragraph('El 마법사 se traduce «hechicero». Ver ', [
          {
            type: 'mention',
            props: { entityType: 'game', entityId: game.id, label: 'Crónicas de Aether' },
          },
        ]),
      ],
      baseVersion: child.version,
    });
    expect(saved.version).toBe(child.version + 1);

    const search = await req<{ entityId: string }[]>('GET', '/api/search?q=hechicero');
    expect(search.map((s) => s.entityId)).toContain(child.id);
    const ko = await req<{ entityId: string }[]>(
      'GET',
      `/api/search?q=${encodeURIComponent('마법')}`,
    );
    expect(ko.map((s) => s.entityId)).toContain(child.id);

    const backlinks = await req<{ entityId: string }[]>(
      'GET',
      `/api/backlinks?entityType=game&entityId=${game.id}`,
    );
    expect(backlinks.map((b) => b.entityId)).toEqual([child.id]);

    // Guardar con una versión antigua da conflicto en lugar de pisar los cambios.
    await req('PATCH', `/api/pages/${child.id}`, { content: [], baseVersion: child.version }, 409);

    const list = await req<PageSummary[]>('GET', '/api/pages');
    expect(list.find((p) => p.id === parent.id)?.hasChildren).toBe(true);
  });

  it('mover sin crear ciclos y ordenar entre hermanas', async () => {
    const a = await req<Page>('POST', '/api/pages', { title: 'A' }, 201);
    const b = await req<Page>('POST', '/api/pages', { title: 'B' }, 201);
    const a1 = await req<Page>('POST', '/api/pages', { title: 'A1', parentId: a.id }, 201);
    await req('PATCH', `/api/pages/${a.id}`, { parentId: a1.id }, 400);
    await req('PATCH', `/api/pages/${a.id}`, { parentId: a.id }, 400);
    await req('PATCH', `/api/pages/${b.id}`, { parentId: null, index: 0 });
    const roots = (await req<PageSummary[]>('GET', '/api/pages')).filter((p) => !p.parentId);
    expect(roots.map((p) => p.title)).toEqual(['B', 'A']);
    const moved = await req<Page>('PATCH', `/api/pages/${b.id}`, { parentId: a.id, index: 0 });
    expect(moved.breadcrumbs.map((x) => x.title)).toEqual(['A']);
    const children = (await req<PageSummary[]>('GET', '/api/pages')).filter(
      (p) => p.parentId === a.id,
    );
    expect(children.map((p) => p.title)).toEqual(['B', 'A1']);
  });

  it('papelera: la página se lleva sus subpáginas y vuelven al restaurar', async () => {
    const a = await req<Page>('POST', '/api/pages', { title: 'Padre' }, 201);
    const a1 = await req<Page>('POST', '/api/pages', { title: 'Hija única', parentId: a.id }, 201);
    await req('DELETE', `/api/pages/${a.id}`);
    expect((await req<PageSummary[]>('GET', '/api/pages')).map((p) => p.id)).not.toContain(a1.id);
    await req('GET', `/api/pages/${a1.id}`, undefined, 404);
    expect((await req<unknown[]>('GET', '/api/search?q=hija%20unica')).length).toBe(0);
    await req('POST', '/api/trash/restore', { entityType: 'page', entityId: a.id });
    expect((await req<Page>('GET', `/api/pages/${a1.id}`)).title).toBe('Hija única');
    expect((await req<unknown[]>('GET', '/api/search?q=hija%20unica')).length).toBe(1);

    // Restaurar una subpágina cuya superior sigue en la papelera la lleva a la raíz.
    await req('DELETE', `/api/pages/${a1.id}`);
    await req('DELETE', `/api/pages/${a.id}`);
    await req('POST', '/api/trash/restore', { entityType: 'page', entityId: a1.id });
    expect((await req<Page>('GET', `/api/pages/${a1.id}`)).parentId).toBeNull();

    // Borrado definitivo en cascada
    const b = await req<Page>('POST', '/api/pages', { title: 'B' }, 201);
    const b1 = await req<Page>('POST', '/api/pages', { title: 'B1', parentId: b.id }, 201);
    await req('DELETE', `/api/pages/${b.id}`);
    await req('POST', '/api/trash/purge', { entityType: 'page', entityId: b.id });
    const n = t.app.ctx.sqlite
      .prepare('SELECT COUNT(*) AS n FROM pages WHERE id IN (?, ?)')
      .get(b.id, b1.id) as { n: number };
    expect(n.n).toBe(0);
  });

  it('versiones: guarda una cada 10 minutos de edición y permite restaurarla', async () => {
    const p = await req<Page>(
      'POST',
      '/api/pages',
      { title: 'Notas', content: [paragraph('v1')] },
      201,
    );
    await req('PATCH', `/api/pages/${p.id}`, { content: [paragraph('v2')] });
    clock = new Date(clock.getTime() + 60_000);
    await req('PATCH', `/api/pages/${p.id}`, { content: [paragraph('v3')] });
    let revs = await req<{ id: string }[]>('GET', `/api/pages/${p.id}/revisions`);
    expect(revs).toHaveLength(1); // solo v1 (la de v2 se agrupa por estar dentro de los 10 min)
    clock = new Date(clock.getTime() + 11 * 60_000);
    await req('PATCH', `/api/pages/${p.id}`, { content: [paragraph('v4')] });
    revs = await req<{ id: string }[]>('GET', `/api/pages/${p.id}/revisions`);
    expect(revs).toHaveLength(2);
    const oldest = revs[revs.length - 1]!;
    const rev = await req<{ content: unknown }>('GET', `/api/pages/${p.id}/revisions/${oldest.id}`);
    expect(JSON.stringify(rev.content)).toContain('v1');
    const restored = await req<Page>('POST', `/api/pages/${p.id}/revisions/${oldest.id}/restore`);
    expect(JSON.stringify(restored.content)).toContain('v1');
    // La versión actual (v4) se conserva como versión antes de restaurar.
    revs = await req<{ id: string }[]>('GET', `/api/pages/${p.id}/revisions`);
    expect(revs).toHaveLength(3);
  });

  it('plantillas, duplicar e importar Markdown', async () => {
    const templates = await req<{ key: string }[]>('GET', '/api/page-templates');
    expect(templates.map((x) => x.key)).toContain('style_guide');
    const p = await req<Page>('POST', '/api/pages', { template: 'style_guide' }, 201);
    expect(p.title).toBe('Guía de estilo');
    expect(p.contentFormat).toBe('markdown');
    expect(String(p.content)).toContain('Tratamiento del jugador');
    expect((await req<unknown[]>('GET', '/api/search?q=tratamiento%20del%20jugador')).length).toBe(
      1,
    );
    const copy = await req<Page>('POST', `/api/pages/${p.id}/duplicate`, undefined, 201);
    expect(copy.title).toBe('Guía de estilo (copia)');
    await req('POST', '/api/pages', { template: 'no-existe' }, 400);

    const res = await t.app.inject({
      method: 'POST',
      url: '/api/import/markdown',
      ...multipart([{ filename: 'acta.md', content: '# Reunión con el PM\n\n- Punto 1\n' }]),
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().title).toBe('Reunión con el PM');
  });
});

describe('tablas personalizadas', () => {
  async function newTable(): Promise<CustomTableDetail> {
    return req<CustomTableDetail>('POST', '/api/tables', { name: 'Tarifas del mercado' }, 201);
  }

  it('columnas, filas, validación, fórmulas y conversión de tipos', async () => {
    const table = await newTable();
    const [name] = table.columns;
    const words = await req<TableColumn>(
      'POST',
      `/api/tables/${table.id}/columns`,
      { name: 'Palabras', type: 'text' },
      201,
    );
    const rate = await req<TableColumn>(
      'POST',
      `/api/tables/${table.id}/columns`,
      { name: 'Tarifa', type: 'currency', options: { currency: 'EUR' } },
      201,
    );
    const rows = await req<TableRow[]>(
      'POST',
      `/api/tables/${table.id}/rows`,
      {
        rows: [
          { values: { [name!.id]: 'Agencia A', [words.id]: '1.200', [rate.id]: 8 } },
          { values: { [name!.id]: 'Agencia B', [words.id]: 'muchas' } },
        ],
      },
      201,
    );
    expect(rows).toHaveLength(2);
    // Una moneda debe ir en céntimos enteros.
    await req(
      'POST',
      `/api/tables/${table.id}/rows`,
      { rows: [{ values: { [rate.id]: 8.5 } }] },
      400,
    );

    // Texto → número: «1.200» pasa a 1200 y lo que no es un número se vacía.
    const asNumber = await req<TableColumn>('PATCH', `/api/table-columns/${words.id}`, {
      type: 'number',
    });
    expect(asNumber.type).toBe('number');
    let data = await req<{ rows: TableRow[] }>('GET', `/api/tables/${table.id}/rows`);
    expect(data.rows[0]!.values[words.id]).toBe(1200);
    expect(data.rows[1]!.values[words.id]).toBeUndefined();

    // Texto → selección: crea las opciones a partir de los valores.
    const sel = await req<TableColumn>('PATCH', `/api/table-columns/${name!.id}`, {
      type: 'select',
    });
    expect(sel.options.choices?.map((c) => c.label)).toEqual(['Agencia A', 'Agencia B']);
    // Quitar una opción la borra de las filas.
    await req('PATCH', `/api/table-columns/${name!.id}`, {
      options: { choices: sel.options.choices!.slice(0, 1) },
    });
    data = await req<{ rows: TableRow[] }>('GET', `/api/tables/${table.id}/rows`);
    expect(data.rows[1]!.values[name!.id]).toBeUndefined();

    // Fórmula con error de sintaxis → 400; válida → se guarda.
    const f = await req<TableColumn>(
      'POST',
      `/api/tables/${table.id}/columns`,
      { name: 'Importe', type: 'formula', options: { formula: '{Palabras} * {Tarifa}' } },
      201,
    );
    await req(
      'PATCH',
      `/api/table-columns/${f.id}`,
      { options: { formula: '{Palabras} * (' } },
      400,
    );

    // Borrar filas y deshacer
    await req('POST', `/api/tables/${table.id}/rows/delete`, { ids: [rows[1]!.id] });
    expect(
      (await req<{ rows: TableRow[] }>('GET', `/api/tables/${table.id}/rows`)).rows,
    ).toHaveLength(1);
    await req('POST', `/api/tables/${table.id}/rows/restore`, { ids: [rows[1]!.id] });
    expect(
      (await req<{ rows: TableRow[] }>('GET', `/api/tables/${table.id}/rows`)).rows,
    ).toHaveLength(2);

    // Borrar una columna quita sus valores
    await req('DELETE', `/api/table-columns/${rate.id}`);
    data = await req<{ rows: TableRow[] }>('GET', `/api/tables/${table.id}/rows`);
    expect(Object.keys(data.rows[0]!.values)).not.toContain(rate.id);

    // Vistas
    const view = await req<{ id: string }>(
      'POST',
      `/api/tables/${table.id}/views`,
      { name: 'Caras', type: 'grid', config: { sorts: [{ columnId: words.id, dir: 'desc' }] } },
      201,
    );
    await req('PATCH', `/api/table-views/${view.id}`, { name: 'Ordenadas' });
    const detail = await req<CustomTableDetail>('GET', `/api/tables/${table.id}`);
    expect(detail.views.map((v) => v.name)).toEqual(['Cuadrícula', 'Ordenadas']);
    await req('DELETE', `/api/table-views/${detail.views[0]!.id}`);
    await req('DELETE', `/api/table-views/${view.id}`, undefined, 400); // queda al menos una
  });

  it('importa un Excel detectando los tipos y exporta a Excel y CSV', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Juegos');
    ws.addRow(['Título', 'Lanzamiento', 'Precio', 'Género', 'Terminado', 'Web']);
    ws.addRow([
      'Aether',
      new Date('2024-05-01T00:00:00Z'),
      19.99,
      'RPG',
      'sí',
      'https://aether.example',
    ]);
    ws.addRow([
      'Neon',
      new Date('2025-02-10T00:00:00Z'),
      9.5,
      'Acción',
      'no',
      'https://neon.example',
    ]);
    ws.addRow([
      'Jardín',
      new Date('2023-11-20T00:00:00Z'),
      0,
      'RPG',
      'sí',
      'https://garden.example',
    ]);
    ws.addRow(['Lumen', new Date('2022-01-01T00:00:00Z'), 4, 'RPG', 'no', 'https://lumen.example']);
    ws.getColumn(3).numFmt = '#,##0.00 €';
    wb.addWorksheet('Vacía');
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/tables/import',
      ...multipart([{ filename: 'Catálogo.xlsx', content: buffer }]),
    });
    expect(res.statusCode, res.body).toBe(201);
    const [table] = res.json() as CustomTableDetail[];
    expect(table!.name).toBe('Catálogo');
    expect(table!.columns.map((c) => c.type)).toEqual([
      'text',
      'date',
      'currency',
      'select',
      'checkbox',
      'url',
    ]);
    const { rows } = await req<{ rows: TableRow[] }>('GET', `/api/tables/${table!.id}/rows`);
    expect(rows).toHaveLength(4);
    const [title, date, price, genre, done] = table!.columns;
    expect(rows[0]!.values[date!.id]).toBe('2024-05-01');
    expect(rows[0]!.values[price!.id]).toBe(1999);
    expect(rows[0]!.values[done!.id]).toBe(true);
    expect(genre!.options.choices?.map((c) => c.label)).toEqual(['RPG', 'Acción']);

    const xlsx = await t.app.inject({ url: `/api/tables/${table!.id}/export?format=xlsx` });
    expect(xlsx.statusCode).toBe(200);
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(xlsx.rawPayload as unknown as ArrayBuffer);
    const sheet = back.worksheets[0]!;
    expect(sheet.getRow(1).getCell(1).value).toBe('Título');
    expect(sheet.getRow(2).getCell(3).value).toBe(19.99);

    const csv = await t.app.inject({ url: `/api/tables/${table!.id}/export?format=csv` });
    expect(csv.body).toContain('Título,Lanzamiento');
    expect(csv.body).toContain('Aether,01/05/2024');
    expect(title!.name).toBe('Título');

    // Papelera: la tabla desaparece con sus filas y vuelve al restaurarla.
    await req('DELETE', `/api/tables/${table!.id}`);
    await req('GET', `/api/tables/${table!.id}`, undefined, 404);
    await req('POST', '/api/trash/restore', { entityType: 'custom_table', entityId: table!.id });
    expect(
      (await req<{ rows: TableRow[] }>('GET', `/api/tables/${table!.id}/rows`)).rows,
    ).toHaveLength(4);
  });

  it('relaciones con fichas de la app y con filas de otra tabla', async () => {
    const game = await req<{ id: string }>('POST', '/api/games', { title: 'Crónicas de Aether' });
    const other = await newTable();
    const [otherName] = other.columns;
    const [o1] = await req<TableRow[]>(
      'POST',
      `/api/tables/${other.id}/rows`,
      { rows: [{ values: { [otherName!.id]: 'Fila enlazada' } }] },
      201,
    );
    const table = await newTable();
    const rg = await req<TableColumn>(
      'POST',
      `/api/tables/${table.id}/columns`,
      { name: 'Juego', type: 'relation', options: { target: 'game' } },
      201,
    );
    const rt = await req<TableColumn>(
      'POST',
      `/api/tables/${table.id}/columns`,
      { name: 'Otra', type: 'relation', options: { target: `table:${other.id}` } },
      201,
    );
    await req(
      'POST',
      `/api/tables/${table.id}/rows`,
      { rows: [{ values: { [rg.id]: [game.id], [rt.id]: [o1!.id] } }] },
      201,
    );
    const { labels } = await req<{ labels: Record<string, string> }>(
      'GET',
      `/api/tables/${table.id}/rows`,
    );
    expect(labels[game.id]).toBe('Crónicas de Aether');
    expect(labels[o1!.id]).toBe('Fila enlazada');
  });
});

describe('recursos del juego', () => {
  it('glosario: alta, importación con y sin cabeceras, duplicados, exportación y deshacer', async () => {
    const game = await req<{ id: string }>('POST', '/api/games', { title: 'Crónicas de Aether' });
    await req('POST', '/api/glossary', { gameId: game.id }, 400);
    const term = await req<GlossaryTerm>(
      'POST',
      '/api/glossary',
      { gameId: game.id, termKo: '마법사', termEs: 'hechicero', status: 'approved' },
      201,
    );
    expect(term.gameTitle).toBe('Crónicas de Aether');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Glosario');
    ws.addRow(['Coreano', 'Español', 'Contexto', 'Estado']);
    ws.addRow(['마법사', 'hechicero', '', 'Aprobado']); // ya existe
    ws.addRow(['검', 'espada', 'Arma básica', 'Aprobado']);
    ws.addRow(['던전', 'mazmorra', '', 'Prohibido']);
    const withHeaders = Buffer.from(await wb.xlsx.writeBuffer());
    let res = await t.app.inject({
      method: 'POST',
      url: '/api/glossary/import',
      ...multipart([{ filename: 'glosario.xlsx', content: withHeaders }], { gameId: game.id }),
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ created: 2, skipped: 1 });
    const batchId = res.json().batchId as string;

    // Sin cabeceras: A = coreano, B = español
    res = await t.app.inject({
      method: 'POST',
      url: '/api/glossary/import',
      ...multipart([{ filename: 'g.csv', content: '방패,escudo\n물약,poción\n' }], {
        gameId: game.id,
      }),
    });
    expect(res.json()).toMatchObject({ created: 2, skipped: 0 });

    let terms = await req<GlossaryTerm[]>('GET', `/api/glossary?gameId=${game.id}`);
    expect(terms).toHaveLength(5);
    expect(terms.find((x) => x.termKo === '던전')?.status).toBe('forbidden');
    expect(terms.find((x) => x.termKo === '검')?.context).toBe('Arma básica');
    expect(
      (await req<GlossaryTerm[]>('GET', `/api/glossary?gameId=${game.id}&q=pocion`)).map(
        (x) => x.termKo,
      ),
    ).toEqual(['물약']);

    const xlsx = await t.app.inject({ url: `/api/glossary/export?gameId=${game.id}` });
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(xlsx.rawPayload as unknown as ArrayBuffer);
    const sheet = back.getWorksheet('Glosario')!;
    expect(sheet.getRow(1).getCell(1).value).toBe('Coreano');
    expect(sheet.rowCount).toBe(6);

    await req('POST', `/api/import/batches/${batchId}/undo`);
    terms = await req<GlossaryTerm[]>('GET', `/api/glossary?gameId=${game.id}`);
    expect(terms).toHaveLength(3);
  });

  it('personajes', async () => {
    const game = await req<{ id: string }>('POST', '/api/games', { title: 'Crónicas de Aether' });
    const c = await req<Character>(
      'POST',
      '/api/characters',
      {
        gameId: game.id,
        nameKo: '서연',
        nameEs: 'Seo-yeon',
        gender: 'f',
        addressForm: 'tu',
        koSpeechLevel: 'banmal',
        speechStyle: 'Directa, usa jerga juvenil',
      },
      201,
    );
    const updated = await req<Character>('PATCH', `/api/characters/${c.id}`, {
      addressForm: 'usted',
    });
    expect(updated).toMatchObject({ addressForm: 'usted', gender: 'f', koSpeechLevel: 'banmal' });
    expect(
      (await req<{ entityId: string }[]>('GET', '/api/search?q=seo-yeon')).map((r) => r.entityId),
    ).toContain(c.id);
    await req('DELETE', `/api/characters/${c.id}`);
    expect(await req<Character[]>('GET', `/api/characters?gameId=${game.id}`)).toHaveLength(0);
  });
});

function zipOf(files: Record<string, Buffer | string>): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files)) {
    zip.addBuffer(Buffer.isBuffer(content) ? content : Buffer.from(content), name);
  }
  zip.end();
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
  });
}

describe('importación de Notion', () => {
  it('páginas con jerarquía, imágenes, enlaces y bases de datos; se puede deshacer', async () => {
    const id = (n: number) =>
      String(n)
        .repeat(32)
        .slice(0, 32)
        .replace(/\d/g, (d) => 'abcdef0123'[Number(d)]!);
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082',
      'hex',
    );
    const zip = await zipOf({
      [`Trabajo ${id(1)}.md`]: `# Trabajo\n\nMis notas. Ver [Guía](Trabajo%20${id(1)}/Gu%C3%ADa%20${id(2)}.md).\n\n![captura](Trabajo%20${id(1)}/captura.png)\n`,
      [`Trabajo ${id(1)}/Guía ${id(2)}.md`]: '# Guía\n\nTratamiento de tú.\n',
      [`Trabajo ${id(1)}/captura.png`]: png,
      [`Clientes ${id(3)}.csv`]: 'Nombre,País\nPixel,España\n',
      [`Clientes ${id(3)}_all.csv`]: 'Nombre,País\nPixel,España\nHangul,Corea\n',
      [`Clientes ${id(3)}/Pixel ${id(4)}.md`]: '# Pixel\n\nPaís: España\n',
    });
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/import/notion',
      ...multipart([{ filename: 'Export.zip', content: zip }]),
    });
    expect(res.statusCode, res.body).toBe(200);
    const result = res.json();
    expect(result).toMatchObject({ tables: 1, attachments: 1 });

    const pages = await req<PageSummary[]>('GET', '/api/pages');
    const byTitle = (title: string) => pages.find((p) => p.title === title)!;
    expect(byTitle('Trabajo').parentId).toBe(result.rootPageId);
    expect(byTitle('Guía').parentId).toBe(byTitle('Trabajo').id);
    // Las filas de la base de datos cuelgan de una página contenedora con su nombre.
    expect(byTitle('Pixel').parentId).toBe(byTitle('Clientes').id);

    const trabajo = await req<Page>('GET', `/api/pages/${byTitle('Trabajo').id}`);
    expect(trabajo.contentFormat).toBe('markdown');
    expect(String(trabajo.content)).toContain('Ver Guía.');
    expect(String(trabajo.content)).toMatch(/!\[captura\]\(\.\/api\/attachments\/[^/]+\/content\)/);

    const tables = await req<{ name: string; rowCount: number }[]>('GET', '/api/tables');
    expect(tables).toEqual([expect.objectContaining({ name: 'Clientes', rowCount: 2 })]);

    await req('POST', `/api/import/batches/${result.batchId}/undo`);
    expect(await req<unknown[]>('GET', '/api/pages')).toHaveLength(0);
    expect(await req<unknown[]>('GET', '/api/tables')).toHaveLength(0);
  });

  it('rechaza archivos que no son una exportación', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/import/notion',
      ...multipart([{ filename: 'x.zip', content: 'no es zip' }]),
    });
    expect(res.statusCode).toBe(400);
  });
});
