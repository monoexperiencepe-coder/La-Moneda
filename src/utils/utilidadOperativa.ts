/**
 * Utilidad operativa por vehículo/mes: histórica importada (caja_negocio_vehiculo)
 * + calculada desde ingresos/gastos operativos posteriores al corte.
 *
 * NO confundir con resultado neto global (ingresos totales − gastos totales).
 *
 * Modo cálculo automático desactivado temporalmente hasta definir corte operativo.
 * UI y KPIs usan solo utilidad histórica mientras UTILIDAD_CALCULO_AUTOMATICO_ACTIVO === false.
 */

import type { CajaNegocioVehiculo, Gasto, Ingreso, Vehicle } from '../data/types';
import { isCajaNegocioGasto } from './cajaNegocio';
import { toDateOnlyString } from './formatting';
import { ingresoMontoPEN } from './moneda';
import { tipoGastoEffective } from './gastosTipoGasto';
import {
  TIPO_GASTO_OPERATIVO_FLOTA_GENERAL,
  TIPO_GASTO_OPERATIVO_VEHICULO,
} from './operativoTipoGasto';

export const UTILIDAD_CALCULO_AUTOMATICO_ACTIVO = false;

export const UTILIDAD_HISTORICA_TOOLTIP =
  'Dato histórico importado desde Excel. La utilidad calculada automática se activará en una fase posterior.';

export const UTILIDAD_HISTORICA_PENDIENTE_NOTA =
  'Cálculo automático pendiente de activación cuando la data operativa esté ordenada y se defina el mes de inicio.';

export interface UtilidadHistoricaMes {
  mes: string;
  mesLabel: string;
  monto: number;
}

export interface UtilidadHistoricaVehiculo {
  vehicleId: number;
  monto: number;
}

/** Suma total importada (caja_negocio_vehiculo). */
export function sumUtilidadHistoricaTotal(cajaNegocio: CajaNegocioVehiculo[]): number {
  return cajaNegocio.reduce((s, r) => s + r.monto, 0);
}

function inHistoricoRange(fecha: string, desde: string | null, hasta: string | null): boolean {
  const d = toDateOnlyString(fecha);
  if (!d) return false;
  if (desde && d < desde) return false;
  if (hasta && d > hasta) return false;
  return true;
}

export function sumUtilidadHistoricaEnRango(
  cajaNegocio: CajaNegocioVehiculo[],
  desde: string | null,
  hasta: string | null,
): number {
  return cajaNegocio
    .filter((r) => inHistoricoRange(r.fecha, desde, hasta))
    .reduce((s, r) => s + r.monto, 0);
}

export function buildUtilidadHistoricaMensual(cajaNegocio: CajaNegocioVehiculo[]): UtilidadHistoricaMes[] {
  const map = new Map<string, number>();
  for (const row of cajaNegocio) {
    const k = monthKeyFromFecha(row.fecha);
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + row.monto);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, monto]) => ({ mes, mesLabel: mesLabelFromKey(mes), monto }));
}

export function buildUtilidadHistoricaPorVehiculo(
  cajaNegocio: CajaNegocioVehiculo[],
): UtilidadHistoricaVehiculo[] {
  const map = new Map<number, number>();
  for (const row of cajaNegocio) {
    map.set(row.vehicleId, (map.get(row.vehicleId) ?? 0) + row.monto);
  }
  return [...map.entries()]
    .map(([vehicleId, monto]) => ({ vehicleId, monto }))
    .sort((a, b) => b.monto - a.monto);
}

export function sumUtilidadHistoricaVehiculoEnRango(
  vehicleId: number,
  cajaNegocio: CajaNegocioVehiculo[],
  desde: string | null,
  hasta: string | null,
): number {
  return cajaNegocio
    .filter((r) => r.vehicleId === vehicleId && inHistoricoRange(r.fecha, desde, hasta))
    .reduce((s, r) => s + r.monto, 0);
}

export type UtilidadMesFuente = 'historica' | 'calculada';

export interface UtilidadCorteHistorico {
  /** YYYY-MM del último mes con utilidad importada */
  ultimoMesHistorico: string | null;
  /** YYYY-MM del primer mes calculado desde registros */
  primerMesCalculado: string | null;
  ultimaFechaRegistro: string | null;
  totalRegistrosHistoricos: number;
}

