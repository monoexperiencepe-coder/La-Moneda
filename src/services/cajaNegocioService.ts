import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { mapCajaNegocioVehiculoRow } from './supabaseMappers';
import type { CajaNegocioVehiculo } from '../data/types';
import { fetchAllSupabasePages } from './supabaseRangeFetch';

export async function fetchCajaNegocioVehiculo(): Promise<CajaNegocioVehiculo[]> {
  if (!EMPRESA_ID) return [];
  const data = await fetchAllSupabasePages(async (from, to) => {
    const { data, error } = await supabase
      .from('caja_negocio_vehiculo')
      .select('*')
      .eq('empresa_id', EMPRESA_ID)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    return { data, error };
  });
  return data.map((r) => mapCajaNegocioVehiculoRow(r as Record<string, unknown>));
}
