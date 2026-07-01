import type { Vehicle } from '../data/types';

/** Número visible de unidad (#83); fallback al id técnico si aún no hay backfill. */
export function getVehicleDisplayNumber(
  vehicle: Pick<Vehicle, 'id' | 'numeroUnidad'> & { placa?: string | null },
): number {
  const n = vehicle.numeroUnidad;
  if (n != null && Number.isFinite(n) && n > 0) return Math.round(n);
  if (import.meta.env.DEV) {
    console.warn('[vehiculo:display:fallback_id]', {
      id: vehicle.id,
      placa: vehicle.placa ?? null,
    });
  }
  return vehicle.id;
}

/** Etiqueta visible «Unidad #N». Sin id técnico en UI. */
export function formatVehicleUnitLabel(
  vehicle: Pick<Vehicle, 'id' | 'numeroUnidad'>,
  opts?: { lowercase?: boolean },
): string {
  const word = opts?.lowercase ? 'unidad' : 'Unidad';
  return `${word} #${getVehicleDisplayNumber(vehicle)}`;
}

export function formatVehicleUnitHash(vehicle: Pick<Vehicle, 'id' | 'numeroUnidad'>): string {
  return `#${getVehicleDisplayNumber(vehicle)}`;
}

/** Etiqueta estándar para selects: #N — Marca Modelo (PLACA) */
export function formatVehicleSelectLabel(
  vehicle: Pick<Vehicle, 'id' | 'numeroUnidad' | 'marca' | 'modelo' | 'placa'>,
): string {
  return `#${getVehicleDisplayNumber(vehicle)} — ${vehicle.marca} ${vehicle.modelo} (${vehicle.placa})`;
}

/** Etiqueta completa: #N Marca Modelo (PLACA) */
export function formatVehicleLabelFull(
  vehicle: Pick<Vehicle, 'id' | 'numeroUnidad' | 'marca' | 'modelo' | 'placa'>,
): string {
  return `#${getVehicleDisplayNumber(vehicle)} ${vehicle.marca} ${vehicle.modelo} (${vehicle.placa})`;
}

/** Etiqueta operaciones: #N — PLACA — Marca Modelo */
export function formatVehiclePlacaMarcaLabel(
  vehicle: Pick<Vehicle, 'id' | 'numeroUnidad' | 'placa' | 'marca' | 'modelo'>,
): string {
  return `#${getVehicleDisplayNumber(vehicle)} — ${vehicle.placa} — ${vehicle.marca} ${vehicle.modelo}`.trim();
}

/** Etiqueta indisponibilidad: #N — Marca Modelo — PLACA */
export function formatVehicleMarcaPlacaLabel(
  vehicle: Pick<Vehicle, 'id' | 'numeroUnidad' | 'marca' | 'modelo' | 'placa'>,
): string {
  return `#${getVehicleDisplayNumber(vehicle)} — ${vehicle.marca} ${vehicle.modelo} — ${vehicle.placa}`.trim();
}

/** Etiqueta corta: #N · PLACA */
export function formatVehicleIdPlaca(
  vehicle: Pick<Vehicle, 'id' | 'numeroUnidad' | 'placa'>,
): string {
  return `#${getVehicleDisplayNumber(vehicle)} · ${vehicle.placa}`;
}

/** Resuelve vehículo por número visible o, en transición, por id técnico. */
export function findVehicleByDisplayNumber(
  vehicles: readonly Vehicle[],
  numero: number,
): Vehicle | null {
  if (!Number.isFinite(numero) || numero <= 0) return null;
  const n = Math.round(numero);
  const byDisplay = vehicles.find((v) => getVehicleDisplayNumber(v) === n);
  if (byDisplay) return byDisplay;
  return vehicles.find((v) => v.id === n) ?? null;
}

/** Fallback cuando solo se tiene vehicleId técnico sin objeto Vehicle. */
export function formatVehicleIdFallback(vehicleId: number | string | null | undefined): string {
  if (vehicleId == null || vehicleId === '') return 'General';
  return `Unidad #${vehicleId}`;
}

/** Orden de flota: numero_unidad visible, luego id técnico. */
export function vehicleFleetSortKey(vehicle: Pick<Vehicle, 'id' | 'numeroUnidad'>): number {
  return getVehicleDisplayNumber(vehicle);
}