export interface UtilidadOperativaMes {
  mes: string;
  mesLabel: string;
  fuente: UtilidadMesFuente;
  utilidadHistorica: number;
  utilidadCalculada: number;
  utilidadTotal: number;
  ingresosCalculados: number;
  gastosOperativosCalculados: number;
}

export interface UtilidadOperativaVehiculo {
  vehicleId: number;
  utilidadHistorica: number;
  utilidadCalculada: number;
  utilidadAcumulada: number;
  ingresosCalculados: number;
  gastosOperativosCalculados: number;
}

export interface UtilidadAcumuladaResumen {
  corte: UtilidadCorteHistorico;
  utilidadHistoricaTotal: number;
  utilidadCalculadaTotal: number;
  utilidadAcumuladaTotal: number;
  porMes: UtilidadOperativaMes[];
  porVehiculo: UtilidadOperativaVehiculo[];
}

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function monthKeyFromFecha(fecha: string): string {
  const d = toDateOnlyString(fecha);
  return d.length >= 7 ? d.slice(0, 7) : '';
}

export function nextMonthKey(ym: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  if (mo === 12) return `${y + 1}-01`;
  return `${y}-${String(mo + 1).padStart(2, '0')}`;
}

export function mesLabelFromKey(ym: string): string {
  const mo = Number(ym.slice(5, 7));
  const y = ym.slice(0, 4);
  if (!Number.isFinite(mo) || mo < 1 || mo > 12) return ym;
  return `${MESES_CORTOS[mo - 1]} ${y}`;
}

/** Último mes cubierto por utilidad histórica importada (caja_negocio_vehiculo). */
export function getUtilidadCorteHistorico(cajaNegocio: CajaNegocioVehiculo[]): UtilidadCorteHistorico {
  if (cajaNegocio.length === 0) {
    return {
      ultimoMesHistorico: null,
      primerMesCalculado: null,
      ultimaFechaRegistro: null,
      totalRegistrosHistoricos: 0,
    };
  }
  let maxFecha = '';
  for (const row of cajaNegocio) {
    const d = toDateOnlyString(row.fecha);
    if (d > maxFecha) maxFecha = d;
  }
  const ultimoMesHistorico = maxFecha.slice(0, 7);
  return {
    ultimoMesHistorico,
    primerMesCalculado: nextMonthKey(ultimoMesHistorico),
    ultimaFechaRegistro: maxFecha || null,
    totalRegistrosHistoricos: cajaNegocio.length,
  };
}

export function isMesHistoricoImportado(mes: string, corte: UtilidadCorteHistorico): boolean {
  if (!corte.ultimoMesHistorico) return false;
  return mes <= corte.ultimoMesHistorico;
}

export function isMesCalculadoDesdeRegistros(mes: string, corte: UtilidadCorteHistorico): boolean {
  if (!corte.ultimoMesHistorico) return true;
  return mes > corte.ultimoMesHistorico;
}

/** Gasto operativo de unidad para utilidad (excluye globales, admin, etc.). */
export function isGastoOperativoUtilidadVehiculo(g: Gasto): boolean {
  if (isCajaNegocioGasto(g)) return false;
  return tipoGastoEffective(g) === TIPO_GASTO_OPERATIVO_VEHICULO;
}

/** Gasto operativo flota general (no asignado a un vehículo). */
export function isGastoOperativoUtilidadFlota(g: Gasto): boolean {
  if (isCajaNegocioGasto(g)) return false;
  return tipoGastoEffective(g) === TIPO_GASTO_OPERATIVO_FLOTA_GENERAL;
}

function inMonth(fecha: string, mes: string): boolean {
  return monthKeyFromFecha(fecha) === mes;
}

function sumIngresosVehiculoMes(ingresos: Ingreso[], vehicleId: number, mes: string): number {
  let s = 0;
  for (const i of ingresos) {
    if (i.vehicleId !== vehicleId) continue;
    if (!inMonth(i.fecha, mes)) continue;
    s += ingresoMontoPEN(i);
  }
  return s;
}

function sumGastosOperativosVehiculoMes(gastos: Gasto[], vehicleId: number, mes: string): number {
  let s = 0;
  for (const g of gastos) {
    if (g.vehicleId !== vehicleId) continue;
    if (!inMonth(g.fecha, mes)) continue;
    if (!isGastoOperativoUtilidadVehiculo(g)) continue;
    s += g.monto;
  }
  return s;
}

