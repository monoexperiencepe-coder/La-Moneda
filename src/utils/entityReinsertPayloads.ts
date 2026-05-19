import type { Conductor, Gasto, Ingreso } from '../data/types';

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
