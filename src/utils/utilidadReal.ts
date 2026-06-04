/**
 * Utilidad real por vehículo: Σ ingresos (vehicle_id, PEN) − Σ gastos permitidos (vehicle_id).
 * Fuente: public.ingresos + public.gastos. No usa caja_negocio_vehiculo.
 */
import type { Gasto, Ingreso, Vehicle } from '../data/types';
import { isCajaNegocioGasto } from './cajaNegocio';
import { toDateOnlyString } from './formatting';
import { tipoGastoEffective } from './gastosTipoGasto';
import { ingresoMontoPEN } from './moneda';
import { mesLabelFromKey, monthKeyFromFecha } from './utilidadOperativa';

export const UTILIDAD_REAL_TOOLTIP =
  'Utilidad real = ingresos registrados del vehículo − gastos operativos del vehículo (excl. inversión, globales y no operativos).';

const TIPOS_EXCLUIDOS_UTILIDAD = new Set([
  'inversion_compra',
  'gastos_globales',
  'financiero_prestamo',
  'financiero',
  'personal_socios_familiares',
  'personal_socios',
  'personales',
  'representacion_interna',
  'pendiente_revision',
  'compra_activo',
]);

const SUBTIPOS_EXCLUIDOS_UTILIDAD = new Set([
  'compra_activo',
  'inversion_general',
  'gasto_global',
  'financiero_global',
]);

function normalizeSubtipoKey(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, '_');
}

/** Gasto con vehicle_id que entra en utilidad real (excluye CAPEX, globales y no operativos). */
export function gastoIncluidoEnUtilidadReal(g: Gasto): boolean {
  if (g.vehicleId == null || g.vehicleId === '') return false;
  if (isCajaNegocioGasto(g)) return false;
  const tipo = tipoGastoEffective(g);
  if (!tipo) return false;
  const tipoNk = tipo.toLowerCase();
  if (TIPOS_EXCLUIDOS_UTILIDAD.has(tipoNk) || tipoNk.includes('compra_activo')) return false;
  const subNk = normalizeSubtipoKey(g.subtipo_gasto);
  if (SUBTIPOS_EXCLUIDOS_UTILIDAD.has(subNk) || subNk.includes('compra_activo')) return false;
  return true;
}

function vehicleIdMatches(
  recordId: number | string | null | undefined,
  vehicleId: number,
): boolean {
  if (recordId == null || recordId === '') return false;
  return String(recordId) === String(vehicleId);
}

export function sumIngresosVehiculoTotal(ingresos: readonly Ingreso[], vehicleId: number): number {
  let s = 0;
  for (const i of ingresos) {
    if (!vehicleIdMatches(i.vehicleId, vehicleId)) continue;
    s += ingresoMontoPEN(i);
  }
  return s;
}

/** Gastos del vehículo incluidos en utilidad real. */
export function sumGastosVehiculoTodos(gastos: readonly Gasto[], vehicleId: number): number {
  let s = 0;
  for (const g of gastos) {
    if (!vehicleIdMatches(g.vehicleId, vehicleId)) continue;
    if (!gastoIncluidoEnUtilidadReal(g)) continue;
    s += g.monto;
  }
  return s;
}

export function calcularUtilidadRealVehiculo(
  vehicleId: number,
  ingresos: readonly Ingreso[],
  gastos: readonly Gasto[],
): { ingresosTotal: number; gastosTotal: number; utilidadReal: number } {
  const ingresosTotal = sumIngresosVehiculoTotal(ingresos, vehicleId);
  const gastosTotal = sumGastosVehiculoTodos(gastos, vehicleId);
  return { ingresosTotal, gastosTotal, utilidadReal: ingresosTotal - gastosTotal };
}

export interface UtilidadRealVehiculo {
  vehicleId: number;
  ingresosTotal: number;
  gastosTotal: number;
  utilidadReal: number;
}

export function buildUtilidadRealPorVehiculo(
  vehicles: readonly Vehicle[],
  ingresos: readonly Ingreso[],
  gastos: readonly Gasto[],
): UtilidadRealVehiculo[] {
  return vehicles
    .filter((v) => v.activo !== false)
    .map((v) => {
      const { ingresosTotal, gastosTotal, utilidadReal } = calcularUtilidadRealVehiculo(
        v.id,
        ingresos,
        gastos,
      );
      return { vehicleId: v.id, ingresosTotal, gastosTotal, utilidadReal };
    })
    .sort((a, b) => b.utilidadReal - a.utilidadReal);
}

export function sumUtilidadRealFlota(
  ingresos: readonly Ingreso[],
  gastos: readonly Gasto[],
  vehicles: readonly Vehicle[],
): number {
  return vehicles
    .filter((v) => v.activo !== false)
    .reduce((s, v) => s + calcularUtilidadRealVehiculo(v.id, ingresos, gastos).utilidadReal, 0);
}

