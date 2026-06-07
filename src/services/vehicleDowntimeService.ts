import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import {
  mapVehicleDowntimeRow,
  vehicleDowntimePatchToSnake,
  vehicleDowntimeToInsert,
} from './supabaseMappers';
import type { VehicleDowntime } from '../data/types';

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

export async function fetchVehicleDowntimes(
  tenantEmpresaId?: string | null,
): Promise<VehicleDowntime[]> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return [];
  const { data, error } = await supabase
    .from('vehicle_downtime')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('fecha_inicio', { ascending: false })
    .order('id', { ascending: false });
  if (error) {
    console.error('[vehicle_downtime]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapVehicleDowntimeRow(r as Record<string, unknown>));
}

export async function fetchVehicleDowntimesByVehicle(
  vehicleId: number,
  tenantEmpresaId?: string | null,
): Promise<VehicleDowntime[]> {
  const all = await fetchVehicleDowntimes(tenantEmpresaId);
  return all.filter((d) => d.vehicleId === vehicleId);
}

export async function insertVehicleDowntime(
  row: Omit<VehicleDowntime, 'id' | 'createdAt'>,
  tenantEmpresaId?: string | null,
): Promise<VehicleDowntime | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return null;
  const { data, error } = await supabase
    .from('vehicle_downtime')
    .insert(vehicleDowntimeToInsert(empresaId, row))
    .select('*')
    .single();
  if (error) {
    console.error('[vehicle_downtime insert]', error.message);
    return null;
  }
  return data ? mapVehicleDowntimeRow(data as Record<string, unknown>) : null;
}

export async function patchVehicleDowntime(
  id: number,
  patch: Partial<Omit<VehicleDowntime, 'id' | 'createdAt'>>,
  tenantEmpresaId?: string | null,
): Promise<VehicleDowntime | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return null;
  const snake = vehicleDowntimePatchToSnake(patch);
  if (Object.keys(snake).length === 0) return null;
  const { data, error } = await supabase
    .from('vehicle_downtime')
    .update(snake)
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .select('*')
    .single();
  if (error) {
    console.error('[vehicle_downtime update]', error.message);
    return null;
  }
  return data ? mapVehicleDowntimeRow(data as Record<string, unknown>) : null;
}

export async function cerrarVehicleDowntime(
  id: number,
  fechaFin: string,
  tenantEmpresaId?: string | null,
): Promise<VehicleDowntime | null> {
  return patchVehicleDowntime(id, { fechaFin, estado: 'cerrado' }, tenantEmpresaId);
}
