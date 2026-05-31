import type { Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { QA_PREFIX, qaDbWritesEnabled } from './qa';
import { createQaSupabaseClient, resolveQaEmpresaId } from './qa-supabase';
import {
  QA_CLEANUP_REPORT_FILE,
  getFailedQaEntities,
  getPendingQaEntities,
  type QaEntityRecord,
  updateQaEntityStatus,
} from './qa-registry';
import { enterGastosCategoriaTab, searchGastoHistorial } from './gastos-form';

export interface QaCleanupReport {
  ranAt: string;
  deleted: QaEntityRecord[];
  failed: Array<QaEntityRecord & { error: string }>;
  pending: QaEntityRecord[];
}

const GASTO_HISTORIAL_TABS = [
  'Administrativos',
  'Financieros',
  'Operativos por vehículo',
  'Operativo flota general',
  'Globales',
] as const;

async function fetchGastoComentarios(
  client: SupabaseClient,
  id: string,
  empresaId: string | null,
): Promise<string | null> {
  let q = client.from('gastos').select('comentarios').eq('id', id);
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;
  return typeof (data as { comentarios?: unknown }).comentarios === 'string'
    ? (data as { comentarios: string }).comentarios
    : null;
}

async function fetchVehiculoPlaca(
  client: SupabaseClient,
  id: string,
  empresaId: string | null,
): Promise<string | null> {
  let q = client.from('vehiculos').select('placa').eq('id', id);
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;
  return typeof (data as { placa?: unknown }).placa === 'string'
    ? (data as { placa: string }).placa
    : null;
}

function isSafeQaGastoComentarios(comentarios: string | null | undefined): boolean {
  return Boolean(comentarios?.includes(QA_PREFIX));
}

function isSafeQaPlaca(placa: string | null | undefined): boolean {
  return Boolean(placa && /^QA/i.test(placa.trim()));
}

async function deleteGastoViaApi(
  client: SupabaseClient,
  id: string,
  empresaId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const comentarios = await fetchGastoComentarios(client, id, empresaId);
  if (comentarios == null) return { ok: true };
  if (!isSafeQaGastoComentarios(comentarios)) {
    return { ok: false, error: `Refusing delete: comentarios sin ${QA_PREFIX}` };
  }
  let q = client.from('gastos').delete().eq('id', id);
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function deleteVehiculoViaApi(
  client: SupabaseClient,
  id: string,
  empresaId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const placa = await fetchVehiculoPlaca(client, id, empresaId);
  if (placa == null) return { ok: true };
  if (!isSafeQaPlaca(placa)) {
    return { ok: false, error: `Refusing delete: placa no QA (${placa})` };
  }
  let q = client.from('vehiculos').delete().eq('id', id);
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function fetchKilometrajeDescripcion(
  client: SupabaseClient,
  id: string,
  empresaId: string | null,
): Promise<string | null> {
  let q = client.from('kilometrajes').select('descripcion').eq('id', id);
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;
  return typeof (data as { descripcion?: unknown }).descripcion === 'string'
    ? (data as { descripcion: string }).descripcion
    : null;
}

function isSafeQaKmDescripcion(descripcion: string | null | undefined): boolean {
  return Boolean(descripcion?.includes(QA_PREFIX));
}

async function fetchControlFechaComentarios(
  client: SupabaseClient,
  id: string,
  empresaId: string | null,
): Promise<string | null> {
  let q = client.from('control_fechas').select('comentarios').eq('id', id);
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;
  return typeof (data as { comentarios?: unknown }).comentarios === 'string'
    ? (data as { comentarios: string }).comentarios
    : null;
}

function isSafeQaControlFechaComentarios(comentarios: string | null | undefined): boolean {
  return Boolean(comentarios?.includes(QA_PREFIX));
}

async function deleteControlFechaViaApi(
  client: SupabaseClient,
  id: string,
  empresaId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const comentarios = await fetchControlFechaComentarios(client, id, empresaId);
  if (comentarios == null) return { ok: true };
  if (!isSafeQaControlFechaComentarios(comentarios)) {
    return { ok: false, error: `Refusing delete: comentarios sin ${QA_PREFIX}` };
  }
  let q = client.from('control_fechas').delete().eq('id', id);
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function deleteKilometrajeViaApi(
  client: SupabaseClient,
  id: string,
  empresaId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const descripcion = await fetchKilometrajeDescripcion(client, id, empresaId);
  if (descripcion == null) return { ok: true };
  if (!isSafeQaKmDescripcion(descripcion)) {
    return { ok: false, error: `Refusing delete: descripcion sin ${QA_PREFIX}` };
  }
  let q = client.from('kilometrajes').delete().eq('id', id);
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const CLEANUP_KIND_ORDER: Record<QaEntityRecord['kind'], number> = {
  control_fecha: 0,
  kilometraje: 1,
  gasto: 2,
  vehiculo: 3,
};

function sortPendingForCleanup(entities: QaEntityRecord[]): QaEntityRecord[] {
  return [...entities].sort((a, b) => CLEANUP_KIND_ORDER[a.kind] - CLEANUP_KIND_ORDER[b.kind]);
}

async function deleteGastoViaUi(page: Page, tag: string): Promise<boolean> {
  if (!tag.includes(QA_PREFIX)) return false;

  await page.goto('/finanzas/inversiones/utilidad');
  await searchGastoHistorial(page, tag).catch(() => undefined);
  if (await tryDeleteGastoRow(page, tag)) return true;

  for (const tab of GASTO_HISTORIAL_TABS) {
    try {
      await enterGastosCategoriaTab(page, tab);
      await searchGastoHistorial(page, tag);
      if (await tryDeleteGastoRow(page, tag)) return true;
    } catch {
      // siguiente pestaña
    }
  }
  return false;
}

async function tryDeleteGastoRow(page: Page, tag: string): Promise<boolean> {
  const row = page.locator('tr', { hasText: tag }).first();
  if (!(await row.isVisible().catch(() => false))) return false;
  await row.getByRole('button', { name: 'Eliminar' }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirmar eliminación' });
  await confirm.waitFor({ state: 'visible', timeout: 10_000 });
  await confirm.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await confirm.waitFor({ state: 'hidden', timeout: 60_000 });
  return true;
}

export function writeCleanupReport(report: QaCleanupReport): void {
  fs.mkdirSync(path.dirname(QA_CLEANUP_REPORT_FILE), { recursive: true });
  fs.writeFileSync(QA_CLEANUP_REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
}

export async function cleanupQaEntities(opts?: {
  testKey?: string;
  page?: Page;
}): Promise<QaCleanupReport> {
  const label = opts?.testKey ?? 'globalTeardown';
  const report: QaCleanupReport = {
    ranAt: new Date().toISOString(),
    deleted: [],
    failed: [],
    pending: [],
  };

  if (!qaDbWritesEnabled()) return report;

  const pending = getPendingQaEntities(opts?.testKey);
  if (pending.length === 0) return report;

  // eslint-disable-next-line no-console
  console.info(`[QA CLEANUP] start · ${label} · pending=${pending.length}`);

  let client: SupabaseClient | null = null;
  let empresaId: string | null = null;
  try {
    client = await createQaSupabaseClient();
    empresaId = await resolveQaEmpresaId(client);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    for (const entity of pending) {
      updateQaEntityStatus(entity.kind, entity.id, {
        cleanupStatus: 'failed',
        cleanupError: msg,
        cleanupMethod: 'none',
      });
      report.failed.push({ ...entity, cleanupStatus: 'failed', cleanupError: msg, error: msg });
    }
    writeCleanupReport(report);
    // eslint-disable-next-line no-console
    console.info(
      `[QA CLEANUP] end · ${label} · deleted=${report.deleted.length} failed=${report.failed.length} pending=${report.pending.length}`,
    );
    return report;
  }

  for (const entity of sortPendingForCleanup(pending)) {
    try {
      let ok = false;
      let method: QaEntityRecord['cleanupMethod'] = 'api';
      let errorMsg: string | undefined;

      if (entity.kind === 'gasto') {
        const api = await deleteGastoViaApi(client, entity.id, empresaId);
        ok = api.ok;
        errorMsg = api.error;
        if (!ok && opts?.page) {
          method = 'ui';
          ok = await deleteGastoViaUi(opts.page, entity.label);
          if (!ok && !errorMsg) errorMsg = 'No se encontró fila en UI para eliminar';
        }
      } else if (entity.kind === 'vehiculo') {
        const api = await deleteVehiculoViaApi(client, entity.id, empresaId);
        ok = api.ok;
        errorMsg = api.error;
        if (!ok && !errorMsg) {
          errorMsg = 'DELETE vehiculo no disponible (RLS/FK). Borrado manual por placa QA.';
        }
      } else if (entity.kind === 'kilometraje') {
        const api = await deleteKilometrajeViaApi(client, entity.id, empresaId);
        ok = api.ok;
        errorMsg = api.error;
      } else if (entity.kind === 'control_fecha') {
        const api = await deleteControlFechaViaApi(client, entity.id, empresaId);
        ok = api.ok;
        errorMsg = api.error;
      }

      if (ok) {
        updateQaEntityStatus(entity.kind, entity.id, {
          cleanupStatus: 'deleted',
          cleanupMethod: method,
          cleanupError: undefined,
        });
        report.deleted.push({ ...entity, cleanupStatus: 'deleted', cleanupMethod: method });
        // eslint-disable-next-line no-console
        console.info(`[QA_AUTO cleanup] deleted ${entity.kind} id=${entity.id} (${entity.label})`);
      } else {
        const err = errorMsg ?? 'cleanup falló';
        updateQaEntityStatus(entity.kind, entity.id, {
          cleanupStatus: 'failed',
          cleanupError: err,
          cleanupMethod: method,
        });
        report.failed.push({ ...entity, cleanupStatus: 'failed', cleanupError: err, error: err });
        // eslint-disable-next-line no-console
        console.warn(`[QA_AUTO cleanup] FAILED ${entity.kind} id=${entity.id}: ${err}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateQaEntityStatus(entity.kind, entity.id, {
        cleanupStatus: 'failed',
        cleanupError: msg,
        cleanupMethod: 'none',
      });
      report.failed.push({ ...entity, cleanupStatus: 'failed', cleanupError: msg, error: msg });
    }
  }

  report.pending = getPendingQaEntities(opts?.testKey);
  writeCleanupReport(report);
  // eslint-disable-next-line no-console
  console.info(
    `[QA CLEANUP] end · ${label} · deleted=${report.deleted.length} failed=${report.failed.length} pending=${report.pending.length}`,
  );
  return report;
}

export function formatCleanupReportSummary(report: QaCleanupReport): string {
  const lines = [
    `[QA_AUTO] Cleanup ${report.ranAt}`,
    `  eliminados: ${report.deleted.length}`,
    `  fallidos: ${report.failed.length}`,
    `  pendientes: ${report.pending.length}`,
  ];
  for (const f of report.failed) {
    lines.push(`  · FALLÓ ${f.kind} id=${f.id} label=${f.label} — ${f.error}`);
  }
  for (const p of report.pending) {
    lines.push(`  · PENDIENTE ${p.kind} id=${p.id} label=${p.label} test=${p.testKey}`);
  }
  const legacyFailed = getFailedQaEntities();
  for (const f of legacyFailed) {
    if (!report.failed.some((x) => x.kind === f.kind && x.id === f.id)) {
      lines.push(`  · FALLÓ (previo) ${f.kind} id=${f.id} — ${f.cleanupError ?? '?'}`);
    }
  }
  return lines.join('\n');
}
