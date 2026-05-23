import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { mapGastoCajaRow } from './supabaseMappers';
import type { GastoCaja } from '../data/types';
import { fetchAllSupabasePages } from './supabaseRangeFetch';
import { devPerfAsync } from '../utils/devPerf';

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

/** @param tenantEmpresaId Preferir `profile.empresa_id` (RLS). */
export async function fetchGastosCaja(tenantEmpresaId?: string | null): Promise<GastoCaja[]> {
  return devPerfAsync('fetchGastosCaja', async () => {
    const empresaId = resolveTenantId(tenantEmpresaId);
    if (!empresaId) return [];
    const data = await fetchAllSupabasePages(async (from, to) => {
      const { data, error } = await supabase
        .from('gastos_caja')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);
      return { data, error };
    }, { label: 'fetchGastosCaja' });
    return data.map((r) => mapGastoCajaRow(r as Record<string, unknown>));
  });
}
