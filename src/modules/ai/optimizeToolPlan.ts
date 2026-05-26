/**
 * Evita llamadas duplicadas o redundantes en el mismo turno de tools.
 */
import type { AiToolCallRequest, AiToolName } from './types';

const COVERED_BY_RESUMEN = new Set<AiToolName>([
  'getIngresosPeriodo',
  'getGastosPeriodo',
  'getGastosPorCategoria',
]);

function resumenHasMonthlyData(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  const meses = d.meses_destacados;
  if (Array.isArray(meses) && meses.length > 0) return true;
  return d.capas_financieras != null;
}

function toolCallKey(call: AiToolCallRequest): string {
  return `${call.name}:${JSON.stringify(call.arguments ?? {})}`;
}

/** Filtra tools redundantes en el mismo batch del LLM. */
export function optimizeToolPlanBatch(calls: AiToolCallRequest[]): AiToolCallRequest[] {
  const hasResumen = calls.some((c) => c.name === 'getResumenFinancieroPeriodo');
  const seen = new Set<string>();
  const out: AiToolCallRequest[] = [];

  for (const call of calls) {
    const key = toolCallKey(call);
    if (seen.has(key)) continue;
    seen.add(key);

    if (hasResumen && COVERED_BY_RESUMEN.has(call.name)) {
      if (import.meta.env.DEV) {
        console.log('[ai:tool-plan]', 'skip redundant', call.name, '(getResumenFinancieroPeriodo in batch)');
      }
      continue;
    }
    out.push(call);
  }

  if (import.meta.env.DEV && out.length !== calls.length) {
    console.log('[ai:tool-plan]', { before: calls.map((c) => c.name), after: out.map((c) => c.name) });
  }
  return out;
}

/** Omite tool si getResumenFinancieroPeriodo ya devolvió meses/capas en este request. */
export function shouldSkipToolAfterResumen(
  call: AiToolCallRequest,
  completed: Array<{ name: AiToolName; data: unknown }>,
): boolean {
  if (!COVERED_BY_RESUMEN.has(call.name)) return false;
  const resumen = completed.find((c) => c.name === 'getResumenFinancieroPeriodo');
  if (!resumen) return false;
  if (!resumenHasMonthlyData(resumen.data)) return false;
  if (import.meta.env.DEV) {
    console.log('[ai:tool-plan]', 'skip after resumen', call.name);
  }
  return true;
}

/** Etiqueta de espera legible para UX. */
export function loadingLabelForTool(
  tool: AiToolName,
  args: Record<string, unknown>,
): string {
  const year = args.anio ?? args.year;
  const yearSuffix = year ? ` ${year}` : '';

  switch (tool) {
    case 'getResumenFinancieroPeriodo':
      return year ? `Analizando resumen financiero${yearSuffix}…` : 'Generando resumen financiero…';
    case 'getIngresosPeriodo':
      return year ? `Consultando ingresos${yearSuffix}…` : 'Consultando ingresos…';
    case 'getGastosPeriodo':
      return year ? `Consultando gastos operativos${yearSuffix}…` : 'Consultando gastos…';
    case 'getGastosPorCategoria':
      return 'Desglosando categorías…';
    case 'getVehiculosConMasGasto':
      return year ? `Comparando gastos por vehículo${yearSuffix}…` : 'Analizando gastos por vehículo…';
    case 'getRankingInversionVehiculos':
      return 'Revisando inversiones vehiculares…';
    case 'getInversionesNoVehiculares':
      return 'Revisando inversiones en activos…';
    case 'getPendientesRevision':
      return 'Revisando pendientes…';
    case 'getHistorialVehiculo':
      return 'Consultando historial del vehículo…';
    default:
      return 'Analizando datos…';
  }
}

/** Etiqueta inicial según intención del mensaje. */
export function loadingLabelForMessage(message: string): string {
  const m = message.toLowerCase();
  const yearMatch = message.match(/\b(20\d{2})\b/);
  const year = yearMatch?.[1];

  if (/\bmejor mes\b|\bpeor mes\b/.test(m)) {
    return year ? `Comparando meses de ${year}…` : 'Comparando meses…';
  }
  if (/\banomal/.test(m)) return year ? `Detectando anomalías en ${year}…` : 'Detectando anomalías…';
  if (/\butilidad\b|\brentabil/.test(m)) {
    return year ? `Calculando utilidad operativa ${year}…` : 'Calculando utilidad operativa…';
  }
  if (/\bcrec/.test(m)) return 'Analizando tendencia de crecimiento…';
  if (/\bingreso/.test(m)) return year ? `Consultando ingresos ${year}…` : 'Consultando ingresos…';
  if (/\bgasto/.test(m)) return year ? `Consultando gastos ${year}…` : 'Consultando gastos…';
  if (/\binvers/.test(m)) return 'Revisando inversiones…';
  if (/\bveh[ií]culo|\bcarro|\bplaca|\bflota/.test(m)) return 'Analizando flota…';
  return 'Analizando…';
}
