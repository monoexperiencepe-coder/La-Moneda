import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { mapInversionGeneralVehiculoRow } from './supabaseMappers';
import type { InversionGeneralVehiculo } from '../data/types';
import { formatVehicleLabelFull } from '../utils/vehicleDisplayNumber';
import { fetchAllSupabasePages } from './supabaseRangeFetch';
import { computeInversionMontoTotal } from '../utils/inversionesGeneralesUtils';

export { computeInversionMontoTotal } from '../utils/inversionesGeneralesUtils';

// ---------------------------------------------------------------------------
// Tipos públicos para mutaciones
// ---------------------------------------------------------------------------

export interface InversionGeneralVehiculoInsertPayload {
  vehiculoReferencia: string;
  vehiculoNumero: number | null;
  placa: string | null;
  modelo: string | null;
  fechaCompra: string | null;
  valorCompraUsd: number | null;
  gastoGnvUsd: number | null;
  gastoNotarialUsd: number | null;
  legFirmasUsd: number | null;
  seguroUsd: number | null;
  gpsUsd: number | null;
  fundasAccesoriosUsd: number | null;
  totalInversionPen: number | null;
  moneda: 'PEN' | 'USD';
  observaciones: string | null;
}

export type InversionGeneralVehiculoUpdatePayload = Partial<InversionGeneralVehiculoInsertPayload>;

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
  numeroUnidad?: number | null;
  marca: string;
  modelo: string;
  placa: string;
}): string {
  return formatVehicleLabelFull(vehicle).trim().slice(0, 240);
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

  // Si existe un registro con desglose, recalcula monto_total preservando los conceptos no tocados.
  // Para registros nuevos (sin desglose) el total es el propio valorCompraUsd.
  const existingMapped = existing ? mapInversionGeneralVehiculoRow(existing) : null;
  const montoTotal = computeInversionMontoTotal(
    {
      valorCompraUsd,
      gastoGnvUsd: existingMapped?.gastoGnvUsd ?? null,
      gastoNotarialUsd: existingMapped?.gastoNotarialUsd ?? null,
      legFirmasUsd: existingMapped?.legFirmasUsd ?? null,
      seguroUsd: existingMapped?.seguroUsd ?? null,
      gpsUsd: existingMapped?.gpsUsd ?? null,
      fundasAccesoriosUsd: existingMapped?.fundasAccesoriosUsd ?? null,
    },
    valorCompraUsd, // fallback: si todo el desglose es nulo (registro sin desglose), usa el valor de compra
  );

  const payload: Record<string, unknown> = {
    empresa_id: empresaId,
    vehiculo_referencia: referencia,
    vehiculo_numero: vehicle.id,
    placa: vehicle.placa,
    modelo: `${vehicle.marca} ${vehicle.modelo}`.trim(),
    valor_compra_usd: valorCompraUsd,
    monto_total: montoTotal,
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

// ---------------------------------------------------------------------------
// CRUD manual desde UI (Finanzas → Inversiones generales)
// ---------------------------------------------------------------------------

function buildDbPayload(
  p: InversionGeneralVehiculoInsertPayload | InversionGeneralVehiculoUpdatePayload,
  empresaId: string,
  extras?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { empresa_id: empresaId };
  if (p.vehiculoReferencia !== undefined) out.vehiculo_referencia = p.vehiculoReferencia;
  if (p.vehiculoNumero !== undefined) out.vehiculo_numero = p.vehiculoNumero;
  if (p.placa !== undefined) out.placa = p.placa || null;
  if (p.modelo !== undefined) out.modelo = p.modelo || null;
  if (p.fechaCompra !== undefined) out.fecha_compra = p.fechaCompra || null;
  if (p.valorCompraUsd !== undefined) out.valor_compra_usd = p.valorCompraUsd;
  if (p.gastoGnvUsd !== undefined) out.gasto_gnv_usd = p.gastoGnvUsd;
  if (p.gastoNotarialUsd !== undefined) out.gasto_notarial_usd = p.gastoNotarialUsd;
  if (p.legFirmasUsd !== undefined) out.leg_firmas_usd = p.legFirmasUsd;
  if (p.seguroUsd !== undefined) out.seguro_usd = p.seguroUsd;
  if (p.gpsUsd !== undefined) out.gps_usd = p.gpsUsd;
  if (p.fundasAccesoriosUsd !== undefined) out.fundas_accesorios_usd = p.fundasAccesoriosUsd;
  if (p.totalInversionPen !== undefined) out.total_equivalente_pen = p.totalInversionPen;
  if (p.moneda !== undefined) out.moneda = p.moneda;
  if (p.observaciones !== undefined) out.observaciones = p.observaciones || null;
  return { ...out, ...extras };
}

/** Alta de un registro de inversión general desde la UI. */
export async function insertInversionGeneralVehiculo(
  payload: InversionGeneralVehiculoInsertPayload,
  tenantEmpresaId?: string | null,
): Promise<InversionGeneralVehiculo | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return null;
  const montoTotal = computeInversionMontoTotal(payload);
  if (montoTotal <= 0) return null;
  const row = buildDbPayload(payload, empresaId, { monto_total: montoTotal, fuente: 'MANUAL_UI' });
  const { data, error } = await supabase
    .from('inversiones_generales_vehiculo')
    .insert(row)
    .select('*')
    .single();
  if (error) {
    console.error('[inversiones_generales insert]', error.message);
    throw new Error(error.message);
  }
  return mapInversionGeneralVehiculoRow(data as Record<string, unknown>);
}

/** Edición de un registro de inversión general desde la UI. */
export async function updateInversionGeneralVehiculo(
  id: string,
  patch: InversionGeneralVehiculoUpdatePayload,
  tenantEmpresaId?: string | null,
): Promise<InversionGeneralVehiculo | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId || !id) return null;
  const computedTotal = computeInversionMontoTotal(patch);
  const extras: Record<string, unknown> = {};
  if (computedTotal > 0) extras.monto_total = computedTotal;
  const row = buildDbPayload(patch, empresaId, extras);
  // empresa_id no va en el PATCH (está en la policy USING)
  delete row.empresa_id;
  const { data, error } = await supabase
    .from('inversiones_generales_vehiculo')
    .update(row)
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .select('*')
    .single();
  if (error) {
    console.error('[inversiones_generales update]', error.message);
    throw new Error(error.message);
  }
  return mapInversionGeneralVehiculoRow(data as Record<string, unknown>);
}

/** Eliminación física de un registro de inversión. Solo elimina la fila; no afecta el vehículo. */
export async function deleteInversionGeneralVehiculo(
  id: string,
  tenantEmpresaId?: string | null,
): Promise<void> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId || !id) throw new Error('Parámetros inválidos.');
  const { error } = await supabase
    .from('inversiones_generales_vehiculo')
    .delete()
    .eq('id', id)
    .eq('empresa_id', empresaId);
  if (error) {
    console.error('[inversiones_generales delete]', error.message);
    throw new Error(error.message);
  }
}
