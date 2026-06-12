/**
 * Aplica / revierte en lote la reclasificación devolución garantía confirmada en preview.
 * Solo actualiza tipo_gasto / subtipo_gasto (+ metadatos de clasificación); no toca monto, fecha, comentarios.
 */
import type { Gasto } from '../data/types';
import { REVISION_USER_LABEL } from '../config/app';
import { getAuthenticatedUserIdForAudit } from '../services/authAuditUser';
import { insertFinancialAuditLog } from '../services/financialAuditService';
import { updateGastoCategoriaManual } from '../services/gastosService';
import { normalizeGastoVehicleFkForDb } from '../utils/vehicleId';
import {
  DEVOLUCION_GARANTIA_AUDIT_ACTION,
  DEVOLUCION_GARANTIA_TARGET_SUBTIPO,
  DEVOLUCION_GARANTIA_TARGET_TIPO,
  type DevolucionGarantiaCandidato,
  isDevolucionGarantiaCandidato,
} from './devolucionGarantiaReclasificacion';

export const DEVOLUCION_GARANTIA_ROLLBACK_STORAGE_KEY = 'la-moneda:devolucion-garantia:last-batch';

export type DevolucionGarantiaRollbackEntry = {
  id: string;
  tipo_gasto: string;
  subtipo_gasto: string | null;
  vehicle_id: number | string | null;
  excel_extra: Record<string, unknown> | null;
};

export type DevolucionGarantiaBatchSnapshot = {
  batchId: string;
  appliedAt: string;
  entries: DevolucionGarantiaRollbackEntry[];
  summary: {
    exitos: number;
    fallos: number;
    montoTotal: number;
  };
};

export type DevolucionGarantiaApplyItemResult =
  | {
      ok: true;
      id: string;
      prevTipo: string;
      prevSubtipo: string | null;
      gasto: Gasto;
    }
  | { ok: false; id: string; message: string };

export type DevolucionGarantiaApplySummary = {
  batchId: string;
  total: number;
  exitos: number;
  fallos: number;
  montoTotal: number;
  items: DevolucionGarantiaApplyItemResult[];
  rollbackEntries: DevolucionGarantiaRollbackEntry[];
};

export type DevolucionGarantiaApplyProgress = {
  batchId: string;
  current: number;
  total: number;
  gastoId: string | null;
};

function buildExcelExtraWithCorrection(
  gasto: Gasto,
  prevTipo: string,
  prevSub: string | null,
  vehicleId: number | string | null,
  batchId: string,
): Record<string, unknown> {
  const prevExtra =
    gasto.excelExtra && typeof gasto.excelExtra === 'object' ? gasto.excelExtra : {};
  const prevHistRaw = (prevExtra as Record<string, unknown>).correcciones_categoria;
  const prevHist = Array.isArray(prevHistRaw) ? prevHistRaw : [];
  const changedAt = new Date().toISOString();
  const correction = {
    batch: 'devolucion_garantia',
    batch_id: batchId,
    from_tipo_gasto: prevTipo,
    to_tipo_gasto: DEVOLUCION_GARANTIA_TARGET_TIPO,
    from_subtipo_gasto: prevSub,
    to_subtipo_gasto: DEVOLUCION_GARANTIA_TARGET_SUBTIPO,
    from_vehicle_id: vehicleId,
    to_vehicle_id: vehicleId,
    changed_at: changedAt,
  };
  return {
    ...(prevExtra as Record<string, unknown>),
    correcciones_categoria: [...prevHist, correction],
  };
}

async function auditDevolucionGarantiaMove(params: {
  gastoId: string;
  oldTipo: string;
  oldSubtipo: string | null;
  newTipo: string;
  newSubtipo: string;
  vehicleId: number | string | null;
  reason: string;
  tenantEmpresaId: string;
}): Promise<void> {
  const auditUserId = await getAuthenticatedUserIdForAudit();
  if (!auditUserId) {
    console.warn('[devolucion-garantia] Sin usuario auth para auditoría; gasto ya actualizado.');
    return;
  }
  await insertFinancialAuditLog(
    {
      user_id: auditUserId,
      action_type: DEVOLUCION_GARANTIA_AUDIT_ACTION,
      entity_type: 'gasto',
      entity_id: params.gastoId,
      old_data: {
        tipo_gasto: params.oldTipo,
        subtipo_gasto: params.oldSubtipo,
        vehicle_id: params.vehicleId,
      },
      new_data: {
        tipo_gasto: params.newTipo,
        subtipo_gasto: params.newSubtipo,
        vehicle_id: params.vehicleId,
      },
      reason: params.reason,
    },
    params.tenantEmpresaId,
  );
}

