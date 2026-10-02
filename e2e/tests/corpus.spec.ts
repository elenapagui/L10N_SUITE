import { expect, test, type Page } from '@playwright/test';

async function openApp(page: Page, hash = '#/') {
  await page.goto(hash);
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

const CSV = [
  'ID,Hablante,Coreano,Español',
  'E2E_001,서연,마법사가 던전에 들어갔다.,La hechicera entró en la mazmorra.',
  'E2E_002,서연,<color=#f00>스킬</color>을 배웠다.,Has aprendido una habilidad.',
  'E2E_003,무혁,{0}님 마법을 쓰세요!,"¡{0}, usa la magia!"',
].join('\n');

test('corpus: importar un Excel/CSV KO-ES, buscar, anotar y exportar', async ({
  page,
  request,
}) => {
  await request.post('/api/games', { data: { title: 'Juego Corpus E2E', genres: ['RPG'] } });

  // Añadir el juego al corpus
  await openApp(page, '#/corpus');
  await page.getByTestId('corpus-new-game').click();
  await page.getByTestId('corpus-add-game-select').click();
  await page.getByRole('option', { name: /Juego Corpus E2E/ }).click();
  await page.getByTestId('corpus-add-game').click();
  await expect(page.getByRole('heading', { name: 'Juego Corpus E2E' })).toBeVisible();

  // Importar los textos
  await page.getByTestId('corpus-import-texts').click();
  await page
    .getByTestId('corpus-file-input')
    .setInputFiles({ name: 'dialogos.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await expect(page.getByTestId('corpus-role-2')).toHaveValue('lang:ko');
  await expect(page.getByTestId('corpus-role-3')).toHaveValue('lang:es');
  await expect(page.getByTestId('corpus-role-0')).toHaveValue('stringId');
  await page.getByTestId('corpus-import-commit').click();
  await expect(page.getByText('3 segmentos importados.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver el documento' }).click();
  await expect(page.getByTestId('corpus-segment')).toHaveCount(3);
  // Las etiquetas de formato se han quitado al importar.
  await expect(page.getByTestId('corpus-segment').nth(1)).toContainText('스킬을 배웠다.');

  // Anotar un fragmento: seleccionar «님» en el tercer segmento.
  const ko = page.getByTestId('corpus-segment').nth(2).getByTestId('seg-text-ko');
  await ko.evaluate((el) => {
    const text = el.textContent ?? '';
    const i = text.indexOf('님');
    const node = el.firstChild!.firstChild!;
    const range = document.createRange();
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.getByTestId('annotate-selection').click();
  await page.getByRole('button', { name: /Sufijos honoríficos/ }).click();
  await page.getByTestId('annotation-comment').fill('Se omite el honorífico');
  await page.getByTestId('annotation-save').click();
  await expect(page.getByRole('button', { name: /Sufijos honoríficos.*«님»/ })).toBeVisible();

  // Buscar en el concordanciador
  await page.getByTestId('nav-/corpus/concordancias').click();
  await page.getByTestId('cond-query-0').fill('마법');
  await page.getByTestId('concordance-search').click();
  await expect(page.getByTestId('concordance-total')).toContainText('2 coincidencias');
  await expect(page.getByTestId('kwic-row')).toHaveCount(2);
  // Español sin tilde
  await page.getByTestId('cond-lang-0').selectOption('es');
  await page.getByTestId('cond-query-0').fill('MAZMORRA');
  await page.getByTestId('concordance-search').click();
  await expect(page.getByTestId('concordance-total')).toContainText('1 coincidencia');

  // Exportar a TMX y TXT
  const tmx = await request.get('/api/corpus/export?format=tmx');
  expect(await tmx.text()).toContain('<seg>La hechicera entró en la mazmorra.</seg>');
  const txt = await request.get('/api/corpus/export?format=txt');
  expect(txt.headers()['content-type']).toContain('zip');

  // Estadísticas
  await openApp(page, '#/corpus?tab=estadisticas');
  await expect(page.getByTestId('corpus-kpis')).toContainText('3');
});
