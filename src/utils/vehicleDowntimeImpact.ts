/**
 * Impacto económico virtual de indisponibilidad (no persiste en BD).
 */
import type { CajaNegocioVehiculo, Ingreso, Vehicle, VehicleDowntime } from '../data/types';
import { toDateOnlyString, todayStr } from './formatting';
import { ingresoMontoPEN } from './moneda';

export const VEHICLE_DOWNTIME_MOTIVO_LABELS: Record<VehicleDowntime['motivo'], string> = {
  taller: 'Taller',
  multa: 'Multa',
  mantenimiento: 'Mantenimiento',
  accidente: 'Accidente',
  sin_conductor: 'Sin conductor',
  administrativo: 'Administrativo',
  otro: 'Otro',
};

const MS_DAY = 86400000;
const VENTANA_PROMEDIO_DIAS = 90;

export function diasCalendarioInclusivos(inicio: string, fin: string): number {
  const a = new Date(toDateOnlyString(inicio) + 'T00:00:00').getTime();
  const b = new Date(toDateOnlyString(fin) + 'T00:00:00').getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / MS_DAY) + 1;
}

export function diasFueraRegistro(row: VehicleDowntime, refDate = todayStr()): number {
  const fin = row.estado === 'activo' && !row.fechaFin ? refDate : row.fechaFin ?? refDate;
  return diasCalendarioInclusivos(row.fechaInicio, fin);
}

function sumIngresosVehiculoEnRango(
  ingresos: readonly Ingreso[],
  vehicleId: number,
  desde: string,
  hasta: string,
): number {
  let s = 0;
  for (const i of ingresos) {
    if (Number(i.vehicleId) !== vehicleId) continue;
    const d = toDateOnlyString(i.fecha);
    if (!d || d < desde || d > hasta) continue;
    s += ingresoMontoPEN(i);
  }
  return s;
}

function spanDiasHistorico(ingresos: readonly Ingreso[], vehicleId: number): number {
  let min = '';
  let max = '';
  for (const i of ingresos) {
    if (Number(i.vehicleId) !== vehicleId) continue;
    const d = toDateOnlyString(i.fecha);
    if (!d) continue;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }
  if (!min || !max) return 0;
  return diasCalendarioInclusivos(min, max);
}

/** Promedio diario: últimos 90 d hasta refDate; si no hay, histórico completo del vehículo. */
export function ingresoPromedioDiarioVehiculo(
  ingresos: readonly Ingreso[],
  vehicleId: number,
  refDate = todayStr(),
  cajaNegocio?: readonly CajaNegocioVehiculo[],
): number {
  const ref = toDateOnlyString(refDate);
  const desde90 = new Date(new Date(ref + 'T00:00:00').getTime() - (VENTANA_PROMEDIO_DIAS - 1) * MS_DAY);
  const desdeStr = desde90.toISOString().slice(0, 10);
  const sum90 = sumIngresosVehiculoEnRango(ingresos, vehicleId, desdeStr, ref);
  if (sum90 > 0) return sum90 / VENTANA_PROMEDIO_DIAS;

  const span = spanDiasHistorico(ingresos, vehicleId);
  if (span > 0) {
    let total = 0;
    for (const i of ingresos) {
      if (Number(i.vehicleId) !== vehicleId) continue;
      total += ingresoMontoPEN(i);
    }
    if (total > 0) return total / span;
  }

  if (cajaNegocio?.length) {
    const rows = cajaNegocio.filter((c) => c.vehicleId === vehicleId);
    if (rows.length > 0) {
      let min = '';
      let max = '';
      let total = 0;
      for (const c of rows) {
        const d = toDateOnlyString(c.fecha);
        if (!d) continue;
        if (!min || d < min) min = d;
        if (!max || d > max) max = d;
        total += c.monto;
      }
      const span = min && max ? diasCalendarioInclusivos(min, max) : 0;
      if (span > 0 && total > 0) return total / span;
    }
  }

  return 0;
}

export type DowntimeImpacto = {
  diasFuera: number;
  ingresoPromedioDiario: number;
  perdidaOportunidad: number;
};

