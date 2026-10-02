import ExcelJS from 'exceljs';
import yauzl from 'yauzl';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  AnnotationTag,
  ConcordanceResult,
  CorpusImportResult,
  CorpusProfile,
  CorpusStats,
  CorpusVersion,
  Segment,
} from '@l10n/shared';
import { createTestApp, multipart, type TestApp } from './helpers';

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp({ now: () => new Date('2026-10-02T10:00:00Z') });
});
afterEach(async () => {
  await t.cleanup();
});

async function req<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: unknown,
  status?: number,
): Promise<T> {
  const res = await t.app.inject({ method, url, payload: payload as object });
  if (status) expect(res.statusCode, res.body).toBe(status);
  else expect(res.statusCode, res.body).toBeLessThan(300);
  return res.json() as T;
}

async function xlsx(rows: (string | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Textos');
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function importFile(
  gameId: string,
  title: string,
  file: Buffer,
  fileName = 'textos.xlsx',
  extra: Record<string, unknown> = {},
): Promise<CorpusImportResult> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/corpus/import/preview',
    ...multipart([{ filename: fileName, content: file }]),
  });
  expect(res.statusCode, res.body).toBe(200);
  const preview = res.json();
  return req<CorpusImportResult>('POST', '/api/corpus/import/commit', {
    token: preview.token,
    gameId,
    title,
    languages: preview.suggested.languages,
    stringId: preview.suggested.stringId,
    speaker: preview.suggested.speaker,
    context: preview.suggested.context,
    headerIsData: preview.headerIsData,
    ...extra,
  });
}

const search = (body: Record<string, unknown>) =>
  req<ConcordanceResult>('POST', '/api/corpus/concordance', body);

async function seedCorpus() {
  const aether = await req<{ id: string }>('POST', '/api/games', {
    title: 'Crónicas de Aether',
    genres: ['RPG', 'Gacha'],
    platforms: ['Android'],
    releaseYear: 2025,
  });
  const neon = await req<{ id: string }>('POST', '/api/games', {
    title: 'Neon Drift',
    genres: ['Carreras'],
    releaseYear: 2023,
  });
  const r1 = await importFile(
    aether.id,
    'Diálogos del capítulo 1',
    await xlsx([
      ['ID', 'Hablante', 'Korean', 'Spanish', 'Notas'],
      [
        'DLG_001',
        '서연',
        '<color=#ff0>마법사</color>가 던전에 들어갔다.',
        'El hechicero entró en la mazmorra.',
        'Intro',
      ],
      ['DLG_002', '무혁', '{0}님, 마법을 쓰세요!', '¡{0}, usa la magia!', null],
      ['DLG_003', '서연', '스킬을 배웠다.', 'Has aprendido una habilidad.', null],
      ['DLG_004', '서연', '흑마법사가 나타났다!', '¡Ha aparecido un nigromante!', null],
      ['DLG_005', null, null, null, null],
      ['DLG_006', '서연', '마법사가 웃었다.', null, null],
      ['DLG_002b', '무혁', '{0}님, 마법을 쓰세요!', '¡{0}, usa la magia!', null],
    ]),
  );
  const r2 = await importFile(
    neon.id,
    'Interfaz',
    Buffer.from('키보드,Teclado\n마법 부스터,Turbo mágico\n출발,Salida\n'),
    'ui.csv',
    { textType: 'ui' },
  );
  return { aether, neon, r1, r2 };
}

