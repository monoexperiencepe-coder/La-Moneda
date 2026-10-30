import type { Vehicle } from '../data/types';
import { getVehicleDisplayNumber } from './vehicleDisplayNumber';
import { UUID_REGEX_FLAT } from './uuidColumn';

/**
 * Orden por número operativo (#numero_unidad) cuando hay catálogo de vehículos.
 * Sin catálogo, cae al rank por id técnico (`vehicleIdSortRank`).
 */
export function vehicleFleetSortRankFromId(
  vehicles: readonly Pick<Vehicle, 'id' | 'numeroUnidad'>[] | undefined,
  vehicleId: number | string | null | undefined,
): number {
  if (vehicleId == null || vehicleId === '' || vehicleId === 0 || vehicleId === '0') {
    return Number.MAX_SAFE_INTEGER;
  }
  const s = String(vehicleId).trim();
  if (UUID_REGEX_FLAT.test(s)) return Number.MAX_SAFE_INTEGER - 2;
  const n = Number(s);
  if (!Number.isFinite(n)) return Number.MAX_SAFE_INTEGER - 1;
  const v = vehicles?.find((x) => x.id === n);
  return v ? getVehicleDisplayNumber(v) : vehicleIdSortRank(vehicleId);
}

/**
 * Orden estándar de listados: unidad #1, #2, … #N; registros sin vehículo al final.
 * Acepta `vehicle_id` bigint o uuid (uuid se agrupa antes del final estable).
 * @deprecated Preferir `vehicleFleetSortRankFromId` cuando exista lista `vehicles`.
 */
export function vehicleIdSortRank(vehicleId: number | string | null | undefined): number {
  if (vehicleId == null || vehicleId === '' || vehicleId === 0 || vehicleId === '0') {
    return Number.MAX_SAFE_INTEGER;
  }
  const s = String(vehicleId).trim();
  if (UUID_REGEX_FLAT.test(s)) return Number.MAX_SAFE_INTEGER - 2;
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER - 1;
}
