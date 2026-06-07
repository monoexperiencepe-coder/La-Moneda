import { expect, type Page, type Response } from '@playwright/test';
import { registerQaIngreso } from './qa-registry';
import { clickUndo } from './gastos-form';

const INGRESOS_REST_PATH = /\/rest\/v1\/ingresos/;

function isSuccessfulIngresoInsertResponse(resp: {
  url(): string;
  request(): { method(): string };
  status(): number;
}): boolean {
  return (
    INGRESOS_REST_PATH.test(resp.url()) &&
    resp.request().method() === 'POST' &&
    resp.status() >= 200 &&
    resp.status() < 300
  );
}

export async function waitForIngresosPageReady(page: Page): Promise<void> {
  await page.goto('/finanzas/ingresos');
  await page.getByRole('heading', { level: 1, name: '💵 Ingresos' }).waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByRole('heading', { name: 'Historial de ingresos' }).waitFor({ state: 'visible', timeout: 60_000 });
}

export async function openRegistrarIngresoModal(page: Page): Promise<void> {
  await waitForIngresosPageReady(page);
  await page.getByRole('button', { name: '+ Registrar ingreso', exact: true }).click();
  await page.getByRole('dialog', { name: 'Registrar ingreso' }).waitFor({ state: 'visible', timeout: 20_000 });
}

/** Fragmento que aparece en historial (`Vehículo: #id · placa`), no el label del select. */
function vehicleHistorialHintFromSelect(label: string, value: string): string {
  const placaMatch = label.match(/\(([^)]+)\)\s*$/);
  if (placaMatch?.[1]?.trim()) return placaMatch[1].trim();
  return `#${value}`;
}

async function pickFirstVehicle(page: Page): Promise<{ value: string; vehicleHint: string }> {
  const modal = page.getByRole('dialog', { name: 'Registrar ingreso' });
  const vehicleSelect = modal.locator('label', { hasText: 'N° Vehículo' }).locator('..').locator('select');
  await vehicleSelect.waitFor({ state: 'visible', timeout: 15_000 });
  const options = vehicleSelect.locator('option');
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    const value = await options.nth(i).getAttribute('value');
    if (value && value.trim()) {
      const label = ((await options.nth(i).textContent()) ?? '').trim();
      await vehicleSelect.selectOption(value);
      return { value, vehicleHint: vehicleHistorialHintFromSelect(label, value) };
    }
  }
  throw new Error('E2E ingresos: no hay vehículos activos para seleccionar.');
}

export type IngresoHistorialExpect = {
  monto: string;
  /** Fragmento visible en historial (#id, placa, marca…). */
  vehicleHint?: string;
};

function montoHistorialRegex(monto: string): RegExp {
  const n = Number(String(monto).replace(',', '.'));
  const fixed = Number.isFinite(n) ? n.toFixed(2) : monto;
  const esPe = Number.isFinite(n)
    ? n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : monto;
  const core = fixed.replace('.', '[.,]');
  const coreEs = esPe.replace('.', '[.,]').replace(/,/g, '[.,]?');
  return new RegExp(`\\+?S\\/\\s*(?:${core}|${coreEs})`);
}

async function readIngresoHoyAmount(page: Page): Promise<string | null> {
  const card = page
    .locator('div')
    .filter({ has: page.getByText('Ingreso hoy', { exact: true }) })
    .first();
  const amount = card.locator('p.tabular-nums').first();
  if (!(await amount.isVisible().catch(() => false))) return null;
  return ((await amount.textContent()) ?? '').trim() || null;
}

