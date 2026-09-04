import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import {
  mapVehiculoRow,
  parseNumeroUnidadFromRow,
  vehiculoPatchToSnake,
  vehiculoToInsert,
} from './supabaseMappers';
import type { Vehicle } from '../data/types';
import { devPerfAsync } from '../utils/devPerf';
import { normalizePlaca, placasMatch } from '../utils/normalizePlaca';
import { mergeVehicleRecord, vehicleMissingNumeroUnidad } from '../utils/vehiculoMerge';

/** SELECT explícito: garantiza `numero_unidad` en la respuesta REST (no depender de `*`). */
export const VEHICULOS_LIST_SELECT =
  'id,numero_unidad,marca,modelo,placa,anio,color,activo,propietario_nombre,combustible,tipo_carroceria,numero_motor,cantidad_llaves,gps_1,gps_2,impuesto,km_inicial,tarjeta_propiedad,created_at';

async function hydrateMissingNumeroUnidad(empresaId: string, vehicles: Vehicle[]): Promise<Vehicle[]> {
  const missingIds = vehicles.filter((v) => vehicleMissingNumeroUnidad(v)).map((v) => v.id);
  if (missingIds.length === 0) return vehicles;

  const { data, error } = await supabase
    .from('vehiculos')
    .select('id,numero_unidad')
    .eq('empresa_id', empresaId)
    .in('id', missingIds);

  if (error) {
    console.error('[vehiculos hydrate numero_unidad]', error.message);
    return vehicles;
  }
  if (!data?.length) return vehicles;

  const byId = new Map<number, number>();
  for (const row of data) {
    const rec = row as Record<string, unknown>;
    const idRaw = rec.id;
    const id = typeof idRaw === 'number' ? idRaw : Number(idRaw);
    const nu = parseNumeroUnidadFromRow(rec);
    if (Number.isFinite(id) && nu != null) byId.set(id, nu);
  }
  if (byId.size === 0) return vehicles;

  if (import.meta.env.DEV) {
    console.warn('[vehiculos hydrate numero_unidad]', {
      repaired: byId.size,
      sample: [...byId.entries()].slice(0, 5),
    });
  }

  return vehicles.map((v) => {
    const nu = byId.get(v.id);
    if (nu != null && vehicleMissingNumeroUnidad(v)) {
      return { ...v, numeroUnidad: nu };
    }
    return v;
  });
}

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

export type InsertVehiculoInput = Omit<Vehicle, 'id'>;

function assertValidNumeroUnidad(n: number): number {
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new Error('No se pudo asignar número de unidad');
  }
  return n;
}

async function fetchNextNumeroUnidad(empresaId: string): Promise<number> {
  const { data, error } = await supabase
    .from('vehiculos')
    .select('numero_unidad')
    .eq('empresa_id', empresaId)
    .not('numero_unidad', 'is', null)
    .order('numero_unidad', { ascending: false })
    .limit(1);
  if (error) {
    console.error('[vehiculos next numero_unidad]', error.message);
    throw new Error('No se pudo asignar número de unidad');
  }
  const max = data?.[0]?.numero_unidad;
  const n = max != null && Number.isFinite(Number(max)) ? Math.round(Number(max)) : 0;
  return assertValidNumeroUnidad(n + 1);
}

/** Comprueba si ya existe un vehículo con la misma placa (normalizada) en el tenant. */
export async function vehiculoPlacaExists(
  placa: string,
  tenantEmpresaId?: string | null,
  excludeVehicleId?: number,
): Promise<boolean> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  const needle = normalizePlaca(placa);
  if (!empresaId || !needle) return false;
  const { data, error } = await supabase
    .from('vehiculos')
    .select('id, placa')
    .eq('empresa_id', empresaId);
  if (error) {
    console.error('[vehiculos placa check]', error.message);
    return false;
  }
  return (data ?? []).some((r) => {
    const id = Number((r as { id: unknown }).id);
    if (excludeVehicleId != null && id === excludeVehicleId) return false;
    return placasMatch(String((r as { placa: unknown }).placa ?? ''), needle);
  });
}

/**
 * @param tenantEmpresaId Preferir `profile.empresa_id` (RLS). `EMPRESA_ID` solo filtro cliente legacy.
 */
