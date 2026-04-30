import type { Ingreso, Gasto } from '../data/types';
import { ingresoMontoPEN } from './moneda';

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export interface MonthlyChartPoint {
  mes: string;
  ingresos: number;
  gastos: number;
}

/** Agrega ingresos (en PEN ref.) y gastos por mes para el año dado. */
export function buildMonthlyChartData(
  year: number,
  ingresos: Ingreso[],
  gastos: Gasto[],
): MonthlyChartPoint[] {
  return MESES_CORTO.map((mes, idx) => {
    const month = String(idx + 1).padStart(2, '0');
    const prefix = `${year}-${month}`;
    const ingTotal = ingresos
      .filter((i) => i.fecha.startsWith(prefix))
      .reduce((sum, i) => sum + ingresoMontoPEN(i), 0);
    const gasTotal = gastos.filter((g) => g.fecha.startsWith(prefix)).reduce((sum, g) => sum + g.monto, 0);
    return { mes, ingresos: ingTotal, gastos: gasTotal };
  });
}
