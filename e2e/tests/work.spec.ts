import { expect, test, type Page } from '@playwright/test';

async function openApp(page: Page, hash = '#/') {
  await page.goto(hash);
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('flujo completo: cliente → proyecto → encargo con análisis CAT → entregado', async ({
  page,
}) => {
  await openApp(page, '#/trabajo/clientes');
  await page.getByTestId('new-client').click();
  await page.getByLabel('Nombre').fill('Agencia E2E');
  await page.getByRole('button', { name: 'Crear cliente' }).click();
  await expect(page.getByRole('heading', { name: 'Agencia E2E' })).toBeVisible();

  // Tarifa del cliente: 0,05 por palabra
  await page.getByRole('tab', { name: /Tarifas/ }).click();
  await page.getByTestId('new-rate').click();
  await page.getByTestId('rate-value').fill('0,05');
  await page.getByTestId('rate-value').blur();
  await page.getByRole('button', { name: 'Guardar tarifa' }).click();
  await expect(page.getByText('0,05')).toBeVisible();

  // Proyecto con un juego creado sobre la marcha
  await page.getByTestId('nav-/trabajo/proyectos').click();
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-client').click();
  await page.getByRole('option', { name: 'Agencia E2E' }).click();
  await page.getByTestId('project-game').click();
  await page.getByPlaceholder('Buscar…').fill('Juego E2E');
  await page.getByRole('option', { name: /Crear «Juego E2E»/ }).click();
  await page.getByLabel('Nombre del proyecto').fill('Proyecto E2E');
  await page.getByTestId('create-project').click();
  await expect(page.getByRole('heading', { name: 'Proyecto E2E' })).toBeVisible();

  // Encargo con plantilla de tareas
  await page.getByTestId('project-new-job').click();
  await page.getByLabel('Título').fill('Parche 1.0');
  await page.getByTestId('job-due').fill('2030-01-15');
  await page.getByTestId('create-job').click();
  await expect(page.getByRole('heading', { name: 'Parche 1.0' })).toBeVisible();
  await expect(page.getByText('Control de calidad (QA)')).toBeVisible();

  // Análisis por coincidencias: 1000 nuevas + 400 al 100 % (25 %) = 1100 ponderadas × 0,05 = 55 €
  await page.getByTestId('toggle-analysis').click();
  await page.getByTestId('band-new').fill('1000');
  await page.getByTestId('band-new').blur();
  await page.getByTestId('band-m100').fill('400');
  await page.getByTestId('band-m100').blur();
  await expect(page.getByTestId('weighted-total')).toHaveText('1100');
  await expect(page.getByTestId('job-amount')).toHaveText(/55,00/);

  // Entregado
  await page.getByTestId('job-status').selectOption('delivered');
  await expect(page.getByTestId('job-status')).toHaveValue('delivered');
  await page.getByTestId('nav-/').click();
  await expect(page.getByText('Pendiente de facturar').first()).toBeVisible();
  await expect(page.getByText('55,00').first()).toBeVisible();
});

test('tareas: alta rápida, completar y tablero', async ({ page }) => {
  await openApp(page, '#/trabajo/tareas');
  await page.getByTestId('task-quick-add').fill('Llamar a la agencia mañana !');
  await page.getByTestId('task-quick-add').press('Enter');
  const row = page.getByTestId('task-row').filter({ hasText: 'Llamar a la agencia' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Mañana');

  // Panel lateral: cambiar el título
  await row.getByText('Llamar a la agencia').click();
  await page.getByTestId('task-title').fill('Llamar a la agencia por el glosario');
  await page.getByTestId('task-title').blur();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('task-row').filter({ hasText: 'por el glosario' })).toBeVisible();

  // Completar
  await page
    .getByTestId('task-row')
    .filter({ hasText: 'por el glosario' })
    .getByRole('checkbox')
    .click();
  await expect(page.getByTestId('task-row').filter({ hasText: 'por el glosario' })).toHaveCount(0);

  // Tablero
  await page.getByTestId('view-board').click();
  await expect(page.getByTestId('kanban-column-Hecha')).toContainText('por el glosario');
});

test('cronómetro de la barra superior', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('timer-open').click();
  await page.getByTestId('timer-start').click();
  await expect(page.getByTestId('timer-running')).toBeVisible();
  await page.getByTestId('timer-stop').click();
  await expect(page.getByTestId('timer-open')).toBeVisible();
  await page.getByTestId('nav-/trabajo/tiempo').click();
  await expect(page.getByText('Sin asignar').first()).toBeVisible();
});

test('importa tareas desde un CSV de ClickUp y deshace la importación', async ({ page }) => {
  await openApp(page, '#/ajustes?tab=importar');
  await page.getByTestId('import-target').selectOption('tasks');
  await page.getByTestId('import-file').setInputFiles({
    name: 'clickup.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Task ID,Task Name,Status,List Name\nx1,Tarea importada uno,to do,Importadas\nx2,Tarea importada dos,complete,Importadas\n',
    ),
  });
  await page.getByTestId('import-commit').click();
  await expect(page.getByTestId('import-result')).toContainText('2');
  await page.getByTestId('nav-/trabajo/tareas').click();
  await page.getByRole('tab', { name: 'Lista' }).click();
  await expect(page.getByText('Tarea importada uno')).toBeVisible();

  await page.goto('#/ajustes?tab=importar');
  await page.getByRole('button', { name: 'Deshacer' }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByRole('cell', { name: 'Deshecha', exact: true })).toBeVisible();
});
