import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { gastoToInsert, mapGastoRow } from './supabaseMappers';
import type { Gasto } from '../data/types';
import { fetchAllSupabasePages } from './supabaseRangeFetch';

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

/**
 * Actualiza solo la capa de clasificación financiera / auditoría.
 */
export async function updateClasificacionGasto(
  id: number,
  patch: ClasificacionGastoPatch,
): Promise<Gasto | null> {
  if (!EMPRESA_ID) return null;
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
  return data ? mapGastoRow(data as Record<string, unknown>) : null;
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
  return data ? mapGastoRow(data as Record<string, unknown>) : null;
}

export async function removeGasto(id: number): Promise<boolean> {
  if (!EMPRESA_ID) return false;
  const { error } = await supabase
    .from('gastos')
    .delete()
    .eq('id', id)
    .eq('empresa_id', EMPRESA_ID);
  if (error) {
    console.error('[gastos delete]', error.message);
    return false;
  }
  return true;
}
