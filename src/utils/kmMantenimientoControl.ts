import type { KilometrajeRegistro } from '../data/types';
import { diffCalendarDays, formatDate, todayStr } from './formatting';
import { vehicleIdSortRank } from './sortByVehicle';

/** Km recorridos desde el último mantenimiento; alerta en UI y en “Qué hacer hoy”. */
export const KM_ALERTA_VARIACION_DESDE_MANT = 5000;

export type TipoMantenimientoKm = 'Simple' | 'Completo';

export type KmMantenimientoStatus = 'ok' | 'alerta' | 'sin_mantenimiento' | 'sin_registro_actual';

export interface KmDesdeUltimoMantenimientoResult {
  vehicleId: number;
  ultimoMantenimientoKm: number | null;
  ultimoMantenimientoFecha: string | null;
  ultimoRegistroKm: number | null;
  ultimoRegistroFecha: string | null;
  diffKm: number | null;
  status: KmMantenimientoStatus;
  warningMessage: string | null;
  /** Tipo del último mantenimiento registrado. */
  tipoMant: TipoMantenimientoKm | null;
  alertaVariacion: boolean;
}

export interface KmControlRow extends KmDesdeUltimoMantenimientoResult {
  /** @deprecated usar ultimoMantenimientoKm */
  kmMant: number | null;
  /** @deprecated usar ultimoRegistroKm */
  kmUlt: number | null;
  /** @deprecated usar ultimoMantenimientoFecha */
  fMant: string | null;
  /** @deprecated usar ultimoRegistroFecha */
  fUlt: string | null;
  /** @deprecated usar diffKm */
  variacion: number | null;
  /** Días desde último mantenimiento real hasta último registro de km (o hoy Lima). */
  dias: number | null;
}

