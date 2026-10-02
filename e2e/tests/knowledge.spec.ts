import { expect, test, type Page } from '@playwright/test';

async function openApp(page: Page, hash = '#/') {
  await page.goto(hash);
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('páginas: crear, escribir con menciones y aviso, guardar y recuperar', async ({
  page,
  request,
}) => {
  const game = await (
    await request.post('/api/games', { data: { title: 'Juego Páginas E2E' } })
  ).json();
  await openApp(page, '#/paginas');
  await page.getByTestId('new-page').click();
  await page.getByTestId('page-title').fill('Notas E2E');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Ver ');
  await page.keyboard.type('@Juego Páginas');
  await expect(page.getByText('Juego Páginas E2E').last()).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/aviso');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Revisar los honoríficos');
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved', {
    timeout: 10_000,
  });

  // Al volver a abrir la página, el contenido sigue ahí.
  await page.reload();
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
  await expect(page.getByTestId('page-title')).toHaveValue('Notas E2E');
  await expect(page.getByText('Revisar los honoríficos')).toBeVisible();
  await expect(page.getByText('@Juego Páginas E2E')).toBeVisible();

  // La ficha del juego muestra la página que lo menciona.
  await openApp(page, `#/trabajo/juegos/${game.id}?tab=conocimiento`);
  await expect(page.getByRole('button', { name: /Notas E2E/ })).toBeVisible();
});

test('páginas: plantilla de guía de estilo vinculada al juego', async ({ page, request }) => {
  const game = await (
    await request.post('/api/games', { data: { title: 'Juego Guía E2E' } })
  ).json();
  await openApp(page, `#/trabajo/juegos/${game.id}?tab=conocimiento`);
  await page.getByTestId('new-style-guide').click();
  await expect(page.getByTestId('page-title')).toHaveValue('Guía de estilo');
  await expect(page.getByRole('heading', { name: 'Tratamiento del jugador' })).toBeVisible();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved', {
    timeout: 10_000,
  });
});

test('tablas: crear, añadir columna, editar celdas y totales', async ({ page }) => {
  await openApp(page, '#/tablas');
  await page.getByTestId('new-table').click();
  await page.getByTestId('table-name').fill('Tarifas E2E');
  await page.getByTestId('create-table').click();
  await expect(page.getByTestId('table-title')).toHaveText('Tarifas E2E');

  await page.getByTestId('add-column').click();
  await page.getByTestId('column-name').fill('Palabras');
  await page.getByTestId('column-type').selectOption('number');
  await page.getByTestId('column-save').click();
  await expect(page.getByTestId('col-Palabras')).toBeVisible();

  for (const [i, [name, words]] of [
    ['Agencia A', '1.200'],
    ['Agencia B', '800'],
  ].entries() as IterableIterator<[number, [string, string]]>) {
    await page.getByTestId('add-row').click();
    await expect(page.getByTestId('grid-row')).toHaveCount(i + 1);
    const row = page.getByTestId('grid-row').nth(i);
    await row.locator('[data-col="Nombre"]').click();
    await page.keyboard.type(name);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.type(words);
    await page.keyboard.press('Enter');
    await expect(row.locator('[data-col="Palabras"]')).toContainText(
      words === '800' ? '800' : '1200',
    );
  }
  // Total de la columna
  await page.locator('button:has-text("Calcular")').nth(2).click({ force: true });
  await page.getByRole('menuitem', { name: 'Suma' }).click();
  await expect(page.getByTestId('total-Palabras')).toHaveText('2000');

  // Buscar filtra las filas
  await page.getByTestId('table-search').fill('agencia b');
  await expect(page.getByTestId('grid-row')).toHaveCount(1);
});

test('glosario del juego: añadir términos', async ({ page, request }) => {
  const game = await (
    await request.post('/api/games', { data: { title: 'Juego Glosario E2E' } })
  ).json();
  await openApp(page, `#/trabajo/juegos/${game.id}?tab=glosario`);
  await page.getByTestId('term-ko').fill('마법사');
  await page.getByTestId('term-es').fill('hechicero');
  await page.getByTestId('term-add').click();
  await expect(page.getByTestId('glossary-table')).toContainText('마법사');
  await expect(page.getByTestId('glossary-table')).toContainText('hechicero');

  await page.getByRole('tab', { name: 'Personajes' }).click();
  await page.getByTestId('new-character').click();
  await page.getByTestId('character-name').fill('Seo-yeon');
  await page.getByTestId('character-save').click();
  await expect(page.getByText('Seo-yeon')).toBeVisible();
});