async function applyOneDevolucionGarantia(params: {
  gasto: Gasto;
  batchId: string;
  tenantEmpresaId: string;
}): Promise<DevolucionGarantiaApplyItemResult> {
  const { gasto, batchId, tenantEmpresaId } = params;
  const prevTipo = gasto.tipo_gasto ?? 'operativo_vehiculo';
  const prevSub = gasto.subtipo_gasto ?? null;
  const vehicleId = normalizeGastoVehicleFkForDb(gasto.vehicleId);
  const changedAt = new Date().toISOString();
  const excelExtraNext = buildExcelExtraWithCorrection(gasto, prevTipo, prevSub, vehicleId, batchId);

  const result = await updateGastoCategoriaManual(
    gasto.id,
    {
      tipo_gasto: DEVOLUCION_GARANTIA_TARGET_TIPO,
      subtipo_gasto: DEVOLUCION_GARANTIA_TARGET_SUBTIPO,
      vehicle_id: vehicleId,
      es_global_flota: false,
      clasificacion_manual: true,
      requiere_revision: false,
      revisado_at: changedAt,
      revisado_por: REVISION_USER_LABEL,
      origen_clasificacion: 'devolucion_garantia_lote',
      excel_extra: excelExtraNext,
    },
    {
      reason: 'Devolución de garantía → financiero_prestamo / compra_activo (lote confirmado)',
      skipAudit: true,
    },
    tenantEmpresaId,
  );

  if (!result.ok) {
    return { ok: false, id: gasto.id, message: result.message };
  }

  await auditDevolucionGarantiaMove({
    gastoId: gasto.id,
    oldTipo: prevTipo,
    oldSubtipo: prevSub,
    newTipo: DEVOLUCION_GARANTIA_TARGET_TIPO,
    newSubtipo: DEVOLUCION_GARANTIA_TARGET_SUBTIPO,
    vehicleId,
    reason:
      'Devolución de garantía reclasificada a financiero_prestamo / compra_activo (lote confirmado).',
    tenantEmpresaId,
  });

  return { ok: true, id: gasto.id, prevTipo, prevSubtipo: prevSub, gasto: result.gasto };
}

/** Aplica reclasificación solo a los candidatos del preview (IDs exactos). */
export async function applyDevolucionGarantiaBatch(params: {
  candidatos: readonly DevolucionGarantiaCandidato[];
  gastosById: ReadonlyMap<string, Gasto>;
  tenantEmpresaId: string;
  onProgress?: (p: DevolucionGarantiaApplyProgress) => void;
}): Promise<DevolucionGarantiaApplySummary> {
  const { candidatos, gastosById, tenantEmpresaId, onProgress } = params;
  const batchId = crypto.randomUUID();
  const total = candidatos.length;
  const items: DevolucionGarantiaApplyItemResult[] = [];
  const rollbackEntries: DevolucionGarantiaRollbackEntry[] = [];
  let exitos = 0;
  let fallos = 0;
  let montoTotal = 0;

  for (let i = 0; i < candidatos.length; i += 1) {
    const c = candidatos[i];
    onProgress?.({ batchId, current: i + 1, total, gastoId: c.id });

    const gasto = gastosById.get(c.id);
    if (!gasto) {
      fallos += 1;
      items.push({ ok: false, id: c.id, message: 'Gasto no encontrado en memoria.' });
      continue;
    }
    if (!isDevolucionGarantiaCandidato(gasto)) {
      fallos += 1;
      items.push({
        ok: false,
        id: c.id,
        message: 'El registro ya no cumple criterios de preview (operativo_vehiculo + devolución garantía).',
      });
      continue;
    }

    const prevExcel =
      gasto.excelExtra && typeof gasto.excelExtra === 'object'
        ? (JSON.parse(JSON.stringify(gasto.excelExtra)) as Record<string, unknown>)
        : null;

    const res = await applyOneDevolucionGarantia({ gasto, batchId, tenantEmpresaId });
    items.push(res);
    if (res.ok) {
      exitos += 1;
      montoTotal += c.monto;
      rollbackEntries.push({
        id: c.id,
        tipo_gasto: res.prevTipo,
        subtipo_gasto: res.prevSubtipo,
        vehicle_id: normalizeGastoVehicleFkForDb(gasto.vehicleId),
        excel_extra: prevExcel,
      });
    } else {
      fallos += 1;
    }
  }

  onProgress?.({ batchId, current: total, total, gastoId: null });

  return { batchId, total, exitos, fallos, montoTotal, items, rollbackEntries };
}

