import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { markQaEntityCleaned, registerQaVehiculo } from './qa-registry';
import { qaFlotaPlaca, qaTag } from './qa';
import { createQaVehiculoViaSupabase } from './qa-supabase';

export const VEHICULOS_REST_PATH = /\/rest\/v1\/vehiculos/;

export function qaTestFlotaLog(step: string): void {
  // eslint-disable-next-line no-console
  console.log(`[QA FLOTA] ${step}`);
}

export function getVehiculoCard(page: Page, placa: string) {
  return page.locator('.game-card').filter({ hasText: placa });
}

export async function waitForInventarioReady(page: Page): Promise<void> {
  await page.goto('/vehiculos/inventario');
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('heading', { name: /Inventario/i }).waitFor({ state: 'visible', timeout: 60_000 });

  const busyOverlay = page.locator('[role="status"][aria-busy="true"]');
  if (await busyOverlay.isVisible().catch(() => false)) {
    await busyOverlay.waitFor({ state: 'hidden', timeout: 60_000 });
  }

  for (const text of [/Cargando/i, /Preparando/i, /Sincronizando/i]) {
    const el = page.getByText(text).first();
    if (await el.isVisible().catch(() => false)) {
      await el.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => undefined);
    }
  }
}

async function captureRegistrarVehiculoClickFailure(
  page: Page,
  btn: ReturnType<Page['getByRole']>,
): Promise<string> {
  const dir = path.join(process.cwd(), 'test-results');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = Date.now();
  const screenshotPath = path.join(dir, `registrar-vehiculo-failed-${stamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);

  const overlays: string[] = [];
  for (const el of await page.locator('[role="status"][aria-busy="true"]').all()) {
    if (await el.isVisible().catch(() => false)) {
      overlays.push((await el.getAttribute('aria-label')) ?? (await el.textContent()) ?? '(overlay busy)');
    }
  }

  const buttons: string[] = [];
  for (const b of await page.getByRole('button').all()) {
    if (await b.isVisible().catch(() => false)) {
      const name = (await b.innerText().catch(() => '')).trim().replace(/\s+/g, ' ');
      if (name) buttons.push(name);
    }
  }

  const btnBox = await btn.boundingBox().catch(() => null);
  return [
    'No se pudo clicar «Registrar vehículo»',
    `url=${page.url()}`,
    `screenshot=${screenshotPath}`,
    `overlays=${overlays.join(' | ') || '(ninguno)'}`,
    `visibleButtons=${buttons.join(' | ') || '(ninguno)'}`,
    `registrarBtnBox=${btnBox ? JSON.stringify(btnBox) : 'null'}`,
  ].join('\n');
}

export async function clickRegistrarVehiculoButton(page: Page): Promise<void> {
  const btn = page.getByRole('button', { name: /Registrar vehículo/i }).first();
  await expect(btn).toBeVisible({ timeout: 60_000 });
  await expect(btn).toBeEnabled({ timeout: 60_000 });
  await btn.scrollIntoViewIfNeeded();

  try {
    await btn.click({ trial: true });
    await btn.click();
  } catch (err) {
    throw new Error(
      `${await captureRegistrarVehiculoClickFailure(page, btn)}\n\nOriginal: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Registra vehículo QA vía UI Inventario (test 1 — flujo completo UI). */
export async function registerQaVehiculoViaUi(
  page: Page,
  opts?: { placa?: string; modelo?: string; marca?: string },
): Promise<{ id: number; placa: string }> {
  const placa = opts?.placa ?? qaFlotaPlaca();
  const modelo = opts?.modelo ?? qaTag('flota-reg').slice(0, 32);
  const marca = opts?.marca ?? 'Toyota';

  await waitForInventarioReady(page);
  await clickRegistrarVehiculoButton(page);
  await page.getByRole('heading', { name: 'Registrar vehículo' }).waitFor({ state: 'visible', timeout: 30_000 });

  await page.getByPlaceholder('Ej. ABC-123').fill(placa);
  await page.locator('span:text-is("Marca *")').locator('..').locator('input').fill(marca);
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
  const id = Number(body.id);
  registerQaVehiculo(id, placa, modelo);
  qaTestFlotaLog(`vehículo creado via UI id=${id} placa=${placa}`);
  return { id, placa };
}

/** Setup rápido vía API (tests edit/delete/asignación). */
export async function createQaVehiculoForTest(
  opts?: { placa?: string; modelo?: string },
): Promise<{ id: number; placa: string }> {
  const placa = opts?.placa ?? qaFlotaPlaca();
  const modelo = opts?.modelo ?? qaTag('flota-setup').slice(0, 32);
  const created = await createQaVehiculoViaSupabase({ placa, modelo, marca: 'Toyota' });
  registerQaVehiculo(created.id, created.placa, modelo);
  qaTestFlotaLog(`vehículo setup API id=${created.id} placa=${created.placa}`);
  return created;
}

export async function expectVehiculoVisibleInInventario(page: Page, placa: string): Promise<void> {
  await waitForInventarioReady(page);
  await expect(getVehiculoCard(page, placa)).toBeVisible({ timeout: 45_000 });
}

export async function expectVehiculoNotVisibleInInventario(page: Page, placa: string): Promise<void> {
  await waitForInventarioReady(page);
  await expect(getVehiculoCard(page, placa)).toHaveCount(0, { timeout: 45_000 });
}

export async function openEditarVehiculoModal(page: Page, vehicleId: number): Promise<void> {
  const vehiclePath = `/vehiculos/${vehicleId}`;
  if (!page.url().includes(vehiclePath)) {
    await page.goto(vehiclePath);
  }
  await page.getByRole('button', { name: 'Editar vehículo' }).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: 'Editar vehículo' }).click();
  await page.getByRole('heading', { name: 'Editar vehículo' }).waitFor({ state: 'visible', timeout: 15_000 });
}

