import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { gastoToInsert, mapGastoRow } from './supabaseMappers';
import type { Gasto } from '../data/types';
import { fetchAllSupabasePages, fetchAllSupabasePagesDetailed } from './supabaseRangeFetch';
import { devPerfAsync } from '../utils/devPerf';
import { mapGastosFinancialSummaryRow, type GastosFinancialSummary } from '../utils/gastosFinancialSummary';
import { insertFinancialAuditLog, logPostgrestError } from './financialAuditService';
import { REVISION_USER_LABEL } from '../config/app';
import { getAuthenticatedUserIdForAudit } from './authAuditUser';
import { logRlsDebugContext, fetchDebugCanUpdateGastoRow } from './rlsDebugService';
import type { VehicleIdLike } from '../utils/vehicleId';
import { normalizeGastoVehicleFkForDb } from '../utils/vehicleId';
import { getDetalleMetodoByLabel } from '../data/factCatalog';
import {
  deepSanitizeUuidPoisonInJson,
  sanitizePostgrestRowZeroIdColumns,
  UUID_REGEX_FLAT,
  vehicleIdAuditScalar,
  cleanUuid,
} from '../utils/uuidColumn';
import { stampCreatedByExtra } from '../utils/amountPermissions';
import { isOperadorVisibleTipoGasto } from '../utils/permissions';
import {
  tipoGastoAdmiteVehiculoOpcional,
  tipoGastoRequiereVehiculo,
} from '../utils/gastoMoveCategoriaDefaults';
import { isValidGastoPrimaryKey } from '../utils/ingresoRecordId';
import { splitGeneralSearchQuery } from '../utils/generalRecordSearch';

const MSG_GASTO_ID_INVALID =
  'Este registro no tiene ID válido. Recarga la página o revisa el mapeo desde Supabase.';

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

function normalizeGastoIdParam(id: unknown): string {
  return typeof id === 'string' ? id.trim() : String(id ?? '').trim();
}

/** Campos de clasificación / revisión (Supabase snake_case vía mapeo). */
export type ClasificacionGastoPatch = Partial<{
  tipo_gasto: string | null;
  subtipo_gasto: string | null;
  clasificacion_confianza: number | null;
  requiere_revision: boolean | null;
  clasificacion_manual: boolean | null;
  revisado_por: string | null;
  revisado_at: string | null;
}>;

export type GastoCategoriaManualPatch = Partial<{
  tipo_gasto: string | null;
  subtipo_gasto: string | null;
  /** bigint o uuid en BD; nunca 0 / "0" / cadena vacía para categorías sin vehículo. */
  vehicle_id: number | string | null;
  es_global_flota: boolean | null;
  clasificacion_manual: boolean | null;
  clasificacion_confianza: number | null;
  requiere_revision: boolean | null;
  revisado_por: string | null;
  revisado_at: string | null;
  origen_clasificacion: string | null;
  excel_extra: Record<string, unknown> | null;
}>;

/** Origen de la operación para decidir qué fila(s) de auditoría crear. */
export type GastoAuditSourceAction = 'move_category' | 'undo_move_category';

export interface GastoAuditMeta {
  reason?: string | null;
  /** Flujo «mover categoría» / deshacer: una sola fila consolidada en historial. */
  sourceAction?: GastoAuditSourceAction;
  /** Si true, no inserta fila en financial_audit_logs (el caller audita por su cuenta). */
  skipAudit?: boolean;
}

/** Opciones de ejecución (p. ej. clasificación operador sin SELECT post-move). */
export type UpdateGastoCategoriaManualOptions = {
  /** Operador: UPDATE sin `.select()` si destino no es tab visible (globales/pendiente). */
  operatorClassifyMode?: boolean;
};

export type UpdateGastoCategoriaManualFailure = {
  ok: false;
  message: string;
  gastoId: string;
  empresaIdFrontend: string;
  empresaIdRow: string | null;
  supabase?: { message: string; code?: string; details?: string; hint?: string };
  updatePayload: Record<string, unknown>;
  patchSummary: {
    tipo_gasto?: string | null;
    subtipo_gasto?: string | null;
    vehicle_id?: number | string | null;
    es_global_flota?: boolean | null;
  };
};

export type UpdateGastoCategoriaManualResult =
  | { ok: true; gasto: Gasto; movedOutOfView?: boolean }
  | UpdateGastoCategoriaManualFailure;

async function fetchGastoEmpresaIdForDiagnostics(id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('gastos')
    .select('empresa_id')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const e = (data as Record<string, unknown>).empresa_id;
  if (e == null || e === '') return null;
  return String(e);
}

/** Solo en desarrollo: payload que se enviará al UPDATE de `public.gastos`. */
export function debugMoveGastoPayload(
  id: string,
  patch: GastoCategoriaManualPatch,
  updateRow: Record<string, unknown>,
): void {
  if (!import.meta.env.DEV) return;
  console.debug('[debugMoveGastoPayload]', {
    gastoId: id,
    patch,
    updateRow,
    empresaIdFrontend: EMPRESA_ID || '(vacío)',
  });
}

/**
 * Una sola fila de auditoría al mover/revertir categoría (sin logs hijos de edición o vehículo).
 * old_data / new_data conservan el snapshot completo para trazabilidad.
 */
async function auditGastoMoveCategoryLogs(
  id: string,
  before: Record<string, unknown> | null,
  afterRow: Record<string, unknown>,
  meta: GastoAuditMeta,
): Promise<void> {
  try {
    const auditUserId = await getAuthenticatedUserIdForAudit();
    if (!auditUserId) {
      console.warn('[gastos] Sin usuario de auth válido para audit; el gasto ya fue actualizado.');
      return;
    }
    if (!before) return;
    const isUndo = meta.sourceAction === 'undo_move_category';
    const actionType = isUndo ? 'undo_move_category' : 'move_category';
    const reasonDefault = isUndo ? 'Deshacer mover categoría' : 'Mover gasto de categoría';
    const reason = meta.reason?.trim() || reasonDefault;
    const ok = await insertFinancialAuditLog({
      user_id: auditUserId,
      action_type: actionType,
      entity_type: 'gasto',
      entity_id: String(id),
      old_data: before,
      new_data: afterRow,
      reason,
    });
    if (!ok) {
      console.warn(`[gastos] audit "${actionType}": insert devolvió false (el gasto ya está actualizado).`);
    }
  } catch (e) {
    console.warn('[gastos] auditoría post-move_category: error global (gasto ya actualizado):', e);
  }
}

function clasificacionPatchToRow(patch: ClasificacionGastoPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.tipo_gasto !== undefined) row.tipo_gasto = patch.tipo_gasto;
  if (patch.subtipo_gasto !== undefined) row.subtipo_gasto = patch.subtipo_gasto;
  if (patch.clasificacion_confianza !== undefined) row.clasificacion_confianza = patch.clasificacion_confianza;
  if (patch.requiere_revision !== undefined) row.requiere_revision = patch.requiere_revision;
  if (patch.clasificacion_manual !== undefined) row.clasificacion_manual = patch.clasificacion_manual;
  if (patch.revisado_por !== undefined) row.revisado_por = patch.revisado_por;
  if (patch.revisado_at !== undefined) row.revisado_at = patch.revisado_at;
  return row;
}

