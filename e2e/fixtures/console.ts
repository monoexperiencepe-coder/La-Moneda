import { test as base } from '@playwright/test';
import { setQaCurrentTest } from '../helpers/qa-registry';

/** Adjunta logs de consola al reporte cuando el test falla. Cleanup QA: solo globalTeardown. */
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const logs: string[] = [];
    page.on('console', (msg) => {
      logs.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      logs.push(`[pageerror] ${err.message}`);
    });
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus && logs.length > 0) {
      await testInfo.attach('browser-console.txt', {
        body: logs.join('\n'),
        contentType: 'text/plain',
      });
    }
  },
});

test.beforeEach(({ }, testInfo) => {
  setQaCurrentTest(testInfo.titlePath.join(' › '));
});

export { expect } from '@playwright/test';
