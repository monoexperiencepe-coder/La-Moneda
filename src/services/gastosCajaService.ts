import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { mapGastoCajaRow } from './supabaseMappers';
import type { GastoCaja } from '../data/types';
import { fetchAllSupabasePages } from './supabaseRangeFetch';

export async function fetchGastosCaja(): Promise<GastoCaja[]> {
  if (!EMPRESA_ID) return [];
  const data = await fetchAllSupabasePages(async (from, to) => {
    const { data, error } = await supabase
      .from('gastos_caja')
      .select('*')
      .eq('empresa_id', EMPRESA_ID)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    return { data, error };
  });
  return data.map((r) => mapGastoCajaRow(r as Record<string, unknown>));
}
