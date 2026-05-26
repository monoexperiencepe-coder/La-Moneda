/**
 * Extrae un año explícito del mensaje del usuario (p.ej. "2025", "del 2024", "en 2026").
 * Retorna el año como número si se encuentra, o null si no.
 */

import { normalizePeriodParams } from '../modules/ai/dateRange';

const YEAR_MIN = 2020;
const YEAR_MAX = 2035;

export function extractExplicitYearFromMessage(message: string): number | null {
  if (!message?.trim()) return null;
  const matches = message.match(/\b(20[2-9]\d)\b/g);
  if (!matches || matches.length === 0) return null;
  const year = Number(matches[matches.length - 1]);
  if (year >= YEAR_MIN && year <= YEAR_MAX) return year;
  return null;
}

/** Alias semántico para prompts y resolución de periodo. */
export const parseYearFromPrompt = extractExplicitYearFromMessage;

/**
 * Lista de tools financieras a las que se debe inyectar el año
 * si el usuario lo mencionó explícitamente.
 */
const YEAR_INJECTABLE_TOOLS = new Set([
  'getResumenFinancieroPeriodo',
  'getGastosPeriodo',
  'getGastosPorCategoria',
  'getIngresosPeriodo',
  'getVehiculosConMasGasto',
  'getGastosGlobales',
  'getMovimientosRecientes',
  'getHistorialVehiculo',
  'getInversionesNoVehiculares',
]);

/**
 * Normaliza args de periodo e inyecta el año del usuario cuando corresponde.
 * El año explícito del mensaje tiene prioridad sobre periodo activo o año del modelo.
 */
export function injectExplicitYearIfMissing(
  toolName: string,
  args: Record<string, unknown>,
  explicitYear: number | null,
): Record<string, unknown> {
  if (!YEAR_INJECTABLE_TOOLS.has(toolName)) {
    return normalizePeriodParams(args);
  }
  return normalizePeriodParams(args, explicitYear);
}