/** Serializa a JSON seguro para columna jsonb (evita referencias circulares / no serializables). */
function sanitizeForJsonbColumn(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    console.warn('[gastos] sanitizeForJsonbColumn: no serializable, se omite excel_extra');
    return null;
  }
}

/** Campos operativos Fact / KPI editables desde «Detalles del registro» (no incluye tipo_gasto financiero). */
export type GastoDetalleManualPatch = Partial<{
  fecha: string;
  fechaRegistro: string;
  vehicleId: number | null;
  subtipo_gasto: string | null;
  tipo: string;
  subTipo: string | null;
  categoria: Gasto['categoria'];
  motivo: string;
  metodoPago: string;
  metodoPagoDetalle: string;
  monto: number;
  comentarios: string;
  /** Solo undo: restaurar actividad previa. Si se omite, el servicio escribe revisado_at = now(). */
  revisado_at?: string | null;
  revisado_por?: string | null;
}>;

export type UpdateGastoDetalleManualResult =
  | { ok: true; gasto: Gasto }
  | {
      ok: false;
      gasto: null;
      error: string;
      supabase?: { message: string; code?: string; details?: string; hint?: string };
    };

function gastoDetalleManualPatchToRow(patch: GastoDetalleManualPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.fecha !== undefined) row.fecha = patch.fecha;
  if (patch.fechaRegistro !== undefined) row.fecha_registro = patch.fechaRegistro;
  if (patch.vehicleId !== undefined) {
    row.vehicle_id = patch.vehicleId;
    row.es_global_flota = patch.vehicleId == null;
  }
  if (patch.subtipo_gasto !== undefined) row.subtipo_gasto = patch.subtipo_gasto;
  if (patch.tipo !== undefined) row.tipo = patch.tipo;
  if (patch.subTipo !== undefined) row.sub_tipo = patch.subTipo;
  if (patch.categoria !== undefined) row.categoria = patch.categoria;
  if (patch.motivo !== undefined) row.motivo = patch.motivo;
  if (patch.metodoPago !== undefined) row.metodo_pago = patch.metodoPago;
  if (patch.metodoPagoDetalle !== undefined) row.metodo_pago_detalle = patch.metodoPagoDetalle;
  if (patch.metodoPago !== undefined && patch.metodoPagoDetalle !== undefined) {
    const det = getDetalleMetodoByLabel(patch.metodoPago, patch.metodoPagoDetalle);
    row.celular_metodo = det?.celular?.trim() ? det.celular.trim() : null;
  }
  if (patch.monto !== undefined) row.monto = patch.monto;
  if (patch.comentarios !== undefined) row.comentarios = patch.comentarios;
  if (patch.revisado_at !== undefined) row.revisado_at = patch.revisado_at;
  if (patch.revisado_por !== undefined) row.revisado_por = patch.revisado_por;
  return row;
}

function gastoDetallePatchTouchesOnlyVehicle(patch: GastoDetalleManualPatch): boolean {
  if (patch.vehicleId === undefined) return false;
  const otherKeys: (keyof GastoDetalleManualPatch)[] = [
    'fecha',
    'fechaRegistro',
    'subtipo_gasto',
    'tipo',
    'subTipo',
    'categoria',
    'motivo',
    'metodoPago',
    'metodoPagoDetalle',
    'monto',
    'comentarios',
  ];
  return !otherKeys.some((k) => patch[k] !== undefined);
}

async function auditGastoDetalleManualAfterUpdate(
  id: string,
  before: Record<string, unknown> | null,
  afterRow: Record<string, unknown>,
  patch: GastoDetalleManualPatch,
): Promise<void> {
  try {
    const auditUserId = await getAuthenticatedUserIdForAudit();
    if (!auditUserId || !before) return;

    const beforeVeh = vehicleIdAuditScalar(before.vehicle_id);
    const afterVeh = vehicleIdAuditScalar(afterRow.vehicle_id);
    const vehicleOnly = gastoDetallePatchTouchesOnlyVehicle(patch) && beforeVeh !== afterVeh;

    if (vehicleOnly) {
      await insertFinancialAuditLog({
        user_id: auditUserId,
        action_type: 'change_vehicle_id',
        entity_type: 'gasto',
        entity_id: String(id),
        old_data: { vehicle_id: beforeVeh, ...before },
        new_data: { vehicle_id: afterVeh, ...afterRow },
        reason: 'Cambio de vehículo desde historial de gastos',
      });
      return;
    }

    await insertFinancialAuditLog({
      user_id: auditUserId,
      action_type: 'edit_expense',
      entity_type: 'gasto',
      entity_id: String(id),
      old_data: before,
      new_data: afterRow,
      reason: 'Edición manual de detalle desde historial de gastos',
    });
  } catch (e) {
    console.warn('[gastos] audit edit_expense post-detalle (gasto ya actualizado):', e);
  }
}

/**
 * UPDATE parcial en `public.gastos` (campos Fact / KPI). No modifica tipo_gasto/subtipo_gasto financiero.
 * Auditoría opcional en try/catch separado; el UPDATE no depende de ella.
 */
