import type { Gasto, Ingreso, Vehicle } from '../data/types';
import { toDateOnlyString } from './formatting';
import { gastosOperativosSolamente } from './cajaNegocio';
import type { FinancialKPIData } from './calculations';
import { calculateFinancialKPIs } from './calculations';

export function fechaEnPeriodo(fecha: string, desde: string, hasta: string): boolean {
  const d = toDateOnlyString(fecha);
  return d !== '' && d >= desde && d <= hasta;
}

function vehicleIdMatch(rowVid: number | null | undefined, vehId: number): boolean {
  if (rowVid == null) return false;
  return Number(rowVid) === Number(vehId);
}

/** KPIs inteligentes filtrados por fechas de movimiento (ingresos / gastos). */
export function calculateFinancialKPIsInPeriod(
  ingresos: Ingreso[],
  gastos: Gasto[],
  desde: string,
  hasta: string,
): FinancialKPIData {
  const i = ingresos.filter((x) => fechaEnPeriodo(x.fecha, desde, hasta));
  const g = gastos.filter((x) => fechaEnPeriodo(x.fecha, desde, hasta));
  return calculateFinancialKPIs(i, g);
}

/** Total legacy: gastos operativos (excluye caja negocio por texto) en el periodo. */
export function legacyTotalGastosOperativosEnPeriodo(
  gastos: Gasto[],
  desde: string,
  hasta: string,
): number {
  return gastosOperativosSolamente(gastos)
    .filter((g) => fechaEnPeriodo(g.fecha, desde, hasta))
    .reduce((s, g) => s + g.monto, 0);
}

export interface VehicleFinancialIntelRollup {
  vehicle: Vehicle;
  kpi: FinancialKPIData;
  totalIngresos: number;
  gastoMotor: number;
}

export function rollupInteligentePorVehiculo(
  vehicle: Vehicle,
  ingresos: Ingreso[],
  gastos: Gasto[],
  desde: string,
  hasta: string,
): VehicleFinancialIntelRollup {
  const i = ingresos.filter(
    (x) => vehicleIdMatch(x.vehicleId, vehicle.id) && fechaEnPeriodo(x.fecha, desde, hasta),
  );
  const g = gastos.filter(
    (x) => vehicleIdMatch(x.vehicleId, vehicle.id) && fechaEnPeriodo(x.fecha, desde, hasta),
  );
  return rollupInteligenteFromFiltered(vehicle, i, g);
}

/** Ingresos y gastos ya filtrados a la unidad (sin filtro de fechas). */
export function rollupInteligentePorVehiculoTodoPeriodo(
  vehicle: Vehicle,
  ingresos: Ingreso[],
  gastos: Gasto[],
): VehicleFinancialIntelRollup {
  const i = ingresos.filter((x) => vehicleIdMatch(x.vehicleId, vehicle.id));
  const g = gastos.filter((x) => vehicleIdMatch(x.vehicleId, vehicle.id));
  return rollupInteligenteFromFiltered(vehicle, i, g);
}

function rollupInteligenteFromFiltered(
  vehicle: Vehicle,
  ingresosFiltrados: Ingreso[],
  gastosFiltrados: Gasto[],
): VehicleFinancialIntelRollup {
  const kpi = calculateFinancialKPIs(ingresosFiltrados, gastosFiltrados);
  const totalIngresos = kpi.utilidad_operativa + kpi.gastos_operativos;
  const gastoMotor = gastosFiltrados
    .filter((x) => x.subtipo_gasto === 'motor')
    .reduce((s, x) => s + x.monto, 0);
  return { vehicle, kpi, totalIngresos, gastoMotor };
}

export function rollupsInteligenteFlota(
  vehicles: Vehicle[],
  ingresos: Ingreso[],
  gastos: Gasto[],
  desde: string,
  hasta: string,
): VehicleFinancialIntelRollup[] {
  return vehicles.map((v) => rollupInteligentePorVehiculo(v, ingresos, gastos, desde, hasta));
}

