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

/** Etiquetas históricas en BD → detalle canónico actual (misma celda cuando aplica). */
const LEGACY_METODO_PAGO_DETALLE: Record<string, { metodo: string; detalle: string }> = {
  'Yape Antonella': { metodo: 'Yape', detalle: 'Yape ANTONELLA GARCIA' },
  'Yape ASB': { metodo: 'Yape', detalle: 'Yape ASB' },
  'Yape Caro': { metodo: 'Yape', detalle: 'Yape CARO HELDEN' },
  'Yape DSB': { metodo: 'Yape', detalle: 'Yape DSB' },
  'Yape Edward': { metodo: 'Yape', detalle: 'Yape EDWARD HELDEN' },
  'Yape Jorge': { metodo: 'Plin', detalle: 'Plin ALFREDO SALAS' },
  'Yape Judy': { metodo: 'Yape', detalle: 'Yape JUDY SALAS' },
  'Yape MPBA': { metodo: 'Yape', detalle: 'Yape MPBA' },
  'Yape Pia': { metodo: 'Yape', detalle: 'Yape PIII' },
  'Yape Sofía': { metodo: 'Yape', detalle: 'Yape PIII' },
  'Plin Jorge': { metodo: 'Plin', detalle: 'Plin JORGE SALAS' },
  'Plin Alfredo': { metodo: 'Plin', detalle: 'Plin ALFREDO SALAS' },
  'Plin ASV': { metodo: 'Yape', detalle: 'Yape ASV' },
  'Plin Daniela': { metodo: 'Plin', detalle: 'Plin ALCIDES CHIQUEZ BADA' },
  'Plin Marco': { metodo: 'Plin', detalle: 'Plin JORGE SALAS' },
  'Plin Rosa': { metodo: 'Plin', detalle: 'Plin MARISOL ROMERO' },
  'Plin Tito': { metodo: 'Plin', detalle: 'Plin PAUL ABANTO' },
  'Plin Único': { metodo: 'Plin', detalle: 'Plin DSB' },
};

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
  const direct = metodoLista.find((r) => r.metodo === metodo && norm(r.detalle) === d);
  if (direct) return direct;
  const legacy = LEGACY_METODO_PAGO_DETALLE[d];
  if (legacy) {
    return metodoLista.find(
      (r) => r.metodo === legacy.metodo && norm(r.detalle) === norm(legacy.detalle),
    );
  }
  return undefined;
}

/** Resuelve cuenta por celular guardado (pagos antiguos con etiqueta distinta). */
export function getDetalleMetodoByCelular(metodo: string, celular: string): MetodoPagoDetalleRow | undefined {
  const c = celular.trim();
  if (!c) return undefined;
  return metodoLista.find((r) => r.metodo === metodo && r.celular.trim() === c);
}
