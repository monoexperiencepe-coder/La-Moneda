/**
 * Orden estándar de listados: unidad #1, #2, … #N; registros sin vehículo al final.
 */
export function vehicleIdSortRank(vehicleId: number | null | undefined): number {
  if (vehicleId == null || Number.isNaN(Number(vehicleId))) return Number.MAX_SAFE_INTEGER;
  return Number(vehicleId);
}
