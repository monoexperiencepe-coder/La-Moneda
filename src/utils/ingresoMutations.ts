import type { Ingreso, Moneda } from '../data/types';
import { sortRegistrosByLatestCreatedOrDate } from './sortRegistrosByLatestCreatedOrDate';

export type IngresoMoneyPatch = {
  monto: number;
  moneda: Moneda;
  tipoCambio: number | null;
  montoPENReferencia: number;
};

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

/** Mantiene monto/moneda/TC/equivalente PEN como una sola unidad coherente. */
export function buildIngresoMoneyPatch(draft: {
  monto: number;
  moneda: Moneda;
  tipoCambio: number | null;
}): IngresoMoneyPatch {
  const monto = round(Number(draft.monto), 2);
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('Monto inválido.');
  if (draft.moneda === 'PEN') {
    return { monto, moneda: 'PEN', tipoCambio: null, montoPENReferencia: monto };
  }
  const tipoCambio = round(Number(draft.tipoCambio), 4);
  if (!Number.isFinite(tipoCambio) || tipoCambio <= 0) {
    throw new Error('Tipo de cambio inválido para un ingreso en USD.');
  }
  return {
    monto,
    moneda: 'USD',
    tipoCambio,
    montoPENReferencia: round(monto * tipoCambio, 2),
  };
}

/** Upsert estable por PK, compartido por edición local y realtime. */
export function mergeIngresoSorted(prev: Ingreso[], row: Ingreso): Ingreso[] {
  const rowId = String(row.id);
  const next = [...prev.filter((x) => String(x.id) !== rowId), row];
  next.sort(sortRegistrosByLatestCreatedOrDate);
  return next;
}

export function removeIngresoById(prev: Ingreso[], id: string): Ingreso[] {
  const target = String(id);
  return prev.filter((i) => String(i.id) !== target);
}

export function requireDeletedIngresoRow(
  rows: readonly Pick<Ingreso, 'id'>[] | null,
  expectedId: string,
): void {
  if (!rows?.some((row) => String(row.id) === String(expectedId))) {
    throw new Error('El ingreso no existe o no pudo ser eliminado.');
  }
}