async function rollbackOneDevolucionGarantia(params: {
  entry: DevolucionGarantiaRollbackEntry;
  batchId: string;
  tenantEmpresaId: string;
}): Promise<{ ok: boolean; id: string; message?: string }> {
  const { entry, batchId, tenantEmpresaId } = params;
  const changedAt = new Date().toISOString();
  const currentTipo = DEVOLUCION_GARANTIA_TARGET_TIPO;
  const currentSub = DEVOLUCION_GARANTIA_TARGET_SUBTIPO;

  const result = await updateGastoCategoriaManual(
    entry.id,
    {
      tipo_gasto: entry.tipo_gasto,
      subtipo_gasto: entry.subtipo_gasto,
      vehicle_id: entry.vehicle_id,
      es_global_flota: false,
      clasificacion_manual: true,
      requiere_revision: false,
      revisado_at: changedAt,
      revisado_por: REVISION_USER_LABEL,
      origen_clasificacion: 'devolucion_garantia_rollback',
      excel_extra: entry.excel_extra,
    },
    {
      reason: 'Rollback lote devolución garantía → categoría anterior',
      skipAudit: true,
    },
    tenantEmpresaId,
  );

  if (!result.ok) {
    return { ok: false, id: entry.id, message: result.message };
  }

  await auditDevolucionGarantiaMove({
    gastoId: entry.id,
    oldTipo: currentTipo,
    oldSubtipo: currentSub,
    newTipo: entry.tipo_gasto,
    newSubtipo: entry.subtipo_gasto ?? '',
    vehicleId: entry.vehicle_id,
    reason: `Rollback lote devolución garantía (${batchId.slice(0, 8)}…).`,
    tenantEmpresaId,
  });

  return { ok: true, id: entry.id };
}

export type DevolucionGarantiaRollbackSummary = {
  batchId: string;
  total: number;
  exitos: number;
  fallos: number;
  items: { id: string; ok: boolean; message?: string }[];
};

/** Revierte por IDs usando snapshot guardado al aplicar. */
export async function rollbackDevolucionGarantiaBatch(params: {
  snapshot: DevolucionGarantiaBatchSnapshot;
  tenantEmpresaId: string;
  onProgress?: (p: DevolucionGarantiaApplyProgress) => void;
}): Promise<DevolucionGarantiaRollbackSummary> {
  const { snapshot, tenantEmpresaId, onProgress } = params;
  const total = snapshot.entries.length;
  const items: { id: string; ok: boolean; message?: string }[] = [];
  let exitos = 0;
  let fallos = 0;

  for (let i = 0; i < snapshot.entries.length; i += 1) {
    const entry = snapshot.entries[i];
    onProgress?.({
      batchId: snapshot.batchId,
      current: i + 1,
      total,
      gastoId: entry.id,
    });
    const res = await rollbackOneDevolucionGarantia({
      entry,
      batchId: snapshot.batchId,
      tenantEmpresaId,
    });
    items.push({ id: entry.id, ok: res.ok, message: res.message });
    if (res.ok) exitos += 1;
    else fallos += 1;
  }

  onProgress?.({ batchId: snapshot.batchId, current: total, total, gastoId: null });

  return { batchId: snapshot.batchId, total, exitos, fallos, items };
}

export function saveDevolucionGarantiaBatchSnapshot(snapshot: DevolucionGarantiaBatchSnapshot): void {
  try {
    sessionStorage.setItem(DEVOLUCION_GARANTIA_ROLLBACK_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    console.warn('[devolucion-garantia] No se pudo guardar snapshot de rollback en sessionStorage.');
  }
}

export function loadDevolucionGarantiaBatchSnapshot(): DevolucionGarantiaBatchSnapshot | null {
  try {
    const raw = sessionStorage.getItem(DEVOLUCION_GARANTIA_ROLLBACK_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DevolucionGarantiaBatchSnapshot;
  } catch {
    return null;
  }
}

export function clearDevolucionGarantiaBatchSnapshot(): void {
  try {
    sessionStorage.removeItem(DEVOLUCION_GARANTIA_ROLLBACK_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
