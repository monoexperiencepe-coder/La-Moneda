import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { controlFechaToInsert, mapControlFechaRow } from './supabaseMappers';
import type { ControlFecha } from '../data/types';
import { devPerfAsync } from '../utils/devPerf';
import { fetchAllSupabasePagesDetailed } from './supabaseRangeFetch';

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

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
 * RPC `fetch_latest_control_fechas_by_vehicle` (SECURITY INVOKER → RLS en control_fechas).
 */
export async function fetchLatestControlFechasByVehicle(
  tenantEmpresaId?: string | null,
): Promise<ControlFecha[]> {
  return devPerfAsync('fetchControlFechas', async () => {
    const empresaId = resolveTenantId(tenantEmpresaId);
    if (!empresaId) return [];
    const { data, error } = await supabase.rpc('fetch_latest_control_fechas_by_vehicle', {
      p_empresa_id: empresaId,
    });
    if (error) {
      console.error('[fetch_latest_control_fechas_by_vehicle]', error.message);
      return [];
    }
    return (data ?? []).map((r: Record<string, unknown>) => mapControlFechaRow(r));
  });
}

/**
 * Historial completo paginado (orden: unidad vehicle_id 1→N, luego vencimiento más reciente, id).
 */
export async function fetchControlFechasHistoryPage(
  filters: ControlFechasHistoryFilters,
  page: number,
  pageSize: number = DEFAULT_HISTORY_PAGE_SIZE,
  tenantEmpresaId?: string | null,
): Promise<{ rows: ControlFecha[]; total: number }> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return { rows: [], total: 0 };
  const from = Math.max(0, page) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase.from('control_fechas').select('*', { count: 'exact' }).eq('empresa_id', empresaId);

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
    .order('vehicle_id', { ascending: true, nullsFirst: false })
    .order('fecha_vencimiento', { ascending: false })
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

/**
 * Historial documentario completo: pagina internamente (1000 filas/página) hasta agotar.
 * Bajo demanda — sin filtros; filtros y búsqueda en cliente tras cargar.
 */
export async function fetchDocumentacionFullAll(
  tenantEmpresaId?: string | null,
  options?: { signal?: AbortSignal },
): Promise<{ rows: ControlFecha[]; error: string | null }> {
  const logPrefix = '[historialFull:documentacion]';
  const pageSize = 1000;

  return devPerfAsync(
    'fetchDocumentacionFullAll',
    async () => {
      const empresaId = resolveTenantId(tenantEmpresaId);
      if (!empresaId) return { rows: [], error: 'Sin empresa_id' };

      if (options?.signal?.aborted) {
        return { rows: [], error: 'Cancelado' };
      }

      if (import.meta.env.DEV) {
        console.info(`${logPrefix} start`, { pageSize, empresaId });
      }

      try {
        const { rows: rawPages, error: pageError } = await fetchAllSupabasePagesDetailed<Record<string, unknown>>(
          async (from, to) => {
            if (options?.signal?.aborted) {
              return { data: [], error: { message: 'Cancelado' } };
            }

            const { data, error } = await supabase
              .from('control_fechas')
              .select('*')
              .eq('empresa_id', empresaId)
              .order('vehicle_id', { ascending: true, nullsFirst: false })
              .order('fecha_vencimiento', { ascending: false })
              .order('id', { ascending: false })
              .range(from, to);

            return { data: (data ?? []) as Record<string, unknown>[] | null, error };
          },
          {
            label: 'fetchDocumentacionFullAll',
            devLogPrefix: logPrefix,
            signal: options?.signal,
          },
        );

        if (options?.signal?.aborted) {
          return { rows: [], error: 'Cancelado' };
        }

        const rows = (rawPages ?? []).map((r) => mapControlFechaRow(r));
        const error = pageError ?? null;

        if (import.meta.env.DEV) {
          if (error) {
            console.error(`${logPrefix} error`, { pageSize, rowsFetched: rows.length, error });
          } else {
            console.info(`${logPrefix} done`, { pageSize, totalRows: rows.length });
          }
        }

        return { rows, error };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (import.meta.env.DEV) {
          console.error(`${logPrefix} error`, { pageSize, rowsFetched: 0, error: message });
        }
        return { rows: [], error: message };
      } finally {
        if (import.meta.env.DEV) {
          console.info(`${logPrefix} finally`);
        }
      }
    },
    (r) => ({ rows: r.rows.length, error: r.error }),
  );
}

export async function insertControlFecha(
  row: Omit<ControlFecha, 'id' | 'createdAt'>,
  tenantEmpresaId?: string | null,
): Promise<ControlFecha | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return null;
  const { data, error } = await supabase
    .from('control_fechas')
    .insert(controlFechaToInsert(empresaId, row))
    .select('*')
    .single();
  if (error) {
    console.error('[control_fechas insert]', error.message);
    return null;
  }
  return data ? mapControlFechaRow(data as Record<string, unknown>) : null;
}

export async function removeControlFecha(id: number, tenantEmpresaId?: string | null): Promise<boolean> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return false;
  const { error } = await supabase
    .from('control_fechas')
    .delete()
    .eq('id', id)
    .eq('empresa_id', empresaId);
  if (error) {
    console.error('[control_fechas delete]', error.message);
    return false;
  }
  return true;
}
