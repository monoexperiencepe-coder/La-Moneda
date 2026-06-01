import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { KM_AT_LEAST_ONE_ERROR } from '../../src/utils/kilometrajeForm';
import { clickUndo } from './gastos-form';
import { markQaEntityCleaned, registerQaKilometraje, registerQaVehiculo } from './qa-registry';
import { qaKmPlaca, qaTag } from './qa';
import { createQaVehiculoViaSupabase, expectQaKilometrajeAbsentInSupabase } from './qa-supabase';

const KM_REST_PATH = /\/rest\/v1\/kilometrajes/;
const VEHICULOS_REST_PATH = /\/rest\/v1\/vehiculos/;
const KM_ROW_TIMEOUT_MS = 15_000;

export type KmTipoForm = 'solo_km' | 'simple' | 'completo';

export function qaTestKmLog(step: string): void {
  // eslint-disable-next-line no-console
  console.log(`[QA KM] ${step}`);
}

function formatKmEs(value: number): string {
  return value.toLocaleString('es-PE');
}

function isSuccessfulKmInsertResponse(resp: {
  url(): string;
  request(): { method(): string };
  status(): number;
}): boolean {
  return (
    KM_REST_PATH.test(resp.url()) &&
    resp.request().method() === 'POST' &&
    resp.status() >= 200 &&
    resp.status() < 300
  );
}

export function getKmHistorialTable(page: Page) {
  return page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'KM mant.' }) });
}

export function getKmControlTable(page: Page) {
  return page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Variación' }) });
}

export async function openMantenimientoPage(page: Page): Promise<void> {
  if (!page.url().includes('/operaciones/mantenimiento')) {
    await page.goto('/operaciones/mantenimiento');
  }
  await page.getByRole('heading', { name: 'Mantenimiento' }).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByText('Registrar kilometraje').waitFor({ state: 'visible', timeout: 30_000 });
}

async function waitForVehicleInMantenimientoSelect(page: Page, vehicleId: number): Promise<void> {
  if (!page.url().includes('/operaciones/mantenimiento')) {
    await page.goto('/operaciones/mantenimiento');
  }
  await page.getByRole('heading', { name: 'Mantenimiento' }).waitFor({ state: 'visible', timeout: 30_000 });
  const select = page.getByLabel('Vehículo', { exact: true });
  await expect(select.locator(`option[value="${String(vehicleId)}"]`)).toBeAttached({
    timeout: 60_000,
  });
}

/** Panel km scoped a un vehículo (historial completo de la unidad, max 40 filas). */
export async function openVehicleKmPanel(page: Page, vehicleId: number): Promise<void> {
  const vehiclePath = `/vehiculos/${vehicleId}`;
  const onVehicleKm =
    page.url().includes(vehiclePath) &&
    (page.url().includes('tab=mantenimiento') ||
      (await page.getByText('Registrar kilometraje').isVisible().catch(() => false)));

  if (!onVehicleKm) {
    await waitForVehicleInMantenimientoSelect(page, vehicleId);
    await page.goto(`${vehiclePath}?tab=mantenimiento`);
  }
  await page.getByRole('tab', { name: 'Mantenimiento' }).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByText('Registrar kilometraje').waitFor({ state: 'visible', timeout: 30_000 });
}

/** Crea vehículo QA dedicado (placa QA-KM-*). Preferencia: API Supabase; fallback UI Inventario. */
export async function registerQaVehiculoIfNeeded(
  page: Page,
  opts?: { placa?: string; modelo?: string },
): Promise<{ id: number; placa: string }> {
  const placa = opts?.placa ?? qaKmPlaca();
  const modelo = opts?.modelo ?? qaTag('veh-km').slice(0, 32);

  try {
    const created = await createQaVehiculoViaSupabase({ placa, modelo, marca: 'Toyota' });
    registerQaVehiculo(created.id, created.placa, modelo);
    qaTestKmLog(`vehículo creado via API id=${created.id} placa=${created.placa}`);
    return created;
  } catch (apiErr) {
    const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
    qaTestKmLog(`vehículo API falló (${msg}) — fallback UI Inventario`);
    return registerQaVehiculoViaUi(page, { placa, modelo });
  }
}

