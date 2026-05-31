import type { Page } from '@playwright/test';
import { requireQaCredentials } from './qa';

export async function loginViaUi(page: Page): Promise<void> {
  const { email, password } = requireQaCredentials();
  await loginWithCredentials(page, email, password);
}

export async function loginAsContador(page: Page): Promise<void> {
  const email = process.env.CONTADOR_EMAIL?.trim() ?? 'contador@lamoneda.com';
  const password = process.env.CONTADOR_PASSWORD?.trim() ?? 'lamoneda2026';
  await loginWithCredentials(page, email, password);
}

async function loginWithCredentials(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Ingresar' }).waitFor({ state: 'visible', timeout: 25_000 });
  await page.getByPlaceholder('usuario@lamoneda.com').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 45_000 });
}

export async function expectDashboardLoaded(page: Page): Promise<void> {
  await page.waitForURL(/\//, { timeout: 45_000 });
  await page.getByText('Finanzas').first().waitFor({ state: 'visible', timeout: 30_000 });
}
