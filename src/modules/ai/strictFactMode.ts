import { COPILOT_STRICT_FACT_MODE } from '../../config/copilotAudit';
import type { AiToolName } from './types';

export function isCopilotStrictFactMode(): boolean {
  return COPILOT_STRICT_FACT_MODE;
}

export function strictFactPayloadForToolError(
  tool: AiToolName,
  error: string,
  denied?: boolean,
): Record<string, unknown> {
  return {
    ok: false,
    strict_fact_mode: true,
    error,
    denied: denied ?? false,
    herramienta: tool,
    cantidad_obtenida: null,
    instruccion:
      'No respondas "0" ni "no existe". Di: "No tengo una herramienta conectada para consultar [tema] todavía." o "No pude consultar esta información." Indica herramienta, error y que cantidad_obtenida es null.',
  };
}

export function strictFactPayloadEnrichment(
  tool: AiToolName,
  base: Record<string, unknown>,
): Record<string, unknown> {
  if (!COPILOT_STRICT_FACT_MODE) return base;

  const rows =
    typeof base.count === 'number'
      ? base.count
      : typeof base.totalVehiculos === 'number'
        ? base.totalVehiculos
        : typeof base.totalConductores === 'number'
          ? base.totalConductores
          : typeof base.totalAlertasAutomaticas === 'number'
            ? base.totalAlertasAutomaticas
            : typeof base.total === 'number'
              ? base.total
              : Array.isArray(base.ranking)
                ? base.ranking.length
                : null;

  if (base.empty === true || base.ok === false) {
    return {
      ...base,
      strict_fact_mode: true,
      herramienta: tool,
      cantidad_obtenida: rows,
      instruccion_estricta:
        'PROHIBIDO responder 0 o "no hay datos" si empty o error. Usa: "No pude consultar esta información" + herramienta + error/mensaje_sin_datos + cantidad_obtenida.',
    };
  }

  return {
    ...base,
    strict_fact_mode: true,
    herramienta: tool,
    cantidad_obtenida: rows,
    fuente_verificada: true,
  };
}

export function buildStrictFactSystemAddon(): string {
  if (!COPILOT_STRICT_FACT_MODE) return '';
  return `
MODO ESTRICTO DE HECHOS (STRICT_FACT_MODE=true):
- Nunca respondas "0" si la consulta falló, fue denegada o no ejecutaste herramienta.
- Nunca asumas que no existe histórico sin datos de tool.
- Si ok=true y count/rows>0: usa totales del payload; PROHIBIDO decir que no hay datos.
- Si no hay herramienta para el tema: "No tengo una herramienta conectada para consultar [tema] todavía." (nunca "0").
- Si falla la herramienta: "No pude consultar esta información." + herramienta + error + cantidad_obtenida.
- Solo cifras que vengan del resultado de herramienta en este turno.
`;
}
