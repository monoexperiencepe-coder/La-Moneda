import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { ingresoDetalleManualPatchToRow, ingresoToInsert, mapIngresoRow } from './supabaseMappers';
import type { Ingreso } from '../data/types';
import { fetchAllSupabasePages } from './supabaseRangeFetch';
import { devPerfAsync } from '../utils/devPerf';
import { insertFinancialAuditLog, logPostgrestError } from './financialAuditService';
import { getAuthenticatedUserIdForAudit } from './authAuditUser';
import { stampCreatedByExtra } from '../utils/amountPermissions';
import { isValidIngresoPrimaryKey } from '../utils/ingresoRecordId';

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

/** Columnas mínimas para old_data en auditoría (evita SELECT * antes del delete). */
const INGRESO_AUDIT_SNAPSHOT_SELECT =
  'id,empresa_id,fecha,fecha_registro,vehicle_id,tipo,sub_tipo,fecha_desde,fecha_hasta,monto,moneda,metodo_pago,comentarios,excel_extra';

export type IngresoDetalleManualPatch = {
  fecha?: string;
  fechaRegistro?: string;
  vehicleId?: number | null;
  tipo?: string;
  subTipo?: string | null;
  fechaDesde?: string | null;
  fechaHasta?: string | null;
  monto?: number;
  moneda?: 'PEN' | 'USD';
  tipoCambio?: number | null;
  montoPENReferencia?: number | null;
  comentarios?: string;
  excelExtra?: Record<string, unknown> | null;
};

export type UpdateIngresoDetalleManualResult =
  | { ok: true; ingreso: Ingreso }
  | { ok: false; ingreso: null; error: string; supabase?: { message: string; code?: string; details?: string; hint?: string } };

export type RemoveIngresoResult =
  | { ok: true }
  | { ok: false; message: string; code?: string; details?: string; hint?: string };

async function fetchIngresoAuditSnapshot(
  id: string,
  tenantEmpresaId?: string | null,
): Promise<Record<string, unknown> | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return null;
  const { data, error } = await supabase
    .from('ingresos')
    .select(INGRESO_AUDIT_SNAPSHOT_SELECT)
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (error) {
    logPostgrestError('ingresos fetchIngresoAuditSnapshot', error);
    return null;
  }
  return (data as Record<string, unknown>) ?? null;
}

/** Lista paginada; `select('*')` incluye `created_at` para UI «Registrado en sistema». */
export async function fetchIngresos(tenantEmpresaId?: string | null): Promise<Ingreso[]> {
  return devPerfAsync('fetchIngresos', async () => {
    const empresaId = resolveTenantId(tenantEmpresaId);
    if (!empresaId) return [];
    const data = await fetchAllSupabasePages(async (from, to) => {
      const { data, error } = await supabase
        .from('ingresos')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);
      return { data, error };
    }, { label: 'fetchIngresos' });
    return data.map((r) => mapIngresoRow(r as Record<string, unknown>));
  });
}

export async function insertIngreso(
  row: Omit<Ingreso, 'id' | 'createdAt'>,
  tenantEmpresaId?: string | null,
): Promise<Ingreso | null> {
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
    .from('ingresos')
    .insert(ingresoToInsert(empresaId, rowForInsert))
    .select('*')
    .single();
  if (error) {
    logPostgrestError('ingresos insert', error);
    return null;
  }
  if (data) {
    const raw = data as Record<string, unknown>;
    void (async () => {
      const uid = await getAuthenticatedUserIdForAudit();
      if (!uid) return;
      const logged = await insertFinancialAuditLog({
        user_id: uid,
        action_type: 'create_income',
        entity_type: 'ingreso',
        entity_id: String(raw.id ?? ''),
        old_data: null,
        new_data: raw,
        reason: 'Registro de ingreso creado desde UI',
      });
      if (!logged) console.warn('[ingresos insert] Auditoría create_income no persistida.');
    })();
  }
  return data ? mapIngresoRow(data as Record<string, unknown>) : null;
}