export async function updateGastoDetalleManual(
  id: string,
  patch: GastoDetalleManualPatch,
  tenantEmpresaId?: string | null,
): Promise<UpdateGastoDetalleManualResult> {
  const empresaIdFrontend = resolveTenantId(tenantEmpresaId) || '';
  const idNorm = normalizeGastoIdParam(id);
  const fail = (
    error: string,
    supabase?: { message: string; code?: string; details?: string; hint?: string },
  ): UpdateGastoDetalleManualResult => {
    const out: UpdateGastoDetalleManualResult = { ok: false, gasto: null, error, supabase };
    console.error('[gastos updateGastoDetalleManual] FALLO', { id: idNorm, patch, ...out });
    return out;
  };

  if (!isValidGastoPrimaryKey(idNorm)) {
    return fail(MSG_GASTO_ID_INVALID);
  }

  if (!empresaIdFrontend) {
    return fail('VITE_EMPRESA_ID no está configurado en el frontend.');
  }

  const empresaIdRow = await fetchGastoEmpresaIdForDiagnostics(idNorm);
  if (empresaIdRow != null && empresaIdRow !== empresaIdFrontend) {
    return fail(
      `El gasto #${idNorm} pertenece a otra empresa (empresa_id en fila ≠ VITE_EMPRESA_ID). Corrige el entorno o el registro.`,
    );
  }

  const before = await fetchGastoRawById(idNorm, empresaIdFrontend);
  const oldRevisadoAt =
    typeof before?.revisado_at === 'string' ? before.revisado_at : (before?.revisado_at as string | null) ?? null;

  const row = gastoDetalleManualPatchToRow(patch);
  if (Object.keys(row).length === 0) {
    return fail('No hay campos para actualizar (patch vacío).');
  }

  const activityAt = new Date().toISOString();
  if (patch.revisado_at === undefined) {
    row.revisado_at = activityAt;
    row.revisado_por = REVISION_USER_LABEL;
  }

  const { data, error } = await supabase
    .from('gastos')
    .update(row)
    .eq('id', idNorm)
    .eq('empresa_id', empresaIdFrontend)
    .select('*')
    .maybeSingle();

  if (error) {
    logPostgrestError('gastos updateGastoDetalleManual UPDATE', error);
    return fail(error.message || 'Error de Supabase al actualizar el gasto.', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
  }

  if (!data) {
    const hint =
      before == null
        ? 'No existe fila con este id y empresa_id (revisa RLS o el id).'
        : 'El UPDATE no devolvió fila (0 filas afectadas). Revisa RLS o empresa_id.';
    return fail(`No se pudo actualizar el gasto #${idNorm}. ${hint}`);
  }

  const afterRow = data as Record<string, unknown>;
  void auditGastoDetalleManualAfterUpdate(idNorm, before, afterRow, patch);

  const gasto = mapGastoRow(afterRow);
  const newRevisadoAt = gasto.revisado_at ?? activityAt;

  if (import.meta.env.DEV) {
    console.log('[historial:edit-order]', {
      gastoId: idNorm,
      oldRevisadoAt,
      newRevisadoAt,
      appearsOnTop: true,
      source: 'detail_edit',
    });
    console.log('[historial:updated-at]', {
      gastoId: idNorm,
      revisado_at: newRevisadoAt,
      willSurviveRefresh: Boolean(newRevisadoAt),
    });
  }

  return { ok: true, gasto };
}

function isInvalidVehicleSentinel(v: unknown): boolean {
  if (v == null || v === '' || v === 0 || v === '0') return true;
  if (typeof v === 'string' && v.trim() === '0') return true;
  if (typeof v === 'bigint' && v === BigInt(0)) return true;
  return false;
}

function parseVehicleIdRaw(raw: unknown): string | number | null {
  if (isInvalidVehicleSentinel(raw)) return null;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (s === '') return null;
    if (UUID_REGEX_FLAT.test(s)) return s;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw === 'bigint') {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/**
 * Valor seguro para columna `vehicle_id` en `public.gastos`.
 * - Sin vehículo obligatorio ni opcional: siempre `null`.
 * - Operativo por vehículo: obligatorio (entero > 0 o uuid).
 * - Inversión: opcional; sentinels → `null`.
 */
function normalizeVehicleIdForGastoRow(
  tipoGasto: string | null | undefined,
  raw: unknown,
  subtipoGasto?: string | null,
): string | number | null {
  const t = tipoGasto == null ? '' : String(tipoGasto).trim();
  if (tipoGastoRequiereVehiculo(t, subtipoGasto)) return parseVehicleIdRaw(raw);
  if (tipoGastoAdmiteVehiculoOpcional(t)) return parseVehicleIdRaw(raw);
  return null;
}

/**
 * Última pasada antes del UPDATE: anula `*_id` = 0/"0", fuerza flota global si el tipo no lleva vehículo,
 * normaliza `vehicle_id` string numérico → number, y limpia `excel_extra` anidado.
 */
function finalizeGastoCategoriaManualUpdateRow(row: Record<string, unknown>): void {
  sanitizePostgrestRowZeroIdColumns(row);
  const tg = row.tipo_gasto;
  const ts = tg == null || tg === '' ? '' : String(tg).trim();
  const sub = row.subtipo_gasto != null ? String(row.subtipo_gasto) : '';
  if (ts && !tipoGastoRequiereVehiculo(ts, sub)) {
    if (tipoGastoAdmiteVehiculoOpcional(ts)) {
      row.vehicle_id = normalizeVehicleIdForGastoRow(ts, row.vehicle_id, sub);
      row.es_global_flota = false;
    } else {
      row.vehicle_id = null;
      row.es_global_flota = true;
    }
  }
  const vid = row.vehicle_id;
  if (vid != null && typeof vid === 'string') {
    const t = vid.trim();
    if (t === '' || t === '0') {
      row.vehicle_id = null;
    } else if (UUID_REGEX_FLAT.test(t)) {
      row.vehicle_id = t;
    } else {
      const n = Number(t);
      row.vehicle_id = Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  if (typeof row.vehicle_id === 'number' && row.vehicle_id <= 0) {
    row.vehicle_id = null;
  }
  if (typeof row.vehicle_id === 'bigint') {
    const n = Number(row.vehicle_id);
    row.vehicle_id = Number.isFinite(n) && n > 0 ? n : null;
  }
  if (row.excel_extra != null && typeof row.excel_extra === 'object') {
    row.excel_extra = deepSanitizeUuidPoisonInJson(row.excel_extra) as Record<string, unknown>;
  }
}

/** Solo columnas permitidas en UPDATE de mover categoría (evita claves extrañas al PostgREST). */
const GASTO_CATEGORIA_MANUAL_ROW_KEYS = new Set([
  'tipo_gasto',
  'subtipo_gasto',
  'vehicle_id',
  'es_global_flota',
  'clasificacion_manual',
  'requiere_revision',
  'revisado_por',
  'revisado_at',
  'origen_clasificacion',
  'excel_extra',
]);

function pickGastoCategoriaManualUpdatePayload(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of GASTO_CATEGORIA_MANUAL_ROW_KEYS) {
    if (Object.prototype.hasOwnProperty.call(row, k)) {
      out[k] = row[k];
    }
  }
  return out;
}

/** Diagnóstico PRE-UPDATE: payload exacto enviado a PostgREST. */
function logGastoCategoriaMoveUpdateDiagnostics(
  id: string,
  empresaIdFilter: string,
  patch: GastoCategoriaManualPatch,
  updateRow: Record<string, unknown>,
  extra?: { empresaIdFrontend?: string; empresaIdRow?: string | null },
): void {
  const payloadKeys = Object.keys(updateRow);
  const zeroLike: { key: string; value: unknown; typeof: string }[] = [];
  for (const [k, v] of Object.entries(updateRow)) {
    if (v === 0 || v === '0' || (typeof v === 'bigint' && v === BigInt(0))) {
      zeroLike.push({ key: k, value: v, typeof: typeof v });
    }
  }
  const nestedZero = JSON.stringify(updateRow).includes('"vehicle_id":0')
    || JSON.stringify(updateRow).includes('"vehicle_id":"0"');

  const entry = {
    id,
    empresa_id_filtro: empresaIdFilter,
    empresaIdFrontend: extra?.empresaIdFrontend ?? null,
    empresaIdRow: extra?.empresaIdRow ?? null,
    updatePayload: updateRow,
    payloadKeys,
    payloadJson: JSON.stringify(updateRow),
    tipo_gasto_destino: updateRow.tipo_gasto ?? patch.tipo_gasto ?? null,
    subtipo_gasto_destino: updateRow.subtipo_gasto ?? patch.subtipo_gasto ?? null,
    vehicle_id: updateRow.vehicle_id ?? null,
    es_global_flota: updateRow.es_global_flota ?? null,
    revisado_por: updateRow.revisado_por ?? null,
    revisado_at: updateRow.revisado_at ?? null,
    clasificacion_manual: updateRow.clasificacion_manual ?? null,
    origen_clasificacion: updateRow.origen_clasificacion ?? null,
    requiere_revision: updateRow.requiere_revision ?? null,
    excel_extra_present: Object.prototype.hasOwnProperty.call(updateRow, 'excel_extra'),
    excel_extra_keys:
      updateRow.excel_extra != null && typeof updateRow.excel_extra === 'object'
        ? Object.keys(updateRow.excel_extra as Record<string, unknown>)
        : null,
    patch_recibido: patch,
    claves_valor_0_o_string_0: zeroLike,
    posible_vehicle_id_cero_en_json: nestedZero,
  };

  console.warn('[updateGastoCategoriaManual PRE-UPDATE]', entry);
  if (zeroLike.length > 0) {
    console.table(zeroLike);
  }
}

function categoriaManualPatchToRow(patch: GastoCategoriaManualPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.tipo_gasto !== undefined) row.tipo_gasto = patch.tipo_gasto;
  if (patch.subtipo_gasto !== undefined) row.subtipo_gasto = patch.subtipo_gasto;

  const touchesVehicle =
    patch.vehicle_id !== undefined || patch.es_global_flota !== undefined || patch.tipo_gasto !== undefined;

  if (touchesVehicle) {
    const tipo = patch.tipo_gasto;
    if (tipo !== undefined) {
      const t = tipo == null ? '' : String(tipo).trim();
      const sub = patch.subtipo_gasto != null ? String(patch.subtipo_gasto) : '';
      if (tipoGastoRequiereVehiculo(t, sub)) {
        row.vehicle_id = normalizeVehicleIdForGastoRow(t, patch.vehicle_id, sub);
        row.es_global_flota = patch.es_global_flota ?? false;
      } else if (tipoGastoAdmiteVehiculoOpcional(t)) {
        row.vehicle_id = normalizeVehicleIdForGastoRow(t, patch.vehicle_id, sub);
        row.es_global_flota = false;
      } else {
        row.vehicle_id = null;
        row.es_global_flota = true;
      }
    } else {
      if (patch.vehicle_id !== undefined) {
        const v = patch.vehicle_id;
        row.vehicle_id = isInvalidVehicleSentinel(v) ? null : v;
      }
      if (patch.es_global_flota !== undefined) row.es_global_flota = patch.es_global_flota;
    }
  }

  if (patch.clasificacion_manual !== undefined) row.clasificacion_manual = patch.clasificacion_manual;
  if (patch.clasificacion_confianza !== undefined) row.clasificacion_confianza = patch.clasificacion_confianza;
  if (patch.requiere_revision !== undefined) row.requiere_revision = patch.requiere_revision;
  if (patch.revisado_por !== undefined) row.revisado_por = patch.revisado_por;
  if (patch.revisado_at !== undefined) row.revisado_at = patch.revisado_at;
  if (patch.origen_clasificacion !== undefined) row.origen_clasificacion = patch.origen_clasificacion;
  if (patch.excel_extra !== undefined) {
    const sanitized = sanitizeForJsonbColumn(patch.excel_extra);
    if (sanitized !== null) row.excel_extra = sanitized;
  }
  return row;
}

/** Carga un gasto del tenant para reclasificación manual (respeta RLS). */
export async function fetchGastoByIdForTenant(
  id: string,
  tenantEmpresaId?: string | null,
): Promise<Gasto | null> {
  const idNorm = normalizeGastoIdParam(id);
  if (!isValidGastoPrimaryKey(idNorm)) return null;
  const raw = await fetchGastoRawById(idNorm, resolveTenantId(tenantEmpresaId));
  if (!raw) return null;
  return mapGastoRow(raw);
}

async function fetchGastoRawById(
  id: string,
  /** Misma forma que el UPDATE (p. ej. UUID ya validado con `cleanUuid`). */
  empresaIdFilter?: string | null,
): Promise<Record<string, unknown> | null> {
  const eid = resolveTenantId(empresaIdFilter);
  if (!eid) return null;
  const { data, error } = await supabase
    .from('gastos')
    .select('*')
    .eq('id', id)
    .eq('empresa_id', eid)
    .single();
  if (error) return null;
  return (data as Record<string, unknown>) ?? null;
}

/**
 * Actualiza solo la capa de clasificación financiera / auditoría.
 */
export async function updateClasificacionGasto(
  id: string,
  patch: ClasificacionGastoPatch,
  meta: GastoAuditMeta = {},
  tenantEmpresaId?: string | null,
): Promise<Gasto | null> {
  const idNorm = normalizeGastoIdParam(id);
  if (!isValidGastoPrimaryKey(idNorm)) {
    console.error('[gastos updateClasificacionGasto]', MSG_GASTO_ID_INVALID, { id: idNorm });
    return null;
  }
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return null;
  const before = await fetchGastoRawById(idNorm, empresaId);
  const row = clasificacionPatchToRow(patch);
  if (Object.keys(row).length === 0) return null;
  const { data, error } = await supabase
    .from('gastos')
    .update(row)
    .eq('id', idNorm)
    .eq('empresa_id', empresaId)
    .select('*')
    .single();
  if (error) {
    console.error('[gastos updateClasificacionGasto]', error.message);
    return null;
  }
  if (before && data) {
    const auditUserId = await getAuthenticatedUserIdForAudit();
    if (auditUserId) {
      await insertFinancialAuditLog({
        user_id: auditUserId,
        action_type: 'fix_classification',
        entity_type: 'gasto',
        entity_id: idNorm,
        old_data: before,
        new_data: data as Record<string, unknown>,
        reason: meta.reason ?? 'Corrección de clasificación financiera',
      });
    }
  }
  return data ? mapGastoRow(data as Record<string, unknown>) : null;
}

function vehicleIdForClassifyRpc(v: unknown): number | null {
  const n = normalizeGastoVehicleFkForDb(v as VehicleIdLike);
  if (n == null) return null;
  if (typeof n === 'number') return n;
  if (typeof n === 'string' && /^[1-9]\d*$/.test(n)) return Number(n);
  return null;
}

type ClassifyGastoRpcResult = {
  ok: boolean;
  moved_out_of_view?: boolean;
  error?: string;
  gasto_id?: string;
  new_tipo?: string;
  new_subtipo?: string | null;
};

async function classifyGastoViaOperadorRpc(
  gastoId: string,
  empresaId: string,
  updatePayload: Record<string, unknown>,
): Promise<{ ok: true; movedOutOfView: boolean } | { ok: false; message: string }> {
  const tipo = String(updatePayload.tipo_gasto ?? '').trim();
  if (!tipo) {
    return { ok: false, message: 'tipo_gasto destino vacío' };
  }

  const { data, error } = await supabase.rpc('classify_gasto_operador', {
    p_gasto_id: gastoId,
    p_empresa_id: empresaId,
    p_tipo_gasto: tipo,
    p_subtipo_gasto:
      updatePayload.subtipo_gasto != null ? String(updatePayload.subtipo_gasto) : null,
    p_vehicle_id: vehicleIdForClassifyRpc(updatePayload.vehicle_id),
    p_es_global_flota:
      typeof updatePayload.es_global_flota === 'boolean' ? updatePayload.es_global_flota : true,
    p_clasificacion_manual:
      typeof updatePayload.clasificacion_manual === 'boolean'
        ? updatePayload.clasificacion_manual
        : null,
    p_requiere_revision:
      typeof updatePayload.requiere_revision === 'boolean' ? updatePayload.requiere_revision : null,
    p_revisado_por:
      updatePayload.revisado_por != null ? String(updatePayload.revisado_por) : null,
    p_revisado_at:
      updatePayload.revisado_at != null ? String(updatePayload.revisado_at) : null,
    p_origen_clasificacion:
      updatePayload.origen_clasificacion != null ? String(updatePayload.origen_clasificacion) : null,
    p_excel_extra:
      updatePayload.excel_extra != null
        ? (updatePayload.excel_extra as Record<string, unknown>)
        : null,
  });

  if (error) {
    return { ok: false, message: error.message || 'RPC classify_gasto_operador falló' };
  }

  const row = (data ?? {}) as ClassifyGastoRpcResult;
  if (!row.ok) {
    return { ok: false, message: row.error || 'classify_gasto_operador rechazó la operación' };
  }

  return { ok: true, movedOutOfView: row.moved_out_of_view === true };
}

function synthesizeGastoRowAfterPatch(
  before: Record<string, unknown>,
  updatePayload: Record<string, unknown>,
  id: string,
): Gasto {
  return mapGastoRow({ ...before, ...updatePayload, id });
}

/**
 * Corrige manualmente la categoría/subtipo/vehículo de un gasto existente.
 * No crea registros nuevos; solo actualiza la fila actual.
 * El UPDATE a `public.gastos` se ejecuta antes que la auditoría; un fallo en audit no revierte el movimiento.
 */
export async function updateGastoCategoriaManual(
  id: string,
  patch: GastoCategoriaManualPatch,
  meta: GastoAuditMeta = {},
  tenantEmpresaId?: string | null,
  options?: UpdateGastoCategoriaManualOptions,
): Promise<UpdateGastoCategoriaManualResult> {
  const idNorm = normalizeGastoIdParam(id);
  const empresaIdFrontend = resolveTenantId(tenantEmpresaId) || '';
  const patchSummary = {
    tipo_gasto: patch.tipo_gasto,
    subtipo_gasto: patch.subtipo_gasto,
    vehicle_id: patch.vehicle_id,
    es_global_flota: patch.es_global_flota,
  };

  const fail = (params: Omit<UpdateGastoCategoriaManualFailure, 'ok'>): UpdateGastoCategoriaManualFailure => {
    const out: UpdateGastoCategoriaManualFailure = { ok: false, ...params };
    console.error('[gastos updateGastoCategoriaManual] FALLO', out);
    return out;
  };

  if (!isValidGastoPrimaryKey(idNorm)) {
    return fail({
      message: MSG_GASTO_ID_INVALID,
      gastoId: idNorm || '(vacío)',
      empresaIdFrontend: empresaIdFrontend || '(vacío)',
      empresaIdRow: null,
      updatePayload: {},
      patchSummary,
    });
  }

  if (!empresaIdFrontend) {
    return fail({
      message: 'VITE_EMPRESA_ID no está configurado en el frontend.',
      gastoId: idNorm,
      empresaIdFrontend: '(vacío)',
      empresaIdRow: null,
      updatePayload: {},
      patchSummary,
    });
  }

  const empresaUuid = cleanUuid(empresaIdFrontend);
  if (!empresaUuid) {
    return fail({
      message:
        'VITE_EMPRESA_ID no es un UUID válido (p. ej. "0" o texto inválido). Revise el archivo .env; PostgREST falla al filtrar por empresa_id.',
      gastoId: idNorm,
      empresaIdFrontend,
      empresaIdRow: null,
      updatePayload: {},
      patchSummary,
    });
  }

  if (patch.tipo_gasto !== undefined && patch.tipo_gasto != null) {
    const tg = String(patch.tipo_gasto).trim();
    const sub = patch.subtipo_gasto != null ? String(patch.subtipo_gasto).trim() : '';
    if (tipoGastoRequiereVehiculo(tg, sub)) {
      const nv = normalizeVehicleIdForGastoRow(tg, patch.vehicle_id, sub);
      if (nv == null) {
        return fail({
          message:
            'Operativo por vehículo requiere un N° de unidad válido (no uses 0 ni vacío).',
          gastoId: idNorm,
          empresaIdFrontend,
          empresaIdRow: null,
          updatePayload: {},
          patchSummary,
        });
      }
    }
  }

  const row = categoriaManualPatchToRow(patch);
  finalizeGastoCategoriaManualUpdateRow(row);
  const updatePayload = pickGastoCategoriaManualUpdatePayload(row);
  if (Object.keys(updatePayload).length === 0) {
    return fail({
      message: 'No hay campos para actualizar (patch vacío).',
      gastoId: idNorm,
      empresaIdFrontend,
      empresaIdRow: null,
      updatePayload: {},
      patchSummary,
    });
  }

  const empresaIdRow = await fetchGastoEmpresaIdForDiagnostics(idNorm);
  if (empresaIdRow != null && empresaIdRow !== empresaUuid) {
    return fail({
      message:
        `El gasto #${idNorm} pertenece a otra empresa (empresa_id en fila ≠ VITE_EMPRESA_ID). Corrige el entorno o el registro.`,
      gastoId: idNorm,
      empresaIdFrontend,
      empresaIdRow,
      updatePayload,
      patchSummary,
    });
  }

  const before = await fetchGastoRawById(idNorm, empresaUuid);

  logGastoCategoriaMoveUpdateDiagnostics(idNorm, empresaUuid, patch, updatePayload, {
    empresaIdFrontend,
    empresaIdRow,
  });
  debugMoveGastoPayload(idNorm, patch, updatePayload);

  const operatorClassify = options?.operatorClassifyMode === true;
  const destTipo =
    patch.tipo_gasto != null && String(patch.tipo_gasto).trim() !== ''
      ? String(patch.tipo_gasto).trim()
      : before != null
        ? String((before as Record<string, unknown>).tipo_gasto ?? '').trim()
        : '';
  const skipSelectForOperador =
    operatorClassify && destTipo.length > 0 && !isOperadorVisibleTipoGasto(destTipo);

  if (operatorClassify) {
    const rpcRes = await classifyGastoViaOperadorRpc(idNorm, empresaUuid, updatePayload);
    if (!rpcRes.ok) {
      void fetchDebugCanUpdateGastoRow(
        idNorm,
        destTipo || 'operativo_flota_general',
        patch.subtipo_gasto != null ? String(patch.subtipo_gasto) : null,
      ).then((rowDiag) => {
        console.warn('[updateGastoCategoriaManual RPC] debug_can_update_gasto_row', rowDiag);
      }).catch(() => undefined);
      return fail({
        message: rpcRes.message,
        gastoId: idNorm,
        empresaIdFrontend,
        empresaIdRow,
        updatePayload,
        patchSummary,
      });
    }
    if (!before) {
      return fail({
        message: 'No se pudo cargar el gasto antes de clasificar (RLS o id incorrecto).',
        gastoId: idNorm,
        empresaIdFrontend,
        empresaIdRow,
        updatePayload,
        patchSummary,
      });
    }
    const afterSynthetic = { ...before, ...updatePayload };
    if (!meta.skipAudit) {
      await auditGastoMoveCategoryLogs(idNorm, before, afterSynthetic, meta);
    }
    return {
      ok: true,
      gasto: synthesizeGastoRowAfterPatch(before, updatePayload, idNorm),
      movedOutOfView: rpcRes.movedOutOfView,
    };
  }

  let data: Record<string, unknown> | null = null;
  let error: { message: string; code?: string; details?: string; hint?: string } | null = null;

  if (skipSelectForOperador) {
    const res = await supabase
      .from('gastos')
      .update(updatePayload)
      .eq('id', idNorm)
      .eq('empresa_id', empresaUuid);
    error = res.error;
  } else {
    const res = await supabase
      .from('gastos')
      .update(updatePayload)
      .eq('id', idNorm)
      .eq('empresa_id', empresaUuid)
      .select('*')
      .maybeSingle();
    data = (res.data as Record<string, unknown> | null) ?? null;
    error = res.error;
  }

  if (error) {
    logPostgrestError('gastos updateGastoCategoriaManual UPDATE', error);
    if (error.code === '42501' || /permission denied|403|row-level security/i.test(error.message)) {
      void logRlsDebugContext('updateGastoCategoriaManual-403').catch(() => undefined);
      void fetchDebugCanUpdateGastoRow(
        idNorm,
        destTipo || 'operativo_flota_general',
        patch.subtipo_gasto != null ? String(patch.subtipo_gasto) : null,
      ).then((rowDiag) => {
        console.warn('[updateGastoCategoriaManual 403] debug_can_update_gasto_row', rowDiag);
      }).catch(() => undefined);
    }
    return fail({
      message: error.message || 'Error de Supabase al actualizar el gasto.',
      gastoId: idNorm,
      empresaIdFrontend,
      empresaIdRow,
      supabase: {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      },
      updatePayload,
      patchSummary,
    });
  }

  if (!data) {
    if (skipSelectForOperador && before) {
      const afterSynthetic = { ...before, ...updatePayload };
      if (!meta.skipAudit) {
        await auditGastoMoveCategoryLogs(idNorm, before, afterSynthetic, meta);
      }
      return {
        ok: true,
        gasto: synthesizeGastoRowAfterPatch(before, updatePayload, idNorm),
        movedOutOfView: true,
      };
    }
    const hint =
      before == null
        ? 'No existe fila visible con este id y empresa_id (revisa RLS o que el id sea correcto).'
        : 'El UPDATE no devolvió fila (0 filas afectadas). Revisa RLS o empresa_id.';
    return fail({
      message: `No se pudo mover el gasto #${idNorm}. ${hint} Revisa la consola para detalle técnico.`,
      gastoId: idNorm,
      empresaIdFrontend,
      empresaIdRow,
      updatePayload,
      patchSummary,
    });
  }

  const afterRow = data as Record<string, unknown>;
  if (!meta.skipAudit) {
    await auditGastoMoveCategoryLogs(idNorm, before, afterRow, meta);
  }

  return { ok: true, gasto: mapGastoRow(afterRow) };
}

export const DEFAULT_GASTOS_RECENT_LIMIT = 1000;
export const DEFAULT_GASTOS_HISTORIAL_PAGE_SIZE = 50;

/** Valores `tipo_gasto` en BD que corresponden a un tab canónico (legacy incluido). */
export function sqlTipoGastoVariants(canonicalTipo: string): string[] {
  switch (canonicalTipo) {
    case 'gastos_globales':
      return ['gastos_globales', 'operativo_flota_global'];
    case 'operativo_flota_general':
      return ['operativo_flota_general'];
    case 'financiero_prestamo':
      return ['financiero_prestamo', 'financiero'];
    case 'inversion_compra':
      return ['inversion_compra', 'inversion'];
    case 'representacion_interna':
      return ['representacion_interna', 'personal_socios_familiares', 'personal_socios', 'personales'];
    default:
      return [canonicalTipo];
  }
}

function mapAndValidateGastosRows(data: Record<string, unknown>[]): Gasto[] {
  const mapped = data.map((r) => mapGastoRow(r));
  const valid: Gasto[] = [];
  for (const g of mapped) {
    if (isValidGastoPrimaryKey(g.id)) {
      valid.push(g);
      continue;
    }
    console.warn('[gastos] fila descartada: id de gasto inválido', {
      id: g.id,
      fecha: g.fecha,
      motivo: g.motivo?.slice?.(0, 80),
    });
  }
  return valid;
}

/** Une listas de gastos sin duplicar por id; orden fecha desc, id desc. */
export function mergeGastosUniqueById(...lists: Gasto[][]): Gasto[] {
  const map = new Map<string, Gasto>();
  for (const list of lists) {
    for (const g of list) {
      map.set(String(g.id), g);
    }
  }
  return [...map.values()].sort((a, b) => {
    const fd = b.fecha.localeCompare(a.fecha);
    if (fd !== 0) return fd;
    return String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
  });
}

/** Carga inicial: últimos N gastos (default 1000). Respeta RLS + empresa_id. */
export async function fetchGastosRecent(
  tenantEmpresaId?: string | null,
  options?: { limit?: number },
): Promise<Gasto[]> {
  const limit = options?.limit ?? DEFAULT_GASTOS_RECENT_LIMIT;
  return devPerfAsync(
    'fetchGastosRecent',
    async () => {
      const empresaId = resolveTenantId(tenantEmpresaId);
      if (!empresaId) return [];
      const { data, error } = await supabase
        .from('gastos')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);
      if (error) {
        console.error('[fetchGastosRecent]', error.message);
        return [];
      }
      return mapAndValidateGastosRows((data ?? []) as Record<string, unknown>[]);
    },
    (rows) => ({ limit }),
  );
}

/** Histórico completo paginado (auditoría, reportes, conciliación total). NO usar en bootstrap. */
export async function fetchGastosFull(tenantEmpresaId?: string | null): Promise<Gasto[]> {
  return devPerfAsync('fetchGastosFull', async () => {
    const empresaId = resolveTenantId(tenantEmpresaId);
    if (!empresaId) return [];
    const data = await fetchAllSupabasePages(async (from, to) => {
      const { data, error } = await supabase
        .from('gastos')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);
      return { data, error };
    }, { label: 'fetchGastosFull' });
    return mapAndValidateGastosRows(data as Record<string, unknown>[]);
  });
}

