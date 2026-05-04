import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { kilometrajeToInsert, mapKilometrajeRow } from './supabaseMappers';
import type { KilometrajeRegistro } from '../data/types';
import { fetchAllSupabasePages } from './supabaseRangeFetch';

export async function fetchKilometrajes(): Promise<KilometrajeRegistro[]> {
  if (!EMPRESA_ID) return [];
  const data = await fetchAllSupabasePages(async (from, to) => {
    const { data, error } = await supabase
      .from('kilometrajes')
      .select('*')
      .eq('empresa_id', EMPRESA_ID)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    return { data, error };
  });
  return data.map((r) => mapKilometrajeRow(r as Record<string, unknown>));
}

export async function insertKilometraje(
  row: Omit<KilometrajeRegistro, 'id' | 'createdAt'>,
): Promise<KilometrajeRegistro | null> {
  if (!EMPRESA_ID) return null;
  const { data, error } = await supabase
    .from('kilometrajes')
    .insert(kilometrajeToInsert(EMPRESA_ID, row))
    .select('*')
    .single();
  if (error) {
    console.error('[kilometrajes insert]', error.message);
    return null;
  }
  return data ? mapKilometrajeRow(data as Record<string, unknown>) : null;
}

export async function removeKilometraje(id: number): Promise<boolean> {
  if (!EMPRESA_ID) return false;
  const { error } = await supabase
    .from('kilometrajes')
    .delete()
    .eq('id', id)
    .eq('empresa_id', EMPRESA_ID);
  if (error) {
    console.error('[kilometrajes delete]', error.message);
    return false;
  }
  return true;
}
