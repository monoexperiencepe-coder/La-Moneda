import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { mapUnidadRow, unidadToInsert } from './supabaseMappers';
import type { UnidadRegistro } from '../data/types';

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

/** @param tenantEmpresaId Preferir `profile.empresa_id` (RLS). `EMPRESA_ID` solo filtro cliente legacy. */
export async function fetchUnidades(tenantEmpresaId?: string | null): Promise<UnidadRegistro[]> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return [];
  const { data, error } = await supabase
    .from('unidades')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('id', { ascending: false });
  if (error) {
    console.error('[unidades]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapUnidadRow(r as Record<string, unknown>));
}

export async function insertUnidad(
  row: Omit<UnidadRegistro, 'id' | 'createdAt'>,
  tenantEmpresaId?: string | null,
): Promise<UnidadRegistro | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return null;
  const { data, error } = await supabase
    .from('unidades')
    .insert(unidadToInsert(empresaId, row))
    .select('*')
    .single();
  if (error) {
    console.error('[unidades insert]', error.message);
    return null;
  }
  return data ? mapUnidadRow(data as Record<string, unknown>) : null;
}

export async function removeUnidad(id: string, tenantEmpresaId?: string | null): Promise<boolean> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId || !id) return false;
  const { error } = await supabase
    .from('unidades')
    .delete()
    .eq('id', id)
    .eq('empresa_id', empresaId);
  if (error) {
    console.error('[unidades delete]', error.message);
    return false;
  }
  return true;
}
