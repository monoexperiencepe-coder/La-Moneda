import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { controlFechaToInsert, mapControlFechaRow } from './supabaseMappers';
import type { ControlFecha } from '../data/types';

/** Filtros server-side para el historial de `control_fechas`. */
export type ControlFechasHistoryFilters = {
  vehicleId?: number;
  tipo?: string;
  fechaVencimientoDesde?: string;
  fechaVencimientoHasta?: string;
};

const DEFAULT_HISTORY_PAGE_SIZE = 75;

/**
 * Resumen operativo: una fila por (vehicle_id, tipo) con la fecha de vencimiento más lejana.
 * Requiere en Supabase la función `fetch_latest_control_fechas_by_vehicle` (ver migration_fetch_latest_control_fechas_fn.sql).
 */
export async function fetchLatestControlFechasByVehicle(): Promise<ControlFecha[]> {
  if (!EMPRESA_ID) return [];
  const { data, error } = await supabase.rpc('fetch_latest_control_fechas_by_vehicle', {
    p_empresa_id: EMPRESA_ID,
  });
  if (error) {
    console.error('[fetch_latest_control_fechas_by_vehicle]', error.message);
    return [];
  }
  return (data ?? []).map((r: Record<string, unknown>) => mapControlFechaRow(r));
}

/**
 * Historial completo paginado (orden: más reciente primero por created_at, luego id).
 * Filtros opcionales en servidor.
 */
export async function fetchControlFechasHistoryPage(
  filters: ControlFechasHistoryFilters,
  page: number,
  pageSize: number = DEFAULT_HISTORY_PAGE_SIZE,
): Promise<{ rows: ControlFecha[]; total: number }> {
  if (!EMPRESA_ID) return { rows: [], total: 0 };
  const from = Math.max(0, page) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase.from('control_fechas').select('*', { count: 'exact' }).eq('empresa_id', EMPRESA_ID);

  if (filters.vehicleId != null && !Number.isNaN(Number(filters.vehicleId))) {
    q = q.eq('vehicle_id', filters.vehicleId);
  }
  const tipo = filters.tipo?.trim();
  if (tipo) q = q.eq('tipo', tipo);
  if (filters.fechaVencimientoDesde?.trim()) {
    q = q.gte('fecha_vencimiento', filters.fechaVencimientoDesde.trim());
  }
  if (filters.fechaVencimientoHasta?.trim()) {
    q = q.lte('fecha_vencimiento', filters.fechaVencimientoHasta.trim());
  }

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('[control_fechas history]', error.message);
    return { rows: [], total: 0 };
  }

  return {
    rows: (data ?? []).map((r: Record<string, unknown>) => mapControlFechaRow(r)),
    total: count ?? 0,
  };
}

export function getDefaultControlFechasHistoryPageSize(): number {
  return DEFAULT_HISTORY_PAGE_SIZE;
}

export async function insertControlFecha(row: Omit<ControlFecha, 'id' | 'createdAt'>): Promise<ControlFecha | null> {
  if (!EMPRESA_ID) return null;
  const { data, error } = await supabase
    .from('control_fechas')
    .insert(controlFechaToInsert(EMPRESA_ID, row))
    .select('*')
    .single();
  if (error) {
    console.error('[control_fechas insert]', error.message);
    return null;
  }
  return data ? mapControlFechaRow(data as Record<string, unknown>) : null;
}

export async function removeControlFecha(id: number): Promise<boolean> {
  if (!EMPRESA_ID) return false;
  const { error } = await supabase
    .from('control_fechas')
    .delete()
    .eq('id', id)
    .eq('empresa_id', EMPRESA_ID);
  if (error) {
    console.error('[control_fechas delete]', error.message);
    return false;
  }
  return true;
}
