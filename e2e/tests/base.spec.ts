import { expect, test, type Page } from '@playwright/test';

async function openApp(page: Page, hash = '#/') {
  await page.goto(hash);
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
}

test('muestra el inicio y navega por la barra lateral', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Buen(os|as)/);
  await page.getByTestId('nav-/trabajo/proyectos').click();
  await expect(page.getByRole('heading', { name: 'Proyectos' })).toBeVisible();
  await page.getByTestId('nav-/paginas').click();
  await expect(page.getByText('Esta sección está en construcción')).toBeVisible();
  await page.getByTestId('nav-/ajustes').click();
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
});

test('gestiona etiquetas, papelera y búsqueda global', async ({ page }) => {
  await openApp(page, '#/ajustes?tab=etiquetas');
  await page.getByTestId('tag-name').fill('Urgente');
  await page.getByRole('button', { name: 'Añadir' }).click();
  await page.getByTestId('tag-name').fill('마법사');
  await page.getByRole('button', { name: 'Añadir' }).click();
  await expect(page.getByTestId('tag-row')).toHaveCount(2);

  // Búsqueda global con Ctrl+K (en coreano y sin tildes)
  await page.keyboard.press('Control+k');
  await page.getByTestId('command-input').fill('마법');
  await expect(page.getByRole('option', { name: /마법사/ })).toBeVisible();
  await page.keyboard.press('Escape');

  // Enviar a la papelera y deshacer
  await page
    .getByTestId('tag-row')
    .filter({ hasText: 'Urgente' })
    .getByRole('button', { name: 'Eliminar etiqueta' })
    .click();
  await expect(page.getByTestId('tag-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByTestId('tag-row')).toHaveCount(2);

  // Enviar a la papelera y restaurar desde la papelera
  await page
    .getByTestId('tag-row')
    .filter({ hasText: 'Urgente' })
    .getByRole('button', { name: 'Eliminar etiqueta' })
    .click();
  await expect(page.getByTestId('tag-row')).toHaveCount(1);
  await page.getByTestId('nav-/papelera').click();
  await expect(page.getByTestId('trash-row')).toHaveCount(1);
  await page.getByTestId('trash-row').getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByText('La papelera está vacía')).toBeVisible();
});

test('hace una copia de seguridad y la restaura', async ({ page }) => {
  await openApp(page, '#/ajustes?tab=copias');
  const rows = page.getByTestId('backup-row');
  const before = await rows.count();
  await page.getByTestId('backup-now').click();
  await expect(rows).toHaveCount(before + 1);

  // Un cambio posterior a la copia…
  await page.goto('#/ajustes?tab=etiquetas');
  await page.getByTestId('tag-name').fill('Posterior a la copia');
  await page.getByRole('button', { name: 'Añadir' }).click();
  await expect(page.getByText('Posterior a la copia').first()).toBeVisible();

  // …desaparece al restaurarla.
  await page.goto('#/ajustes?tab=copias');
  await page
    .getByTestId('backup-row')
    .filter({ hasText: 'Manual' })
    .first()
    .getByRole('button', { name: 'Restaurar' })
    .click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restaurar' }).click();
  await page.waitForLoadState('load');
  await openApp(page, '#/ajustes?tab=etiquetas');
  await expect(page.getByText('Posterior a la copia')).toHaveCount(0);
});

test('guarda los datos del perfil y las preferencias', async ({ page }) => {
  await openApp(page, '#/ajustes?tab=perfil');
  await page.getByLabel('Nombre para mostrar').fill('Prueba');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Datos guardados')).toBeVisible();
  await openApp(page, '#/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Prueba');
});
