import type { Ingreso, Prestamo } from '../data/types';

/** Monto del ingreso expresado en PEN para KPIs y sumas (legacy sin campos = monto en PEN). */
export function ingresoMontoPEN(i: Ingreso): number {
  if (i.montoPENReferencia != null && !Number.isNaN(i.montoPENReferencia) && i.montoPENReferencia > 0) {
    return i.montoPENReferencia;
  }
  if (i.moneda === 'USD' && i.tipoCambio != null && i.tipoCambio > 0) {
    return i.monto * i.tipoCambio;
  }
  return i.monto;
}

/** Saldo pendiente del préstamo referido a PEN (usa TC guardado en el préstamo si es USD). */
export function prestamoSaldoEquivalentePEN(p: Prestamo): number {
  if (p.moneda === 'PEN') return p.saldoPendiente;
  if (p.tipoCambio != null && p.tipoCambio > 0) return p.saldoPendiente * p.tipoCambio;
  return p.saldoPendiente;
}