describe('corpus: importación y catálogo', () => {
  it('importa con detección de columnas, limpia etiquetas y avisa de filas vacías, desalineadas y repetidas', async () => {
    const { aether, neon, r1, r2 } = await seedCorpus();
    expect(r1).toMatchObject({
      segments: 6,
      skippedEmpty: 1,
      misaligned: 1,
      duplicates: 1,
      markupRemoved: 2,
      variablesFound: 4,
    });
    // CSV sin cabeceras: la primera fila también es texto (A = coreano, B = español).
    expect(r2.segments).toBe(3);

    const segs = await req<{ items: Segment[]; total: number }>(
      'GET',
      `/api/corpus/documents/${r1.documentId}/segments`,
    );
    expect(segs.total).toBe(6);
    expect(segs.items[0]).toMatchObject({
      stringId: 'DLG_001',
      speaker: '서연',
      context: 'Intro',
      texts: { ko: '마법사가 던전에 들어갔다.', es: 'El hechicero entró en la mazmorra.' },
    });

    const profiles = await req<CorpusProfile[]>('GET', '/api/corpus/profiles');
    expect(profiles.map((p) => [p.gameTitle, p.segmentCount, p.languages.sort()])).toEqual([
      ['Crónicas de Aether', 6, ['es', 'ko']],
      ['Neon Drift', 3, ['es', 'ko']],
    ]);
    const updated = await req<CorpusProfile>('PUT', `/api/corpus/profiles/${aether.id}`, {
      phase: 'annotation',
      translationDirection: 'direct',
    });
    expect(updated).toMatchObject({
      phase: 'annotation',
      translationDirection: 'direct',
      genres: ['RPG', 'Gacha'],
    });
    await req('DELETE', `/api/corpus/profiles/${neon.id}`, undefined, 400);

    // Corregir un segmento actualiza el índice de búsqueda.
    await req('PATCH', `/api/corpus/segments/${segs.items[2]!.id}`, {
      texts: { es: 'Has aprendido una técnica.' },
    });
    expect((await search({ conditions: [{ lang: 'es', query: 'tecnica' }] })).total).toBe(1);
    expect((await search({ conditions: [{ lang: 'es', query: 'habilidad' }] })).total).toBe(0);
  });

  it('deshacer la importación borra el documento y sus segmentos del índice', async () => {
    const { r2 } = await seedCorpus();
    const batches = await req<{ id: string; kind: string; fileName: string }[]>(
      'GET',
      '/api/import/batches',
    );
    const batch = batches.find((b) => b.kind === 'Corpus' && b.fileName === 'ui.csv')!;
    expect((await search({ conditions: [{ lang: 'es', query: 'turbo' }] })).total).toBe(1);
    await req('POST', `/api/import/batches/${batch.id}/undo`);
    expect((await search({ conditions: [{ lang: 'es', query: 'turbo' }] })).total).toBe(0);
    await req('GET', `/api/corpus/documents/${r2.documentId}`, undefined, 404);
  });
});

