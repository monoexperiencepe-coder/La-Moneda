import { test as setup } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNotProduction } from './helpers/qa';
import { loginViaUi } from './helpers/auth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '.auth/user.json');

setup('autenticar usuario QA', async ({ page }) => {
  assertNotProduction();
  await loginViaUi(page);
  await page.context().storageState({ path: authFile });
});
