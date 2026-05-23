import type { Ingreso } from '../data/types';
import {
  TIPO_INGRESO_EXTRAORDINARIO,
  labelCategoriaIngresoExtraordinario,
} from '../data/ingresoAlcanceCatalog';
import { ingresoMontoPEN } from './moneda';
import { vehicleIdKey } from './vehicleId';

/** Ingreso sin unidad (extraordinario / empresa). */
export function isIngresoExtraordinario(ingreso: Pick<Ingreso, 'esExtraordinario' | 'tipo' | 'vehicleId'>): boolean {
  if (ingreso.esExtraordinario === true) return true;
  if ((ingreso.tipo ?? '').trim().toUpperCase() === TIPO_INGRESO_EXTRAORDINARIO) return true;
  return vehicleIdKey(ingreso.vehicleId) == null;
}

export function isIngresoVehicular(ingreso: Pick<Ingreso, 'esExtraordinario' | 'tipo' | 'vehicleId'>): boolean {
  return !isIngresoExtraordinario(ingreso);
}

export function ingresoCategoriaDisplay(ingreso: Ingreso): string {
  if (isIngresoExtraordinario(ingreso)) {
    return labelCategoriaIngresoExtraordinario(ingreso.subTipo);
  }
  return ingreso.subTipo?.trim() ? `${ingreso.tipo} · ${ingreso.subTipo}` : ingreso.tipo;
}

export function sumIngresosPEN(rows: Ingreso[]): number {
  return rows.reduce((s, i) => s + ingresoMontoPEN(i), 0);
}

export function partitionIngresosPorAlcance(ingresos: Ingreso[]): {
  vehiculares: Ingreso[];
  extraordinarios: Ingreso[];
} {
  const vehiculares: Ingreso[] = [];
  const extraordinarios: Ingreso[] = [];
  for (const i of ingresos) {
    if (isIngresoExtraordinario(i)) extraordinarios.push(i);
    else vehiculares.push(i);
  }
  return { vehiculares, extraordinarios };
}

export function ingresosVehicularesTotal(ingresos: Ingreso[]): number {
  return sumIngresosPEN(ingresos.filter(isIngresoVehicular));
}

export function ingresosExtraordinariosTotal(ingresos: Ingreso[]): number {
  return sumIngresosPEN(ingresos.filter(isIngresoExtraordinario));
}
