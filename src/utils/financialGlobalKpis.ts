/**
 * Fuente única para KPIs financieros globales (ingresos completos + gastos RPC).
 * Memoria `gastos` reciente solo para UI operativa / período filtrado en cliente.
 */

import type { Ingreso } from '../data/types';
import { formatCurrency } from './formatting';
import { ingresoMontoPEN } from './moneda';
import {
  type GastosFinancialSummary,
  type GastosGlobalTotalState,
  formatGastosGlobalTotalDisplay,
  summaryCategoria,
} from './gastosFinancialSummary';

import type { GlobalAmountFormatter } from './displayAmount';

export type FinancialKpiSource = 'bd' | 'memoria-periodo' | 'memoria-vista-rapida' | 'loading';

/** Suma histórica de ingresos cargados en contexto (fetchIngresos paginado completo). */
export function sumIngresosGlobalPEN(ingresos: Ingreso[]): number {
  return ingresos.reduce((s, i) => s + ingresoMontoPEN(i), 0);
}

/**
 * Utilidad global = ingresos globales − gastos globales (RPC).
 * No usar memoria parcial cuando scope es `recent`.
 */
export function computeGlobalUtilidadPEN(
  ingresos: Ingreso[],
  gastosState: GastosGlobalTotalState,
): number | null {
  if (gastosState.source === 'loading' || gastosState.total == null) return null;
  return sumIngresosGlobalPEN(ingresos) - gastosState.total;
}

export function formatGlobalResultadoNetoDisplay(
  ingresos: Ingreso[],
  gastosState: GastosGlobalTotalState,
  formatAmount: GlobalAmountFormatter = (n) => formatCurrency(n),
): string {
  return formatGlobalUtilidadDisplay(ingresos, gastosState, formatAmount);
}

/** @deprecated Usar formatGlobalResultadoNetoDisplay — no es utilidad operativa. */
export function formatGlobalUtilidadDisplay(
  ingresos: Ingreso[],
  gastosState: GastosGlobalTotalState,
  formatAmount: GlobalAmountFormatter = (n) => formatCurrency(n),
): string {
  if (gastosState.source === 'loading' || gastosState.loadingLabel) {
    return gastosState.loadingLabel ?? 'Cargando totales globales…';
  }
  const u = computeGlobalUtilidadPEN(ingresos, gastosState);
  if (u == null) return '—';
  return formatAmount(u);
}

export function globalUtilidadSource(gastosState: GastosGlobalTotalState): FinancialKpiSource {
  if (gastosState.source === 'loading') return 'loading';
  if (gastosState.source === 'rpc') return 'bd';
  return 'memoria-vista-rapida';
}

/** Etiqueta corta para UI (hub, tarjetas, pies). */
export function financialKpiSourceLabel(source: FinancialKpiSource): string {
  switch (source) {
    case 'bd':
      return 'BD';
    case 'memoria-periodo':
      return 'Vista rápida (período)';
    case 'memoria-vista-rapida':
      return 'Vista rápida';
    case 'loading':
      return 'Cargando…';
    default:
      return '';
  }
}

export interface InversionCompraKpi {
  monto: number;
  count: number;
  source: FinancialKpiSource;
  loadingLabel: string | null;
}

/**
 * Inversión con utilidad (`inversion_compra`): siempre preferir RPC summary.
 */
export function resolveInversionCompraKpi(
  summary: GastosFinancialSummary | null | undefined,
  gastosLocal: { monto: number; count: number },
  gastosLoadScope: 'recent' | 'full',
  isLoadingGastosSummary: boolean,
): InversionCompraKpi {
  if (summary != null) {
    const c = summaryCategoria(summary, 'inversion_compra');
    return { monto: c.monto, count: c.count, source: 'bd', loadingLabel: null };
  }
  if (gastosLoadScope === 'recent' || isLoadingGastosSummary) {
    return {
      monto: 0,
      count: 0,
      source: 'loading',
      loadingLabel: 'Cargando totales globales…',
    };
  }
  return {
    monto: gastosLocal.monto,
    count: gastosLocal.count,
    source: 'memoria-vista-rapida',
    loadingLabel: null,
  };
}

export function formatInversionCompraDisplay(
  kpi: InversionCompraKpi,
  formatAmount: GlobalAmountFormatter = (n) => formatCurrency(n),
): string {
  if (kpi.loadingLabel) return kpi.loadingLabel;
  return formatAmount(kpi.monto);
}

export interface ResultadoNetoKpi {
  value: number | null;
  display: string;
  gastosSource: FinancialKpiSource;
}

/**
 * Resultado = ingresos del período − gastos del período o globales (preset todo + RPC).
 */
export function resolveResultadoNetoKpi(
  totalIngresosPeriodo: number,
  gastosState: GastosGlobalTotalState,
  useSummaryAllTime: boolean,
  totalGastosPeriodoLocal: number,
  formatAmount: GlobalAmountFormatter = (n) => formatCurrency(n),
): ResultadoNetoKpi {
  if (useSummaryAllTime) {
    if (gastosState.source === 'loading' || gastosState.total == null) {
      return {
        value: null,
        display: gastosState.loadingLabel ?? 'Cargando totales globales…',
        gastosSource: 'loading',
      };
    }
    const value = totalIngresosPeriodo - gastosState.total;
    return {
      value,
      display: formatAmount(value),
      gastosSource: gastosState.source === 'rpc' ? 'bd' : 'memoria-vista-rapida',
    };
  }
  const value = totalIngresosPeriodo - totalGastosPeriodoLocal;
  return {
    value,
    display: formatAmount(value),
    gastosSource: 'memoria-periodo',
  };
}

export function formatGlobalIngresosDisplay(
  ingresos: Ingreso[],
  formatAmount: GlobalAmountFormatter = (n) => formatCurrency(n),
): string {
  return formatAmount(sumIngresosGlobalPEN(ingresos));
}

export function formatGlobalGastosDisplay(
  gastosState: GastosGlobalTotalState,
  formatAmount: GlobalAmountFormatter = (n) => formatCurrency(n),
): string {
  return formatGastosGlobalTotalDisplay(gastosState, formatAmount);
}
