import { Ingreso } from '../data/types';

/** Cantidad de registros (ingreso o gasto) con la misma cuenta Fact (método + detalle). */
export function countRegistrosPorCuenta(
  items: Array<{ metodoPago: string; metodoPagoDetalle: string }>,
  metodo: string,
  detalle: string,
): number {
  const d = detalle.trim();
  return items.filter(
    i => i.metodoPago === metodo && i.metodoPagoDetalle.trim() === d,
  ).length;
}

/** Cantidad de ingresos guardados con la misma cuenta (método + detalle Fact). */
export function countIngresosPorCuenta(
  ingresos: Ingreso[],
  metodo: string,
  detalle: string,
): number {
  return countRegistrosPorCuenta(ingresos, metodo, detalle);
}

/** Totales por detalle para un método (p. ej. conteo por celular Yape). */
export function countIngresosPorDetalleEnMetodo(
  ingresos: Ingreso[],
  metodo: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of ingresos) {
    if (i.metodoPago !== metodo) continue;
    const k = i.metodoPagoDetalle.trim();
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