function sumUtilidadHistoricaMes(cajaNegocio: CajaNegocioVehiculo[], mes: string, vehicleId?: number): number {
  let s = 0;
  for (const row of cajaNegocio) {
    if (!inMonth(row.fecha, mes)) continue;
    if (vehicleId != null && row.vehicleId !== vehicleId) continue;
    s += row.monto;
  }
  return s;
}

/** Utilidad operativa calculada de un vehículo en un mes (ingresos − gastos operativos unidad). */
export function calcularUtilidadOperativaVehiculoMes(
  vehicleId: number,
  ingresos: Ingreso[],
  gastos: Gasto[],
  mes: string,
): { utilidad: number; ingresos: number; gastosOperativos: number } {
  const ing = sumIngresosVehiculoMes(ingresos, vehicleId, mes);
  const gas = sumGastosOperativosVehiculoMes(gastos, vehicleId, mes);
  return { utilidad: ing - gas, ingresos: ing, gastosOperativos: gas };
}

/** Utilidad operativa de flota en un mes (todos los vehículos + gasto flota general). */
export function calcularUtilidadOperativaFlotaMes(
  ingresos: Ingreso[],
  gastos: Gasto[],
  mes: string,
  vehicleIds?: number[],
): { utilidad: number; ingresos: number; gastosOperativos: number } {
  const ids =
    vehicleIds ??
    [...new Set([...ingresos.map((i) => i.vehicleId), ...gastos.map((g) => g.vehicleId)].filter((x): x is number => x != null))];

  let ingTotal = 0;
  let gasTotal = 0;
  for (const id of ids) {
    const part = calcularUtilidadOperativaVehiculoMes(id, ingresos, gastos, mes);
    ingTotal += part.ingresos;
    gasTotal += part.gastosOperativos;
  }
  for (const g of gastos) {
    if (!inMonth(g.fecha, mes)) continue;
    if (!isGastoOperativoUtilidadFlota(g)) continue;
    gasTotal += g.monto;
  }
  return { utilidad: ingTotal - gasTotal, ingresos: ingTotal, gastosOperativos: gasTotal };
}

function collectMonthKeys(
  cajaNegocio: CajaNegocioVehiculo[],
  ingresos: Ingreso[],
  gastos: Gasto[],
): string[] {
  const set = new Set<string>();
  for (const row of cajaNegocio) {
    const k = monthKeyFromFecha(row.fecha);
    if (k) set.add(k);
  }
  for (const i of ingresos) {
    const k = monthKeyFromFecha(i.fecha);
    if (k) set.add(k);
  }
  for (const g of gastos) {
    if (!isGastoOperativoUtilidadVehiculo(g) && !isGastoOperativoUtilidadFlota(g)) continue;
    const k = monthKeyFromFecha(g.fecha);
    if (k) set.add(k);
  }
  return [...set].sort();
}

/** Serie mensual: histórico hasta corte + calculado desde mes siguiente. */
export function buildUtilidadOperativaMensual(
  cajaNegocio: CajaNegocioVehiculo[],
  ingresos: Ingreso[],
  gastos: Gasto[],
  corte?: UtilidadCorteHistorico,
): UtilidadOperativaMes[] {
  const c = corte ?? getUtilidadCorteHistorico(cajaNegocio);
  return collectMonthKeys(cajaNegocio, ingresos, gastos).map((mes) => {
    const historica = isMesHistoricoImportado(mes, c) ? sumUtilidadHistoricaMes(cajaNegocio, mes) : 0;
    const calcPart = isMesCalculadoDesdeRegistros(mes, c)
      ? calcularUtilidadOperativaFlotaMes(ingresos, gastos, mes)
      : { utilidad: 0, ingresos: 0, gastosOperativos: 0 };
    const fuente: UtilidadMesFuente = isMesHistoricoImportado(mes, c) ? 'historica' : 'calculada';
    return {
      mes,
      mesLabel: mesLabelFromKey(mes),
      fuente,
      utilidadHistorica: historica,
      utilidadCalculada: calcPart.utilidad,
      utilidadTotal: historica + calcPart.utilidad,
      ingresosCalculados: calcPart.ingresos,
      gastosOperativosCalculados: calcPart.gastosOperativos,
    };
  });
}