export interface KmMantenimientoMensualRow {
  key: string;
  label: string;
  simple: number;
  completo: number;
  total: number;
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

function logKmMantenimientoDev(result: KmDesdeUltimoMantenimientoResult): void {
  if (!import.meta.env.DEV || import.meta.env.VITE_KM_MANTENIMIENTO_LOG !== '1') return;
  console.info('[km:mantenimiento]', {
    vehicle_id: result.vehicleId,
    ultimoMantenimientoKm: result.ultimoMantenimientoKm,
    ultimoMantenimientoFecha: result.ultimoMantenimientoFecha,
    ultimoRegistroKm: result.ultimoRegistroKm,
    ultimoRegistroFecha: result.ultimoRegistroFecha,
    diffKm: result.diffKm,
    status: result.status,
  });
}

function findUltimoMantenimiento(sorted: KilometrajeRegistro[]): {
  km: number | null;
  fecha: string | null;
  tipo: TipoMantenimientoKm | null;
} {
  for (const r of sorted) {
    if (!esRegistroMantenimiento(r)) continue;
    return {
      km: r.kmMantenimiento ?? r.kilometraje ?? null,
      fecha: r.fecha.slice(0, 10),
      tipo: tipoMantenimientoDesdeRegistro(r),
    };
  }
  return { km: null, fecha: null, tipo: null };
}

/**
 * Última lectura actual:
 * - Si hay mantenimiento y el último registro semanal es en/fecha posterior → ese.
 * - Si no hay semanal posterior → el kilometraje más reciente disponible (cualquier fila).
 */
function findUltimoRegistroActual(
  sorted: KilometrajeRegistro[],
  mantFecha: string | null,
): { km: number | null; fecha: string | null } {
  let latestWeekly: KilometrajeRegistro | null = null;
  for (const r of sorted) {
    if (esRegistroMantenimiento(r)) continue;
    if (r.kilometraje == null || !Number.isFinite(r.kilometraje)) continue;
    latestWeekly = r;
    break;
  }

  if (mantFecha && latestWeekly) {
    const weeklyDate = latestWeekly.fecha.slice(0, 10);
    if (weeklyDate >= mantFecha) {
      return { km: latestWeekly.kilometraje, fecha: weeklyDate };
    }
  }

  for (const r of sorted) {
    if (r.kilometraje == null || !Number.isFinite(r.kilometraje)) continue;
    return { km: r.kilometraje, fecha: r.fecha.slice(0, 10) };
  }

  if (!mantFecha && latestWeekly) {
    return { km: latestWeekly.kilometraje, fecha: latestWeekly.fecha.slice(0, 10) };
  }

  return { km: null, fecha: null };
}

/** Días calendario desde último mant. hasta fecha de referencia (último km o hoy). */
export function computeDiasDesdeUltimoMantenimiento(
  mantFecha: string | null,
  regFecha: string | null,
): number | null {
  if (!mantFecha) return null;
  const ref = regFecha ?? todayStr();
  if (ref.slice(0, 10) < mantFecha.slice(0, 10)) return 0;
  return diffCalendarDays(mantFecha, ref);
}

function resolveStatus(
  mantKm: number | null,
  regKm: number | null,
  diffKm: number | null,
): Pick<KmDesdeUltimoMantenimientoResult, 'status' | 'warningMessage' | 'alertaVariacion'> {
  if (mantKm == null) {
    return {
      status: 'sin_mantenimiento',
      warningMessage: 'Sin mantenimiento registrado',
      alertaVariacion: false,
    };
  }
  if (regKm == null) {
    return {
      status: 'sin_registro_actual',
      warningMessage: 'Sin kilometraje actual registrado',
      alertaVariacion: false,
    };
  }
  if (variacionSuperaUmbralAlerta(diffKm)) {
    return {
      status: 'alerta',
      warningMessage: 'Rojo / requiere mantenimiento',
      alertaVariacion: true,
    };
  }
  return { status: 'ok', warningMessage: null, alertaVariacion: false };
}

/** Calcula km/fechas/variación desde registros de un vehículo. */
export function computeKmDesdeUltimoMantenimiento(
  vehicleId: number,
  rows: KilometrajeRegistro[],
): KmDesdeUltimoMantenimientoResult {
  const sorted = sortRowsChrono(rows);
  const mant = findUltimoMantenimiento(sorted);
  const reg = findUltimoRegistroActual(sorted, mant.fecha);
  const diffKm =
    reg.km != null && mant.km != null && Number.isFinite(reg.km) && Number.isFinite(mant.km)
      ? reg.km - mant.km
      : null;
  const { status, warningMessage, alertaVariacion } = resolveStatus(mant.km, reg.km, diffKm);

  const result: KmDesdeUltimoMantenimientoResult = {
    vehicleId,
    ultimoMantenimientoKm: mant.km,
    ultimoMantenimientoFecha: mant.fecha,
    ultimoRegistroKm: reg.km,
    ultimoRegistroFecha: reg.fecha,
    diffKm,
    status,
    warningMessage,
    tipoMant: mant.tipo,
    alertaVariacion,
  };

  logKmMantenimientoDev(result);
  return result;
}

/** API principal: km desde último mantenimiento para un vehículo. */
export function getKmDesdeUltimoMantenimiento(
  vehicleId: number,
  kilometrajes: KilometrajeRegistro[],
): KmDesdeUltimoMantenimientoResult {
  const rows = kilometrajes.filter((r) => Number(r.vehicleId) === Number(vehicleId));
  return computeKmDesdeUltimoMantenimiento(vehicleId, rows);
}

function toKmControlRow(result: KmDesdeUltimoMantenimientoResult): KmControlRow {
  const dias = computeDiasDesdeUltimoMantenimiento(
    result.ultimoMantenimientoFecha,
    result.ultimoRegistroFecha,
  );

  return {
    ...result,
    kmMant: result.ultimoMantenimientoKm,
    kmUlt: result.ultimoRegistroKm,
    fMant: result.ultimoMantenimientoFecha,
    fUlt: result.ultimoRegistroFecha,
    variacion: result.diffKm,
    dias,
  };
}

/**
 * Control KMS por vehículo (tabla / alertas).
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

  return entries.map(([vehicleId, rows]) => toKmControlRow(computeKmDesdeUltimoMantenimiento(vehicleId, rows)));
}

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Resumen mensual de mantenimientos simple/completo por vehículo (o todos). */
export function buildKmMantenimientoMensualSummary(
  kilometrajes: KilometrajeRegistro[],
  vehicleId?: number | null,
): KmMantenimientoMensualRow[] {
  const rows =
    vehicleId != null
      ? kilometrajes.filter((r) => Number(r.vehicleId) === Number(vehicleId))
      : kilometrajes;
  const byMonth = new Map<string, { simple: number; completo: number }>();
  for (const r of rows) {
    const tipo = tipoMantenimientoDesdeRegistro(r);
    if (tipo !== 'Simple' && tipo !== 'Completo') continue;
    const key = r.fecha.slice(0, 7);
    const cur = byMonth.get(key) ?? { simple: 0, completo: 0 };
    if (tipo === 'Simple') cur.simple += 1;
    else cur.completo += 1;
    byMonth.set(key, cur);
  }
  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, counts]) => {
      const y = Number(key.slice(0, 4));
      const m = Number(key.slice(5, 7));
      const label = `${MESES_ES[m - 1] ?? key} ${y}`;
      return {
        key,
        label,
        simple: counts.simple,
        completo: counts.completo,
        total: counts.simple + counts.completo,
      };
    });
}

