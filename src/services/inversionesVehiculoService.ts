import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { mapInversionVehiculoRow } from './supabaseMappers';
import type { InversionVehiculo } from '../data/types';
import { fetchAllSupabasePages } from './supabaseRangeFetch';

/** Suma total_inversion_usd por vehicle_id; null si no hay filas para esa unidad. */
export function totalInversionUsdForVehicle(rows: InversionVehiculo[], vehicleId: number): number | null {
  const list = rows.filter((r) => r.vehicleId != null && Number(r.vehicleId) === vehicleId);
  if (!list.length) return null;
  const sum = list.reduce((s, r) => s + (r.totalInversionUsd ?? 0), 0);
  return sum;
}

export async function fetchInversionesVehiculo(): Promise<InversionVehiculo[]> {
  if (!EMPRESA_ID) return [];
  const data = await fetchAllSupabasePages(async (from, to) => {
    const { data, error } = await supabase
      .from('inversiones_vehiculo')
      .select('*')
      .eq('empresa_id', EMPRESA_ID)
      .order('id', { ascending: true })
      .range(from, to);
    return { data, error };
  });
  return data.map((r) => mapInversionVehiculoRow(r as Record<string, unknown>));
}
