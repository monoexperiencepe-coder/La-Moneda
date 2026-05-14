import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { gastoToInsert, mapGastoRow } from './supabaseMappers';
import type { Gasto } from '../data/types';
import { fetchAllSupabasePages } from './supabaseRangeFetch';
import { insertFinancialAuditLog, logPostgrestError } from './financialAuditService';
import { getAuthenticatedUserIdForAudit } from './authAuditUser';
import { getDetalleMetodoByLabel } from '../data/factCatalog';

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
  requiere_revision: boolean | null;
  revisado_por: string | null;
  revisado_at: string | null;
  origen_clasificacion: string | null;
  excel_extra: Record<string, unknown> | null;
}>;

export interface GastoAuditMeta {
  reason?: string | null;
}

export type UpdateGastoCategoriaManualFailure = {
  ok: false;
  message: string;
  gastoId: number;
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
  | { ok: true; gasto: Gasto }
  | UpdateGastoCategoriaManualFailure;

async function fetchGastoEmpresaIdForDiagnostics(id: number): Promise<string | null> {
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
  id: number,
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

async function auditGastoMoveCategoryLogs(
  id: number,
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
    const reasonBase = meta.reason ?? 'Mover gasto de categoría';
    const run = async (label: string, insertFn: () => Promise<boolean>) => {
      try {
        const ok = await insertFn();
        if (!ok) console.warn(`[gastos] audit "${label}": insert devolvió false (el gasto ya está actualizado).`);
      } catch (e) {
        console.warn(`[gastos] audit "${label}" excepción (el gasto ya está actualizado):`, e);
      }
    };
    if (!before) return;
    await run('move_category', () =>
      insertFinancialAuditLog({
        user_id: auditUserId,
        action_type: 'move_category',
        entity_type: 'gasto',
        entity_id: String(id),
        old_data: before,
        new_data: afterRow,
        reason: reasonBase,
      }),
    );
    const beforeVeh = before.vehicle_id == null ? null : Number(before.vehicle_id);
    const afterVeh =
      afterRow.vehicle_id == null || afterRow.vehicle_id === ''
        ? null
        : Number(afterRow.vehicle_id);
    if (beforeVeh !== afterVeh) {
      await run('change_vehicle_id', () =>
        insertFinancialAuditLog({
          user_id: auditUserId,
          action_type: 'change_vehicle_id',
          entity_type: 'gasto',
          entity_id: String(id),
          old_data: { vehicle_id: beforeVeh },
          new_data: { vehicle_id: afterVeh },
          reason: reasonBase,
        }),
      );
    }
    const beforeMonto = Number(before.monto ?? 0);
    const afterMonto = Number(afterRow.monto ?? 0);
    if (beforeMonto !== afterMonto) {
      await run('change_amount', () =>
        insertFinancialAuditLog({
          user_id: auditUserId,
          action_type: 'change_amount',
          entity_type: 'gasto',
          entity_id: String(id),
          old_data: { monto: beforeMonto },
          new_data: { monto: afterMonto },
          reason: reasonBase,
        }),
      );
    }
    await run('edit_expense', () =>
      insertFinancialAuditLog({
        user_id: auditUserId,
        action_type: 'edit_expense',
        entity_type: 'gasto',
        entity_id: String(id),
        old_data: before,
        new_data: afterRow,
        reason: reasonBase,
      }),
    );
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
  tipo: string;
  subTipo: string | null;
  categoria: Gasto['categoria'];
  motivo: string;
  metodoPago: string;
  metodoPagoDetalle: string;
  monto: number;
  comentarios: string;
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
  return row;
}

async function auditGastoDetalleManualAfterUpdate(
  id: number,
  before: Record<string, unknown> | null,
  afterRow: Record<string, unknown>,
): Promise<void> {
  try {
    const auditUserId = await getAuthenticatedUserIdForAudit();
    if (!auditUserId || !before) return;
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
  id: number,
  patch: GastoDetalleManualPatch,
): Promise<UpdateGastoDetalleManualResult> {
  const empresaIdFrontend = EMPRESA_ID || '';
  const fail = (
    error: string,
    supabase?: { message: string; code?: string; details?: string; hint?: string },
  ): UpdateGastoDetalleManualResult => {
    const out: UpdateGastoDetalleManualResult = { ok: false, gasto: null, error, supabase };
    console.error('[gastos updateGastoDetalleManual] FALLO', { id, patch, ...out });
    return out;
  };

  if (!empresaIdFrontend) {
    return fail('VITE_EMPRESA_ID no está configurado en el frontend.');
  }

  const row = gastoDetalleManualPatchToRow(patch);
  if (Object.keys(row).length === 0) {
    return fail('No hay campos para actualizar (patch vacío).');
  }

  const empresaIdRow = await fetchGastoEmpresaIdForDiagnostics(id);
  if (empresaIdRow != null && empresaIdRow !== empresaIdFrontend) {
    return fail(
      `El gasto #${id} pertenece a otra empresa (empresa_id en fila ≠ VITE_EMPRESA_ID). Corrige el entorno o el registro.`,
    );
  }

  const before = await fetchGastoRawById(id);

  const { data, error } = await supabase
    .from('gastos')
    .update(row)
    .eq('id', id)
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
    return fail(`No se pudo actualizar el gasto #${id}. ${hint}`);
  }

  const afterRow = data as Record<string, unknown>;
  void auditGastoDetalleManualAfterUpdate(id, before, afterRow);

  return { ok: true, gasto: mapGastoRow(afterRow) };
}

const TIPO_GASTO_REQUIERE_VEHICULO = new Set(['operativo_vehiculo', 'inversion_compra']);

function isInvalidVehicleSentinel(v: unknown): boolean {
  return v == null || v === '' || v === 0 || v === '0';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valor seguro para columna `vehicle_id` en `public.gastos`.
 * - Categorías sin vehículo: siempre `null` (no enviar 0 ni "0" a uuid/bigint).
 * - Operativo / inversión: entero > 0 o uuid válido; sentinels → `null`.
 */
function normalizeVehicleIdForGastoRow(
  tipoGasto: string | null | undefined,
  raw: unknown,
): string | number | null {
  const t = tipoGasto == null ? '' : String(tipoGasto).trim();
  if (!TIPO_GASTO_REQUIERE_VEHICULO.has(t)) return null;
  if (isInvalidVehicleSentinel(raw)) return null;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (s === '') return null;
    if (UUID_RE.test(s)) return s;
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
      if (!TIPO_GASTO_REQUIERE_VEHICULO.has(t)) {
        row.vehicle_id = null;
        row.es_global_flota = true;
      } else {
        row.vehicle_id = normalizeVehicleIdForGastoRow(t, patch.vehicle_id);
        row.es_global_flota = patch.es_global_flota ?? false;
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

async function fetchGastoRawById(id: number): Promise<Record<string, unknown> | null> {
  if (!EMPRESA_ID) return null;
  const { data, error } = await supabase
    .from('gastos')
    .select('*')
    .eq('id', id)
    .eq('empresa_id', EMPRESA_ID)
    .single();
  if (error) return null;
  return (data as Record<string, unknown>) ?? null;
}

/**
 * Actualiza solo la capa de clasificación financiera / auditoría.
 */
export async function updateClasificacionGasto(
  id: number,
  patch: ClasificacionGastoPatch,
  meta: GastoAuditMeta = {},
): Promise<Gasto | null> {
  if (!EMPRESA_ID) return null;
  const before = await fetchGastoRawById(id);
  const row = clasificacionPatchToRow(patch);
  if (Object.keys(row).length === 0) return null;
  const { data, error } = await supabase
    .from('gastos')
    .update(row)
    .eq('id', id)
    .eq('empresa_id', EMPRESA_ID)
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
        entity_id: String(id),
        old_data: before,
        new_data: data as Record<string, unknown>,
        reason: meta.reason ?? 'Corrección de clasificación financiera',
      });
    }
  }
  return data ? mapGastoRow(data as Record<string, unknown>) : null;
}

/**
 * Corrige manualmente la categoría/subtipo/vehículo de un gasto existente.
 * No crea registros nuevos; solo actualiza la fila actual.
 * El UPDATE a `public.gastos` se ejecuta antes que la auditoría; un fallo en audit no revierte el movimiento.
 */
export async function updateGastoCategoriaManual(
  id: number,
  patch: GastoCategoriaManualPatch,
  meta: GastoAuditMeta = {},
): Promise<UpdateGastoCategoriaManualResult> {
  const empresaIdFrontend = EMPRESA_ID || '';
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

  if (!empresaIdFrontend) {
    return fail({
      message: 'VITE_EMPRESA_ID no está configurado en el frontend.',
      gastoId: id,
      empresaIdFrontend: '(vacío)',
      empresaIdRow: null,
      updatePayload: {},
      patchSummary,
    });
  }

  if (patch.tipo_gasto !== undefined && patch.tipo_gasto != null) {
    const tg = String(patch.tipo_gasto).trim();
    if (TIPO_GASTO_REQUIERE_VEHICULO.has(tg)) {
      const nv = normalizeVehicleIdForGastoRow(tg, patch.vehicle_id);
      if (nv == null) {
        return fail({
          message:
            'Operativo e inversión con utilidad requieren un vehículo válido. Elige un N° de unidad (no uses 0 ni vacío).',
          gastoId: id,
          empresaIdFrontend,
          empresaIdRow: null,
          updatePayload: {},
          patchSummary,
        });
      }
    }
  }

  const row = categoriaManualPatchToRow(patch);
  if (Object.keys(row).length === 0) {
    return fail({
      message: 'No hay campos para actualizar (patch vacío).',
      gastoId: id,
      empresaIdFrontend,
      empresaIdRow: null,
      updatePayload: {},
      patchSummary,
    });
  }

  const empresaIdRow = await fetchGastoEmpresaIdForDiagnostics(id);
  if (empresaIdRow != null && empresaIdRow !== empresaIdFrontend) {
    return fail({
      message:
        `El gasto #${id} pertenece a otra empresa (empresa_id en fila ≠ VITE_EMPRESA_ID). Corrige el entorno o el registro.`,
      gastoId: id,
      empresaIdFrontend,
      empresaIdRow,
      updatePayload: row,
      patchSummary,
    });
  }

  const before = await fetchGastoRawById(id);

  debugMoveGastoPayload(id, patch, row);

  const { data, error } = await supabase
    .from('gastos')
    .update(row)
    .eq('id', id)
    .eq('empresa_id', empresaIdFrontend)
    .select('*')
    .maybeSingle();

  if (error) {
    logPostgrestError('gastos updateGastoCategoriaManual UPDATE', error);
    return fail({
      message: error.message || 'Error de Supabase al actualizar el gasto.',
      gastoId: id,
      empresaIdFrontend,
      empresaIdRow,
      supabase: {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      },
      updatePayload: row,
      patchSummary,
    });
  }

  if (!data) {
    const hint =
      before == null
        ? 'No existe fila visible con este id y empresa_id (revisa RLS o que el id sea correcto).'
        : 'El UPDATE no devolvió fila (0 filas afectadas). Revisa RLS o empresa_id.';
    return fail({
      message: `No se pudo mover el gasto #${id}. ${hint} Revisa la consola para detalle técnico.`,
      gastoId: id,
      empresaIdFrontend,
      empresaIdRow,
      updatePayload: row,
      patchSummary,
    });
  }

  const afterRow = data as Record<string, unknown>;
  await auditGastoMoveCategoryLogs(id, before, afterRow, meta);

  return { ok: true, gasto: mapGastoRow(afterRow) };
}

export async function fetchGastos(): Promise<Gasto[]> {
  if (!EMPRESA_ID) return [];
  const data = await fetchAllSupabasePages(async (from, to) => {
    const { data, error } = await supabase
      .from('gastos')
      .select('*')
      .eq('empresa_id', EMPRESA_ID)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    return { data, error };
  });
  return data.map((r) => mapGastoRow(r as Record<string, unknown>));
}

export async function insertGasto(row: Omit<Gasto, 'id' | 'createdAt'>): Promise<Gasto | null> {
  if (!EMPRESA_ID) return null;
  const { data, error } = await supabase
    .from('gastos')
    .insert(gastoToInsert(EMPRESA_ID, row))
    .select('*')
    .single();
  if (error) {
    console.error('[gastos insert]', error.message);
    return null;
  }
  if (data) {
    const raw = data as Record<string, unknown>;
    const uid = await getAuthenticatedUserIdForAudit();
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

export async function removeGasto(id: number): Promise<boolean> {
  if (!EMPRESA_ID) return false;
  const before = await fetchGastoRawById(id);
  const { error } = await supabase
    .from('gastos')
    .delete()
    .eq('id', id)
    .eq('empresa_id', EMPRESA_ID);
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
        entity_id: String(id),
        old_data: before,
        new_data: null,
        reason: 'Eliminación de gasto',
      });
    }
  }
  return true;
}
