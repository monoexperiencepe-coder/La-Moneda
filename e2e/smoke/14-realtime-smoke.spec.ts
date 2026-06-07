import { test, expect } from '../fixtures/console';
import { assertNotProduction } from '../helpers/qa';

test.describe('Smoke · Realtime (manual-friendly)', () => {
  test.beforeAll(() => {
    assertNotProduction();
  });

  test('admin ve badge de sincronización en vivo o log SUBSCRIBED', async ({ page }) => {
    test.setTimeout(120_000);
    const logs: string[] = [];
    page.on('console', (msg) => {
      logs.push(msg.text());
    });

    await page.goto('/');
    await page.getByText('Finanzas').first().waitFor({ state: 'visible', timeout: 60_000 });

    const badge = page.getByText('Actualizado en vivo');
    const badgeVisible = await badge.waitFor({ state: 'visible', timeout: 90_000 }).then(() => true).catch(() => false);

    const subscribedInConsole = logs.some((l) => /SUBSCRIBED|realtime.*connected|registros.*realtime/i.test(l));

    expect(
      badgeVisible || subscribedInConsole,
      `Realtime no confirmado: badge=${badgeVisible} logs=${logs.slice(-8).join(' | ')}`,
    ).toBeTruthy();
  });
});