export function vehiculosMasRentables(
  rollups: VehicleFinancialIntelRollup[],
  limit = 5,
): VehicleFinancialIntelRollup[] {
  return [...rollups]
    .sort((a, b) => b.kpi.utilidad_operativa - a.kpi.utilidad_operativa)
    .slice(0, limit);
}

export function vehiculosMayorGastoMotor(
  rollups: VehicleFinancialIntelRollup[],
  limit = 5,
): VehicleFinancialIntelRollup[] {
  return [...rollups].sort((a, b) => b.gastoMotor - a.gastoMotor).slice(0, limit);
}

export function vehiculosMayorGastoFinanciero(
  rollups: VehicleFinancialIntelRollup[],
  limit = 5,
): VehicleFinancialIntelRollup[] {
  return [...rollups]
    .sort((a, b) => b.kpi.gastos_financieros - a.kpi.gastos_financieros)
    .slice(0, limit);
}

export type FinancialFleetAlertSeverity = 'warning' | 'danger';

export interface FinancialFleetAlert {
  id: string;
  severity: FinancialFleetAlertSeverity;
  message: string;
  vehicleId: number;
  placa: string;
}

/** Umbrales heurísticos solo frontend (sin IA). */
const PCT_MOTOR = 0.12;
const PCT_FIN = 0.15;
const PCT_ADMIN = 0.1;
const ABS_MOTOR = 2800;
const ABS_FIN = 2000;
const ABS_ADMIN = 1500;

function excesoMotor(totalIngresos: number, gastoMotor: number): boolean {
  if (gastoMotor <= 0) return false;
  if (totalIngresos > 0) return gastoMotor / totalIngresos > PCT_MOTOR;
  return gastoMotor >= ABS_MOTOR;
}

function excesoFin(totalIngresos: number, monto: number): boolean {
  if (monto <= 0) return false;
  if (totalIngresos > 0) return monto / totalIngresos > PCT_FIN;
  return monto >= ABS_FIN;
}

function excesoAdmin(totalIngresos: number, monto: number): boolean {
  if (monto <= 0) return false;
  if (totalIngresos > 0) return monto / totalIngresos > PCT_ADMIN;
  return monto >= ABS_ADMIN;
}

export function computeFinancialFleetAlerts(rollups: VehicleFinancialIntelRollup[]): FinancialFleetAlert[] {
  const out: FinancialFleetAlert[] = [];
  for (const r of rollups) {
    const { vehicle, kpi, totalIngresos, gastoMotor } = r;
    const sinActividad =
      totalIngresos === 0 &&
      kpi.gastos_operativos === 0 &&
      kpi.gastos_financieros === 0 &&
      kpi.gastos_administrativos === 0 &&
      gastoMotor === 0;
    if (sinActividad) continue;
    const placa = vehicle.placa || `#${vehicle.id}`;
    if (kpi.utilidad_operativa < 0) {
      out.push({
        id: `neg-${vehicle.id}`,
        severity: 'danger',
        message: `Utilidad operativa negativa (${placa})`,
        vehicleId: vehicle.id,
        placa,
      });
    }
    if (excesoMotor(totalIngresos, gastoMotor)) {
      out.push({
        id: `motor-${vehicle.id}`,
        severity: 'warning',
        message: `Posible exceso gasto motor (${placa})`,
        vehicleId: vehicle.id,
        placa,
      });
    }
    if (excesoFin(totalIngresos, kpi.gastos_financieros)) {
      out.push({
        id: `fin-${vehicle.id}`,
        severity: 'warning',
        message: `Gasto financiero elevado vs ingresos (${placa})`,
        vehicleId: vehicle.id,
        placa,
      });
    }
    if (excesoAdmin(totalIngresos, kpi.gastos_administrativos)) {
      out.push({
        id: `adm-${vehicle.id}`,
        severity: 'warning',
        message: `Gasto administrativo elevado vs ingresos (${placa})`,
        vehicleId: vehicle.id,
        placa,
      });
    }
  }
  return out;
}
