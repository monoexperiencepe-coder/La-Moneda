import factSubtiposIngresos from './factSubtiposIngresos.json';
import factSubtiposGastos from './factSubtiposGastos.json';
import factMetodoPagoLista from './factMetodoPagoLista.json';

/** Maestro Fact / Dim_MetodoP (orden general) */
export const METODOS_PAGO = [
  'Yape',
  'Plin',
  'Transferencia',
  'Efectivo',
  'Otros',
  'Tarjeta',
] as const;

/** Métodos mostrados en registro rápido de ingresos (sin Tarjeta por defecto) */
export const METODOS_INGRESO_RAPIDO = [
  'Yape',
  'Plin',
  'Transferencia',
  'Efectivo',
  'Otros',
] as const;

export type MetodoPago = (typeof METODOS_PAGO)[number];

export interface MetodoPagoDetalleRow {
  id: number;
  metodo: string;
  detalle: string;
  celular: string;
  banco: string;
}

const subtiposIngresos = factSubtiposIngresos as Record<string, string[]>;
const subtiposGastos = factSubtiposGastos as Record<string, string[]>;
const metodoLista = factMetodoPagoLista as MetodoPagoDetalleRow[];

export const TIPOS_INGRESO_FACT = Object.keys(subtiposIngresos);

export function getSubtiposIngreso(tipo: string): string[] {
  return subtiposIngresos[tipo] ?? [];
}

export const TIPOS_GASTO_FACT = Object.keys(subtiposGastos).sort();

export function getSubtiposGasto(tipo: string): string[] {
  return subtiposGastos[tipo] ?? [];
}

export function getDetallesMetodoPago(metodo: string): MetodoPagoDetalleRow[] {
  return metodoLista.filter((r) => r.metodo === metodo);
}

function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

export function getDetalleMetodoByLabel(metodo: string, detalleLabel: string): MetodoPagoDetalleRow | undefined {
  const d = norm(detalleLabel);
  return metodoLista.find((r) => r.metodo === metodo && norm(r.detalle) === d);
}
