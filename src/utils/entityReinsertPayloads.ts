import type { Conductor, ControlFecha, Gasto, Ingreso, KilometrajeRegistro, Pendiente } from '../data/types';

export function omitGastoIds(row: Gasto): Omit<Gasto, 'id' | 'createdAt'> {
  const { id: _id, createdAt: _c, ...rest } = row;
  return rest;
}

export function omitIngresoIds(row: Ingreso): Omit<Ingreso, 'id' | 'createdAt'> {
  const { id: _id, createdAt: _c, ...rest } = row;
  return rest;
}

export function omitConductorIds(row: Conductor): Omit<Conductor, 'id' | 'createdAt'> {
  const { id: _id, createdAt: _c, ...rest } = row;
  return rest;
}

export function omitKilometrajeIds(row: KilometrajeRegistro): Omit<KilometrajeRegistro, 'id' | 'createdAt'> {
  const { id: _id, createdAt: _c, ...rest } = row;
  return rest;
}

export function omitPendienteIds(row: Pendiente): Omit<Pendiente, 'id' | 'createdAt'> {
  const { id: _id, createdAt: _c, ...rest } = row;
  return rest;
}

export function omitControlFechaIds(row: ControlFecha): Omit<ControlFecha, 'id' | 'createdAt'> {
  const { id: _id, createdAt: _c, ...rest } = row;
  return rest;
}
