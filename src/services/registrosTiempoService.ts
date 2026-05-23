import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import {
  mapRegistroTiempoRow,
  registroTiempoPatchToSnake,
  registroTiempoToInsert,
} from './supabaseMappers';
import type { RegistroTiempo } from '../data/types';

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

/** @param tenantEmpresaId Preferir `profile.empresa_id` (RLS). */
export async function fetchRegistrosTiempo(tenantEmpresaId?: string | null): Promise<RegistroTiempo[]> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return [];
  const { data, error } = await supabase
    .from('registros_tiempo')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('fecha', { ascending: false })
    .order('id', { ascending: false });
  if (error) {
    console.error('[registros_tiempo]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapRegistroTiempoRow(r as Record<string, unknown>));
}

export async function insertRegistroTiempo(
  row: Omit<RegistroTiempo, 'id' | 'createdAt'>,
  tenantEmpresaId?: string | null,
): Promise<RegistroTiempo | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return null;
  const { data, error } = await supabase
    .from('registros_tiempo')
    .insert(registroTiempoToInsert(empresaId, row))
    .select('*')
    .single();
  if (error) {
    console.error('[registros_tiempo insert]', error.message);
    return null;
  }
  return data ? mapRegistroTiempoRow(data as Record<string, unknown>) : null;
}

export async function patchRegistroTiempo(
  id: number,
  patch: Partial<Omit<RegistroTiempo, 'id' | 'createdAt'>>,
  tenantEmpresaId?: string | null,
): Promise<RegistroTiempo | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return null;
  const snake = registroTiempoPatchToSnake(patch);
  if (Object.keys(snake).length === 0) {
    const { data: cur } = await supabase
      .from('registros_tiempo')
      .select('*')
      .eq('id', id)
      .eq('empresa_id', empresaId)
      .maybeSingle();
    return cur ? mapRegistroTiempoRow(cur as Record<string, unknown>) : null;
  }
  const { data, error } = await supabase
    .from('registros_tiempo')
    .update(snake)
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .select('*')
    .single();
  if (error) {
    console.error('[registros_tiempo update]', error.message);
    return null;
  }
  return data ? mapRegistroTiempoRow(data as Record<string, unknown>) : null;
}

export async function removeRegistroTiempo(id: number, tenantEmpresaId?: string | null): Promise<boolean> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return false;
  const { error } = await supabase.from('registros_tiempo').delete().eq('id', id).eq('empresa_id', empresaId);
  if (error) {
    console.error('[registros_tiempo delete]', error.message);
    return false;
  }
  return true;
}
