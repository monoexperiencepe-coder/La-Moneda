import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { mapInversionVehiculoRow } from './supabaseMappers';
import type { InversionVehiculo } from '../data/types';
import { fetchAllSupabasePages } from './supabaseRangeFetch';

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

/** Suma total_inversion_usd por vehicle_id; null si no hay filas para esa unidad. */
export function totalInversionUsdForVehicle(rows: InversionVehiculo[], vehicleId: number): number | null {
  const list = rows.filter((r) => r.vehicleId != null && Number(r.vehicleId) === vehicleId);
  if (!list.length) return null;
  const sum = list.reduce((s, r) => s + (r.totalInversionUsd ?? 0), 0);
  return sum;
}

/** @param tenantEmpresaId Preferir `profile.empresa_id` (RLS). */
export async function fetchInversionesVehiculo(tenantEmpresaId?: string | null): Promise<InversionVehiculo[]> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return [];
  const data = await fetchAllSupabasePages(async (from, to) => {
    const { data, error } = await supabase
      .from('inversiones_vehiculo')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('id', { ascending: true })
      .range(from, to);
    return { data, error };
  });
  return data.map((r) => mapInversionVehiculoRow(r as Record<string, unknown>));
}
