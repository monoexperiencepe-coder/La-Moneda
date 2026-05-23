import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { mapCajaNegocioVehiculoRow } from './supabaseMappers';
import type { CajaNegocioVehiculo } from '../data/types';
import { fetchAllSupabasePages } from './supabaseRangeFetch';
import { devPerfAsync } from '../utils/devPerf';

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

/** @param tenantEmpresaId Preferir `profile.empresa_id` (RLS). */
export async function fetchCajaNegocioVehiculo(tenantEmpresaId?: string | null): Promise<CajaNegocioVehiculo[]> {
  return devPerfAsync('fetchCajaNegocioVehiculo', async () => {
    const empresaId = resolveTenantId(tenantEmpresaId);
    if (!empresaId) return [];
    const data = await fetchAllSupabasePages(async (from, to) => {
      const { data, error } = await supabase
        .from('caja_negocio_vehiculo')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);
      return { data, error };
    }, { label: 'fetchCajaNegocioVehiculo' });
    return data.map((r) => mapCajaNegocioVehiculoRow(r as Record<string, unknown>));
  });
}
