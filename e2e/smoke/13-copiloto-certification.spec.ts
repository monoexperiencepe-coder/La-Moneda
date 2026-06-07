import { test, expect } from '../fixtures/console';
import { assertNotProduction } from '../helpers/qa';

test.describe('Smoke · Copiloto certificación', () => {
  test.beforeAll(() => {
    assertNotProduction();
  });

  test('runCopilotCertification >= 90% precisión (solo admin)', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => undefined);

    const result = await page.evaluate(async () => {
      if (typeof window.runCopilotCertification !== 'function') {
        return { skipped: true as const, reason: 'window.runCopilotCertification no está registrado (requiere sesión admin)' };
      }
      const r = await window.runCopilotCertification();
      if (!r) {
        return { skipped: true as const, reason: 'Certificación devolvió null (sin user/empresaId)' };
      }
      return { skipped: false as const, precision: r.precision, passed: r.passed, total: r.total };
    });

    if (result.skipped) {
      test.skip(true, result.reason);
    }

    expect(result.precision).toBeGreaterThanOrEqual(90);
    expect(result.passed).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });
});