export async function editQaVehiculo(
  page: Page,
  vehicleId: number,
  patch: { modelo: string; color: string; observaciones: string },
): Promise<void> {
  await openEditarVehiculoModal(page, vehicleId);

  const modeloInput = page.locator('span:text-is("Modelo *")').locator('..').locator('input');
  await modeloInput.fill(patch.modelo);
  await page.locator('span:text-is("Color")').locator('..').locator('input').fill(patch.color);
  await page.locator('textarea').fill(patch.observaciones);

  const patchResponse = page.waitForResponse(
    (resp) =>
      VEHICULOS_REST_PATH.test(resp.url()) &&
      resp.request().method() === 'PATCH' &&
      resp.status() >= 200 &&
      resp.status() < 300,
    { timeout: 60_000 },
  );
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await patchResponse;
  await page.getByRole('heading', { name: 'Editar vehículo' }).waitFor({ state: 'hidden', timeout: 30_000 });
  qaTestFlotaLog(`vehículo editado id=${vehicleId}`);
}

export async function deleteQaVehiculoViaUi(
  page: Page,
  vehicleId: number,
  placa: string,
): Promise<void> {
  await openEditarVehiculoModal(page, vehicleId);
  await page.getByRole('button', { name: 'Eliminar vehículo' }).click();
  await page.getByText(`¿Eliminar ${placa}?`).waitFor({ state: 'visible', timeout: 10_000 });

  const deleteResponse = page.waitForResponse(
    (resp) =>
      VEHICULOS_REST_PATH.test(resp.url()) &&
      resp.request().method() === 'DELETE' &&
      resp.status() >= 200 &&
      resp.status() < 300,
    { timeout: 60_000 },
  );
  await page.getByRole('button', { name: 'Sí, eliminar' }).click();
  await deleteResponse;
  await page.getByRole('heading', { name: /Inventario/i }).waitFor({ state: 'visible', timeout: 45_000 });
  markQaEntityCleaned(String(vehicleId), { kind: 'vehiculo', method: 'ui' });
  qaTestFlotaLog(`vehículo eliminado via UI id=${vehicleId} placa=${placa}`);
}

function conductorSelect(page: Page) {
  return page.locator('span:text-is("Conductor vigente")').locator('..').locator('select').first();
}

