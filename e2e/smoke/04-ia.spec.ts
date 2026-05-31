import { test, expect } from '../fixtures/console';
import { assertNotProduction } from '../helpers/qa';

test.describe('Smoke · Asistente IA', () => {
  test.beforeAll(() => {
    assertNotProduction();
  });

  test('pregunta sobre cantidad de vehículos responde sin error', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/asistente');
    await expect(page.getByRole('heading', { name: 'Asistente IA' })).toBeVisible();

    const pregunta = '¿Cuántos vehículos tiene la empresa?';
    const textarea = page.getByPlaceholder('Pregunta sobre gastos, pendientes, resumen del mes…');
    await textarea.fill(pregunta);
    await page.getByRole('button', { name: 'Enviar' }).click();

    await expect(page.getByText(pregunta).first()).toBeVisible({ timeout: 15_000 });

    const errorBanner = page.getByText(/no está disponible|configura|error al consultar/i);
    await expect(errorBanner).toHaveCount(0, { timeout: 120_000 });

    await expect(
      page.locator('.rounded-2xl, [class*="AIMessage"]').filter({ hasNotText: pregunta }).last(),
    ).toBeVisible({ timeout: 120_000 });

    const body = await page.locator('main, section').first().innerText();
    expect(body.length).toBeGreaterThan(50);
  });
});