export interface UtilidadRealMes {
  mes: string;
  mesLabel: string;
  ingresos: number;
  gastos: number;
  utilidadReal: number;
}

function inDateRange(fecha: string, desde: string | null, hasta: string | null): boolean {
  const d = toDateOnlyString(fecha);
  if (!d) return false;
  if (desde && d < desde) return false;
  if (hasta && d > hasta) return false;
  return true;
}

export function buildUtilidadRealMensualFlota(
  ingresos: readonly Ingreso[],
  gastos: readonly Gasto[],
  vehicleId?: number,
): UtilidadRealMes[] {
  const monthKeys = new Set<string>();
  for (const i of ingresos) {
    if (vehicleId != null && !vehicleIdMatches(i.vehicleId, vehicleId)) continue;
    const k = monthKeyFromFecha(i.fecha);
    if (k) monthKeys.add(k);
  }
  for (const g of gastos) {
    if (vehicleId != null && !vehicleIdMatches(g.vehicleId, vehicleId)) continue;
    const k = monthKeyFromFecha(g.fecha);
    if (k) monthKeys.add(k);
  }
  return [...monthKeys].sort().map((mes) => {
    let ing = 0;
    let gas = 0;
    for (const i of ingresos) {
      if (vehicleId != null && !vehicleIdMatches(i.vehicleId, vehicleId)) continue;
      if (monthKeyFromFecha(i.fecha) !== mes) continue;
      ing += ingresoMontoPEN(i);
    }
    for (const g of gastos) {
      if (vehicleId != null && !vehicleIdMatches(g.vehicleId, vehicleId)) continue;
      if (monthKeyFromFecha(g.fecha) !== mes) continue;
      if (!gastoIncluidoEnUtilidadReal(g)) continue;
      gas += g.monto;
    }
    return { mes, mesLabel: mesLabelFromKey(mes), ingresos: ing, gastos: gas, utilidadReal: ing - gas };
  });
}

export function calcularUtilidadRealEnRango(
  ingresos: readonly Ingreso[],
  gastos: readonly Gasto[],
  desde: string | null,
  hasta: string | null,
  vehicleId?: number,
): { ingresos: number; gastos: number; utilidadReal: number } {
  let ing = 0;
  let gas = 0;
  for (const i of ingresos) {
    if (vehicleId != null && !vehicleIdMatches(i.vehicleId, vehicleId)) continue;
    if (!inDateRange(i.fecha, desde, hasta)) continue;
    ing += ingresoMontoPEN(i);
  }
  for (const g of gastos) {
    if (vehicleId != null && !vehicleIdMatches(g.vehicleId, vehicleId)) continue;
    if (!inDateRange(g.fecha, desde, hasta)) continue;
    if (!gastoIncluidoEnUtilidadReal(g)) continue;
    gas += g.monto;
  }
  return { ingresos: ing, gastos: gas, utilidadReal: ing - gas };
}

export interface TopVehiculoUtilidadRow {
  vehicleId: number;
  placa: string;
  ingresos: number;
  gastos: number;
  utilidad: number;
}

export function buildTopVehiculosUtilidad(
  vehicles: readonly Vehicle[],
  ingresos: readonly Ingreso[],
  gastos: readonly Gasto[],
  opts?: { desde?: string | null; hasta?: string | null; limit?: number },
): TopVehiculoUtilidadRow[] {
  const limit = opts?.limit ?? 10;
  const desde = opts?.desde ?? null;
  const hasta = opts?.hasta ?? null;
  const filtrarFecha = Boolean(desde || hasta);

  return vehicles
    .filter((v) => v.activo !== false)
    .map((v) => {
      let ing = 0;
      let gas = 0;
      for (const i of ingresos) {
        if (!vehicleIdMatches(i.vehicleId, v.id)) continue;
        if (filtrarFecha && !inDateRange(i.fecha, desde, hasta)) continue;
        ing += ingresoMontoPEN(i);
      }
      for (const g of gastos) {
        if (!vehicleIdMatches(g.vehicleId, v.id)) continue;
        if (!gastoIncluidoEnUtilidadReal(g)) continue;
        if (filtrarFecha && !inDateRange(g.fecha, desde, hasta)) continue;
        gas += g.monto;
      }
      return {
        vehicleId: v.id,
        placa: (v.placa ?? v.modelo ?? `Unidad ${v.id}`).trim(),
        ingresos: ing,
        gastos: gas,
        utilidad: ing - gas,
      };
    })
    .sort((a, b) => b.utilidad - a.utilidad)
    .slice(0, limit);
}
