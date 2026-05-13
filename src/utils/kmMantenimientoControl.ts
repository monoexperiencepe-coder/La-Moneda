import type { KilometrajeRegistro } from '../data/types';
import { todayStr } from './formatting';
import { vehicleIdSortRank } from './sortByVehicle';

function diffDaysFromToday(dateStr: string): number {
  const today = new Date(todayStr() + 'T00:00:00').getTime();
  const target = new Date(dateStr.slice(0, 10) + 'T00:00:00').getTime();
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

/** Km recorridos desde el último mantenimiento; alerta en UI y en “Qué hacer hoy”. */
export const KM_ALERTA_VARIACION_DESDE_MANT = 5000;

/** Heurística para etiqueta Compuesto vs Simple (histórico / descripción). */
export const KM_HEURISTICA_TIPO_COMPUESTO = 3500;

export type TipoMantenimientoKm = 'Simple' | 'Compuesto';

export interface KmControlRow {
  vehicleId: number;
  kmMant: number | null;
  kmUlt: number | null;
  fMant: string | null;
  fUlt: string | null;
  variacion: number | null;
  dias: number | null;
  tipoMant: TipoMantenimientoKm;
  alertaVariacion: boolean;
}

function tipoMantDesdeVariacionYDescripcion(variacion: number | null, lastMantDesc: string): TipoMantenimientoKm {
  const d = lastMantDesc.toUpperCase();
  if (
    d.includes('COMPUESTO') ||
    d.includes('COMPLETO') ||
    d.includes('MANT.COMPLETO') ||
    d.includes('MANT COMPLETO')
  ) {
    return 'Compuesto';
  }
  if (variacion != null && variacion >= KM_HEURISTICA_TIPO_COMPUESTO) return 'Compuesto';
  if (d.includes('SIMPLE') || d.includes('MANT.SIMPLE')) return 'Simple';
  return 'Simple';
}

/**
 * Tipo de mantenimiento inferido por fila (últimos registros).
 * `null` = registro solo de km semanal, sin datos de mantenimiento en esa fila.
 */
export function tipoMantenimientoDesdeRegistro(r: KilometrajeRegistro): TipoMantenimientoKm | null {
  const desc = (r.descripcion ?? '').trim().toUpperCase();
  const tieneKmMant = r.kmMantenimiento != null && Number.isFinite(r.kmMantenimiento);
  const tieneKm = r.kilometraje != null && Number.isFinite(r.kilometraje);

  if (!tieneKmMant && !desc) {
    return tieneKm ? null : null;
  }

  if (desc.includes('COMPUESTO') || desc.includes('COMPLETO') || desc.includes('MANT.COMPLETO')) {
    return 'Compuesto';
  }
  if (desc.includes('SIMPLE') || desc.includes('MANT.SIMPLE')) {
    return 'Simple';
  }

  if (tieneKmMant && tieneKm) {
    const delta = r.kilometraje! - r.kmMantenimiento!;
    if (delta >= KM_HEURISTICA_TIPO_COMPUESTO) return 'Compuesto';
    return 'Simple';
  }

  if (tieneKmMant) return 'Simple';

  return null;
}

export function variacionSuperaUmbralAlerta(variacion: number | null): boolean {
  return variacion != null && Number.isFinite(variacion) && variacion >= KM_ALERTA_VARIACION_DESDE_MANT;
}

/**
 * Una fila por vehículo con datos en `kilometrajes`: último km de mant., último km odométrico y variación.
 */
export function buildKmControlRows(
  kilometrajes: KilometrajeRegistro[],
  restrictVehicleId?: number | null,
): KmControlRow[] {
  const byVehicle = new Map<number, KilometrajeRegistro[]>();
  for (const r of kilometrajes) {
    const arr = byVehicle.get(r.vehicleId) ?? [];
    arr.push(r);
    byVehicle.set(r.vehicleId, arr);
  }

  const entries = Array.from(byVehicle.entries()).filter(([vid]) =>
    restrictVehicleId == null ? true : vid === restrictVehicleId,
  );
  entries.sort(([a], [b]) => vehicleIdSortRank(a) - vehicleIdSortRank(b));

  return entries.map(([vehicleId, rows]) => {
    const maxKmMant = rows.reduce<number | null>((acc, r) => {
      if (r.kmMantenimiento == null) return acc;
      return acc == null ? r.kmMantenimiento : Math.max(acc, r.kmMantenimiento);
    }, null);
    const maxKm = rows.reduce<number | null>((acc, r) => {
      if (r.kilometraje == null) return acc;
      return acc == null ? r.kilometraje : Math.max(acc, r.kilometraje);
    }, null);
    const fMant =
      maxKmMant == null
        ? null
        : rows
            .filter((r) => r.kmMantenimiento === maxKmMant)
            .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.fecha ?? null;
    const fUlt =
      maxKm == null
        ? null
        : rows
            .filter((r) => r.kilometraje === maxKm)
            .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.fecha ?? null;
    const variacion = maxKm != null && maxKmMant != null ? maxKm - maxKmMant : null;
    const dias = fMant && fUlt ? Math.abs(diffDaysFromToday(fMant) - diffDaysFromToday(fUlt)) : null;
    const lastMantDesc =
      rows
        .filter((r) => r.descripcion?.trim())
        .sort((a, b) => (b.fecha + b.createdAt).localeCompare(a.fecha + a.createdAt))[0]
        ?.descripcion?.trim()
        ?.toUpperCase() ?? '';

    const tipoMant = tipoMantDesdeVariacionYDescripcion(variacion, lastMantDesc);
    const alertaVariacion = variacionSuperaUmbralAlerta(variacion);

    return {
      vehicleId,
      kmMant: maxKmMant,
      kmUlt: maxKm,
      fMant,
      fUlt,
      variacion,
      dias,
      tipoMant,
      alertaVariacion,
    };
  });
}