async function waitForIngresoPostRegisterSignals(
  page: Page,
  opts?: { ingresoHoyBefore?: string | null },
): Promise<void> {
  await page.getByRole('dialog', { name: 'Registrar ingreso' }).waitFor({ state: 'hidden', timeout: 60_000 });

  const toastOk = await page
    .getByText(/Ingreso registrado/i)
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (toastOk) return;

  const ingresoHoyBefore = opts?.ingresoHoyBefore ?? null;
  if (ingresoHoyBefore != null) {
    const ingresoHoyCard = page
      .locator('div')
      .filter({ has: page.getByText('Ingreso hoy', { exact: true }) })
      .first();
    const amount = ingresoHoyCard.locator('p.tabular-nums').first();
    const hoyChanged = await expect(amount)
      .not.toHaveText(ingresoHoyBefore, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (hoyChanged) return;
  }

  await page.getByText('Ingreso hoy', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
}

function historialMovimientosTable(page: Page) {
  return page
    .getByRole('table')
    .filter({ has: page.getByRole('columnheader', { name: /Fecha movimiento/i }) })
    .filter({ has: page.getByRole('columnheader', { name: /^Monto$/i }) });
}

function ingresoHistorialRow(page: Page, opts: IngresoHistorialExpect) {
  const amountRe = montoHistorialRegex(opts.monto);
  let row = historialMovimientosTable(page).locator('tbody tr').filter({ hasText: amountRe });
  if (opts.vehicleHint?.trim()) {
    row = row.filter({ hasText: opts.vehicleHint.trim() });
  }
  return row;
}

export async function registerIngreso(
  page: Page,
  opts: { comentarios: string; monto?: string },
): Promise<{ id: string; comentarios: string; monto: string; vehicleHint: string }> {
  const modal = page.getByRole('dialog', { name: 'Registrar ingreso' });
  const monto = opts.monto ?? '50.00';
  const { vehicleHint } = await pickFirstVehicle(page);
  await modal.getByLabel('Monto (S/)').fill(monto);
  await modal.getByLabel(/Comentarios/i).fill(opts.comentarios);

  const ingresoHoyBefore = await readIngresoHoyAmount(page);
  const insertResponse = page.waitForResponse(isSuccessfulIngresoInsertResponse, { timeout: 60_000 });
  await modal.getByRole('button', { name: 'Registrar ingreso', exact: true }).click();
  const resp = await insertResponse;
  const body = (await resp.json()) as { id?: string | number; comentarios?: string };
  const id = body.id != null ? String(body.id) : '';
  if (!id) throw new Error('E2E ingresos: POST sin id');
  if (body.comentarios !== opts.comentarios) {
    throw new Error(
      `E2E ingresos: comentarios no coinciden. esperado="${opts.comentarios}" recibido="${body.comentarios ?? ''}"`,
    );
  }
  registerQaIngreso(id, opts.comentarios);
  await waitForIngresoPostRegisterSignals(page, { ingresoHoyBefore });
  return { id, comentarios: opts.comentarios, monto, vehicleHint };
}

export async function expectIngresoVisibleInHistorial(
  page: Page,
  opts: IngresoHistorialExpect,
): Promise<void> {
  await page.getByRole('heading', { name: 'Historial de ingresos' }).scrollIntoViewIfNeeded();
  await expect(ingresoHistorialRow(page, opts).first()).toBeVisible({ timeout: 45_000 });
}

export async function expectIngresoNotVisibleInHistorial(
  page: Page,
  opts: IngresoHistorialExpect,
): Promise<void> {
  await page.getByRole('heading', { name: 'Historial de ingresos' }).scrollIntoViewIfNeeded();
  await expect(ingresoHistorialRow(page, opts)).toHaveCount(0, { timeout: 45_000 });
}

export async function undoCreateIngreso(page: Page): Promise<void> {
  await clickUndo(page);
}

export async function waitForIngresoInsertSuccess(
  page: Page,
  comentarios: string,
  responsePromise: Promise<Response>,
): Promise<{ id: string; comentarios: string }> {
  const resp = await responsePromise;
  const body = (await resp.json()) as { id?: string | number; comentarios?: string };
  const id = body.id != null ? String(body.id) : '';
  if (!id) throw new Error('waitForIngresoInsertSuccess: sin id');
  registerQaIngreso(id, comentarios);
  return { id, comentarios };
}
