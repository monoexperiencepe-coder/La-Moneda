import { test, expect } from '../fixtures/console';
import { assertNotProduction, qaPlaca, qaTag, skipUnlessQaDbWrites } from '../helpers/qa';
import { registerQaVehiculo } from '../helpers/qa-registry';

const VEHICULOS_REST_PATH = /\/rest\/v1\/vehiculos/;

test.describe.configure({ mode: 'serial' });

test.describe('Smoke · Flota', () => {
  test.beforeAll(() => {
    assertNotProduction();
  });

  test('listar vehículos en inventario', async ({ page }) => {
    await page.goto('/vehiculos/inventario');
    await expect(page.getByRole('heading', { name: /Inventario/i })).toBeVisible();
    await expect(page.getByText(/vehículo/i).first()).toBeVisible();
  });

  test('registrar vehículo test QA_AUTO', async ({ page }) => {
    skipUnlessQaDbWrites(test);
    const placa = qaPlaca();
    const modelo = qaTag('modelo').slice(0, 32);
    await page.goto('/vehiculos/inventario');
    await page.getByRole('button', { name: 'Registrar vehículo' }).click();
    await page.getByRole('heading', { name: 'Registrar vehículo' }).waitFor();
    await page.getByPlaceholder('Ej. ABC-123').fill(placa);
    await page.locator('span:text-is("Marca *")').locator('..').locator('input').fill('Toyota');
    await page.locator('span:text-is("Modelo *")').locator('..').locator('input').fill(modelo);
    const insertResponse = page.waitForResponse(
      (resp) =>
        VEHICULOS_REST_PATH.test(resp.url()) &&
        resp.request().method() === 'POST' &&
        resp.status() >= 200 &&
        resp.status() < 300,
      { timeout: 60_000 },
    );
    await page.getByRole('button', { name: 'Guardar vehículo' }).click();
    const resp = await insertResponse;
    const body = (await resp.json()) as { id?: number | string; placa?: string };
    if (body.id == null) {
      throw new Error('Vehículo QA no se creó: respuesta POST sin id');
    }
    registerQaVehiculo(body.id, placa, modelo);
    await expect(page.getByText(placa).first()).toBeVisible({ timeout: 45_000 });
  });

  test('inventario muestra bloque Conductor por vehículo', async ({ page }) => {
    await page.goto('/vehiculos/inventario');
    await expect(page.getByText('Conductor', { exact: true }).first()).toBeVisible();
  });
});
