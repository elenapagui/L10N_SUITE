import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

async function openApp(page: Page, hash = '#/') {
  await page.goto(hash);
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
}

async function post<T = { id: string }>(
  request: APIRequestContext,
  url: string,
  data: unknown,
): Promise<T> {
  const res = await request.post(url, { data });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as T;
}

test.describe.configure({ mode: 'serial' });

test('encargo: al poner la fecha de entrega, la hora se pone a las 23:59', async ({
  page,
  request,
}) => {
  const client = await post(request, '/api/clients', { name: 'Cliente Hora E2E' });
  const project = await post(request, '/api/projects', {
    name: 'Proyecto Hora E2E',
    clientId: client.id,
  });
  const job = await post(request, '/api/jobs', { projectId: project.id, title: 'Parche 23:59' });
  await openApp(page, `#/trabajo/encargos/${job.id}`);
  await page.getByTestId('job-detail-due').fill('2026-12-15');
  await expect(page.getByTestId('job-detail-due-time')).toHaveValue('23:59');
  // Se puede quitar y volver a poner con el botón.
  await page.getByRole('button', { name: 'Quitar la hora' }).click();
  await expect(page.getByTestId('job-detail-due-time')).toHaveValue('');
  await page.getByTestId('job-detail-due-time-preset').click();
  await expect(page.getByTestId('job-detail-due-time')).toHaveValue('23:59');
});

test('bancos: cuenta, gasto con su banco y «Cargar»', async ({ page }) => {
  await openApp(page, '#/finanzas/bancos');
  await page.getByTestId('new-bank').click();
  await page.getByTestId('bank-name').fill('Cuenta autónomos E2E');
  await page.getByTestId('bank-bank').fill('Banco Ejemplo');
  await page.getByTestId('bank-number').fill('ES1234567890123456789012');
  await page.getByTestId('bank-balance').fill('1.000,00');
  await page.getByTestId('bank-balance').press('Enter');
  await page.getByTestId('bank-save').click();
  const card = page.getByTestId('bank-card').filter({ hasText: 'Cuenta autónomos E2E' });
  await expect(card).toContainText('ES12 •••• 9012');
  await expect(card.getByTestId('bank-card-balance')).toHaveText(/1000,00/);

  // Gasto: la cuenta principal se elige sola; el saldo no cambia hasta «Cargar».
  await page.getByTestId('nav-/finanzas/gastos').click();
  await page.getByTestId('new-expense').click();
  await page.getByTestId('expense-concept').fill('Licencia memoQ E2E');
  await page.getByTestId('expense-base').fill('100');
  await page.getByTestId('expense-base').press('Enter');
  await expect(page.getByTestId('expense-bank')).not.toHaveValue('');
  await page.getByTestId('expense-save').click();
  await page.getByRole('button', { name: 'Cerrar' }).click();
  const row = page.getByRole('row', { name: /Licencia memoQ E2E/ });
  await row.getByTestId('expense-charge').click();
  await expect(row).toContainText('Cargado el');

  await page.getByTestId('nav-/finanzas/bancos').click();
  // 1000 − 121 (100 + 21 % de IVA) = 879
  await expect(card.getByTestId('bank-card-balance')).toHaveText(/879,00/);
  await expect(page.getByTestId('bank-movements')).toContainText('Cargo');
});

test('gastos recurrentes: «Se repite» y la pestaña de recurrentes', async ({ page }) => {
  await openApp(page, '#/finanzas/gastos');
  await page.getByTestId('new-expense').click();
  await page.getByTestId('expense-concept').fill('Netflix E2E');
  await page.getByTestId('expense-base').fill('10,74');
  await page.getByTestId('expense-base').press('Enter');
  await page.getByTestId('expense-repeat').click();
  await page.getByTestId('expense-frequency').selectOption('monthly');
  await page.getByTestId('expense-save').click();
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('row', { name: /Netflix E2E/ })).toHaveCount(1);

  await page.getByTestId('tab-recurring').click();
  const rec = page.getByTestId('recurring-table').getByRole('row', { name: /Netflix E2E/ });
  await expect(rec).toContainText('Cada mes');
  await expect(rec).toContainText('13,00');
});
