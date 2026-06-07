import { expect, type Page } from '@playwright/test';
import { todayStr } from '../../src/utils/formatting';
import { registerQaVehicleDowntime } from './qa-registry';
import {
  deleteVehicleDowntimeViaApiDirect,
  expectQaVehicleDowntimeAbsentInSupabase,
} from './qa-supabase';

export const VEHICLE_DOWNTIME_REST_PATH = /\/rest\/v1\/vehicle_downtime/;

export type VehiculoFinanzasSnapshot = {
  ingresos: string;
  gastos: string;
  utilidadReal: string;
};

export async function readVehiculoFinanzasSnapshot(page: Page, vehicleId: number): Promise<VehiculoFinanzasSnapshot> {
  await page.goto(`/vehiculos/${vehicleId}`);
  await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible', timeout: 45_000 });

  const readCard = async (label: string): Promise<string> => {
    const card = page.locator('div').filter({ has: page.getByText(label, { exact: true }) }).first();
    const value = card.locator('p.font-bold, p.text-lg').first();
    await value.waitFor({ state: 'visible', timeout: 30_000 });
    return (await value.textContent())?.trim() ?? '';
  };

  return {
    ingresos: await readCard('Ingresos (total)'),
    gastos: await readCard('Gastos (total)'),
    utilidadReal: await readCard('Utilidad real'),
  };
}

export async function openDisponibilidadDashboard(page: Page): Promise<void> {
  await page.goto('/operaciones/disponibilidad');
  await page.getByRole('heading', { name: 'Disponibilidad operativa' }).waitFor({ state: 'visible', timeout: 60_000 });
}

export async function registerIndisponibilidadOnVehicle(
  page: Page,
  opts: { vehicleId: number; comentario: string; fechaFin?: string },
): Promise<{ id: number; comentario: string; placa: string }> {
  await page.goto(`/vehiculos/${opts.vehicleId}`);
  await page.getByRole('button', { name: 'Registrar indisponibilidad' }).click();
  await page.getByRole('dialog', { name: 'Registrar indisponibilidad' }).waitFor({ state: 'visible', timeout: 15_000 });

  const dialog = page.getByRole('dialog', { name: 'Registrar indisponibilidad' });
  const placa = (await page.locator('p.text-gray-600.font-mono').first().textContent())?.trim() ?? '';

  await dialog.getByLabel('Fecha inicio').fill(todayStr());
  if (opts.fechaFin) {
    await dialog.getByLabel('Fecha fin (opcional)').fill(opts.fechaFin);
  }
  await dialog.locator('textarea').fill(opts.comentario);

  const insertResponse = page.waitForResponse(
    (resp) =>
      VEHICLE_DOWNTIME_REST_PATH.test(resp.url()) &&
      resp.request().method() === 'POST' &&
      resp.status() >= 200 &&
      resp.status() < 300,
    { timeout: 60_000 },
  );
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  const resp = await insertResponse;
  const body = (await resp.json()) as { id?: number | string; comentario?: string };
  const id = body.id != null ? Number(body.id) : NaN;
  if (!Number.isFinite(id)) throw new Error('E2E downtime: POST sin id');
  registerQaVehicleDowntime(id, opts.comentario);
  await dialog.waitFor({ state: 'hidden', timeout: 30_000 });
  return { id, comentario: opts.comentario, placa };
}

export async function expectPlacaEnDisponibilidadDashboard(page: Page, placa: string): Promise<void> {
  await openDisponibilidadDashboard(page);
  await expect(page.getByRole('table').getByText(placa).first()).toBeVisible({ timeout: 45_000 });
}

export async function cerrarIndisponibilidadOnVehicle(page: Page, vehicleId: number): Promise<void> {
  await page.goto(`/vehiculos/${vehicleId}`);
  await page.getByRole('button', { name: 'Cerrar' }).first().click();
  await page.getByRole('dialog', { name: 'Cerrar indisponibilidad' }).waitFor({ state: 'visible', timeout: 15_000 });
  const dialog = page.getByRole('dialog', { name: 'Cerrar indisponibilidad' });
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 30_000 });
}

export async function cleanupQaVehicleDowntimeOrFail(id: number): Promise<void> {
  const res = await deleteVehicleDowntimeViaApiDirect(String(id));
  if (!res.ok) {
    throw new Error(`CLEANUP FALLÓ vehicle_downtime id=${id}: ${res.error ?? 'desconocido'}`);
  }
  await expectQaVehicleDowntimeAbsentInSupabase(String(id));
}

export async function resolveVehicleIdForTest(page: Page, preferredId = 1): Promise<number> {
  await page.goto(`/vehiculos/${preferredId}`);
  const missing = page.getByText('Vehículo no encontrado');
  if (!(await missing.isVisible().catch(() => false))) {
    return preferredId;
  }
  await page.goto('/vehiculos/inventario');
  await page.getByRole('heading', { name: /Inventario/i }).waitFor({ state: 'visible', timeout: 90_000 });
  const verBtn = page.getByRole('button', { name: 'Ver' }).first();
  await verBtn.waitFor({ state: 'visible', timeout: 30_000 });
  await verBtn.click();
  await page.waitForURL(/\/vehiculos\/\d+/, { timeout: 30_000 });
  const m = page.url().match(/\/vehiculos\/(\d+)/);
  if (!m) throw new Error('E2E: no se pudo resolver vehicleId desde inventario.');
  return Number(m[1]);
}
