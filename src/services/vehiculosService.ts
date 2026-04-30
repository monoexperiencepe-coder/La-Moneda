import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { mapVehiculoRow } from './supabaseMappers';
import type { Vehicle } from '../data/types';

export async function fetchVehiculos(): Promise<Vehicle[]> {
  if (!EMPRESA_ID) return [];
  const { data, error } = await supabase
    .from('vehiculos')
    .select('*')
    .eq('empresa_id', EMPRESA_ID)
    .order('id', { ascending: true });
  if (error) {
    console.error('[vehiculos]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapVehiculoRow(r as Record<string, unknown>));
}
