import { UUID_REGEX_FLAT } from './uuidColumn';

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
  marca?: string | null;
  modelo?: string | null;
  placa?: string | null;
};

/** Etiqueta visible en selects de vehículo (value sigue siendo `String(id)`). */
export function vehicleSelectOptionLabel(v: VehicleSelectLabelFields): string {
  const idStr = String(v.id).trim();
  const marcaModelo = [v.marca, v.modelo]
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean)
    .join(' ');
  const placa = typeof v.placa === 'string' ? v.placa.trim() : '';
  const parts: string[] = [`Unidad ${idStr}`];
  if (marcaModelo && placa) parts.push(`${marcaModelo} (${placa})`);
  else if (marcaModelo) parts.push(marcaModelo);
  else if (placa) parts.push(placa);
  parts.push(`ID: ${idStr}`);
  return parts.join(' · ');
}