/** @deprecated Preferir fetchGastosRecent (bootstrap) o fetchGastosFull (histórico). */
export const fetchGastos = fetchGastosFull;

/** Todos los gastos de un tipo (p. ej. pendiente_revision, gastos_globales) — conciliación operador. */
export async function fetchGastosByTipo(
  tipoGasto: string,
  tenantEmpresaId?: string | null,
): Promise<Gasto[]> {
  return devPerfAsync(
    `fetchGastosByTipo:${tipoGasto}`,
    async () => {
      const empresaId = resolveTenantId(tenantEmpresaId);
      if (!empresaId) return [];
      const variants = sqlTipoGastoVariants(tipoGasto);
      const data = await fetchAllSupabasePages(async (from, to) => {
        const { data, error } = await supabase
          .from('gastos')
          .select('*')
          .eq('empresa_id', empresaId)
          .in('tipo_gasto', variants)
          .order('fecha', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to);
        return { data, error };
      }, { label: `fetchGastosByTipo:${tipoGasto}` });
      return mapAndValidateGastosRows(data as Record<string, unknown>[]);
    },
  );
}

export type GastosHistorialOrderMode = 'fecha' | 'actividad';

export type GastosHistorialFilters = {
  tipo_gasto: string;
  year?: string;
  month?: string;
  subtipo?: string;
  /** Variantes BD (aliases/legacy) para filtro canónico; usa .in en lugar de eq exacto. */
  subtipoVariants?: string[];
  search?: string;
  /** `actividad`: revisado_at → created_at → fecha (movimientos/editions recientes arriba). */
  orderMode?: GastosHistorialOrderMode;
};

