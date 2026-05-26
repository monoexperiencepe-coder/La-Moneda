/**
 * Prepara payloads de tools para el LLM: compactos, con capas OPEX/CAPEX e insights.
 * El usuario final NO ve este JSON — solo lo interpreta el modelo.
 */
import type { AiToolName } from './types';
import { enrichToolPayloadForLlm } from './toolEmptyResults';

const MAX_FILAS = 8;
const MAX_RANKING = 10;

function truncateList<T>(arr: T[] | undefined, max: number): T[] | undefined {
  if (!Array.isArray(arr)) return arr;
  if (arr.length <= max) return arr;
  return arr.slice(0, max);
}

function compactPayload(tool: AiToolName, data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };

  if (Array.isArray(out.filas)) {
    out.filas_muestra = truncateList(out.filas as unknown[], MAX_FILAS);
    delete out.filas;
  }
  if (Array.isArray(out.gastos)) {
    out.gastos_muestra = truncateList(out.gastos as unknown[], MAX_FILAS);
    delete out.gastos;
  }
  if (Array.isArray(out.movimientos)) {
    out.movimientos_muestra = truncateList(out.movimientos as unknown[], MAX_FILAS);
    delete out.movimientos;
  }
  if (Array.isArray(out.sugerencias)) {
    out.sugerencias_muestra = truncateList(out.sugerencias as unknown[], 12);
    delete out.sugerencias;
  }
  if (Array.isArray(out.ranking)) {
    out.ranking = truncateList(out.ranking as unknown[], MAX_RANKING);
  }
  if (Array.isArray(out.categorias) && (out.categorias as unknown[]).length > 12) {
    out.categorias = (out.categorias as unknown[]).slice(0, 12);
  }
  if (Array.isArray(out.categorias_operativas_opex) && (out.categorias_operativas_opex as unknown[]).length > 10) {
    out.categorias_operativas_opex = (out.categorias_operativas_opex as unknown[]).slice(0, 10);
  }
  if (Array.isArray(out.meses_destacados) && (out.meses_destacados as unknown[]).length > 12) {
    out.meses_destacados = (out.meses_destacados as unknown[]).slice(-12);
  }
  if (Array.isArray(out.insights_automaticos) && (out.insights_automaticos as unknown[]).length > 10) {
    out.insights_automaticos = (out.insights_automaticos as unknown[]).slice(0, 10);
  }

  out._instruccion_interpretacion =
    'Datos internos para interpretar. NO copies este JSON al usuario. Redacta narrativa ejecutiva en español (analista financiero). Separa siempre OPEX vs CAPEX. Usa S/ y US$.';

  if (tool === 'getResumenFinancieroPeriodo' || tool === 'getGastosPorCategoria') {
    out._recordatorio_capex =
      'inversion_compra y compras de activos NO son gasto operativo; no los uses para explicar "gasto operativo alto".';
  }

  return out;
}

export function prepareToolPayloadForLlm(tool: AiToolName, data: unknown): Record<string, unknown> {
  const base = enrichToolPayloadForLlm(tool, data);
  if (base.empty === true) return base;
  return compactPayload(tool, base);
}
