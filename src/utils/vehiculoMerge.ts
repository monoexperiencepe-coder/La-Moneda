import type { Vehicle } from '../data/types';

function vehicleHasNumeroUnidad(v: Pick<Vehicle, 'numeroUnidad'>): boolean {
  return v.numeroUnidad != null && Number.isFinite(v.numeroUnidad) && v.numeroUnidad > 0;
}

/** Realtime/updates parciales: conservar numeroUnidad ya cargado si el payload no lo trae. */
export function mergeVehicleRecord(existing: Vehicle | undefined, incoming: Vehicle): Vehicle {
  if (!existing) return incoming;
  const numeroUnidad = vehicleHasNumeroUnidad(incoming)
    ? incoming.numeroUnidad!
    : existing.numeroUnidad ?? null;
  return { ...existing, ...incoming, numeroUnidad };
}

export function vehicleMissingNumeroUnidad(v: Pick<Vehicle, 'numeroUnidad'>): boolean {
  return !vehicleHasNumeroUnidad(v);
}
