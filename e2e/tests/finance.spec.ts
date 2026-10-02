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

test('facturación: encargo entregado → factura registrada → cobrada', async ({ page, request }) => {
  const client = await post(request, '/api/clients', {
    name: 'Cliente Finanzas E2E',
    currency: 'EUR',
    vatPct: 21,
    irpfPct: 15,
  });
  const project = await post(request, '/api/projects', {
    name: 'Proyecto Finanzas E2E',
    clientId: client.id,
  });
  const job = await post(request, '/api/jobs', {
    projectId: project.id,
    title: 'Traducción de la ficha de tienda',
    unit: 'word',
    volume: 1000,
    rateMicros: 50_000,
  });
  const res = await request.patch(`/api/jobs/${job.id}`, { data: { status: 'delivered' } });
  expect(res.ok()).toBeTruthy();

  await openApp(page, '#/finanzas/facturas');
  const group = page.getByTestId('pending-group').filter({ hasText: 'Cliente Finanzas E2E' });
  await expect(group).toContainText('50,00');
  await group.getByTestId('register-invoice').click();

  // 1000 palabras × 0,05 = 50 € + 21 % IVA − 15 % IRPF = 53 €
  await expect(page.getByTestId('invoice-number')).not.toHaveValue('');
  await page.getByTestId('invoice-number').fill('E2E-001');
  await expect(page.getByTestId('invoice-total')).toHaveText(/53,00/);
  await page.getByTestId('invoice-save').click();
  await expect(group).toHaveCount(0);

  await page.getByRole('tab', { name: 'Facturas', exact: true }).click();
  await page
    .getByTestId('invoices-table')
    .getByRole('cell', { name: 'E2E-001', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Factura E2E-001' })).toBeVisible();
  await expect(page.getByText('Emitida').first()).toBeVisible();
  await page.getByTestId('invoice-pay').click();
  await expect(page.getByText('Cobrada', { exact: true }).first()).toBeVisible();

  // El encargo queda como cobrado
  const jobAfter = await (await request.get(`/api/jobs/${job.id}`)).json();
  expect(jobAfter.billingStatus).toBe('paid');
});

test('gastos e informes', async ({ page, request }) => {
  await openApp(page, '#/finanzas/gastos');
  await page.getByTestId('new-expense').click();
  await page.getByTestId('expense-concept').fill('Licencia de software E2E');
  await page.getByTestId('expense-base').fill('100');
  await page.getByTestId('expense-base').blur();
  await page.getByTestId('expense-save').click();
  await expect(page.getByRole('heading', { name: 'Justificante' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('expenses-table')).toContainText('Licencia de software E2E');
  await expect(page.getByTestId('expenses-table')).toContainText('121,00');

  await openApp(page, '#/finanzas/informes');
  await expect(page.getByTestId('finance-kpis')).toContainText('Facturado');
  await expect(
    page.getByTestId('monthly-chart').getByRole('img', { name: /Facturado y gastos/ }),
  ).toBeVisible();
  // Vista de tabla del gráfico (accesible)
  await page.getByTestId('monthly-chart').getByRole('button', { name: 'Ver como tabla' }).click();
  await expect(page.getByTestId('monthly-chart').getByRole('table')).toBeVisible();
  await expect(page.getByTestId('model-303')).toBeVisible();

  // Previsión de cobros: un encargo entregado y sin facturar aparece como partida.
  const client = await (
    await request.post('/api/clients', {
      data: { name: 'Cliente previsión', paymentTermsDays: 30, vatPct: 21, irpfPct: 15 },
    })
  ).json();
  const project = await (
    await request.post('/api/projects', { data: { name: 'Previsión', clientId: client.id } })
  ).json();
  const job = await (
    await request.post('/api/jobs', {
      data: {
        projectId: project.id,
        title: 'Entrega para la previsión',
        unit: 'flat',
        rateMicros: 100_000_000,
      },
    })
  ).json();
  await request.patch(`/api/jobs/${job.id}`, { data: { status: 'delivered' } });
  await page.reload();
  const forecast = page.getByTestId('forecast');
  await expect(forecast.getByText('Previsión de cobros')).toBeVisible();
  await forecast.getByText(/Ver las \d+ partidas/).click();
  await expect(page.getByTestId('forecast-items')).toContainText('Entrega para la previsión');
  // 100 € + 21 % IVA − 15 % IRPF
  await expect(page.getByTestId('forecast-items')).toContainText('106,00');
});
