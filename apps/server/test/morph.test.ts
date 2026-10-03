import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConcordanceResult, FrequencyRow, MorphStatus } from '@l10n/shared';
import { createTestApp, multipart, type TestApp } from './helpers';

/**
 * Pruebas del análisis morfológico con el modelo real de Kiwi (unos 100 MB). Solo se ejecutan si
 * el modelo está disponible en L10N_KIWI_MODEL_DIR.
 */
const modelDir = process.env.L10N_KIWI_MODEL_DIR;
const available = Boolean(modelDir && fs.existsSync(path.join(modelDir, 'sj.morph')));

let t: TestApp;
beforeEach(async () => {
  t = await createTestApp();
});
afterEach(async () => {
  await t.cleanup();
});

async function req<T>(method: 'GET' | 'POST', url: string, payload?: unknown): Promise<T> {
  const res = await t.app.inject({ method, url, payload: payload as object });
  expect(res.statusCode, res.body).toBeLessThan(300);
  return res.json() as T;
}

describe('análisis morfológico del coreano', () => {
  it('sin modelo, la búsqueda por lema explica cómo instalarlo', async () => {
    if (available) return;
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/corpus/concordance',
      payload: { conditions: [{ lang: 'ko', mode: 'lemma', query: '마법사' }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('Descárgalo');
  });

  it.skipIf(!available)(
    'analiza el corpus y busca por lema y frecuencias por lema',
    async () => {
      const game = await req<{ id: string }>('POST', '/api/games', { title: 'Juego KO' });
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Textos');
      for (const r of [
        ['Korean', 'Spanish'],
        ['마법사가 던전에 들어갔다.', 'El hechicero entró en la mazmorra.'],
        ['마법사를 찾았다.', 'Encontró al hechicero.'],
        ['밥을 먹었다.', 'Comió.'],
        ['같이 먹고 싶어요.', 'Quiero comer contigo.'],
        ['흑마법사가 나타났다!', '¡Apareció un nigromante!'],
      ])
        ws.addRow(r);
      const file = Buffer.from(await wb.xlsx.writeBuffer());
      const prev = await t.app.inject({
        method: 'POST',
        url: '/api/corpus/import/preview',
        ...multipart([{ filename: 't.xlsx', content: file }]),
      });
      const p = prev.json();
      await req('POST', '/api/corpus/import/commit', {
        token: p.token,
        gameId: game.id,
        title: 'Diálogos',
        languages: p.suggested.languages,
        headerIsData: p.headerIsData,
      });

      // La importación lanza el análisis en segundo plano; se espera a que termine.
      let st = await req<MorphStatus>('POST', '/api/corpus/morph/analyze');
      for (let i = 0; i < 200 && st.analyzed < st.total; i++) {
        await new Promise((ok) => setTimeout(ok, 100));
        st = await req<MorphStatus>('GET', '/api/corpus/morph');
      }
      expect(st).toMatchObject({ installed: true, total: 5, analyzed: 5 });

      // «마법사» encuentra 마법사가 y 마법사를, y también el compuesto 흑마법사 (Kiwi lo separa).
      const r1 = await req<ConcordanceResult>('POST', '/api/corpus/concordance', {
        conditions: [{ lang: 'ko', mode: 'lemma', query: '마법사' }],
      });
      expect(r1.hits.map((h) => h.match).sort()).toEqual(['마법사가', '마법사를', '흑마법사가']);
      // «먹다» encuentra 먹었다 y 먹고.
      const r2 = await req<ConcordanceResult>('POST', '/api/corpus/concordance', {
        conditions: [{ lang: 'ko', mode: 'lemma', query: '먹다' }],
      });
      expect(r2.hits.map((h) => h.match).sort()).toEqual(['먹고', '먹었다']);
      // Combinado con una condición en español.
      const r3 = await req<ConcordanceResult>('POST', '/api/corpus/concordance', {
        conditions: [
          { lang: 'ko', mode: 'lemma', query: '먹었어요' },
          { lang: 'es', mode: 'text', query: 'quiero' },
        ],
      });
      expect(r3.total).toBe(1);

      const freq = await req<{ rows: FrequencyRow[] }>(
        'GET',
        '/api/corpus/frequencies?lang=ko&unit=lemma&stopwords=true',
      );
      const top = Object.fromEntries(freq.rows.map((r) => [`${r.token}/${r.tag}`, r.count]));
      expect(top['마법사/NNG']).toBe(3);
      expect(top['먹다/VV']).toBe(2);
      expect(freq.rows.some((r) => r.tag?.startsWith('J'))).toBe(false);

      // Editar el texto invalida su análisis y lo vuelve a analizar en segundo plano.
      const seg = r1.hits[0]!.segmentId;
      await t.app.inject({
        method: 'PATCH',
        url: `/api/corpus/segments/${seg}`,
        payload: { texts: { ko: '전사가 들어갔다.' } },
      });
      let r4: ConcordanceResult | null = null;
      for (let i = 0; i < 100; i++) {
        r4 = await req<ConcordanceResult>('POST', '/api/corpus/concordance', {
          conditions: [{ lang: 'ko', mode: 'lemma', query: '전사' }],
        });
        if (r4.total) break;
        await new Promise((ok) => setTimeout(ok, 100));
      }
      expect(r4!.hits.map((h) => h.match)).toEqual(['전사가']);
      expect(await req<MorphStatus>('GET', '/api/corpus/morph')).toMatchObject({ analyzed: 5 });
    },
    120_000,
  );
});
