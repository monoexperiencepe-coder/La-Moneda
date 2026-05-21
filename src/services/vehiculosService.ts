import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { mapVehiculoRow } from './supabaseMappers';
import type { Vehicle } from '../data/types';

/**
 * @param tenantEmpresaId Preferir `profile.empresa_id` (RLS). `EMPRESA_ID` solo filtro cliente legacy.
 */
export async function fetchVehiculos(tenantEmpresaId?: string | null): Promise<Vehicle[]> {
  const empresaId = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  if (!empresaId) return [];
  const { data, error } = await supabase
    .from('vehiculos')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('id', { ascending: true });
  if (error) {
    console.error('[vehiculos]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapVehiculoRow(r as Record<string, unknown>));
}
