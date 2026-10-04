import { expect, test, type Page } from '@playwright/test';

async function openApp(page: Page, hash = '#/') {
  await page.goto(hash);
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('candidaturas: de la oferta a la prueba, el calendario y el nuevo cliente', async ({
  page,
}) => {
  await openApp(page, '#/empleo');
  await page.getByTestId('new-application').click();
  await page.getByTestId('application-title').fill('Traductora KO-ES de videojuegos');
  await page.getByTestId('application-company').fill('Agencia Candidatura E2E');
  await page.getByTestId('application-create').click();

  await expect(
    page.getByRole('heading', { name: 'Traductora KO-ES de videojuegos' }),
  ).toBeVisible();
  await expect(page.getByTestId('application-status')).toHaveValue('applied');
  await expect(page.getByTestId('application-timeline')).toContainText('Solicitud enviada');

  // Prueba recibida con plazo hoy: el estado pasa a «Prueba».
  const today = iso(new Date());
  await page.getByTestId('step-kind').selectOption('test_received');
  await page.getByTestId('step-due').fill(today);
  await page.getByTestId('step-add').click();
  await expect(page.getByTestId('application-timeline')).toContainText('Prueba recibida');
  await expect(page.getByTestId('application-status')).toHaveValue('test');

  // En el calendario aparece el plazo de la prueba.
  await page.getByTestId('nav-/calendario').click();
  await page.getByText('Entregar la prueba: Agencia Candidatura E2E').first().click();
  await expect(
    page.getByRole('heading', { name: 'Traductora KO-ES de videojuegos' }),
  ).toBeVisible();

  // Aceptada, con la tarifa acordada, pasa a cliente.
  await page.getByTestId('application-status').selectOption('accepted');
  await expect(page.getByTestId('application-timeline')).toContainText('Cambio de estado');
  await page.getByTestId('application-rate').fill('0,07');
  await page.getByTestId('application-rate').press('Enter');
  await page.getByTestId('application-rate-unit').selectOption('char');
  await page.getByTestId('application-to-client').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Crear cliente' }).click();
  await expect(page.getByRole('heading', { name: 'Agencia Candidatura E2E' })).toBeVisible();

  // En el tablero, la candidatura está en «Aceptada».
  await page.getByTestId('nav-/empleo').click();
  await expect(page.getByTestId('column-accepted').getByTestId('application-card')).toContainText(
    'Agencia Candidatura E2E',
  );
});
