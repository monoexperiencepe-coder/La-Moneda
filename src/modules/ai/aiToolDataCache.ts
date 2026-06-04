/**
 * Cache en memoria por sesión para datos pesados de tools IA (gastos/ingresos/vehículos).
 */
import type { Gasto, Ingreso, Vehicle } from '../../data/types';
import { recordAiDataCacheHit, recordAiDataCacheMiss } from '../copilot/copilotExecutionAudit';
import { fetchGastosFull } from '../../services/gastosService';
import { fetchIngresos } from '../../services/ingresosService';
import { fetchVehiculos } from '../../services/vehiculosService';

const TTL_MS = 5 * 60 * 1000;

type CacheEntry<T> = { ts: number; data: T };

const gastosCache = new Map<string, CacheEntry<Gasto[]>>();
const ingresosCache = new Map<string, CacheEntry<Ingreso[]>>();
const vehiculosCache = new Map<string, CacheEntry<Vehicle[]>>();

function isFresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return entry != null && Date.now() - entry.ts < TTL_MS;
}

export function invalidateAiToolDataCache(empresaId?: string): void {
  if (!empresaId) {
    gastosCache.clear();
    ingresosCache.clear();
    vehiculosCache.clear();
    return;
  }
  gastosCache.delete(empresaId);
  ingresosCache.delete(empresaId);
  vehiculosCache.delete(empresaId);
}

export async function getCachedGastosFull(empresaId: string): Promise<Gasto[]> {
  const hit = gastosCache.get(empresaId);
  if (isFresh(hit)) {
    recordAiDataCacheHit();
    return hit.data;
  }
  recordAiDataCacheMiss();
  const data = await fetchGastosFull(empresaId);
  gastosCache.set(empresaId, { ts: Date.now(), data });
  return data;
}

export async function getCachedIngresos(empresaId: string): Promise<Ingreso[]> {
  const hit = ingresosCache.get(empresaId);
  if (isFresh(hit)) {
    recordAiDataCacheHit();
    return hit.data;
  }
  recordAiDataCacheMiss();
  const data = await fetchIngresos(empresaId);
  ingresosCache.set(empresaId, { ts: Date.now(), data });
  return data;
}

export async function getCachedVehiculos(empresaId: string): Promise<Vehicle[]> {
  const hit = vehiculosCache.get(empresaId);
  if (isFresh(hit)) {
    recordAiDataCacheHit();
    return hit.data;
  }
  recordAiDataCacheMiss();
  const data = await fetchVehiculos(empresaId);
  vehiculosCache.set(empresaId, { ts: Date.now(), data });
  return data;
}

export async function getCachedFinanzasVehiculoBundle(empresaId: string): Promise<{
  vehicles: Vehicle[];
  ingresos: Ingreso[];
  gastosAll: Gasto[];
}> {
  const [vehicles, ingresos, gastosAll] = await Promise.all([
    getCachedVehiculos(empresaId),
    getCachedIngresos(empresaId),
    getCachedGastosFull(empresaId),
  ]);
  return { vehicles, ingresos, gastosAll };
}
