import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { ingresoToInsert, mapIngresoRow } from './supabaseMappers';
import type { Ingreso } from '../data/types';
import { fetchAllSupabasePages } from './supabaseRangeFetch';
import { insertFinancialAuditLog, logPostgrestError } from './financialAuditService';
import { getAuthenticatedUserIdForAudit } from './authAuditUser';
import { isValidIngresoPrimaryKey } from '../utils/ingresoRecordId';

/** Columnas mínimas para old_data en auditoría (evita SELECT * antes del delete). */
const INGRESO_AUDIT_SNAPSHOT_SELECT =
  'id,empresa_id,fecha,fecha_registro,vehicle_id,tipo,sub_tipo,monto,moneda,metodo_pago,comentarios';

export type RemoveIngresoResult =
  | { ok: true }
  | { ok: false; message: string; code?: string; details?: string; hint?: string };

async function fetchIngresoAuditSnapshot(id: string): Promise<Record<string, unknown> | null> {
  if (!EMPRESA_ID) return null;
  const { data, error } = await supabase
    .from('ingresos')
    .select(INGRESO_AUDIT_SNAPSHOT_SELECT)
    .eq('id', id)
    .eq('empresa_id', EMPRESA_ID)
    .maybeSingle();
  if (error) {
    logPostgrestError('ingresos fetchIngresoAuditSnapshot', error);
    return null;
  }
  return (data as Record<string, unknown>) ?? null;
}

/** Lista paginada; `select('*')` incluye `created_at` para UI «Registrado en sistema». */
export async function fetchIngresos(): Promise<Ingreso[]> {
  if (!EMPRESA_ID) return [];
  const data = await fetchAllSupabasePages(async (from, to) => {
    const { data, error } = await supabase
      .from('ingresos')
      .select('*')
      .eq('empresa_id', EMPRESA_ID)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    return { data, error };
  });
  return data.map((r) => mapIngresoRow(r as Record<string, unknown>));
}

export async function insertIngreso(row: Omit<Ingreso, 'id' | 'createdAt'>): Promise<Ingreso | null> {
  if (!EMPRESA_ID) return null;
  const { data, error } = await supabase
    .from('ingresos')
    .insert(ingresoToInsert(EMPRESA_ID, row))
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
export async function removeIngreso(id: string): Promise<RemoveIngresoResult> {
  if (!isValidIngresoPrimaryKey(id)) {
    return { ok: false, message: 'No se puede eliminar: el registro no tiene ID válido' };
  }
  if (!EMPRESA_ID) {
    return { ok: false, message: 'EMPRESA_ID no configurado.' };
  }

  const before = await fetchIngresoAuditSnapshot(id);

  const { error } = await supabase
    .from('ingresos')
    .delete()
    .eq('id', id)
    .eq('empresa_id', EMPRESA_ID);

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