/** Utilidad acumulada por vehículo (histórico + calculado post-corte). */
export function buildUtilidadPorVehiculo(
  vehicles: Vehicle[],
  cajaNegocio: CajaNegocioVehiculo[],
  ingresos: Ingreso[],
  gastos: Gasto[],
  corte?: UtilidadCorteHistorico,
): UtilidadOperativaVehiculo[] {
  const c = corte ?? getUtilidadCorteHistorico(cajaNegocio);
  const meses = collectMonthKeys(cajaNegocio, ingresos, gastos);

  return vehicles
    .filter((v) => v.activo)
    .map((v) => {
      let historica = 0;
      let calculada = 0;
      let ingCalc = 0;
      let gasCalc = 0;
      for (const mes of meses) {
        if (isMesHistoricoImportado(mes, c)) {
          historica += sumUtilidadHistoricaMes(cajaNegocio, mes, v.id);
        } else if (isMesCalculadoDesdeRegistros(mes, c)) {
          const part = calcularUtilidadOperativaVehiculoMes(v.id, ingresos, gastos, mes);
          calculada += part.utilidad;
          ingCalc += part.ingresos;
          gasCalc += part.gastosOperativos;
        }
      }
      return {
        vehicleId: v.id,
        utilidadHistorica: historica,
        utilidadCalculada: calculada,
        utilidadAcumulada: historica + calculada,
        ingresosCalculados: ingCalc,
        gastosOperativosCalculados: gasCalc,
      };
    })
    .sort((a, b) => b.utilidadAcumulada - a.utilidadAcumulada);
}

export function calcularUtilidadOperativaVehiculoEnRango(
  vehicleId: number,
  cajaNegocio: CajaNegocioVehiculo[],
  ingresos: Ingreso[],
  gastos: Gasto[],
  desde: string | null,
  hasta: string | null,
  corte?: UtilidadCorteHistorico,
): { utilidad: number; historica: number; calculada: number } {
  const c = corte ?? getUtilidadCorteHistorico(cajaNegocio);
  const meses = collectMonthKeys(cajaNegocio, ingresos, gastos).filter((mes) => {
    const desdeMes = desde ? desde.slice(0, 7) : null;
    const hastaMes = hasta ? hasta.slice(0, 7) : null;
    if (desdeMes && mes < desdeMes) return false;
    if (hastaMes && mes > hastaMes) return false;
    return true;
  });

  let historica = 0;
  let calculada = 0;
  for (const mes of meses) {
    if (isMesHistoricoImportado(mes, c)) {
      historica += sumUtilidadHistoricaMes(cajaNegocio, mes, vehicleId);
    } else if (isMesCalculadoDesdeRegistros(mes, c)) {
      calculada += calcularUtilidadOperativaVehiculoMes(vehicleId, ingresos, gastos, mes).utilidad;
    }
  }
  return { utilidad: historica + calculada, historica, calculada };
}

/** Utilidad operativa de flota en rango (para reportes). */
export function calcularUtilidadOperativaFlotaEnRango(
  cajaNegocio: CajaNegocioVehiculo[],
  ingresos: Ingreso[],
  gastos: Gasto[],
  desde: string | null,
  hasta: string | null,
): number {
  const corte = getUtilidadCorteHistorico(cajaNegocio);
  const meses = buildUtilidadOperativaMensual(cajaNegocio, ingresos, gastos, corte).filter((m) => {
    if (desde && m.mes < desde.slice(0, 7)) return false;
    if (hasta && m.mes > hasta.slice(0, 7)) return false;
    return true;
  });
  return meses.reduce((s, m) => s + m.utilidadTotal, 0);
}

/** Resumen global: histórica + calculada = acumulada. */
export function calcularUtilidadAcumulada(
  cajaNegocio: CajaNegocioVehiculo[],
  ingresos: Ingreso[],
  gastos: Gasto[],
  vehicles: Vehicle[] = [],
): UtilidadAcumuladaResumen {
  const corte = getUtilidadCorteHistorico(cajaNegocio);
  const porMes = buildUtilidadOperativaMensual(cajaNegocio, ingresos, gastos, corte);
  const porVehiculo = buildUtilidadPorVehiculo(vehicles, cajaNegocio, ingresos, gastos, corte);

  const utilidadHistoricaTotal = cajaNegocio.reduce((s, r) => s + r.monto, 0);
  const utilidadCalculadaTotal = porMes
    .filter((m) => m.fuente === 'calculada')
    .reduce((s, m) => s + m.utilidadCalculada, 0);

  return {
    corte,
    utilidadHistoricaTotal,
    utilidadCalculadaTotal,
    utilidadAcumuladaTotal: utilidadHistoricaTotal + utilidadCalculadaTotal,
    porMes,
    porVehiculo,
  };
}
