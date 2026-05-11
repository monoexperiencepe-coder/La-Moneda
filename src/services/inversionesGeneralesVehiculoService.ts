import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { mapInversionGeneralVehiculoRow } from './supabaseMappers';
import type { InversionGeneralVehiculo } from '../data/types';
import { fetchAllSupabasePages } from './supabaseRangeFetch';

export async function fetchInversionesGeneralesVehiculo(): Promise<InversionGeneralVehiculo[]> {
  if (!EMPRESA_ID) return [];
  const data = await fetchAllSupabasePages(async (from, to) => {
    const { data, error } = await supabase
      .from('inversiones_generales_vehiculo')
      .select('*')
      .eq('empresa_id', EMPRESA_ID)
      .order('vehiculo_referencia', { ascending: true })
      .range(from, to);
    return { data, error };
  });
  const rows = data.map((r) => mapInversionGeneralVehiculoRow(r as Record<string, unknown>));
  rows.sort((a, b) => {
    const na = a.vehiculoNumero ?? 10_000;
    const nb = b.vehiculoNumero ?? 10_000;
    if (na !== nb) return na - nb;
    return a.vehiculoReferencia.localeCompare(b.vehiculoReferencia, 'es');
  });
  return rows;
}
