import { expect, type Page } from '@playwright/test';
import { markQaEntityCleaned, registerQaControlFecha } from './qa-registry';
import { isoDateOffset, qaDocTag, qaTag } from './qa';
import { createQaVehiculoForTest } from './flota-form';

export const CONTROL_FECHAS_REST_PATH = /\/rest\/v1\/control_fechas/;

export function qaTestDocLog(step: string): void {
  // eslint-disable-next-line no-console
  console.log(`[QA DOC] ${step}`);
}

export async function openDocumentacionPage(page: Page): Promise<void> {
  if (!page.url().includes('/operaciones/docs')) {
    await page.goto('/operaciones/docs');
  }
  await page.getByRole('heading', { name: 'Documentación' }).waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator('#registro-vencimiento-supabase').waitFor({ state: 'visible', timeout: 30_000 });
}

export async function openRegistrarVencimientoForm(page: Page): Promise<void> {
  await openDocumentacionPage(page);
  const panel = page.locator('#registro-vencimiento-supabase');
  const toggle = panel.getByRole('button', { name: 'Registrar vencimiento' }).first();
  await toggle.click();
  await panel.getByRole('button', { name: 'Guardar en Supabase' }).waitFor({ state: 'visible', timeout: 15_000 });
}

export async function loadHistorialCompleto(page: Page): Promise<void> {
  await openDocumentacionPage(page);
  const btn = page.getByRole('button', { name: 'Ver historial completo' });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
  }
  await expect(page.getByRole('button', { name: 'Viendo historial completo' })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/documentos cargados/i).first()).toBeVisible({ timeout: 120_000 });
}

export async function searchDocumentacionHistorial(page: Page, query: string): Promise<void> {
  const input = page.getByLabel(/Buscar en historial completo|Filtrar solo en esta página/i);
  await input.fill(query);
}

function historialRow(page: Page, tag: string) {
  return page.locator('.divide-y.divide-gray-50 > div').filter({ hasText: tag });
}

export async function expectDocumentoVisible(page: Page, tag: string): Promise<void> {
  await loadHistorialCompleto(page);
  await searchDocumentacionHistorial(page, tag);
  await expect(historialRow(page, tag)).toBeVisible({ timeout: 45_000 });
}

export async function expectDocumentoNotVisible(page: Page, tag: string): Promise<void> {
  await loadHistorialCompleto(page);
  await searchDocumentacionHistorial(page, tag);
  await expect(historialRow(page, tag)).toHaveCount(0, { timeout: 45_000 });
}

export type QaDocumentoCreateOpts = {
  vehicleId?: number;
  vehiclePlaca?: string;
  tag?: string;
  tipo?: string;
  fechaVencimiento?: string;
};

/** Crea vehículo QA + registro control_fechas vía UI. */
export async function registerQaDocumento(
  page: Page,
  opts?: QaDocumentoCreateOpts,
): Promise<{ id: number; tag: string; vehicleId: number; placa: string }> {
  const tag = opts?.tag ?? qaDocTag();
  let vehicleId = opts?.vehicleId;
  let placa = opts?.vehiclePlaca;

  if (vehicleId == null || !placa) {
    const veh = await createQaVehiculoForTest({ modelo: qaTag('doc-veh').slice(0, 32) });
    vehicleId = veh.id;
    placa = veh.placa;
  }

  await openRegistrarVencimientoForm(page);
  const panel = page.locator('#registro-vencimiento-supabase');

  await panel.getByLabel('Vehículo').selectOption(String(vehicleId));
  if (opts?.tipo) {
    await panel.getByLabel('Tipo').selectOption(opts.tipo);
  }
  const vencimiento = opts?.fechaVencimiento ?? isoDateOffset(400);
  await panel.getByLabel('Fecha de vencimiento').fill(vencimiento);
  await panel.getByLabel(/Comentario/i).fill(tag);

  const insertResponse = page.waitForResponse(
    (resp) =>
      CONTROL_FECHAS_REST_PATH.test(resp.url()) &&
      resp.request().method() === 'POST' &&
      resp.status() >= 200 &&
      resp.status() < 300,
    { timeout: 60_000 },
  );
  await panel.getByRole('button', { name: 'Guardar en Supabase' }).click();
  const resp = await insertResponse;
  const body = (await resp.json()) as { id?: number | string };
  if (body.id == null) {
    throw new Error('Documento QA no se creó: respuesta POST sin id');
  }
  const id = Number(body.id);
  registerQaControlFecha(id, tag);
  qaTestDocLog(`documento creado id=${id} tag="${tag}" veh=${placa}`);
  return { id, tag, vehicleId, placa };
}

export async function editQaDocumento(
  page: Page,
  tag: string,
  patch: { tipo: string; comentarios: string; fechaVencimiento: string },
): Promise<void> {
  await loadHistorialCompleto(page);
  await searchDocumentacionHistorial(page, tag);
  const row = historialRow(page, tag);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByTitle('Editar documento').click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('heading', { name: 'Editar documento' }).waitFor({ state: 'visible', timeout: 15_000 });

  await modal.getByLabel('Tipo (título)').selectOption(patch.tipo);
  await modal.getByLabel('Fecha de vencimiento (estado)').fill(patch.fechaVencimiento);
  await modal.getByLabel('Descripción / comentarios').fill(patch.comentarios);

  const patchResponse = page.waitForResponse(
    (resp) =>
      CONTROL_FECHAS_REST_PATH.test(resp.url()) &&
      resp.request().method() === 'PATCH' &&
      resp.status() >= 200 &&
      resp.status() < 300,
    { timeout: 60_000 },
  );
  await modal.getByRole('button', { name: 'Guardar cambios' }).click();
  await patchResponse;
  await modal.waitFor({ state: 'hidden', timeout: 30_000 });
  qaTestDocLog(`documento editado tag="${patch.comentarios}"`);
}

export async function deleteQaDocumentoViaUi(page: Page, tag: string, id: number): Promise<void> {
  await loadHistorialCompleto(page);
  await searchDocumentacionHistorial(page, tag);
  const row = historialRow(page, tag);
  await expect(row).toBeVisible({ timeout: 30_000 });

  const deleteResponse = page.waitForResponse(
    (resp) =>
      CONTROL_FECHAS_REST_PATH.test(resp.url()) &&
      resp.request().method() === 'DELETE' &&
      resp.status() >= 200 &&
      resp.status() < 300,
    { timeout: 60_000 },
  );
  await row.getByTitle('Eliminar').click();
  await deleteResponse;
  markQaEntityCleaned(String(id), { kind: 'control_fecha', method: 'ui' });
  qaTestDocLog(`documento eliminado id=${id}`);
}

export async function expectDocumentoEstadoPorVencer(page: Page, tag: string): Promise<void> {
  await searchDocumentacionHistorial(page, tag);
  const row = historialRow(page, tag);
  await expect(row.getByText(/\d+ d(?!\.)/)).toBeVisible({ timeout: 15_000 });
}