export async function fetchVehiculos(tenantEmpresaId?: string | null): Promise<Vehicle[]> {
  return devPerfAsync('fetchVehiculos', async () => {
    const empresaId = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
    if (!empresaId) return [];
    const { data, error } = await supabase
      .from('vehiculos')
      .select(VEHICULOS_LIST_SELECT)
      .eq('empresa_id', empresaId)
      .order('numero_unidad', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });
    if (error) {
      console.error('[vehiculos]', error.message);
      return [];
    }
    const mapped = (data ?? []).map((r) => mapVehiculoRow(r as Record<string, unknown>));
    return hydrateMissingNumeroUnidad(empresaId, mapped);
  });
}

export async function insertVehiculo(
  row: InsertVehiculoInput,
  tenantEmpresaId?: string | null,
): Promise<Vehicle | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) {
    console.error('[vehiculos insert] tenant empresa_id no configurado');
    return null;
  }

  const placa = normalizePlaca(row.placa);
  const marca = row.marca.trim();
  const modelo = row.modelo.trim();
  if (!placa || !marca || !modelo) {
    throw new Error('Placa, marca y modelo son obligatorios.');
  }

  if (await vehiculoPlacaExists(placa, empresaId)) {
    throw new Error(`Ya existe un vehículo con la placa ${placa}.`);
  }

  const nextNumeroUnidad = assertValidNumeroUnidad(await fetchNextNumeroUnidad(empresaId));

  const payload = vehiculoToInsert(empresaId, {
    ...row,
    placa,
    marca,
    modelo,
    color: row.color?.trim() || undefined,
    numeroUnidad: nextNumeroUnidad,
  });

  const { data, error } = await supabase
    .from('vehiculos')
    .insert(payload)
    .select(VEHICULOS_LIST_SELECT)
    .single();

  if (error) {
    console.error('[vehiculos insert]', error.message, error);
    if (error.code === '23505') {
      throw new Error(`Ya existe un vehículo con la placa ${placa}.`);
    }
    return null;
  }

  const created = data ? mapVehiculoRow(data as Record<string, unknown>) : null;
  if (!created?.numeroUnidad || !Number.isFinite(created.numeroUnidad) || created.numeroUnidad <= 0) {
    throw new Error('Vehículo creado sin número de unidad');
  }

  console.log('[vehiculos:create:numero_unidad]', {
    id: created.id,
    placa: created.placa,
    numeroUnidad: created.numeroUnidad,
  });

  return created;
}

export async function patchVehiculo(
  id: number,
  patch: Partial<Omit<Vehicle, 'id'>>,
  tenantEmpresaId?: string | null,
): Promise<Vehicle | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) {
    console.error('[vehiculos update] tenant empresa_id no configurado');
    return null;
  }
  if (!Number.isFinite(id)) return null;

  const snake = vehiculoPatchToSnake(patch);
  if (Object.keys(snake).length === 0) {
    const { data: cur, error: readErr } = await supabase
      .from('vehiculos')
      .select(VEHICULOS_LIST_SELECT)
      .eq('id', id)
      .eq('empresa_id', empresaId)
      .maybeSingle();
    if (readErr) {
      console.error('[vehiculos update] read empty patch failed', readErr.message);
      return null;
    }
    return cur ? mapVehiculoRow(cur as Record<string, unknown>) : null;
  }

  if (patch.placa != null) {
    const placa = normalizePlaca(patch.placa);
    if (!placa) throw new Error('Placa inválida.');
    if (await vehiculoPlacaExists(placa, empresaId, id)) {
      throw new Error(`Ya existe un vehículo con la placa ${placa}.`);
    }
    snake.placa = placa;
  }

  const { data, error } = await supabase
    .from('vehiculos')
    .update(snake)
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .select(VEHICULOS_LIST_SELECT);

  if (error) {
    console.error('[vehiculos update]', error.message, error);
    return null;
  }
  const row = data?.[0];
  return row ? mapVehiculoRow(row as Record<string, unknown>) : null;
}

export async function deleteVehiculo(
  id: number,
  tenantEmpresaId?: string | null,
): Promise<boolean> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId || !Number.isFinite(id)) return false;

  const { error, count } = await supabase
    .from('vehiculos')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('empresa_id', empresaId);

  if (error) {
    console.error('[vehiculos delete]', error.message, error);
    return false;
  }
  return (count ?? 0) > 0;
}
