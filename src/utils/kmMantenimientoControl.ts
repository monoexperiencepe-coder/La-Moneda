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

export type TipoMantenimientoKm = 'Simple' | 'Completo';

export interface KmControlRow {
  vehicleId: number;
  kmMant: number | null;
  kmUlt: number | null;
  fMant: string | null;
  fUlt: string | null;
  variacion: number | null;
  dias: number | null;
  /** Tipo del último mantenimiento registrado; null si solo hay lecturas semanales. */
  tipoMant: TipoMantenimientoKm | null;
  alertaVariacion: boolean;
}

function sortRowsChrono(rows: KilometrajeRegistro[]): KilometrajeRegistro[] {
  return [...rows].sort((a, b) => {
    const fd = b.fecha.localeCompare(a.fecha);
    if (fd !== 0) return fd;
    return b.id - a.id;
  });
}

/**
 * Tipo de mantenimiento inferido por fila.
 * `null` = solo lectura semanal de km (sin mantenimiento en esa fila).
 */
export function tipoMantenimientoDesdeRegistro(r: KilometrajeRegistro): TipoMantenimientoKm | null {
  const desc = (r.descripcion ?? '').trim().toUpperCase();
  const tieneKmMant = r.kmMantenimiento != null && Number.isFinite(r.kmMantenimiento);

  if (desc.includes('COMPUESTO') || desc.includes('COMPLETO') || desc.includes('MANT.COMPLETO') || desc.includes('MANT COMPLETO')) {
    return 'Completo';
  }
  if (desc.includes('SIMPLE') || desc.includes('MANT.SIMPLE') || desc.includes('MANT SIMPLE')) {
    return 'Simple';
  }

  if (tieneKmMant) return 'Simple';

  return null;
}

export function esRegistroMantenimiento(r: KilometrajeRegistro): boolean {
  return tipoMantenimientoDesdeRegistro(r) != null;
}

export function tipoMantenimientoEtiqueta(t: TipoMantenimientoKm | null): string {
  if (t === 'Simple') return 'Simple';
  if (t === 'Completo') return 'Completo';
  return 'Solo km semanal';
}

export function variacionSuperaUmbralAlerta(variacion: number | null): boolean {
  return variacion != null && Number.isFinite(variacion) && variacion >= KM_ALERTA_VARIACION_DESDE_MANT;
}

/**
 * Control KMS por vehículo:
 * - km actual = última lectura de odómetro (por fecha)
 * - km mant. = último registro de mantenimiento (simple/completo), no el máximo histórico
 * - variación = km actual − km del último mantenimiento
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
    const sorted = sortRowsChrono(rows);

    let kmMant: number | null = null;
    let fMant: string | null = null;
    let tipoMant: TipoMantenimientoKm | null = null;

    for (const r of sorted) {
      if (!esRegistroMantenimiento(r)) continue;
      kmMant = r.kmMantenimiento ?? r.kilometraje ?? null;
      fMant = r.fecha;
      tipoMant = tipoMantenimientoDesdeRegistro(r);
      break;
    }

    let kmUlt: number | null = null;
    let fUlt: string | null = null;
    for (const r of sorted) {
      if (r.kilometraje != null && Number.isFinite(r.kilometraje)) {
        kmUlt = r.kilometraje;
        fUlt = r.fecha;
        break;
      }
    }

    const variacion = kmUlt != null && kmMant != null ? kmUlt - kmMant : null;
    const dias = fMant && fUlt ? Math.abs(diffDaysFromToday(fMant) - diffDaysFromToday(fUlt)) : null;
    const alertaVariacion = variacionSuperaUmbralAlerta(variacion);

    return {
      vehicleId,
      kmMant,
      kmUlt,
      fMant,
      fUlt,
      variacion,
      dias,
      tipoMant,
      alertaVariacion,
    };
  });
}
