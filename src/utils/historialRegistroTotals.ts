import type { Gasto, Ingreso } from '../data/types';
import { ingresoMontoPEN } from './moneda';

/** Suma en PEN (referencia) para totales de historial de ingresos. */
export function sumIngresosHistorialPEN(rows: Ingreso[]): number {
  let total = 0;
  for (const i of rows) total += ingresoMontoPEN(i);
  return total;
}

/** Suma montos de gastos tal como en listados/KPIs (rebajes negativos restan). */
export function sumGastosHistorialPEN(rows: Gasto[]): number {
  let total = 0;
  for (const g of rows) total += g.monto;
  return total;
}
