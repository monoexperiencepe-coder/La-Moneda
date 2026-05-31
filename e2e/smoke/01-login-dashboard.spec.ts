import { test, expect } from '../fixtures/console';
import { assertNotProduction } from '../helpers/qa';
import { expectDashboardLoaded } from '../helpers/auth';

test.describe('Smoke · Login y dashboard', () => {
  test('sesión guardada carga el inicio (dashboard)', async ({ page }) => {
    assertNotProduction();
    await page.goto('/');
    await expectDashboardLoaded(page);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText('Finanzas').first()).toBeVisible();
  });
});
