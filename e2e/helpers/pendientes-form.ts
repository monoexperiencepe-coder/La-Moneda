import { expect, type Page } from '@playwright/test';
import { registerQaPendiente } from './qa-registry';
import { deletePendienteViaApiDirect, expectQaPendienteAbsentInSupabase } from './qa-supabase';

export const PENDIENTES_REST_PATH = /\/rest\/v1\/pendientes/;

export async function openPendientesPage(page: Page): Promise<void> {
  await page.goto('/operaciones/pendientes');
  await page.getByRole('button', { name: '+ Nuevo' }).waitFor({ state: 'visible', timeout: 90_000 });
}

export async function createQaPendiente(
  page: Page,
  opts: { titulo: string; descripcion?: string },
): Promise<{ id: number; titulo: string }> {
  await openPendientesPage(page);
  await page.getByRole('button', { name: '+ Nuevo' }).click();
  await page.getByRole('heading', { name: 'Nuevo pendiente' }).waitFor({ state: 'visible', timeout: 15_000 });

  await page.getByLabel('Título').fill(opts.titulo);
  if (opts.descripcion) {
    await page.locator('textarea.input-field').fill(opts.descripcion);
  }

  const insertResponse = page.waitForResponse(
    (resp) =>
      PENDIENTES_REST_PATH.test(resp.url()) &&
      resp.request().method() === 'POST' &&
      resp.status() >= 200 &&
      resp.status() < 300,
    { timeout: 60_000 },
  );
  await page.getByRole('button', { name: 'Guardar pendiente', exact: true }).click();
  const resp = await insertResponse;
  const body = (await resp.json()) as { id?: number | string; titulo?: string };
  const id = body.id != null ? Number(body.id) : NaN;
  if (!Number.isFinite(id)) throw new Error('E2E pendientes: POST sin id');
  registerQaPendiente(id, opts.titulo);
  await page.getByText(/Pendiente registrado/i).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
  return { id, titulo: opts.titulo };
}

export async function expectPendienteVisible(page: Page, titulo: string, tab: 'hoy' | 'backlog' | 'completadas' = 'backlog'): Promise<void> {
  await openPendientesPage(page);
  const tabLabel = tab === 'hoy' ? 'Hoy' : tab === 'completadas' ? 'Completadas' : 'Sin fecha';
  await page.getByRole('tab', { name: tabLabel }).click();
  await expect(page.getByText(titulo).first()).toBeVisible({ timeout: 45_000 });
}

export async function completarPendienteByTitulo(page: Page, titulo: string): Promise<void> {
  const card = page.locator('[class*="rounded"]').filter({ hasText: titulo }).first();
  await card.getByRole('button', { name: 'Completar' }).click();
  await page.getByText(/Pendiente actualizado|Pendiente registrado/i).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
}

export async function cleanupQaPendienteOrFail(id: number): Promise<void> {
  const res = await deletePendienteViaApiDirect(String(id));
  if (!res.ok) {
    throw new Error(`CLEANUP FALLÓ pendiente id=${id}: ${res.error ?? 'desconocido'}`);
  }
  await expectQaPendienteAbsentInSupabase(String(id));
}