/** Elimina ingreso; auditoría en segundo plano para no demorar la respuesta. */
export async function removeIngreso(
  id: string,
  tenantEmpresaId?: string | null,
): Promise<RemoveIngresoResult> {
  if (!isValidIngresoPrimaryKey(id)) {
    return { ok: false, message: 'No se puede eliminar: el registro no tiene ID válido' };
  }
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) {
    return { ok: false, message: 'Empresa no configurada.' };
  }

  const before = await fetchIngresoAuditSnapshot(id, empresaId);

  const { error } = await supabase
    .from('ingresos')
    .delete()
    .eq('id', id)
    .eq('empresa_id', empresaId);

  if (error) {
    logPostgrestError('ingresos delete', error);
    return {
      ok: false,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    };
  }

  if (before) {
    void (async () => {
      const uid = await getAuthenticatedUserIdForAudit();
      if (!uid) return;
      const logged = await insertFinancialAuditLog({
        user_id: uid,
        action_type: 'delete_income',
        entity_type: 'ingreso',
        entity_id: id,
        old_data: before,
        new_data: null,
        reason: 'Eliminación de ingreso desde UI',
      });
      if (!logged) {
        console.warn('[ingresos delete] Auditoría delete_income no persistida (el ingreso ya fue eliminado).');
      }
    })();
  }

  return { ok: true };
}

async function fetchIngresoRawById(
  id: string,
  tenantEmpresaId?: string | null,
): Promise<Record<string, unknown> | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return null;
  const { data, error } = await supabase
    .from('ingresos')
    .select('*')
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (error) {
    logPostgrestError('ingresos fetchIngresoRawById', error);
    return null;
  }
  return (data as Record<string, unknown>) ?? null;
}

/** UPDATE parcial en `public.ingresos` con auditoría `edit_income`. */
export async function updateIngresoDetalleManual(
  id: string,
  patch: IngresoDetalleManualPatch,
  tenantEmpresaId?: string | null,
): Promise<UpdateIngresoDetalleManualResult> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  const fail = (
    error: string,
    supabase?: { message: string; code?: string; details?: string; hint?: string },
  ): UpdateIngresoDetalleManualResult => ({ ok: false, ingreso: null, error, supabase });

  if (!isValidIngresoPrimaryKey(id)) {
    return fail('No se puede editar: el registro no tiene ID válido');
  }
  if (!empresaId) return fail('Empresa no configurada.');

  const before = await fetchIngresoRawById(id, empresaId);
  if (!before) return fail(`No existe ingreso #${id} para esta empresa.`);

  const row = ingresoDetalleManualPatchToRow(patch);
  if (Object.keys(row).length === 0) {
    return fail('No hay campos para actualizar (patch vacío).');
  }

  const { data, error } = await supabase
    .from('ingresos')
    .update(row)
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .select('*')
    .maybeSingle();

  if (error) {
    logPostgrestError('ingresos updateIngresoDetalleManual UPDATE', error);
    return fail(error.message || 'Error de Supabase al actualizar el ingreso.', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
  }

  if (!data) {
    return fail(`No se pudo actualizar el ingreso #${id} (0 filas afectadas).`);
  }

  const afterRow = data as Record<string, unknown>;
  void (async () => {
    const uid = await getAuthenticatedUserIdForAudit();
    if (!uid) return;
    const logged = await insertFinancialAuditLog({
      user_id: uid,
      action_type: 'edit_income',
      entity_type: 'ingreso',
      entity_id: id,
      old_data: before,
      new_data: afterRow,
      reason: 'Edición de ingreso desde historial',
    });
    if (!logged) console.warn('[ingresos update] Auditoría edit_income no persistida.');
  })();

  return { ok: true, ingreso: mapIngresoRow(afterRow) };
}
