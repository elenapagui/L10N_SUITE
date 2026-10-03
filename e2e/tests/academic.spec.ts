import { expect, test, type Page } from '@playwright/test';

async function openApp(page: Page, hash = '#/') {
  await page.goto(hash);
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

const BIB = `@article{mangiron2006,
  author = {Mangiron, Carme and O'Hagan, Minako},
  title = {Game Localisation: Unleashing Imagination with {\\textquoteleft}Restricted{\\textquoteright} Translation},
  journal = {The Journal of Specialised Translation},
  year = {2006},
  number = {6},
  pages = {10--21}
}
@book{bernal2015,
  author = {Bernal-Merino, Miguel {\\'A}.},
  title = {Translation and Localisation in Video Games},
  publisher = {Routledge},
  year = {2015},
  doi = {10.4324/9781315752334}
}`;

test('biblioteca: importar BibTeX, evitar duplicados, citar en APA y anotar', async ({ page }) => {
  await openApp(page, '#/academico/biblioteca');
  await page.getByTestId('add-reference').click();
  await page.getByTestId('add-paste').click();
  await page.getByTestId('paste-input').fill(BIB);
  await page.getByTestId('paste-import').click();
  await expect(page.getByText('2 referencias añadidas')).toBeVisible();
  await expect(page.getByTestId('library-row')).toHaveCount(2);

  // La misma importación otra vez no duplica nada.
  await page.getByTestId('add-reference').click();
  await page.getByTestId('add-paste').click();
  await page.getByTestId('paste-input').fill(BIB);
  await page.getByTestId('paste-import').click();
  await expect(page.getByText('2 ya estaban en la biblioteca')).toBeVisible();
  await expect(page.getByTestId('library-row')).toHaveCount(2);

  // Búsqueda y ficha con la referencia en APA 7.
  await page.getByTestId('library-search').fill('Bernal');
  await expect(page.getByTestId('library-row')).toHaveCount(1);
  await page.getByTestId('library-row').click();
  const apa = page.getByTestId('ref-apa');
  await expect(apa).toContainText('Bernal-Merino, M. Á. (2015).');
  await expect(apa.locator('i')).toContainText('Translation and Localisation in Video Games');
  await expect(apa).toContainText('https://doi.org/10.4324/9781315752334');

  // Cita textual con página.
  await page.getByRole('tab', { name: 'Lectura y citas' }).click();
  await page.getByTestId('quote-text').fill('La localización es una actividad creativa.');
  await page.getByPlaceholder('Página', { exact: true }).fill('42');
  await page.getByTestId('quote-add').click();
  await expect(page.getByText('La localización es una actividad creativa.')).toBeVisible();
});

test('ficha: se puede escribir la autoría y el borrador sobrevive a la valoración', async ({
  page,
}) => {
  await openApp(page, '#/academico/biblioteca');
  await page.getByTestId('library-search').fill('Bernal');
  await expect(page.getByTestId('library-row')).toHaveCount(1);
  await page.getByTestId('library-row').click();
  const authors = page.getByTestId('ref-authors');
  await authors.fill('');
  await authors.pressSequentially('Bernal-Merino, Miguel Ángel\nKim, Ji-hye');
  await expect(authors).toHaveValue('Bernal-Merino, Miguel Ángel\nKim, Ji-hye');

  // Valorar la referencia no borra lo que se está escribiendo en la ficha.
  await page.getByRole('tab', { name: 'Lectura y citas' }).click();
  await page.getByRole('button', { name: '4 estrellas' }).click();
  await expect(page.getByRole('dialog').getByLabel('Valoración: 4 de 5')).toBeVisible();
  await page.getByRole('tab', { name: 'Ficha' }).click();
  await expect(page.getByTestId('ref-authors')).toHaveValue(
    'Bernal-Merino, Miguel Ángel\nKim, Ji-hye',
  );
  await page.getByTestId('ref-save').click();
  await expect(page.getByTestId('ref-apa')).toContainText('Bernal-Merino, M. Á. y Kim, J.');
});

test('publicaciones: de la idea al envío con bibliografía y tareas', async ({ page, request }) => {
  await request.post('/api/journals', {
    data: { name: 'Revista E2E de Traducción', indexing: ['Scopus'] },
  });

  await openApp(page, '#/academico/publicaciones');
  await page.getByTestId('new-publication').click();
  await page.getByTestId('publication-title').fill('Honoríficos coreanos en los juegos gacha');
  await page.getByTestId('publication-create').click();
  await expect(
    page.getByRole('heading', { name: 'Honoríficos coreanos en los juegos gacha' }),
  ).toBeVisible();
  await expect(page.getByTestId('publication-status')).toHaveValue('idea');

  // Bibliografía desde la biblioteca, ordenada en APA.
  await page.getByTestId('tab-bibliography').click();
  await page.getByTestId('add-bibliography').click();
  await page.getByRole('dialog').getByRole('checkbox').first().check();
  await page.getByRole('dialog').getByRole('checkbox').nth(1).check();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Añadir/ })
    .click();
  await expect(page.getByTestId('bibliography').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('bibliography').locator('li').first()).toContainText(
    'Bernal-Merino',
  );

  // Una tarea vinculada.
  await page.getByRole('tab', { name: 'Tareas' }).click();
  await page.getByTestId('task-quick-add').fill('Redactar la introducción');
  await page.getByTestId('task-quick-add').press('Enter');
  await expect(page.getByText('Redactar la introducción')).toBeVisible();

  // Envío a una revista; la decisión cambia el estado de la publicación.
  await page.getByRole('tab', { name: /Envíos/ }).click();
  await page.getByTestId('new-submission').click();
  await page.getByTestId('submission-journal').click();
  await page.getByRole('option', { name: 'Revista E2E de Traducción' }).click();
  await page.getByTestId('submission-save').click();
  await expect(page.getByTestId('submission-row')).toHaveCount(1);
  await expect(page.getByTestId('publication-status')).toHaveValue('submitted');

  await page.getByTestId('submission-row').getByRole('button', { name: 'Editar' }).click();
  await page.getByTestId('submission-decision').selectOption('minor');
  await page.getByTestId('submission-save').click();
  await expect(page.getByTestId('publication-status')).toHaveValue('revisions');

  // En el tablero aparece en «Cambios solicitados».
  await page.getByRole('link', { name: 'Publicaciones' }).first().click();
  await expect(
    page.getByTestId('publication-card').filter({ hasText: 'Honoríficos coreanos' }),
  ).toBeVisible();

  // Y la revista ya cuenta el envío.
  await page.getByTestId('nav-/academico/revistas').click();
  await expect(page.getByRole('row', { name: /Revista E2E de Traducción/ })).toContainText('1');
});