/** Historial paginado server-side (tab detalle Gastos). */
export async function fetchGastosHistorialPage(
  filters: GastosHistorialFilters,
  page: number,
  pageSize: number = DEFAULT_GASTOS_HISTORIAL_PAGE_SIZE,
  tenantEmpresaId?: string | null,
): Promise<{ rows: Gasto[]; total: number }> {
  return devPerfAsync(
    'fetchGastosHistorialPage',
    async () => {
      const empresaId = resolveTenantId(tenantEmpresaId);
      if (!empresaId) return { rows: [], total: 0 };

      const from = Math.max(0, page) * pageSize;
      const to = from + pageSize - 1;
      const variants = sqlTipoGastoVariants(filters.tipo_gasto);

      let q = supabase
        .from('gastos')
        .select('*', { count: 'exact' })
        .eq('empresa_id', empresaId)
        .in('tipo_gasto', variants);

      const year = filters.year?.trim();
      if (year && year !== 'ALL' && /^\d{4}$/.test(year)) {
        q = q.gte('fecha', `${year}-01-01`).lte('fecha', `${year}-12-31`);
        const month = filters.month?.trim();
        if (month && month !== 'ALL' && /^\d{1,2}$/.test(month)) {
          const mm = month.padStart(2, '0');
          const yNum = Number(year);
          const mNum = Number(mm);
          const lastDay = new Date(yNum, mNum, 0).getDate();
          q = q
            .gte('fecha', `${year}-${mm}-01`)
            .lte('fecha', `${year}-${mm}-${String(lastDay).padStart(2, '0')}`);
        }
      }

      const subtipoDbVariants = filters.subtipoVariants?.map((s) => s.trim()).filter(Boolean) ?? [];
      const subtipo = filters.subtipo?.trim();
      if (subtipoDbVariants.length > 1) {
        q = q.in('subtipo_gasto', subtipoDbVariants);
      } else if (subtipoDbVariants.length === 1) {
        q = q.eq('subtipo_gasto', subtipoDbVariants[0]!);
      } else if (subtipo) {
        q = q.eq('subtipo_gasto', subtipo);
      }

      const search = filters.search?.trim();
      if (search) {
        const { wantsGeneral, textQuery } = splitGeneralSearchQuery(search);
        if (wantsGeneral) {
          q = q.or('vehicle_id.is.null,vehicle_id.eq.0,es_global_flota.eq.true');
        }
        const textForSearch = wantsGeneral ? textQuery : search;
        const esc = textForSearch.replace(/[%_,]/g, '');
        if (esc) {
          q = q.or(
            `motivo.ilike.%${esc}%,comentarios.ilike.%${esc}%,pagado_a.ilike.%${esc}%,subtipo_gasto.ilike.%${esc}%`,
          );
        }
      }

      const orderMode = filters.orderMode ?? 'actividad';
      if (orderMode === 'actividad') {
        q = q
          .order('revisado_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false, nullsFirst: false })
          .order('fecha', { ascending: false })
          .order('id', { ascending: false });
      } else {
        q = q.order('fecha', { ascending: false }).order('id', { ascending: false });
      }

      const { data, error, count } = await q.range(from, to);

      if (error) {
        console.error('[fetchGastosHistorialPage]', error.message);
        return { rows: [], total: 0 };
      }

      return {
        rows: mapAndValidateGastosRows((data ?? []) as Record<string, unknown>[]),
        total: count ?? 0,
      };
    },
    (r) => ({ page, pageSize, total: r.total, rows: r.rows.length, tipo: filters.tipo_gasto }),
  );
}

/** Alias: historial paginado por categoría (server-side, sin bootstrap global). */
export { fetchGastosHistorialPage as fetchGastosByTipoFull };

export type GastosByTipoFullAllFilters = {
  tipo_gasto: string;
  orderMode?: GastosHistorialOrderMode;
};

/**
 * Historial completo de una categoría: pagina internamente (1000 filas/página) hasta agotar.
 * Sin filtro año/mes/búsqueda — eso se aplica en cliente tras cargar todo.
 */
export async function fetchGastosByTipoFullAll(
  filters: GastosByTipoFullAllFilters,
  tenantEmpresaId?: string | null,
  options?: { signal?: AbortSignal },
): Promise<{ rows: Gasto[]; error: string | null }> {
  const logPrefix = '[historialFull:gastos]';
  const pageSize = 1000;

  return devPerfAsync(
    'fetchGastosByTipoFullAll',
    async () => {
      const empresaId = resolveTenantId(tenantEmpresaId);
      if (!empresaId) return { rows: [], error: 'Sin empresa_id' };

      if (options?.signal?.aborted) {
        return { rows: [], error: 'Cancelado' };
      }

      const variants = sqlTipoGastoVariants(filters.tipo_gasto);
      const orderMode = filters.orderMode ?? 'actividad';

      if (import.meta.env.DEV) {
        console.info(`${logPrefix} start`, {
          tipo_gasto: filters.tipo_gasto,
          pageSize,
          orderMode,
        });
      }

      try {
        const { rows: rawPages, error: pageError } = await fetchAllSupabasePagesDetailed<Record<string, unknown>>(
          async (from, to) => {
            if (options?.signal?.aborted) {
              return { data: [], error: { message: 'Cancelado' } };
            }

            let q = supabase
              .from('gastos')
              .select('*')
              .eq('empresa_id', empresaId)
              .in('tipo_gasto', variants);

            if (orderMode === 'actividad') {
              q = q
                .order('revisado_at', { ascending: false, nullsFirst: false })
                .order('created_at', { ascending: false, nullsFirst: false })
                .order('fecha', { ascending: false })
                .order('id', { ascending: false });
            } else {
              q = q.order('fecha', { ascending: false }).order('id', { ascending: false });
            }

            const { data, error } = await q.range(from, to);
            return { data: (data ?? []) as Record<string, unknown>[] | null, error };
          },
          {
            label: `fetchGastosByTipoFullAll:${filters.tipo_gasto}`,
            devLogPrefix: logPrefix,
            signal: options?.signal,
          },
        );

        if (options?.signal?.aborted) {
          if (import.meta.env.DEV) {
            console.info(`${logPrefix} finally`, { tipo_gasto: filters.tipo_gasto, reason: 'aborted' });
          }
          return { rows: [], error: 'Cancelado' };
        }

        const rows = mapAndValidateGastosRows(rawPages);
        const error = pageError ?? null;

        if (import.meta.env.DEV) {
          if (error) {
            console.error(`${logPrefix} error`, {
              tipo_gasto: filters.tipo_gasto,
              pageSize,
              rowsFetched: rows.length,
              error,
            });
          } else {
            console.info(`${logPrefix} done`, {
              tipo_gasto: filters.tipo_gasto,
              pageSize,
              totalRows: rows.length,
            });
          }
        }

        return { rows, error };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (import.meta.env.DEV) {
          console.error(`${logPrefix} error`, {
            tipo_gasto: filters.tipo_gasto,
            pageSize,
            rowsFetched: 0,
            error: message,
          });
        }
        return { rows: [], error: message };
      } finally {
        if (import.meta.env.DEV) {
          console.info(`${logPrefix} finally`, { tipo_gasto: filters.tipo_gasto });
        }
      }
    },
    (r) => ({ tipo: filters.tipo_gasto, rows: r.rows.length, error: r.error }),
  );
}

export async function insertGasto(
  row: Omit<Gasto, 'id' | 'createdAt'>,
  tenantEmpresaId?: string | null,
): Promise<Gasto | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return null;
  const uid = await getAuthenticatedUserIdForAudit();
  const rowForInsert =
    uid != null
      ? {
          ...row,
          excelExtra: stampCreatedByExtra(row.excelExtra ?? null, uid),
        }
      : row;
  const { data, error } = await supabase
    .from('gastos')
    .insert(gastoToInsert(empresaId, rowForInsert))
    .select('*')
    .single();
  if (error) {
    console.error('[gasto:create:error]', { stage: 'supabase_insert', message: error.message, error });
    console.error('[gastos insert]', error.message);
    return null;
  }
  if (data) {
    const raw = data as Record<string, unknown>;
    if (uid) {
      await insertFinancialAuditLog({
        user_id: uid,
        action_type: 'create_expense',
        entity_type: 'gasto',
        entity_id: String(raw.id ?? ''),
        old_data: null,
        new_data: raw,
        reason: 'Registro de gasto creado desde UI',
      });
    }
  }
  return data ? mapGastoRow(data as Record<string, unknown>) : null;
}

