import { test, expect } from '../fixtures/console';
import { assertNotProduction } from '../helpers/qa';

test.describe('Smoke · Utilidad (solo lectura)', () => {
  test.beforeAll(() => {
    assertNotProduction();
  });

  test('módulo utilidad muestra KPIs, tabla e insights', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/finanzas/utilidad-operativa');
    await page.getByRole('heading', { name: 'Utilidad', exact: true, level: 1 }).waitFor({
      state: 'visible',
      timeout: 60_000,
    });

    await expect(page.getByText('Utilidad operativa', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Utilidad global', { exact: true }).first()).toBeVisible();

    const loading = page.getByText(/Cargando histórico completo de gastos|Preparando histórico/i);
    if (await loading.isVisible().catch(() => false)) {
      await loading.waitFor({ state: 'hidden', timeout: 120_000 });
    }

    await expect(page.getByText('Ingresos').first()).toBeVisible();
    await expect(page.getByText('Gastos').first()).toBeVisible();

    await expect(page.getByText('Utilidad por vehículo').first()).toBeVisible();

    const tabla = page.getByRole('table').filter({ has: page.getByText('Ingresos') });
    await expect(tabla).toBeVisible({ timeout: 60_000 });

    const filas = tabla.locator('tbody tr');
    const rowCount = await filas.count();
    expect(rowCount).toBeGreaterThan(0);

    const mejorVehiculo = page.getByText('Mejor vehículo');
    if (await mejorVehiculo.isVisible().catch(() => false)) {
      await expect(mejorVehiculo).toBeVisible();
      await expect(page.locator('section').filter({ has: mejorVehiculo }).getByText(/S\/|…/).first()).toBeVisible();
    }
  });
});
