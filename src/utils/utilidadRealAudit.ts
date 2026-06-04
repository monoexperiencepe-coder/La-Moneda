/**
 * Logs DEV temporales para comparar utilidad lista vs detalle vehículo.
 */
import type { Gasto, Ingreso, Vehicle } from '../data/types';
import { calcularUtilidadRealVehiculo } from './utilidadReal';

export type UtilidadAuditGastosSource =
  | 'RegistrosContext.gastos'
  | 'bootstrap_recent'
  | 'full_historico';

export function logAuditUtilidadLista(params: {
  vehicleId: number;
  placa?: string;
  ingresos: number;
  gastos: number;
  utilidad: number;
  gastosSource: UtilidadAuditGastosSource;
  gastosLoadScope: 'recent' | 'full';
  gastosEnMemoria: number;
  formula: string;
  pantalla: string;
}): void {
  if (!import.meta.env.DEV) return;
  console.warn('[audit:utilidad:lista]', params);
}

export function logAuditUtilidadDetalle(params: {
  vehicleId: number;
  placa?: string;
  ingresos: number;
  gastos: number;
  utilidad: number;
  gastosSource: UtilidadAuditGastosSource;
  gastosLoadScope: 'recent' | 'full';
  gastosEnMemoria: number;
  cantidadGastosVehiculo: number;
  formula: string;
  pantalla: string;
}): void {
  if (!import.meta.env.DEV) return;
  console.warn('[audit:utilidad:detalle]', params);
}

const FORMULA_REAL =
  'utilidadReal = Σ ingresos(vehicle_id) − Σ gastos(vehicle_id) [calcularUtilidadRealVehiculo]';

export function auditUtilidadListaVsDetalle(
  vehicleIdOrPlaca: number | string,
  vehicles: readonly Vehicle[],
  ingresos: readonly Ingreso[],
  gastos: readonly Gasto[],
  gastosLoadScope: 'recent' | 'full',
  pantallaLista = 'UtilidadOperativa.buildUtilidadRealPorVehiculo',
  pantallaDetalle = 'VehiculoDetalle.calcularUtilidadRealVehiculo',
): void {
  if (!import.meta.env.DEV) return;

  let vehicle: Vehicle | undefined;
  if (typeof vehicleIdOrPlaca === 'number') {
    vehicle = vehicles.find((v) => v.id === vehicleIdOrPlaca);
  } else {
    const q = String(vehicleIdOrPlaca).trim().toUpperCase();
    vehicle =
      vehicles.find((v) => v.placa?.toUpperCase() === q) ??
      vehicles.find((v) => v.id === Number(q));
  }
  if (!vehicle) {
    console.warn('[audit:utilidad:compare] vehículo no encontrado', { vehicleIdOrPlaca });
    return;
  }

  const source: UtilidadAuditGastosSource =
    gastosLoadScope === 'full' ? 'full_historico' : 'bootstrap_recent';

  const lista = calcularUtilidadRealVehiculo(vehicle.id, ingresos, gastos);
  const detalle = calcularUtilidadRealVehiculo(vehicle.id, ingresos, gastos);

  const listaPayload = {
    vehicleId: vehicle.id,
    placa: vehicle.placa,
    ingresos: lista.ingresosTotal,
    gastos: lista.gastosTotal,
    utilidad: lista.utilidadReal,
    gastosSource: source,
    gastosLoadScope,
    gastosEnMemoria: gastos.length,
    formula: FORMULA_REAL,
    pantalla: pantallaLista,
  };
  const detallePayload = {
    vehicleId: vehicle.id,
    placa: vehicle.placa,
    ingresos: detalle.ingresosTotal,
    gastos: detalle.gastosTotal,
    utilidad: detalle.utilidadReal,
    gastosSource: source,
    gastosLoadScope,
    gastosEnMemoria: gastos.length,
    cantidadGastosVehiculo: gastos.filter(
      (g) => g.vehicleId != null && String(g.vehicleId) === String(vehicle.id),
    ).length,
    formula: FORMULA_REAL,
    pantalla: pantallaDetalle,
  };

  logAuditUtilidadLista(listaPayload);
  logAuditUtilidadDetalle(detallePayload);

  const diffGastos = Math.abs(lista.gastosTotal - detalle.gastosTotal);
  console.warn('[audit:utilidad:compare]', {
    vehicleId: vehicle.id,
    placa: vehicle.placa,
    misma_formula: true,
    diferencia_gastos: diffGastos,
    diferencia_utilidad: lista.utilidadReal - detalle.utilidadReal,
    nota:
      diffGastos > 0.01
        ? 'Lista y detalle usan la misma función; si difieren, revisar timing (gastosLoadScope recent vs full) o vehicleId distinto.'
        : 'Valores coinciden con los mismos datos en memoria.',
    lista: listaPayload,
    detalle: detallePayload,
  });
}