export function calcularImpactoIndisponibilidad(
  row: VehicleDowntime,
  ingresos: readonly Ingreso[],
  cajaNegocio?: readonly CajaNegocioVehiculo[],
  refDate = todayStr(),
): DowntimeImpacto {
  const dias = diasFueraRegistro(row, refDate);
  const ingresoPromedioDiario = ingresoPromedioDiarioVehiculo(
    ingresos,
    row.vehicleId,
    refDate,
    cajaNegocio,
  );
  return {
    diasFuera: dias,
    ingresoPromedioDiario,
    perdidaOportunidad: dias * ingresoPromedioDiario,
  };
}

export type DowntimeFilaDashboard = {
  downtime: VehicleDowntime;
  vehicleId: number;
  placa: string;
  motivoLabel: string;
  diasFuera: number;
  ingresoPromedioDiario: number;
  perdidaOportunidad: number;
};

export function buildDowntimeFilasDashboard(
  records: readonly VehicleDowntime[],
  vehicles: readonly Vehicle[],
  ingresos: readonly Ingreso[],
  cajaNegocio?: readonly CajaNegocioVehiculo[],
): DowntimeFilaDashboard[] {
  const vMap = new Map(vehicles.map((v) => [v.id, v]));
  return records
    .map((d) => {
      const v = vMap.get(d.vehicleId);
      const impacto = calcularImpactoIndisponibilidad(d, ingresos, cajaNegocio);
      return {
        downtime: d,
        vehicleId: d.vehicleId,
        placa: v?.placa ?? `Unidad ${d.vehicleId}`,
        motivoLabel: VEHICLE_DOWNTIME_MOTIVO_LABELS[d.motivo] ?? d.motivo,
        ...impacto,
      };
    })
    .sort((a, b) => b.perdidaOportunidad - a.perdidaOportunidad);
}

export type DowntimeDashboardKpis = {
  disponibilidadPct: number | null;
  diasFueraServicio: number;
  ingresoDiarioPromedio: number;
  ingresoPotencialPerdido: number;
};

export function buildDowntimeDashboardKpis(
  filas: readonly DowntimeFilaDashboard[],
  vehicles: readonly Vehicle[],
  refDate = todayStr(),
): DowntimeDashboardKpis {
  const activos = vehicles.filter((v) => v.activo !== false);
  const n = activos.length;
  const activas = filas.filter((f) => f.downtime.estado === 'activo');
  const diasFueraServicio = activas.reduce((s, f) => s + f.diasFuera, 0);
  const ingresoPotencialPerdido = filas.reduce((s, f) => s + f.perdidaOportunidad, 0);
  const ingresoDiarioPromedio =
    activas.length > 0
      ? activas.reduce((s, f) => s + f.ingresoPromedioDiario, 0) / activas.length
      : 0;

  let disponibilidadPct: number | null = null;
  if (n > 0) {
    const ref = toDateOnlyString(refDate);
    const diasPeriodo = 30;
    const capacidad = n * diasPeriodo;
    const perdidaDias = Math.min(capacidad, diasFueraServicio);
    disponibilidadPct = Math.max(0, Math.min(100, ((capacidad - perdidaDias) / capacidad) * 100));
  }

  return {
    disponibilidadPct,
    diasFueraServicio,
    ingresoDiarioPromedio,
    ingresoPotencialPerdido,
  };
}

export function alertasIndisponibilidad(filas: readonly DowntimeFilaDashboard[]): {
  mas3Dias: DowntimeFilaDashboard[];
  mas7Dias: DowntimeFilaDashboard[];
  topPerdida: DowntimeFilaDashboard[];
} {
  const activas = filas.filter((f) => f.downtime.estado === 'activo');
  return {
    mas3Dias: activas.filter((f) => f.diasFuera > 3),
    mas7Dias: activas.filter((f) => f.diasFuera > 7),
    topPerdida: [...filas].sort((a, b) => b.perdidaOportunidad - a.perdidaOportunidad).slice(0, 5),
  };
}