describe('corpus: concordanciador', () => {
  it('busca sin tildes ni mayúsculas, con palabra completa, prefijo y búsquedas cortas en coreano', async () => {
    await seedCorpus();
    const r = await search({ conditions: [{ lang: 'es', query: 'MAZMORRA' }] });
    expect(r.total).toBe(1);
    expect(r.hits[0]).toMatchObject({
      match: 'mazmorra',
      left: 'El hechicero entró en la ',
      gameTitle: 'Crónicas de Aether',
      stringId: 'DLG_001',
      parallel: { ko: '마법사가 던전에 들어갔다.' },
    });
    expect((await search({ conditions: [{ lang: 'es', query: 'magico' }] })).total).toBe(1);
    // Coreano: 2 sílabas (sin índice trigram) y «empieza por» con partículas.
    expect((await search({ conditions: [{ lang: 'ko', query: '마법' }] })).total).toBe(6);
    const prefix = await search({ conditions: [{ lang: 'ko', mode: 'prefix', query: '마법사' }] });
    expect(prefix.hits.map((h) => h.match)).toEqual(['마법사가', '마법사가']);
    const word = await search({ conditions: [{ lang: 'es', mode: 'word', query: 'magia' }] });
    expect(word.total).toBe(2);
    const regex = await search({
      conditions: [{ lang: 'es', mode: 'regex', query: 'ha(s)? (aprendido|aparecido)' }],
    });
    expect(regex.hits.map((h) => h.match).sort()).toEqual(['Ha aparecido', 'Has aprendido']);
    await req(
      'POST',
      '/api/corpus/concordance',
      { conditions: [{ lang: 'es', mode: 'regex', query: '(' }] },
      400,
    );
  });

  it('combina condiciones en varios idiomas, filtra y ordena', async () => {
    const { neon } = await seedCorpus();
    // KO contiene 마법 y ES no contiene «magia»
    const combined = await search({
      conditions: [
        { lang: 'ko', query: '마법' },
        { lang: 'es', query: 'magia', negate: true },
      ],
    });
    expect(combined.segments).toBe(4);
    const onlyNeon = await search({
      conditions: [{ lang: 'ko', query: '마법' }],
      filters: { gameIds: [neon.id] },
    });
    expect(onlyNeon.hits.map((h) => h.parallel.es)).toEqual(['Turbo mágico']);
    const byGenre = await search({
      conditions: [{ lang: 'ko', query: '마법' }],
      filters: { genres: ['Carreras'] },
    });
    expect(byGenre.total).toBe(1);
    const bySpeaker = await search({
      conditions: [{ lang: 'ko', query: '마법' }],
      filters: { speaker: '무혁' },
    });
    expect(bySpeaker.total).toBe(2);
    const sorted = await search({ conditions: [{ lang: 'ko', query: '마법' }], sort: 'right' });
    expect(sorted.hits[0]!.right.startsWith(' ')).toBe(true);
    await req(
      'POST',
      '/api/corpus/concordance',
      { conditions: [{ lang: 'es', query: 'magia', negate: true }] },
      400,
    );

    const xlsxRes = await t.app.inject({
      method: 'POST',
      url: '/api/corpus/concordance/export',
      payload: { conditions: [{ lang: 'ko', query: '마법' }] },
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsxRes.rawPayload as unknown as ArrayBuffer);
    expect(wb.worksheets[0]!.rowCount).toBe(7);
    expect(wb.worksheets[0]!.getRow(1).getCell(7).value).toBe('Coincidencia');
  });

  it('anotaciones de fragmentos y filtro por etiqueta (con subetiquetas)', async () => {
    const { r1 } = await seedCorpus();
    const tags = await req<AnnotationTag[]>('GET', '/api/corpus/tags');
    const honorific = tags.find((x) => x.name.startsWith('Sufijos honoríficos'))!;
    const parent = tags.find((x) => x.id === honorific.parentId)!;
    expect(parent.name).toBe('Honoríficos y tratamiento');
    const segs = await req<{ items: Segment[] }>(
      'GET',
      `/api/corpus/documents/${r1.documentId}/segments`,
    );
    const seg = segs.items[1]!;
    const ann = await req<{ quote: string }>(
      'POST',
      '/api/corpus/annotations',
      {
        segmentId: seg.id,
        tagId: honorific.id,
        lang: 'ko',
        start: 3,
        end: 4,
        comment: '«-님» omitido en español',
      },
      201,
    );
    expect(ann.quote).toBe('님');
    await req(
      'POST',
      '/api/corpus/annotations',
      { segmentId: seg.id, tagId: honorific.id, lang: 'ko', start: 3, end: 99 },
      400,
    );
    const filtered = await search({
      conditions: [{ lang: 'ko', query: '마법' }],
      filters: { tagIds: [parent.id] },
    });
    expect(filtered.segments).toBe(1);
    expect(filtered.hits[0]!.annotationCount).toBe(1);
    const custom = await req<AnnotationTag>(
      'POST',
      '/api/corpus/tags',
      {
        name: 'Explicitación',
        parentId: tags.find((x) => x.name === 'Técnicas de traducción')!.id,
      },
      201,
    );
    expect(custom.parentId).toBeTruthy();
    await req('PATCH', `/api/corpus/tags/${parent.id}`, { parentId: honorific.id }, 400);
  });
});

describe('corpus: estadísticas, exportación y versiones', () => {
  it('cuenta eojeol, palabras y caracteres, y distribuye por género y tipo de texto', async () => {
    await seedCorpus();
    const stats = await req<CorpusStats>('GET', '/api/corpus/stats');
    expect(stats).toMatchObject({ games: 2, documents: 2, segments: 9 });
    const ko = stats.languages.find((l) => l.lang === 'ko')!;
    expect(ko.tokenLabel).toBe('eojeol');
    expect(ko.texts).toBe(9);
    expect(ko.tokens).toBe(19);
    expect(stats.byGenre.find((g) => g.key === 'RPG')!.segments).toBe(6);
    expect(stats.byTextType.map((x) => x.label).sort()).toEqual(['Diálogos', 'Interfaz']);

    const freq = await req<{ rows: { token: string; count: number }[] }>(
      'GET',
      `/api/corpus/frequencies?lang=es&stopwords=true`,
    );
    expect(freq.rows[0]).toEqual({ token: 'magia', count: 2, segments: 2 });
    expect(freq.rows.some((r) => r.token === 'la')).toBe(false);
  });

  it('exporta a TMX, TXT, Excel y crea versiones citables', async () => {
    const { aether } = await seedCorpus();
    const tmx = await t.app.inject({ url: '/api/corpus/export?format=tmx' });
    expect(tmx.statusCode).toBe(200);
    expect(tmx.body).toContain('<tuv xml:lang="ko-KR"><seg>마법사가 던전에 들어갔다.</seg></tuv>');
    expect(tmx.body).toContain('<prop type="x-string-id">DLG_001</prop>');
    expect((tmx.body.match(/<tu /g) ?? []).length).toBe(8); // el segmento sin español no entra en la TMX

    const filters = encodeURIComponent(JSON.stringify({ gameIds: [aether.id] }));
    const txt = await t.app.inject({ url: `/api/corpus/export?format=txt&filters=${filters}` });
    const names = await new Promise<string[]>((resolve, reject) =>
      yauzl.fromBuffer(txt.rawPayload, { lazyEntries: true }, (err, zip) => {
        if (err || !zip) return reject(err);
        const out: string[] = [];
        zip.on('entry', (e: yauzl.Entry) => {
          out.push(e.fileName);
          zip.readEntry();
        });
        zip.on('end', () => resolve(out));
        zip.readEntry();
      }),
    );
    expect(names.sort()).toEqual([
      'Corpus 2026-10-02-es.txt',
      'Corpus 2026-10-02-ko.txt',
      'es/Crónicas de Aether.txt',
      'ko/Crónicas de Aether.txt',
    ]);

    const x = await t.app.inject({ url: '/api/corpus/export?format=xlsx' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(x.rawPayload as unknown as ArrayBuffer);
    expect(wb.worksheets[0]!.rowCount).toBe(10);

    const json = await t.app.inject({ url: '/api/corpus/export?format=json' });
    expect(JSON.parse(json.body)).toHaveLength(9);

    // Material restringido: no sale salvo que se pida.
    await req('PUT', `/api/corpus/profiles/${aether.id}`, { restricted: true });
    expect(
      JSON.parse((await t.app.inject({ url: '/api/corpus/export?format=json' })).body),
    ).toHaveLength(3);
    await req('PUT', `/api/corpus/profiles/${aether.id}`, { restricted: false });

    const v = await req<CorpusVersion>(
      'POST',
      '/api/corpus/versions',
      { name: 'v0.1', description: 'Primera versión', filters: {} },
      201,
    );
    expect(v.stats.segments).toBe(9);
    expect(v.citation).toBe(
      'Corpus de videojuegos coreano-español, versión v0.1 (02/10/2026): 2 juegos, 2 documentos y 9 segmentos.',
    );
    expect(v.attachmentId).toBeTruthy();
    const zip = await t.app.inject({ url: `/api/attachments/${v.attachmentId}/content` });
    expect(zip.statusCode).toBe(200);
    expect(zip.rawPayload.length).toBeGreaterThan(500);
    await req('POST', '/api/corpus/versions', { name: 'v0.1', filters: {} }, 400);
    await req('DELETE', `/api/corpus/versions/${v.id}`);
    expect(await req<unknown[]>('GET', '/api/corpus/versions')).toHaveLength(0);
  });

  it('un documento en la papelera no aparece en las búsquedas ni en las estadísticas', async () => {
    const { r2 } = await seedCorpus();
    await req('DELETE', `/api/corpus/documents/${r2.documentId}`);
    expect((await search({ conditions: [{ lang: 'es', query: 'turbo' }] })).total).toBe(0);
    expect((await req<CorpusStats>('GET', '/api/corpus/stats')).segments).toBe(6);
    await req('POST', '/api/trash/restore', {
      entityType: 'corpus_document',
      entityId: r2.documentId,
    });
    expect((await search({ conditions: [{ lang: 'es', query: 'turbo' }] })).total).toBe(1);
  });
});
