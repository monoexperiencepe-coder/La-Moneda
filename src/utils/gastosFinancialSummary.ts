/** Agregados financieros de gastos (RPC get_gastos_financial_summary). */

import { formatCurrency } from './formatting';
import type { GlobalAmountFormatter } from './displayAmount';

export interface GastosCategoriaSummary {
  monto: number;
  count: number;
}

export interface GastosFinancialSummary {
  totalGastos: number;
  totalCount: number;
  byTipoGasto: Record<string, GastosCategoriaSummary>;
}

export const GASTOS_SUMMARY_TIPOS = [
  'operativo_vehiculo',
  'operativo_flota_general',
  'administrativo_empresa',
  'financiero_prestamo',
  'planilla_laboral',
  'inversion_compra',
  'representacion_interna',
  'gastos_globales',
  'pendiente_revision',
] as const;

export type GastosSummaryTipo = (typeof GASTOS_SUMMARY_TIPOS)[number];

export const EMPTY_GASTOS_FINANCIAL_SUMMARY: GastosFinancialSummary = {
  totalGastos: 0,
  totalCount: 0,
  byTipoGasto: Object.fromEntries(GASTOS_SUMMARY_TIPOS.map((t) => [t, { monto: 0, count: 0 }])),
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function int(v: unknown): number {
  return Math.trunc(num(v));
}

/** Mapea fila snake_case del RPC a estructura de la app. */
export function mapGastosFinancialSummaryRow(row: Record<string, unknown>): GastosFinancialSummary {
  const pairs: Array<[GastosSummaryTipo, string, string]> = [
    ['operativo_vehiculo', 'total_operativo_vehiculo', 'count_operativo_vehiculo'],
    ['operativo_flota_general', 'total_operativo_flota_general', 'count_operativo_flota_general'],
    ['administrativo_empresa', 'total_administrativo_empresa', 'count_administrativo_empresa'],
    ['financiero_prestamo', 'total_financiero_prestamo', 'count_financiero_prestamo'],
    ['planilla_laboral', 'total_planilla_laboral', 'count_planilla_laboral'],
    ['inversion_compra', 'total_inversion_compra', 'count_inversion_compra'],
    ['representacion_interna', 'total_representacion_interna', 'count_representacion_interna'],
    ['gastos_globales', 'total_gastos_globales', 'count_gastos_globales'],
    ['pendiente_revision', 'total_pendiente_revision', 'count_pendiente_revision'],
  ];

  const byTipoGasto: Record<string, GastosCategoriaSummary> = {};
  for (const [tipo, totalKey, countKey] of pairs) {
    byTipoGasto[tipo] = { monto: num(row[totalKey]), count: int(row[countKey]) };
  }

  return {
    totalGastos: num(row.total_gastos),
    totalCount: int(row.total_count),
    byTipoGasto,
  };
}

export function summaryCategoria(
  summary: GastosFinancialSummary | null | undefined,
  tipo: string,
): GastosCategoriaSummary {
  return summary?.byTipoGasto[tipo] ?? { monto: 0, count: 0 };
}

/** Total global: preferir RPC cuando está disponible. */
export function resolveGlobalGastosTotal(
  summary: GastosFinancialSummary | null | undefined,
  gastosLocalTotal: number,
): number {
  if (summary != null) return summary.totalGastos;
  return gastosLocalTotal;
}

export type GastosGlobalTotalSource = 'rpc' | 'memory' | 'loading';

export interface GastosGlobalTotalState {
  source: GastosGlobalTotalSource;
  /** null mientras carga (no mostrar total parcial en memoria). */
  total: number | null;
  loadingLabel: string | null;
  movementCount: number | null;
}

/**
 * Regla UI: con scope `recent`, nunca usar memoria parcial como total global definitivo.
 * Esperar RPC o mostrar estado de carga.
 */
export function resolveGastosGlobalTotalState(
  summary: GastosFinancialSummary | null | undefined,
  gastosLocalTotal: number,
  gastosLocalCount: number,
  gastosLoadScope: 'recent' | 'full',
  isLoadingGastosSummary: boolean,
): GastosGlobalTotalState {
  if (summary != null) {
    return {
      source: 'rpc',
      total: summary.totalGastos,
      loadingLabel: null,
      movementCount: summary.totalCount,
    };
  }
  if (gastosLoadScope === 'recent' || isLoadingGastosSummary) {
    return {
      source: 'loading',
      total: null,
      loadingLabel: 'Cargando totales globales…',
      movementCount: null,
    };
  }
  return {
    source: 'memory',
    total: gastosLocalTotal,
    loadingLabel: null,
    movementCount: gastosLocalCount,
  };
}

export function formatGastosGlobalTotalDisplay(
  state: GastosGlobalTotalState,
  formatAmount: GlobalAmountFormatter = (n) => formatCurrency(n),
): string {
  if (state.loadingLabel) return state.loadingLabel;
  if (state.total == null) return '—';
  return formatAmount(state.total);
}

/** Parrilla Gastos: { count, monto } por tab tipo_gasto. */
/** Clona summary para parches optimistas inmutables. */
export function cloneGastosFinancialSummary(
  summary: GastosFinancialSummary,
): GastosFinancialSummary {
  return {
    totalGastos: summary.totalGastos,
    totalCount: summary.totalCount,
    byTipoGasto: { ...summary.byTipoGasto },
  };
}

export function resumenPorCategoriaFromSummary(
  summary: GastosFinancialSummary,
  tipos: string[],
): Record<string, { count: number; monto: number }> {
  return Object.fromEntries(
    tipos.map((tipo) => {
      const c = summaryCategoria(summary, tipo);
      return [tipo, { count: c.count, monto: c.monto }];
    }),
  );
}

/** Distribución Resumen (CATEGORIA_MAP keys) desde summary all-time. */
export function distribucionFromSummary(
  summary: GastosFinancialSummary,
  categorias: ReadonlyArray<{ key: string; label: string }>,
): Array<{ key: string; label: string; monto: number; pct: number }> {
  const total = summary.totalGastos;
  return categorias
    .map((c) => {
      const monto = summaryCategoria(summary, c.key).monto;
      const pct = total > 0 ? (monto / total) * 100 : 0;
      return { key: c.key, label: c.label, monto, pct };
    })
    .filter((d) => d.monto > 0)
    .sort((a, b) => b.monto - a.monto);
}
