/**
 * Utilidad / ingresos / gastos por número de unidad (vehicle.id).
 */
import type { Gasto, Ingreso, Vehicle } from '../../data/types';
import { getCachedFinanzasVehiculoBundle } from './aiToolDataCache';
import { filterGastosForUser, type PermissionUser } from '../../utils/permissions';
import {
  calcularUtilidadRealVehiculo,
  sumGastosVehiculoTodos,
  sumIngresosVehiculoTotal,
  UTILIDAD_REAL_TOOLTIP,
} from '../../utils/utilidadReal';

function resolveVehicle(vehicles: Vehicle[], numero: number): Vehicle | null {
  return vehicles.find((v) => v.id === numero) ?? null;
}

export type VehiculoFinanzasBase = {
  encontrado: boolean;
  numeroUnidad: number;
  vehicleId: number | null;
  placa: string | null;
  marca: string | null;
  modelo: string | null;
  fuente: string;
};

export type UtilidadVehiculoPayload = VehiculoFinanzasBase & {
  _tipo_metrica: 'utilidad_vehiculo';
  ingresos: number;
  gastos: number;
  utilidad: number;
  ingresos_total: number;
  gastos_total: number;
  nota: string;
};

export type IngresosVehiculoPayload = VehiculoFinanzasBase & {
  _tipo_metrica: 'ingresos_vehiculo';
  ingresos: number;
  ingresos_total: number;
  count: number;
  nota: string;
};

export type GastosVehiculoPayload = VehiculoFinanzasBase & {
  _tipo_metrica: 'gastos_vehiculo';
  gastos: number;
  gastos_total: number;
  count: number;
  nota: string;
};

function countIngresosVehiculo(ingresos: readonly Ingreso[], vehicleId: number): number {
  return ingresos.filter((i) => Number(i.vehicleId) === vehicleId).length;
}

function countGastosVehiculo(gastos: readonly Gasto[], vehicleId: number): number {
  return gastos.filter((g) => Number(g.vehicleId) === vehicleId).length;
}

function notFoundPayload(numero: number): VehiculoFinanzasBase {
  return {
    encontrado: false,
    numeroUnidad: numero,
    vehicleId: null,
    placa: null,
    marca: null,
    modelo: null,
    fuente: 'public.ingresos + public.gastos',
  };
}

export async function buildUtilidadVehiculoPayload(
  empresaId: string,
  user: PermissionUser,
  numero: number,
): Promise<UtilidadVehiculoPayload> {
  const { vehicles, ingresos, gastosAll } = await getCachedFinanzasVehiculoBundle(empresaId);
  const vehicle = resolveVehicle(vehicles, numero);
  if (!vehicle) {
    return {
      ...notFoundPayload(numero),
      _tipo_metrica: 'utilidad_vehiculo',
      ingresos: 0,
      gastos: 0,
      utilidad: 0,
      ingresos_total: 0,
      gastos_total: 0,
      nota: `No se encontró vehículo #${numero}.`,
    };
  }
  const gastos = filterGastosForUser(user, gastosAll);
  const { ingresosTotal, gastosTotal, utilidadReal } = calcularUtilidadRealVehiculo(
    numero,
    ingresos,
    gastos,
  );
  return {
    encontrado: true,
    numeroUnidad: numero,
    vehicleId: numero,
    placa: vehicle.placa,
    marca: vehicle.marca,
    modelo: vehicle.modelo,
    _tipo_metrica: 'utilidad_vehiculo',
    ingresos: ingresosTotal,
    gastos: gastosTotal,
    utilidad: utilidadReal,
    ingresos_total: ingresosTotal,
    gastos_total: gastosTotal,
    fuente: 'calcularUtilidadRealVehiculo',
    nota: UTILIDAD_REAL_TOOLTIP,
  };
}

export async function buildIngresosVehiculoPayload(
  empresaId: string,
  numero: number,
): Promise<IngresosVehiculoPayload> {
  const { vehicles, ingresos } = await getCachedFinanzasVehiculoBundle(empresaId);
  const vehicle = resolveVehicle(vehicles, numero);
  if (!vehicle) {
    return {
      ...notFoundPayload(numero),
      _tipo_metrica: 'ingresos_vehiculo',
      ingresos: 0,
      ingresos_total: 0,
      count: 0,
      nota: `No se encontró vehículo #${numero}.`,
    };
  }
  const total = sumIngresosVehiculoTotal(ingresos, numero);
  return {
    encontrado: true,
    numeroUnidad: numero,
    vehicleId: numero,
    placa: vehicle.placa,
    marca: vehicle.marca,
    modelo: vehicle.modelo,
    _tipo_metrica: 'ingresos_vehiculo',
    ingresos: total,
    ingresos_total: total,
    count: countIngresosVehiculo(ingresos, numero),
    fuente: 'public.ingresos',
    nota: 'Suma histórica de ingresos del vehículo (PEN).',
  };
}

export async function buildGastosVehiculoPayload(
  empresaId: string,
  user: PermissionUser,
  numero: number,
): Promise<GastosVehiculoPayload> {
  const { vehicles, gastosAll } = await getCachedFinanzasVehiculoBundle(empresaId);
  const vehicle = resolveVehicle(vehicles, numero);
  if (!vehicle) {
    return {
      ...notFoundPayload(numero),
      _tipo_metrica: 'gastos_vehiculo',
      gastos: 0,
      gastos_total: 0,
      count: 0,
      nota: `No se encontró vehículo #${numero}.`,
    };
  }
  const gastos = filterGastosForUser(user, gastosAll);
  const total = sumGastosVehiculoTodos(gastos, numero);
  return {
    encontrado: true,
    numeroUnidad: numero,
    vehicleId: numero,
    placa: vehicle.placa,
    marca: vehicle.marca,
    modelo: vehicle.modelo,
    _tipo_metrica: 'gastos_vehiculo',
    gastos: total,
    gastos_total: total,
    count: countGastosVehiculo(gastos, numero),
    fuente: 'public.gastos (utilidad real)',
    nota: 'Gastos operativos del vehículo incluidos en utilidad real.',
  };
}
