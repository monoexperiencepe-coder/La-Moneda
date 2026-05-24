/** Mutaciones locales de préstamos financieros (panel Financiamiento). */

import type { PrestamoFinancieroDetalle } from '../data/types';

export function applyPrestamoDetalleUpsert(
  list: PrestamoFinancieroDetalle[],
  row: PrestamoFinancieroDetalle,
): PrestamoFinancieroDetalle[] {
  const id = row.prestamo.id;
  const without = list.filter((d) => d.prestamo.id !== id);
  return [...without, row];
}

export function applyPrestamoDetalleRemoved(
  list: PrestamoFinancieroDetalle[],
  prestamoId: number,
): PrestamoFinancieroDetalle[] {
  return list.filter((d) => d.prestamo.id !== prestamoId);
}

export function sumCapitalActualDetalle(list: PrestamoFinancieroDetalle[]): {
  pen: number;
  usd: number;
} {
  let pen = 0;
  let usd = 0;
  for (const { prestamo: p } of list) {
    if (p.estado !== 'activo') continue;
    if (p.monedaCapital === 'USD') usd += p.capitalActualEstimado;
    else pen += p.capitalActualEstimado;
  }
  return { pen, usd };
}

export function sumCuotaMensualDetalle(list: PrestamoFinancieroDetalle[]): {
  pen: number;
  usd: number;
} {
  let pen = 0;
  let usd = 0;
  for (const { prestamo: p } of list) {
    if (p.estado !== 'activo') continue;
    if (p.monedaPago === 'USD') usd += p.interesMensualActual;
    else pen += p.interesMensualActual;
  }
  return { pen, usd };
}

export function devLogPrestamoMutation(action: string, payload: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.info(`[localMutation:prestamo] ${action}`, payload);
  }
}