async function waitForInventarioReady(page: Page): Promise<void> {
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

async function captureRegistrarVehiculoClickFailure(page: Page, btn: ReturnType<Page['getByRole']>): Promise<string> {
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

async function clickRegistrarVehiculoButton(page: Page): Promise<void> {
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

/** Fallback UI: registrar vehículo QA en Inventario (solo si API falla). */
async function registerQaVehiculoViaUi(
  page: Page,
  opts: { placa: string; modelo: string },
): Promise<{ id: number; placa: string }> {
  const { placa, modelo } = opts;

  await waitForInventarioReady(page);
  await clickRegistrarVehiculoButton(page);
  await page.getByRole('heading', { name: 'Registrar vehículo' }).waitFor({ state: 'visible', timeout: 30_000 });

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
  const id = Number(body.id);
  registerQaVehiculo(id, placa, modelo);
  qaTestKmLog(`vehículo creado via UI id=${id} placa=${placa}`);
  return { id, placa };
}

async function selectKmVehicle(page: Page, vehicleId: number): Promise<void> {
  const select = page.getByLabel('Vehículo', { exact: true });
  await expect(select).toBeVisible({ timeout: KM_ROW_TIMEOUT_MS });
  await select.selectOption(String(vehicleId));
}

async function selectKmTipo(page: Page, tipo: KmTipoForm): Promise<void> {
  const label =
    tipo === 'solo_km' ? 'Solo km semanal' : tipo === 'simple' ? 'Simple' : 'Completo';
  await page.locator('label').filter({ hasText: new RegExp(`^${label}$`) }).click();
}

export type RegisterQaKmOpts = {
  vehicleId: number;
  vehiclePlaca: string;
  tag: string;
  kilometraje?: number;
  tipo?: KmTipoForm;
  kmMantenimiento?: number;
};

export { KM_AT_LEAST_ONE_ERROR };

/** Registra kilometraje QA en /operaciones/mantenimiento. */
export async function registerQaKm(page: Page, opts: RegisterQaKmOpts): Promise<{ id: number; tag: string }> {
  const { vehicleId, vehiclePlaca, tag, kilometraje, tipo = 'solo_km', kmMantenimiento } = opts;

  if (kilometraje == null && kmMantenimiento == null) {
    throw new Error('registerQaKm: indica kilometraje o kmMantenimiento');
  }

  await openVehicleKmPanel(page, vehicleId);
  await selectKmTipo(page, tipo);

  if (tipo !== 'solo_km' && kmMantenimiento != null) {
    await page.getByLabel('KM al mantenimiento').fill(String(kmMantenimiento));
  }

  if (kilometraje != null) {
    const kmLabel =
      tipo === 'solo_km' ? 'Kilometraje semanal (odómetro)' : 'Kilometraje actual (odómetro)';
    await page.getByLabel(kmLabel).fill(String(kilometraje));
  }

  await page.getByLabel('Notas (opcional)').fill(tag);

  const insertResponse = page.waitForResponse(isSuccessfulKmInsertResponse, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Guardar registro' }).click();
  const resp = await insertResponse;
  const body = (await resp.json()) as { id?: number; descripcion?: string };
  if (body.id == null) {
    throw new Error('Kilometraje QA no se creó: respuesta POST sin id');
  }
  if (body.descripcion && !body.descripcion.includes('[QA_AUTO]')) {
    throw new Error(`Kilometraje insertado sin prefijo QA: "${body.descripcion}"`);
  }
  registerQaKilometraje(body.id, tag);
  qaTestKmLog(
    `registro id=${body.id} veh=${vehiclePlaca} km=${kilometraje ?? '—'} mant=${kmMantenimiento ?? '—'} tipo=${tipo}`,
  );

  if (kilometraje != null) {
    await expect(kmHistorialRow(page, vehiclePlaca, kilometraje).first()).toBeVisible({
      timeout: KM_ROW_TIMEOUT_MS,
    });
  } else if (kmMantenimiento != null) {
    await expectKmMantVisible(page, { vehiclePlaca, kmMantenimiento, tag });
  }

  return { id: body.id, tag };
}

function kmHistorialRowByMant(page: Page, vehiclePlaca: string, kmMantenimiento: number) {
  return getKmHistorialTable(page)
    .locator('tbody tr')
    .filter({ hasText: vehiclePlaca })
    .filter({ hasText: String(kmMantenimiento) });
}

/** Intenta guardar sin kilometraje; debe bloquear con mensaje de validación. */
export async function expectKmValidationBlocked(page: Page, opts: { vehicleId: number; tipo?: KmTipoForm }): Promise<void> {
  const { vehicleId, tipo = 'simple' } = opts;
  await openVehicleKmPanel(page, vehicleId);
  await selectKmTipo(page, tipo);

  let posted = false;
  const onResponse = (resp: { url(): string; request(): { method(): string }; status(): number }) => {
    if (isSuccessfulKmInsertResponse(resp)) posted = true;
  };
  page.on('response', onResponse);

  try {
    await page.getByRole('button', { name: 'Guardar registro' }).click();
    await expect(page.getByText(KM_AT_LEAST_ONE_ERROR)).toBeVisible({ timeout: KM_ROW_TIMEOUT_MS });
    expect(posted).toBe(false);
  } finally {
    page.off('response', onResponse);
  }
}

function kmHistorialRow(page: Page, vehiclePlaca: string, km: number) {
  return getKmHistorialTable(page)
    .locator('tbody tr')
    .filter({ hasText: vehiclePlaca })
    .filter({ hasText: String(km) });
}

export async function expectKmVisible(
  page: Page,
  opts: { vehiclePlaca: string; kilometraje: number; tag?: string },
): Promise<void> {
  qaTestKmLog(`expect visible km=${opts.kilometraje} placa=${opts.vehiclePlaca}`);
  const row = kmHistorialRow(page, opts.vehiclePlaca, opts.kilometraje);
  await expect(row.first()).toBeVisible({ timeout: KM_ROW_TIMEOUT_MS });
}

export async function expectKmMantVisible(
  page: Page,
  opts: { vehiclePlaca: string; kmMantenimiento: number; tag?: string },
): Promise<void> {
  qaTestKmLog(`expect visible km mant=${opts.kmMantenimiento} placa=${opts.vehiclePlaca}`);
  const row = kmHistorialRowByMant(page, opts.vehiclePlaca, opts.kmMantenimiento);
  await expect(row.first()).toBeVisible({ timeout: KM_ROW_TIMEOUT_MS });
}

export async function expectKmNotVisible(
  page: Page,
  opts: { vehiclePlaca: string; kilometraje: number },
): Promise<void> {
  qaTestKmLog(`expect not visible km=${opts.kilometraje} placa=${opts.vehiclePlaca}`);
  const row = kmHistorialRow(page, opts.vehiclePlaca, opts.kilometraje);
  await expect(row).toHaveCount(0, { timeout: KM_ROW_TIMEOUT_MS });
}

export async function expectKmSummaryUpdated(
  page: Page,
  opts: { vehiclePlaca: string; ultimoRegistroKm: number },
): Promise<void> {
  qaTestKmLog(`expect resumen km=${opts.ultimoRegistroKm}`);
  const resumen = page.locator('section').filter({ hasText: 'Último registro' }).first();
  await expect(resumen).toContainText(formatKmEs(opts.ultimoRegistroKm));
  const row = getKmControlTable(page).locator('tbody tr').filter({ hasText: opts.vehiclePlaca });
  await expect(row.first()).toBeVisible({ timeout: KM_ROW_TIMEOUT_MS });
  await expect(row.first()).toContainText(formatKmEs(opts.ultimoRegistroKm));
}

export async function expectKmMaintenanceAlert(
  page: Page,
  opts: { vehiclePlaca: string; variacionKm?: number },
): Promise<void> {
  qaTestKmLog(`expect alert placa=${opts.vehiclePlaca}`);
  await expect(page.getByText('Rojo / requiere mantenimiento').first()).toBeVisible({
    timeout: KM_ROW_TIMEOUT_MS,
  });
  if (opts.variacionKm != null) {
    await expect(page.getByText(`${formatKmEs(opts.variacionKm)} km desde último mantenimiento`)).toBeVisible();
  }
  const row = getKmControlTable(page).locator('tbody tr').filter({ hasText: opts.vehiclePlaca });
  await expect(row.getByText('¡Alerta!', { exact: true })).toBeVisible();
}

/** Deshacer último registro de km (header/toast) y marcar cleaned si aplica. */
export async function undoQaKm(page: Page, kmId: number): Promise<void> {
  await clickUndo(page);
  await expectQaKilometrajeAbsentInSupabase(String(kmId));
  markQaEntityCleaned(String(kmId), { kind: 'kilometraje', method: 'none' });
  qaTestKmLog(`undo OK id=${kmId}`);
}

/** Marca km como cleaned (p. ej. tras undo o delete manual). */
export async function cleanupQaKm(kmId: number | string): Promise<void> {
  markQaEntityCleaned(String(kmId), { kind: 'kilometraje', method: 'api' });
}
