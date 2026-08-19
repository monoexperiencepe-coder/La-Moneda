/**
 * Fórmula única del Resultado General del negocio.
 *
 * Misma definición en Resumen y Reportes:
 *   Resultado = Σ ingresoMontoPEN(ingresos) − Σ gastos.monto
 *
 * Incluye TODAS las categorías de gasto sin excepción.
 * NO incluye descuentos (son una métrica operativa separada).
 */

// ── Cascada financiera ────────────────────────────────────────────────────────

export interface CascadaLayer {
  id: string;
  label: string;
  tipos: readonly string[];
  /** Suma de gastos en este grupo */
  monto: number;
  /** % sobre totalGastos */
  pct: number;
}

export interface CascadaFinanciera {
  totalIngresos: number;
  totalGastos: number;
  /** totalIngresos − totalGastos (fuente autoritativa, no derivada de capas) */
  resultado: number;
  layers: CascadaLayer[];
  /** Subtotales intermedios de la cascada */
  resultadoOperativo: number;
  resultadoNegocio: number;
  resultadoPostFinanciero: number;
  resultadoPostInversion: number;
  /** true si sum(layers.monto) reconcilia con totalGastos (±0.01) */
  reconciles: boolean;
}

const CASCADA_GROUPS = [
  {
    id: 'operativos',
    label: 'Gastos operativos',
    tipos: ['operativo_vehiculo', 'operativo_flota_general'] as const,
  },
  {
    id: 'negocio',
    label: 'Administración, planilla y otros',
    tipos: [
      'administrativo_empresa',
      'planilla_laboral',
      'representacion_interna',
      'otros_gastos_varios',
      'gastos_globales',
    ] as const,
  },
  {
    id: 'financieros',
    label: 'Gastos financieros registrados',
    tipos: ['financiero_prestamo'] as const,
  },
  {
    id: 'inversiones',
    label: 'Inversiones registradas',
    tipos: ['inversion_compra'] as const,
  },
  {
    id: 'pendientes',
    label: 'Pendientes de clasificación',
    tipos: ['pendiente_revision'] as const,
  },
] as const;

/**
 * Construye la cascada financiera a partir de la distribución ya calculada.
 * No ejecuta nuevas consultas — usa datos en memoria.
 *
 * La suma de layers debe igualar totalGastos; si no reconcilia es porque
 * existen gastos con tipo_gasto fuera de los 10 canónicos.
 */
export function buildCascadaFinanciera(
  totalIngresos: number,
  distribucion: ReadonlyArray<{ key: string; monto: number }>,
  totalGastos: number,
): CascadaFinanciera {
  const byKey = Object.fromEntries(distribucion.map((d) => [d.key, d.monto]));

  const layers: CascadaLayer[] = CASCADA_GROUPS.map((g) => {
    const monto = g.tipos.reduce((s, t) => s + (byKey[t] ?? 0), 0);
    const pct = totalGastos > 0 ? (monto / totalGastos) * 100 : 0;
    return { id: g.id, label: g.label, tipos: g.tipos, monto, pct };
  });

  const opMonto = layers.find((l) => l.id === 'operativos')?.monto ?? 0;
  const negMonto = layers.find((l) => l.id === 'negocio')?.monto ?? 0;
  const finMonto = layers.find((l) => l.id === 'financieros')?.monto ?? 0;
  const invMonto = layers.find((l) => l.id === 'inversiones')?.monto ?? 0;

  const resultadoOperativo = totalIngresos - opMonto;
  const resultadoNegocio = resultadoOperativo - negMonto;
  const resultadoPostFinanciero = resultadoNegocio - finMonto;
  const resultadoPostInversion = resultadoPostFinanciero - invMonto;

  const sumLayers = layers.reduce((s, l) => s + l.monto, 0);
  const reconciles = Math.abs(sumLayers - totalGastos) < 0.01;

  return {
    totalIngresos,
    totalGastos,
    resultado: totalIngresos - totalGastos,
    layers,
    resultadoOperativo,
    resultadoNegocio,
    resultadoPostFinanciero,
    resultadoPostInversion,
    reconciles,
  };
}

import { toDateOnlyString } from './formatting';
import { ingresoMontoPEN } from './moneda';
import type { Gasto, Ingreso } from '../data/types';

export interface BusinessResultTotals {
  totalIngresos: number;
  totalGastos: number;
  /** totalIngresos − totalGastos */
  resultado: number;
  hasMovement: boolean;
}

export function calculateBusinessResult(
  ingresos: Ingreso[],
  gastos: Gasto[],
  desde: string | null,
  hasta: string | null,
): BusinessResultTotals {
  let ing = 0;
  let gas = 0;
  let hasMovement = false;
  const bounded = Boolean(desde && hasta);

  for (const i of ingresos) {
    const d = toDateOnlyString(i.fecha);
    if (!d) continue;
    if (bounded && (d < desde! || d > hasta!)) continue;
    ing += ingresoMontoPEN(i);
    hasMovement = true;
  }
  for (const g of gastos) {
    const d = toDateOnlyString(g.fecha);
    if (!d) continue;
    if (bounded && (d < desde! || d > hasta!)) continue;
    gas += g.monto;
    hasMovement = true;
  }
  return { totalIngresos: ing, totalGastos: gas, resultado: ing - gas, hasMovement };
}

/**
 * Ingresos en USD que no tienen tipo de cambio ni monto PEN de referencia.
 * Estos caen en el fallback de ingresoMontoPEN: el monto USD se suma como si fuera PEN.
 */
export function ingresosSinTipoCambio(ingresos: Ingreso[]): Ingreso[] {
  return ingresos.filter(
    (i) =>
      i.moneda === 'USD' &&
      !(Number(i.tipoCambio) > 0) &&
      !(Number(i.montoPENReferencia) > 0),
  );
}