/** Línea compacta «100,000 km · 12/04/2026». */
export function formatKmFechaLine(km: number | null, fecha: string | null): string {
  if (km == null && !fecha) return '—';
  const kmPart = km != null ? `${km.toLocaleString('es-PE')} km` : '—';
  const fechaPart = fecha ? formatDate(fecha) : '—';
  if (km == null) return fechaPart;
  if (!fecha) return kmPart;
  return `${kmPart} · ${fechaPart}`;
}

export function kmMantenimientoStatusLabel(status: KmMantenimientoStatus): string {
  switch (status) {
    case 'alerta':
      return 'Rojo / requiere mantenimiento';
    case 'sin_mantenimiento':
      return 'Sin mantenimiento registrado';
    case 'sin_registro_actual':
      return 'Sin kilometraje actual registrado';
    default:
      return 'Al día';
  }
}

/** Metadatos del flujo QA/E2E de kilometraje (solo lectura). */
export function auditKmQaFlowMeta(): {
  route: string;
  table: string;
  requiredFields: string[];
  supportsUndo: boolean;
  alertThresholdKm: number;
  cleanupStrategy: string;
} {
  return {
    route: '/operaciones/mantenimiento',
    table: 'kilometrajes',
    requiredFields: [
      'vehicle_id (vehículo activo)',
      'fecha',
      'kilometraje (odómetro) o km_mantenimiento (al menos uno)',
      'descripcion (notas; usar prefijo [QA_AUTO])',
    ],
    supportsUndo: true,
    alertThresholdKm: KM_ALERTA_VARIACION_DESDE_MANT,
    cleanupStrategy:
      'DELETE API en kilometrajes con descripcion [QA_AUTO]; luego DELETE vehículos con placa QA*',
  };
}

/** Detalle para alertas operativas (incluye fechas). */
export function kmMantenimientoAlertDetail(r: KmDesdeUltimoMantenimientoResult): string {
  if (r.status === 'sin_mantenimiento') return r.warningMessage ?? 'Sin mantenimiento registrado';
  if (r.status === 'sin_registro_actual') return r.warningMessage ?? 'Sin kilometraje actual registrado';
  const diff = r.diffKm != null ? `+${r.diffKm.toLocaleString('es-PE')} km` : '—';
  const mant = formatKmFechaLine(r.ultimoMantenimientoKm, r.ultimoMantenimientoFecha);
  const act = formatKmFechaLine(r.ultimoRegistroKm, r.ultimoRegistroFecha);
  return `Variación ${diff} desde mant. (${mant}) · último registro ${act} (≥${KM_ALERTA_VARIACION_DESDE_MANT.toLocaleString('es-PE')} km)`;
}