export async function removeGasto(id: string, tenantEmpresaId?: string | null): Promise<boolean> {
  const idNorm = normalizeGastoIdParam(id);
  if (!isValidGastoPrimaryKey(idNorm)) {
    console.error('[gastos removeGasto]', MSG_GASTO_ID_INVALID, { id: idNorm });
    return false;
  }
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return false;
  const before = await fetchGastoRawById(idNorm, empresaId);
  const { error } = await supabase
    .from('gastos')
    .delete()
    .eq('id', idNorm)
    .eq('empresa_id', empresaId);
  if (error) {
    console.error('[gastos delete]', error.message);
    return false;
  }
  if (before) {
    const deleteUserId = await getAuthenticatedUserIdForAudit();
    if (deleteUserId) {
      await insertFinancialAuditLog({
        user_id: deleteUserId,
        action_type: 'delete_expense',
        entity_type: 'gasto',
        entity_id: idNorm,
        old_data: before,
        new_data: null,
        reason: 'Eliminación de gasto',
      });
    }
  }
  return true;
}

/** Agregados financieros globales (RPC; respeta RLS, no trae filas). */
export async function fetchGastosFinancialSummary(
  tenantEmpresaId?: string | null,
): Promise<GastosFinancialSummary | null> {
  return devPerfAsync('fetchGastosFinancialSummary', async () => {
    const empresaId = resolveTenantId(tenantEmpresaId);
    if (!empresaId) {
      if (import.meta.env.DEV) console.warn('[fetchGastosFinancialSummary] sin empresa_id');
      return null;
    }

    const { data, error } = await supabase.rpc('get_gastos_financial_summary', {
      p_empresa_id: empresaId,
    });

    if (import.meta.env.DEV) {
      console.log('[fetchGastosFinancialSummary] raw', { empresaId, data, error: error?.message ?? null });
    }

    if (error) {
      console.error('[fetchGastosFinancialSummary]', error.message, error);
      return null;
    }

    let row: Record<string, unknown> | null = null;
    if (Array.isArray(data)) {
      row = (data[0] as Record<string, unknown> | undefined) ?? null;
      if (!row && data.length === 0 && import.meta.env.DEV) {
        console.warn('[fetchGastosFinancialSummary] RPC devolvió array vacío (se esperaba 1 fila)');
      }
    } else if (data && typeof data === 'object') {
      row = data as Record<string, unknown>;
    }

    if (!row) {
      console.warn('[fetchGastosFinancialSummary] respuesta vacía o sin filas');
      return null;
    }

    const mapped = mapGastosFinancialSummaryRow(row);
    if (import.meta.env.DEV) {
      console.log('[fetchGastosFinancialSummary] mapped', mapped);
    }
    return mapped;
  });
}