export async function openAsignarConductorModal(page: Page, placa: string): Promise<void> {
  await waitForInventarioReady(page);
  const card = getVehiculoCard(page, placa);
  await expect(card).toBeVisible({ timeout: 45_000 });
  await card.getByRole('button', { name: /Asignar \/ Reasignar/i }).click();
  await expect(
    page.getByRole('heading', { name: /Asignar conductor|Reasignar conductor/i }),
  ).toBeVisible({ timeout: 15_000 });
}

/** Elige el primer conductor vigente disponible (value no vacío). */
export async function pickFirstVigenteConductor(page: Page): Promise<string> {
  const select = conductorSelect(page);
  const options = select.locator('option');
  const count = await options.count();
  expect(count).toBeGreaterThan(1);

  for (let i = 0; i < count; i++) {
    const opt = options.nth(i);
    const value = (await opt.getAttribute('value')) ?? '';
    if (!value) continue;
    const label = ((await opt.textContent()) ?? '').trim();
    await select.selectOption(value);
    return label.split('·')[0]?.trim() || label;
  }
  throw new Error('No hay conductores vigentes en el select');
}

export async function assignConductorToQaVehiculo(
  page: Page,
  placa: string,
): Promise<{ conductorLabel: string }> {
  await openAsignarConductorModal(page, placa);
  const conductorLabel = await pickFirstVigenteConductor(page);

  const patchResponse = page.waitForResponse(
    (resp) => /\/rest\/v1\/conductores/.test(resp.url()) && resp.request().method() === 'PATCH',
    { timeout: 60_000 },
  );
  await page.getByRole('button', { name: 'Guardar asignación' }).click();
  await patchResponse;
  await expect(
    page.getByRole('heading', { name: /Asignar conductor|Reasignar conductor/i }),
  ).toBeHidden({ timeout: 30_000 });

  const card = getVehiculoCard(page, placa);
  await expect(card.getByText(conductorLabel, { exact: false })).toBeVisible({ timeout: 30_000 });
  qaTestFlotaLog(`conductor asignado placa=${placa} conductor=${conductorLabel}`);
  return { conductorLabel };
}

export async function clearConductorFromQaVehiculo(page: Page, placa: string): Promise<void> {
  await openAsignarConductorModal(page, placa);
  await conductorSelect(page).selectOption('');

  const patchResponse = page.waitForResponse(
    (resp) => /\/rest\/v1\/conductores/.test(resp.url()) && resp.request().method() === 'PATCH',
    { timeout: 60_000 },
  );
  await page.getByRole('button', { name: 'Guardar asignación' }).click();
  await patchResponse;
  await expect(
    page.getByRole('heading', { name: /Asignar conductor|Reasignar conductor/i }),
  ).toBeHidden({ timeout: 30_000 });

  const card = getVehiculoCard(page, placa);
  await expect(card.getByText('—', { exact: true })).toBeVisible({ timeout: 30_000 });
  qaTestFlotaLog(`conductor desasignado placa=${placa}`);
}

export async function expectEditFormValues(
  page: Page,
  vehicleId: number,
  expected: { modelo: string; color: string; observaciones: string },
): Promise<void> {
  await openEditarVehiculoModal(page, vehicleId);
  await expect(page.locator('span:text-is("Modelo *")').locator('..').locator('input')).toHaveValue(
    expected.modelo,
  );
  await expect(page.locator('span:text-is("Color")').locator('..').locator('input')).toHaveValue(
    expected.color,
  );
  await expect(page.locator('textarea')).toHaveValue(expected.observaciones);
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('heading', { name: 'Editar vehículo' }).waitFor({ state: 'hidden', timeout: 15_000 });
}

export async function expectVehiculoDetalleShows(
  page: Page,
  opts: { vehicleId: number; modeloFragment: string },
): Promise<void> {
  if (!page.url().includes(`/vehiculos/${opts.vehicleId}`)) {
    await page.goto(`/vehiculos/${opts.vehicleId}`);
  }
  await expect(page.getByRole('heading', { level: 1 })).toContainText(opts.modeloFragment, {
    timeout: 30_000,
  });
}
