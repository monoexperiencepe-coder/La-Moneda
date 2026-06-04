/**
 * Matching del pre-router (sin Supabase) — usable en scripts de auditoría.
 */
import type { AiToolName } from '../ai/types';
import type { CopilotIntentId } from './copilotIntent';
import {
  EMPTY_COPILOT_CONTEXT,
  extractGastoFiltroTexto,
  isContextFollowUpQuery,
  resolveVehicleNumero,
  type CopilotConversationContext,
} from './copilotConversationContext';
import {
  enrichConversationContextWithFollowUp,
  getCopilotFollowUpContext,
  resolveFollowUpPreRoute,
} from './copilotFollowUpContext';
import { normalizeCopilotQuery, recordCopilotRouter } from './copilotExecutionAudit';

export type CopilotPreRouteMatch = {
  matchedIntent: CopilotIntentId;
  tool: AiToolName;
  args?: Record<string, unknown>;
  reason: string;
};

export type MatchCopilotPreRouteOptions = {
  /** Omite logs [copilot:router] (p. ej. batch QA). */
  silent?: boolean;
};

function normalizeQuery(query: string): string {
  return normalizeCopilotQuery(query);
}

function extractNumeroFromQuery(q: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = q.match(re);
    if (!m) continue;
    const n = Number(m[m.length - 1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

const VEHICULO_NUMERO_PATTERNS = [
  /vehiculo\s+(?:numero|n[uú]mero|#)?\s*(\d+)/,
  /carro\s+(?:numero|n[uú]mero|#)?\s*(\d+)/,
  /unidad\s+(?:numero|n[uú]mero|#)?\s*(\d+)/,
  /el\s+vehiculo\s+(?:numero|n[uú]mero)\s+(\d+)/,
  /vehiculo\s+#\s*(\d+)/,
];

function extractVehiculoNumero(q: string): number | null {
  return extractNumeroFromQuery(q, VEHICULO_NUMERO_PATTERNS);
}

function hasVehiculoKeyword(q: string): boolean {
  return /\b(vehiculo|carro|unidad)\b/.test(q);
}

function matchVehiculoFinanciero(
  q: string,
  ctx: CopilotConversationContext,
): CopilotPreRouteMatch | null {
  const numero = resolveVehicleNumero(q, ctx);
  const vehiculoExplicito = hasVehiculoKeyword(q) && extractVehiculoNumero(q) != null;
  const contextoVehiculo = numero != null && isContextFollowUpQuery(q);

  if (numero == null) return null;
  if (!vehiculoExplicito && !contextoVehiculo && !/\b(vehiculo|carro|unidad)\b/.test(q)) {
    if (!isContextFollowUpQuery(q)) return null;
  }

  if (/\b(por\s*qu[eé]|porque|explicar|desglosa|desglose)\b/.test(q) && /\b(utilidad|rentabilidad)\b/.test(q)) {
    return route('utilidad_vehiculo_detalle', 'getUtilidadVehiculoDetalle', 'followup: explicar utilidad vehiculo', { numero });
  }

  if (
    /\b(categor[ií]a|subtipos?|motor|frenos|llantas|electricidad|mantenimiento|desglose)\b/.test(q) ||
    (/\bgastos?\b/.test(q) && (ctx.lastTopic === 'utilidad' || ctx.lastTopic === 'gastos')) ||
    /\bcuantos?\s+subtipos?\b/.test(q) ||
    /\b(esos|estos)\s+gastos?\b/.test(q)
  ) {
    const filtro = extractGastoFiltroTexto(q);
    return route(
      'gastos_vehiculo_desglose',
      'getGastosVehiculoDesglose',
      filtro ? `followup: desglose gastos filtro=${filtro}` : 'followup: desglose gastos con contexto',
      filtro ? { numero, filtroTexto: filtro } : { numero },
    );
  }

  if (!hasVehiculoKeyword(q) && !contextoVehiculo) return null;

  if (/\b(utilidad|rentabilidad|ganancia)\b/.test(q) && !/\b(por\s*qu[eé]|porque|explicar)\b/.test(q)) {
    return route('utilidad_vehiculo', 'getUtilidadVehiculo', 'finanzas: utilidad/rentabilidad + vehiculo numero', { numero });
  }
  if (/\bingresos?\b/.test(q)) {
    return route('ingresos_vehiculo', 'getIngresosVehiculo', 'finanzas: ingresos + vehiculo numero', { numero });
  }
  if (/\bgastos?\b/.test(q) && !/\b(categor|subtipo|motor|frenos|desglose)\b/.test(q)) {
    return route('gastos_vehiculo', 'getGastosVehiculo', 'finanzas: gastos + vehiculo numero', { numero });
  }
  return null;
}

function matchFlotaAsignacion(q: string): CopilotPreRouteMatch | null {
  if (
    /cuantos.*vehiculos.*(tienen|con)\s+conductor|vehiculos.*con\s+conductor|cuantos.*con\s+conductor.*asign|vehiculos.*tienen\s+chofer/.test(
      q,
    )
  ) {
    return route(
      'flota_vehiculos_con_conductor',
      'getFlotaResumen',
      'vehiculos activos con conductor asignado',
    );
  }
  if (
    (/sin\s+(conductor|asignar)|sin\s+asignar|vehiculos?\s+libres?|estan?\s+sin\s+asignar|disponibles/.test(
      q,
    ) &&
      /\b(vehiculo|vehiculos|flota|carro|unidad)\b/.test(q)) ||
    /cuantos.*vehiculos.*sin\s+conductor/.test(q)
  ) {
    return route('flota_sin_conductor', 'getFlotaResumen', 'vehiculos activos sin conductor');
  }
  return null;
}

function matchDocumentosVehiculo(q: string): CopilotPreRouteMatch | null {
  if (!/\b(documentos?|documentacion)\b/.test(q)) return null;
  if (!hasVehiculoKeyword(q)) return null;
  const numero = extractVehiculoNumero(q);
  if (numero == null) return null;
  return route('documentos_vehiculo', 'getDocumentosVehiculo', 'documentos + vehiculo numero (antes de getVehiculoPorNumero)', { numero });
}

function matchDocumentosPorRango(q: string): CopilotPreRouteMatch | null {
  if (
    /\bvencen?\b.*\b(semana|7\s*d[ií]as)\b/.test(q) ||
    /\bcuantos?\s+vencen?\b.*\b(semana|proxim)/.test(q) ||
    /\besta\s+semana\b.*\bvenc/.test(q)
  ) {
    return route('documentos_por_rango', 'getDocumentosPorRango', 'vencimientos proximos 7 dias', { dias: 7 });
  }
  return null;
}

function matchTopUtilidad(q: string): CopilotPreRouteMatch | null {
  if (
    /\b(top|mejores|ranking|10)\b.*\b(utilidad|rentabilidad)\b/.test(q) ||
    /\b(utilidad|rentabilidad)\b.*\b(historic|top|mejores|10)\b/.test(q) ||
    /\bdame\s+los\s+10\s+vehiculos/.test(q)
  ) {
    return route('utilidad_ranking', 'getTopVehiculosUtilidad', 'ranking top utilidad historica', {
      periodo: 'historico',
      limit: 10,
    });
  }
  return null;
}

function route(
  matchedIntent: CopilotIntentId,
  tool: AiToolName,
  reason: string,
  args?: Record<string, unknown>,
): CopilotPreRouteMatch {
  return { matchedIntent, tool, args, reason };
}

function logRouter(query: string, match: CopilotPreRouteMatch | null, silent: boolean): void {
  if (silent) return;
  recordCopilotRouter({
    query,
    normalized: normalizeQuery(query),
    matchedIntent: match?.matchedIntent ?? null,
    selectedTool: match?.tool ?? null,
    args: match?.args ?? {},
    reason: match?.reason ?? (match ? null : 'no_match_pre_router'),
  });
}

function matchDocumentosResumen(q: string): CopilotPreRouteMatch | null {
  if (/pendiente\s*revision|pendientes\s*revision|clasificar\s*gasto/.test(q)) return null;
  if (
    /cuantos?\s+documentos|total\s+documentos|resumen.*document|estado.*documentacion|documentacion.*resumen|documentos?\s+(vencidos|por\s+vencer|vigentes)\s*(hay|tenemos|tiene)/.test(
      q,
    )
  ) {
    return route('documentos_resumen', 'getDocumentosResumen', 'resumen inventario documentacion');
  }
  if (/\bdocumentacion\b/.test(q) && /\b(cuantos|total|resumen|estado)\b/.test(q)) {
    return route('documentos_resumen', 'getDocumentosResumen', 'resumen documentacion modulo');
  }
  return null;
}

function matchPendientesResumen(q: string): CopilotPreRouteMatch | null {
  if (/pendiente\s*revision|pendientes\s*de\s*revision|gastos?\s*pendiente/.test(q)) return null;
  if (
    /cuantos?\s+pendientes|total\s+pendientes|pendientes\s+del\s+equipo|pendientes\s+operativos|pendientes\s+abiertos|que\s+pendientes|resumen\s+pendientes/.test(
      q,
    )
  ) {
    return route('pendientes_resumen', 'getPendientesResumen', 'pendientes operativos equipo');
  }
  return null;
}

function extractAlertasDetalleArgs(q: string): {
  tipo?: string;
  dias?: number;
  limit?: number;
} {
  const args: { tipo?: string; dias?: number; limit?: number } = {};

  if (/documentos?\s+vencidos|vencidos.*document|\bvencidos?\b.*\b(document|doc)/.test(q)) {
    args.tipo = 'documentos_vencidos';
  } else if (/\bpor\s+vencer\b/.test(q)) {
    args.tipo = 'documentos_por_vencer';
  } else if (/sin\s+ingresos?|vehiculos?\s+sin\s+ingreso/.test(q)) {
    args.tipo = 'sin_ingresos';
  } else if (/mantenimientos?|km\s+sin\s+mant/.test(q)) {
    args.tipo = 'mantenimientos';
  }

  const limitMatch =
    q.match(/\bcuales?\s+son\s+los?\s+(\d{1,3})\s+por\s+vencer\b/) ||
    q.match(/\blos?\s+(\d{1,3})\s+por\s+vencer\b/);
  if (limitMatch?.[1]) args.limit = Number(limitMatch[1]);

  const diasMatch =
    q.match(/\b(?:proximos?|pr[oó]ximos?)\s+(\d{1,3})\s+d[ií]as\b/) ||
    q.match(/\ben\s+(\d{1,3})\s+d[ií]as\b/);
  if (diasMatch?.[1]) args.dias = Number(diasMatch[1]);

  return args;
}

function matchAlertasDetalle(q: string): CopilotPreRouteMatch | null {
  if (
    /cuantos|cuantas|total\s+alertas|alertas\s+activas|que\s+hacer\s+hoy/.test(q) &&
    !/detalle|listar|lista|muestr|cuales|que\s+vehiculos|por\s+vencer/.test(q)
  ) {
    return null;
  }

  const { tipo, dias, limit } = extractAlertasDetalleArgs(q);

  const isListIntent =
    /detalle.*alertas|listar.*alertas|lista.*alertas|muestr.*alertas|muestr.*documentos?|detalle.*vencid|listar.*vencid|que\s+vehiculos.*sin\s+ingreso|cuales?\s+son\s+los?|\bpor\s+vencer\b|\bvencidos?\b/.test(
      q,
    );

  if (!isListIntent && !tipo) return null;

  const args: Record<string, unknown> = {};
  if (tipo) args.tipo = tipo;
  if (dias != null) args.dias = dias;
  if (limit != null) args.limit = limit;

  return route(
    'alertas_detalle',
    'getDetalleAlertas',
    tipo ? `detalle alertas tipo=${tipo}` : 'detalle alertas listado',
    Object.keys(args).length > 0 ? args : {},
  );
}

/** Patrones hardcoded — orden importa. */
export function matchCopilotPreRoute(
  query: string,
  conversationContext: CopilotConversationContext = EMPTY_COPILOT_CONTEXT,
  options?: MatchCopilotPreRouteOptions,
): CopilotPreRouteMatch | null {
  const silent = options?.silent ?? false;
  const q = normalizeQuery(query);
  const followUp = getCopilotFollowUpContext();
  const ctx = enrichConversationContextWithFollowUp(conversationContext, followUp);
  let match: CopilotPreRouteMatch | null = null;

  match = matchTopUtilidad(q);
  if (match) {
    logRouter(query, match, silent);
    return match;
  }

  const followUpMatch = resolveFollowUpPreRoute(query, followUp);
  if (followUpMatch) {
    match = route(
      followUpMatch.matchedIntent,
      followUpMatch.tool,
      followUpMatch.reason,
      followUpMatch.args,
    );
    logRouter(query, match, silent);
    return match;
  }

  match = matchDocumentosVehiculo(q);
  if (match) {
    logRouter(query, match, silent);
    return match;
  }

  match = matchDocumentosPorRango(q);
  if (match) {
    logRouter(query, match, silent);
    return match;
  }

  match = matchFlotaAsignacion(q);
  if (match) {
    logRouter(query, match, silent);
    return match;
  }

  match = matchVehiculoFinanciero(q, ctx);
  if (match) {
    logRouter(query, match, silent);
    return match;
  }

  match = matchDocumentosResumen(q);
  if (match) {
    logRouter(query, match, silent);
    return match;
  }

  match = matchPendientesResumen(q);
  if (match) {
    logRouter(query, match, silent);
    return match;
  }

  match = matchAlertasDetalle(q);
  if (match) {
    logRouter(query, match, silent);
    return match;
  }

  const conductorNumero = extractNumeroFromQuery(q, [
    /conductor\s+(?:numero|n[uú]mero|#)?\s*(\d+)/,
    /chofer\s+(?:numero|n[uú]mero|#)?\s*(\d+)/,
    /nombre\s+del\s+conductor\s+(?:numero|n[uú]mero)\s+(\d+)/,
    /conductor\s+#\s*(\d+)/,
  ]);
  if (conductorNumero != null) {
    match = route('conductor_por_numero', 'getConductorPorNumero', 'conductor por numero listado', {
      numero: conductorNumero,
    });
    logRouter(query, match, silent);
    return match;
  }

  if (
    /cuantos.*conductores|cuantas.*conductores|cuantos.*choferes|cuantas.*choferes|conductores.*registrados|choferes.*registrados/.test(
      q,
    )
  ) {
    match = route('conductores_conteo', 'getConteoConductores', 'conteo conductores');
    logRouter(query, match, silent);
    return match;
  }

  if (
    /cuantos.*vehiculos|cuantas.*vehiculos|cuantos.*carros|cuantas.*carros|tamano.*flota|tamanio.*flota/.test(
      q,
    )
  ) {
    match = route('flota_conteo', 'getFlotaResumen', 'conteo flota vehiculos');
    logRouter(query, match, silent);
    return match;
  }

  if (
    /\bflota\b/.test(q) &&
    /\b(cuantos|cuantas|total|tamano|tamanio|tiene|hay|registrad)\b/.test(q)
  ) {
    match = route('flota_conteo', 'getFlotaResumen', 'conteo flota vehiculos');
    logRouter(query, match, silent);
    return match;
  }

  if (
    /alertas|que hacer hoy|cuantas alertas|cuantos alertas|alertas automaticas|alertas activas/.test(
      q,
    )
  ) {
    match = route('alertas_operativas', 'getAlertasAutomaticas', 'resumen alertas que hacer hoy');
    logRouter(query, match, silent);
    return match;
  }

  const vehiculoNumero = extractVehiculoNumero(q);
  if (
    vehiculoNumero != null &&
    hasVehiculoKeyword(q) &&
    !/\b(documentos?|documentacion)\b/.test(q)
  ) {
    match = route('vehiculo_por_numero', 'getVehiculoPorNumero', 'vehiculo numero sin finanzas/documentos', {
      numero: vehiculoNumero,
    });
    logRouter(query, match, silent);
    return match;
  }

  logRouter(query, null, silent);
  return null;
}
