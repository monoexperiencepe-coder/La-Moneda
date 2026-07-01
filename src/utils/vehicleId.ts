import { UUID_REGEX_FLAT } from './uuidColumn';
import { formatVehicleSelectLabel } from './vehicleDisplayNumber';

/** Clave estable para comparar FK vehículo (bigint o uuid en BD). */
export type VehicleIdLike = number | string | null | undefined;

/**
 * FK `gastos.vehicle_id` hacia `vehiculos.id` (bigint o uuid según entorno).
 * Nunca devuelve 0: `moveTarget.vehicleId ?? null` deja 0 pasar porque no es nullish.
 */
export function normalizeGastoVehicleFkForDb(v: VehicleIdLike): number | string | null {
  if (v == null || v === '' || v === 0 || v === '0') return null;
  if (typeof v === 'bigint') {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '' || t === '0') return null;
    if (UUID_REGEX_FLAT.test(t)) return t;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export function vehicleIdKey(v: VehicleIdLike): string | null {
  if (v == null || v === '' || v === 0 || v === '0') return null;
  return String(v);
}

export function vehicleIdsEqual(a: VehicleIdLike, b: VehicleIdLike): boolean {
  return vehicleIdKey(a) === vehicleIdKey(b);
}

export type VehicleSelectLabelFields = {
  id: number | string;
  numeroUnidad?: number | null;
  marca?: string | null;
  modelo?: string | null;
  placa?: string | null;
};

/** Etiqueta visible en selects de vehículo (value sigue siendo `String(id)`). */
export function vehicleSelectOptionLabel(v: VehicleSelectLabelFields): string {
  return formatVehicleSelectLabel({
    id: typeof v.id === 'number' ? v.id : Number(v.id) || 0,
    numeroUnidad: v.numeroUnidad ?? null,
    marca: v.marca ?? '',
    modelo: v.modelo ?? '',
    placa: v.placa ?? '',
  });
}
