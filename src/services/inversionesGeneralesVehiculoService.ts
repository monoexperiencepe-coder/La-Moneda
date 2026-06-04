import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { mapInversionGeneralVehiculoRow } from './supabaseMappers';
import type { InversionGeneralVehiculo } from '../data/types';
import { fetchAllSupabasePages } from './supabaseRangeFetch';

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

/** @param tenantEmpresaId Preferir `profile.empresa_id` (RLS). */
export async function fetchInversionesGeneralesVehiculo(
  tenantEmpresaId?: string | null,
): Promise<InversionGeneralVehiculo[]> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return [];
  const data = await fetchAllSupabasePages(async (from, to) => {
    const { data, error } = await supabase
      .from('inversiones_generales_vehiculo')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('vehiculo_numero', { ascending: true, nullsFirst: false })
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

function vehiculoReferenciaForVehicle(vehicle: {
  id: number;
  marca: string;
  modelo: string;
  placa: string;
}): string {
  return `#${vehicle.id} ${vehicle.marca} ${vehicle.modelo}`.trim().slice(0, 240);
}

/** Valor de compra / inversión inicial desde registro de vehículo → tabla inversiones_generales_vehiculo. */
export async function upsertInversionGeneralVehiculoValor(
  vehicle: { id: number; marca: string; modelo: string; placa: string },
  valorCompraUsd: number,
  tenantEmpresaId?: string | null,
): Promise<InversionGeneralVehiculo | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId || !Number.isFinite(valorCompraUsd) || valorCompraUsd <= 0) return null;

  const { data: existingRows, error: findError } = await supabase
    .from('inversiones_generales_vehiculo')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('vehiculo_numero', vehicle.id)
    .limit(1);

  if (findError) {
    console.error('[inversiones_generales_vehiculo upsert find]', findError.message);
    return null;
  }

  const existing = existingRows?.[0] as Record<string, unknown> | undefined;
  const referencia =
    (existing?.vehiculo_referencia as string | undefined)?.trim()
    || vehiculoReferenciaForVehicle(vehicle);

  const payload: Record<string, unknown> = {
    empresa_id: empresaId,
    vehiculo_referencia: referencia,
    vehiculo_numero: vehicle.id,
    placa: vehicle.placa,
    modelo: `${vehicle.marca} ${vehicle.modelo}`.trim(),
    valor_compra_usd: valorCompraUsd,
    monto_total: valorCompraUsd,
    moneda: 'USD',
    fuente: 'REGISTRO_UI',
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from('inversiones_generales_vehiculo')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) {
      console.error('[inversiones_generales_vehiculo upsert update]', error.message);
      return null;
    }
    return mapInversionGeneralVehiculoRow(data as Record<string, unknown>);
  }

  const { data, error } = await supabase
    .from('inversiones_generales_vehiculo')
    .insert(payload)
    .select('*')
    .single();
  if (error) {
    console.error('[inversiones_generales_vehiculo upsert insert]', error.message);
    return null;
  }
  return mapInversionGeneralVehiculoRow(data as Record<string, unknown>);
}

export async function fetchInversionGeneralByVehicleId(
  vehicleId: number,
  tenantEmpresaId?: string | null,
): Promise<InversionGeneralVehiculo | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return null;
  const { data, error } = await supabase
    .from('inversiones_generales_vehiculo')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('vehiculo_numero', vehicleId)
    .maybeSingle();
  if (error || !data) return null;
  return mapInversionGeneralVehiculoRow(data as Record<string, unknown>);
}
