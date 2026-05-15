import { UUID_REGEX_FLAT } from './uuidColumn';

/**
 * Orden estándar de listados: unidad #1, #2, … #N; registros sin vehículo al final.
 * Acepta `vehicle_id` bigint o uuid (uuid se agrupa antes del final estable).
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
