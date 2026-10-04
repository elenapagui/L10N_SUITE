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

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test.describe.configure({ mode: 'serial' });

test('encargos: tarjetas, tablero (mover de estado), agrupada, línea de tiempo y periodo', async ({
  page,
  request,
}) => {
  const client = await post(request, '/api/clients', { name: 'Cliente Vistas E2E' });
  const project = await post(request, '/api/projects', {
    name: 'Proyecto Vistas E2E',
    clientId: client.id,
  });
  const today = new Date();
  const thisMonth = iso(today);
  const lastYear = iso(new Date(today.getFullYear() - 1, today.getMonth(), 15));
  await post(request, '/api/jobs', {
    projectId: project.id,
    title: 'Vistas: encargo de este mes',
    unit: 'flat',
    rateMicros: 100_000_000,
    dueDate: thisMonth,
  });
  await post(request, '/api/jobs', {
    projectId: project.id,
    title: 'Vistas: encargo del año pasado',
    unit: 'flat',
    rateMicros: 40_000_000,
    dueDate: lastYear,
  });

  await openApp(page, '#/trabajo/encargos');
  await page.getByRole('tab', { name: 'Todos' }).click();
  await page.getByPlaceholder('Filtrar…').fill('Vistas:');

  // Tarjetas.
  await page.getByTestId('view-cards').click();
  await expect(page.getByTestId('view-card')).toHaveCount(2);

  // Tablero: se arrastra a «En curso».
  await page.getByTestId('view-board').click();
  const card = page
    .getByTestId('board-column-received')
    .getByTestId('board-card')
    .filter({ hasText: 'encargo de este mes' });
  const target = page.getByTestId('board-column-in_progress');
  const from = (await card.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 10 });
  await page.mouse.up();
  await expect(
    page.getByTestId('board-column-in_progress').getByText('Vistas: encargo de este mes'),
  ).toBeVisible();
  const res = await request.get('/api/jobs?status=in_progress');
  expect(((await res.json()) as { title: string }[]).map((j) => j.title)).toContain(
    'Vistas: encargo de este mes',
  );

  // Agrupada por cliente, con su subtotal.
  await page.getByTestId('view-grouped').click();
  await page.getByTestId('group-by').selectOption('client');
  await expect(
    page
      .getByTestId('group')
      .filter({ hasText: 'Cliente Vistas E2E' })
      .getByTestId('group-subtotal'),
  ).toContainText('2 encargos');

  // Línea de tiempo.
  await page.getByTestId('view-timeline').click();
  await expect(page.getByTestId('timeline-bar')).toHaveCount(2);

  // Periodo «Mes»: solo el encargo de este mes y su importe en el pie.
  await page.getByTestId('view-table').click();
  await page.getByTestId('period-kind').selectOption('month');
  await expect(
    page.getByTestId('jobs-table').getByText('Vistas: encargo de este mes'),
  ).toBeVisible();
  await expect(page.getByText('Vistas: encargo del año pasado')).toHaveCount(0);
  await expect(page.getByTestId('jobs-totals')).toContainText('1 encargo');
  await expect(page.getByTestId('jobs-totals')).toContainText('100,00');
  // El periodo anterior del mismo tipo.
  await page.getByRole('button', { name: 'Periodo anterior' }).click();
  await expect(page.getByText('Vistas: encargo de este mes')).toHaveCount(0);
  await page.getByTestId('period-kind').selectOption('all');

  // En la ficha del proyecto, también por periodos.
  await page.goto(`#/trabajo/proyectos/${project.id}`);
  await expect(page.getByTestId('period-stats')).toContainText('2');
  await page.getByTestId('period-kind').selectOption('year');
  await expect(page.getByTestId('period-stats')).toContainText('100,00');
  await page.getByTestId('period-kind').selectOption('all');
});
