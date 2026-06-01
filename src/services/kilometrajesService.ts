import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { kilometrajeToInsert, mapKilometrajeRow } from './supabaseMappers';
import type { KilometrajeRegistro } from '../data/types';
import { fetchAllSupabasePages } from './supabaseRangeFetch';
import { logOperationalAudit } from './operationalAuditLog';

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

/** @param tenantEmpresaId Preferir `profile.empresa_id` (RLS). `EMPRESA_ID` solo filtro cliente legacy. */
export async function fetchKilometrajes(tenantEmpresaId?: string | null): Promise<KilometrajeRegistro[]> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return [];
  const data = await fetchAllSupabasePages(async (from, to) => {
    const { data, error } = await supabase
      .from('kilometrajes')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    return { data, error };
  });
  return data.map((r) => mapKilometrajeRow(r as Record<string, unknown>));
}

export async function insertKilometraje(
  row: Omit<KilometrajeRegistro, 'id' | 'createdAt'>,
  tenantEmpresaId?: string | null,
): Promise<KilometrajeRegistro | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return null;
  const { data, error } = await supabase
    .from('kilometrajes')
    .insert(kilometrajeToInsert(empresaId, row))
    .select('*')
    .single();
  if (error) {
    console.error('[kilometrajes insert]', error.message);
    return null;
  }
  if (data) {
    const raw = data as Record<string, unknown>;
    void logOperationalAudit('create_kilometraje', 'kilometraje', String(raw.id ?? ''), {
      newData: raw,
      reason: 'Registro de kilometraje / mantenimiento desde UI',
      tenantEmpresaId: empresaId,
    });
  }
  return data ? mapKilometrajeRow(data as Record<string, unknown>) : null;
}

export async function removeKilometraje(id: number, tenantEmpresaId?: string | null): Promise<boolean> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return false;

  const { data: before, error: readErr } = await supabase
    .from('kilometrajes')
    .select('id,vehicle_id,fecha,fecha_registro,km_mantenimiento,kilometraje,descripcion,costo')
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (readErr) {
    console.error('[kilometrajes delete] read snapshot', readErr.message);
  }

  const { error } = await supabase
    .from('kilometrajes')
    .delete()
    .eq('id', id)
    .eq('empresa_id', empresaId);
  if (error) {
    console.error('[kilometrajes delete]', error.message);
    return false;
  }
  if (before) {
    void logOperationalAudit('delete_kilometraje', 'kilometraje', id, {
      oldData: before as Record<string, unknown>,
      reason: 'Eliminación de registro de kilometraje desde UI',
      tenantEmpresaId: empresaId,
    });
  }
  return true;
}
