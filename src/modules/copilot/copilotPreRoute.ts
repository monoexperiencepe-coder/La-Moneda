/**
 * Pre-router determinístico — consultas básicas de flota/conductores/alertas/finanzas por vehículo
 * sin depender del planner del LLM.
 */
import { canExecuteAiTool } from '../ai/permissions';
import { executeAiTool, type AiToolContext } from '../ai/tools/runner';
import type { AiStructuredResponse, AiSuggestedAction, AiToolName } from '../ai/types';
import type { PermissionUser } from '../../utils/permissions';
import { canViewSection } from '../../utils/permissions';
import type { CopilotActionId, CopilotNavigateParams } from './copilotActions';
import type { CopilotIntentId } from './copilotIntent';
import { loadingLabelForTool } from '../ai/optimizeToolPlan';
import { formatCurrencyByCode } from '../ai/dateRange';
import {
  updateCopilotContextFromTool,
  deriveCopilotContextFromHistory,
  EMPTY_COPILOT_CONTEXT,
  type CopilotConversationContext,
} from './copilotConversationContext';
import {
  logCopilotQuery,
  normalizeCopilotQuery,
  setCopilotExecutionContext,
} from './copilotExecutionAudit';
import {
  matchCopilotPreRoute,
} from './copilotPreRouteMatch';
import { updateCopilotFollowUpFromTool } from './copilotFollowUpContext';

export { updateCopilotContextFromTool, deriveCopilotContextFromHistory } from './copilotConversationContext';
export { normalizeCopilotQuery };
export { matchCopilotPreRoute, type CopilotPreRouteMatch } from './copilotPreRouteMatch';

export type CopilotPreRouteResult = {
  matchedIntent: CopilotIntentId;
  tool: AiToolName;
  summary: string;
  structured: AiStructuredResponse;
  toolsUsed: AiToolName[];
  toolData: unknown;
  durationMs: number;
};

function fmtPen(n: number): string {
  return formatCurrencyByCode(n, 'PEN');
}

function sanitizeCountPayload(
  intent: CopilotIntentId,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  if (intent === 'flota_conteo' || intent === 'flota_vehiculos_con_conductor' || intent === 'flota_sin_conductor') {
    return {
      _tipo_metrica: 'conteo_flota',
      totalVehiculos: raw.totalVehiculos ?? raw.total,
      activos: raw.activos,
      inactivos: raw.inactivos,
      disponibles: raw.disponibles,
      sinConductor: raw.sinConductor,
      vehiculosConConductor: raw.vehiculosConConductor,
      conductoresAsignados: raw.conductoresAsignados,
      fuente: raw.fuente,
    };
  }
  if (intent === 'conductores_conteo') {
    return {
      _tipo_metrica: 'conteo_conductores',
      totalConductores: raw.totalConductores,
      activos: raw.activos,
      inactivos: raw.inactivos,
      conductoresAsignados: raw.conductoresAsignados,
      conductoresSinVehiculo: raw.conductoresSinVehiculo,
      vehiculosSinConductor: raw.vehiculosSinConductor,
      fuente: raw.fuente,
    };
  }
  if (intent === 'alertas_operativas') {
    return {
      _tipo_metrica: 'conteo_alertas',
      totalAlertasAutomaticas: raw.totalAlertasAutomaticas ?? raw.count,
      documentosVencidos: raw.documentosVencidos,
      documentosPorVencer: raw.documentosPorVencer,
      sinIngresosRecientes: raw.sinIngresosRecientes,
      kmSinMantenimiento: raw.kmSinMantenimiento,
      pendientesAltaPrioridad: raw.pendientesAltaPrioridad,
      fuente: raw.fuente,
    };
  }
  if (intent === 'documentos_resumen') {
    return {
      _tipo_metrica: 'documentos_resumen',
      totalDocumentos: raw.totalDocumentos,
      vencidos: raw.vencidos,
      porVencer: raw.porVencer,
      vigentes: raw.vigentes,
      fuente: raw.fuente,
    };
  }
  if (intent === 'pendientes_resumen') {
    return {
      _tipo_metrica: 'pendientes_resumen',
      totalPendientes: raw.totalPendientes,
      activos: raw.activos,
      abiertos: raw.abiertos,
      enCurso: raw.enCurso,
      alta: raw.alta,
      fuente: raw.fuente,
    };
  }
  if (intent === 'utilidad_vehiculo') {
    return {
      _tipo_metrica: 'utilidad_vehiculo',
      numeroUnidad: raw.numeroUnidad,
      ingresos: raw.ingresos,
      gastos: raw.gastos,
      utilidad: raw.utilidad,
      ingresos_total: raw.ingresos_total ?? raw.ingresos,
      gastos_total: raw.gastos_total ?? raw.gastos,
      encontrado: raw.encontrado,
      fuente: raw.fuente,
    };
  }
  return raw;
}

function formatFlotaSummary(d: Record<string, unknown>): string {
  const total = Number(d.totalVehiculos ?? 0);
  const activos = Number(d.activos ?? 0);
  const inactivos = Number(d.inactivos ?? 0);
  const conConductor = Number(
    d.vehiculosConConductor ?? Math.max(0, activos - Number(d.sinConductor ?? 0)),
  );
  const sinConductor = Number(d.sinConductor ?? 0);
  return `La flota tiene ${total} vehículo${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}. ${activos} activo${activos !== 1 ? 's' : ''}, ${inactivos} inactivo${inactivos !== 1 ? 's' : ''}. ${conConductor} con conductor asignado${sinConductor > 0 ? ` y ${sinConductor} sin conductor` : ''}.`;
}

function formatFlotaConConductorSummary(d: Record<string, unknown>): string {
  const conConductor = Number(
    d.vehiculosConConductor ?? Math.max(0, Number(d.activos ?? 0) - Number(d.sinConductor ?? 0)),
  );
  const total = Number(d.totalVehiculos ?? 0);
  return `${conConductor} vehículo${conConductor !== 1 ? 's' : ''} activo${conConductor !== 1 ? 's' : ''} tienen conductor asignado (de ${total} registrado${total !== 1 ? 's' : ''} en flota).`;
}

function formatFlotaSinConductorSummary(d: Record<string, unknown>): string {
  const sinConductor = Number(d.sinConductor ?? d.disponibles ?? 0);
  if (sinConductor === 0) {
    return 'No hay vehículos activos sin conductor asignado en este momento.';
  }
  return `${sinConductor} vehículo${sinConductor !== 1 ? 's' : ''} activo${sinConductor !== 1 ? 's' : ''} está${sinConductor === 1 ? '' : 'n'} sin conductor asignado (libre${sinConductor !== 1 ? 's' : ''}).`;
}

function formatConductoresSummary(d: Record<string, unknown>): string {
  const total = Number(d.totalConductores ?? 0);
  const asignados = Number(d.conductoresAsignados ?? NaN);
  const sinVehiculo = Number(d.vehiculosSinConductor ?? NaN);
  if (Number.isFinite(asignados)) {
    let s = `Hay ${total} conductor${total !== 1 ? 'es' : ''} registrado${total !== 1 ? 's' : ''}. Actualmente ${asignados} están asignados a vehículos`;
    if (Number.isFinite(sinVehiculo) && sinVehiculo > 0) {
      s += ` y ${sinVehiculo} vehículo${sinVehiculo !== 1 ? 's' : ''} está${sinVehiculo === 1 ? '' : 'n'} libre`;
    }
    return `${s}.`;
  }
  const activos = Number(d.activos ?? 0);
  const inactivos = Number(d.inactivos ?? 0);
  return `Hay ${total} conductor${total !== 1 ? 'es' : ''} registrado${total !== 1 ? 's' : ''}. ${activos} vigente${activos !== 1 ? 's' : ''}, ${inactivos} no vigente${inactivos !== 1 ? 's' : ''}.`;
}

function formatAlertasSummary(d: Record<string, unknown>): string {
  const total = Number(d.totalAlertasAutomaticas ?? 0);
  const nota =
    'Alertas = criterios de Qué hacer hoy (vencidos + por vencer + sin ingreso + km mant.). Documentación = inventario completo.';
  if (total === 0) {
    return `No hay alertas automáticas activas en este momento. ${nota}`;
  }
  const parts: string[] = [];
  const venc = Number(d.documentosVencidos ?? 0);
  const porVencer = Number(d.documentosPorVencer ?? 0);
  const sinIng = Number(d.sinIngresosRecientes ?? 0);
  const km = Number(d.kmSinMantenimiento ?? 0);
  if (venc > 0) parts.push(`${venc} documento${venc !== 1 ? 's' : ''} vencido${venc !== 1 ? 's' : ''}`);
  if (porVencer > 0) parts.push(`${porVencer} por vencer`);
  if (sinIng > 0) parts.push(`${sinIng} sin ingresos recientes`);
  if (km > 0) parts.push(`${km} con km sin mantenimiento`);
  const detalle = parts.length ? `: ${parts.join(', ')}.` : '.';
  return `Hay ${total} alerta${total !== 1 ? 's' : ''} automática${total !== 1 ? 's' : ''} activa${total !== 1 ? 's' : ''}${detalle} ${nota}`;
}

function formatDocumentosResumenSummary(d: Record<string, unknown>): string {
  const total = Number(d.totalDocumentos ?? 0);
  const vencidos = Number(d.vencidos ?? 0);
  const porVencer = Number(d.porVencer ?? 0);
  const vigentes = Number(d.vigentes ?? 0);
  const nota =
    'Documentación usa inventario completo. Alertas usa criterios de Qué hacer hoy (no es el mismo total).';
  return `Hay ${total} documento${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}: ${vencidos} vencido${vencidos !== 1 ? 's' : ''}, ${porVencer} por vencer, ${vigentes} vigente${vigentes !== 1 ? 's' : ''}. ${nota}`;
}

function formatPendientesResumenSummary(d: Record<string, unknown>): string {
  const total = Number(d.totalPendientes ?? 0);
  const activos = Number(d.activos ?? 0);
  const alta = Number(d.alta ?? 0);
  return `Hay ${total} pendiente${total !== 1 ? 's' : ''} operativo${total !== 1 ? 's' : ''}. ${activos} activo${activos !== 1 ? 's' : ''}${alta > 0 ? `, ${alta} de alta prioridad` : ''}.`;
}

function formatAlertasDetalleSummary(d: Record<string, unknown>): string {
  const count = Number(d.count ?? 0);
  const tipo = String(d.tipo ?? 'todos');
  if (count === 0) return 'No hay alertas en esa categoría.';
  const items = Array.isArray(d.items) ? d.items : [];
  const preview = items
    .slice(0, 3)
    .map((it) => {
      const row = it as Record<string, unknown>;
      const vehiculo = row.vehiculo ?? row.numeroUnidad ?? row.vehicleId;
      const placa = row.placa ?? '';
      const motivo = row.motivo ?? row.detail ?? '';
      const dias = row.diasRestantes;
      const diasTxt =
        dias != null && Number.isFinite(Number(dias))
          ? Number(dias) < 0
            ? ` (${Math.abs(Number(dias))} d vencido)`
            : ` (${dias} d)`
          : '';
      return `#${vehiculo} ${placa} — ${motivo}${diasTxt}`.trim();
    })
    .join('; ');
  const diasHorizonte = d.dias != null ? `, horizonte ${d.dias} días` : '';
  return `Encontré ${count} alerta${count !== 1 ? 's' : ''} (${tipo.replace(/_/g, ' ')}${diasHorizonte}).${preview ? ` ${preview}.` : ''}`;
}

function formatUtilidadVehiculoSummary(d: Record<string, unknown>): string {
  const numero = Number(d.numeroUnidad ?? 0);
  if (d.encontrado !== true) {
    return `No encontré el vehículo #${numero} para calcular utilidad.`;
  }
  const ing = Number(d.ingresos ?? d.ingresos_total ?? 0);
  const gas = Number(d.gastos ?? d.gastos_total ?? 0);
  const util = Number(d.utilidad ?? ing - gas);
  return `Vehículo #${numero}: Ingresos ${fmtPen(ing)}, Gastos ${fmtPen(gas)}, Utilidad ${fmtPen(util)}.`;
}

function formatIngresosVehiculoSummary(d: Record<string, unknown>): string {
  const numero = Number(d.numeroUnidad ?? 0);
  if (d.encontrado !== true) {
    return `No encontré el vehículo #${numero}.`;
  }
  const ing = Number(d.ingresos ?? d.ingresos_total ?? 0);
  return `Ingresos del vehículo #${numero}: ${fmtPen(ing)}.`;
}

function formatGastosVehiculoSummary(d: Record<string, unknown>): string {
  const numero = Number(d.numeroUnidad ?? 0);
  if (d.encontrado !== true) {
    return `No encontré el vehículo #${numero}.`;
  }
  const gas = Number(d.gastos ?? d.gastos_total ?? 0);
  return `Gastos operativos del vehículo #${numero}: ${fmtPen(gas)}.`;
}

function formatDocumentosPorRangoSummary(d: Record<string, unknown>): string {
  const cantidad = Number(d.cantidad ?? d.count ?? 0);
  const dias = Number(d.dias ?? 7);
  const lista = Array.isArray(d.listaBreve) ? (d.listaBreve as string[]) : [];
  const preview = lista.slice(0, 5).join('; ');
  if (cantidad === 0) return `No hay documentos que venzan en los próximos ${dias} días.`;
  return `${cantidad} documento${cantidad !== 1 ? 's' : ''} vencen en los próximos ${dias} días.${preview ? ` ${preview}.` : ''}`;
}

function formatDocumentosVehiculoSummary(d: Record<string, unknown>): string {
  const numero = Number(d.numeroUnidad ?? 0);
  if (d.encontrado !== true) return `No encontré el vehículo #${numero}.`;
  const placa = String(d.placa ?? '—');
  const falt = Number(d.countFaltantes ?? 0);
  const venc = Number(d.countVencidos ?? 0);
  const pv = Number(d.countPorVencer ?? 0);
  const vig = Number(d.countVigentes ?? 0);
  return `Vehículo #${numero} (${placa}): ${falt} documento${falt !== 1 ? 's' : ''} faltante${falt !== 1 ? 's' : ''}, ${venc} vencido${venc !== 1 ? 's' : ''}, ${pv} por vencer, ${vig} vigente${vig !== 1 ? 's' : ''}.`;
}

function formatTopUtilidadSummary(d: Record<string, unknown>): string {
  const lineas = Array.isArray(d.lineas_ranking_compact)
    ? (d.lineas_ranking_compact as string[])
    : Array.isArray(d.lineas_ranking)
      ? (d.lineas_ranking as string[])
      : [];
  if (!lineas.length) return 'No hay ranking de utilidad disponible.';
  return `Top ${lineas.length} utilidad histórica:\n${lineas.join('\n')}`;
}

function formatUtilidadVehiculoDetalleSummary(d: Record<string, unknown>): string {
  const numero = Number(d.numeroUnidad ?? 0);
  if (d.encontrado !== true) return `No encontré el vehículo #${numero}.`;
  const ing = Number(d.ingresos ?? 0);
  const gas = Number(d.gastos ?? 0);
  const util = Number(d.utilidad ?? 0);
  const conclusion = String(d.conclusion ?? '');
  const porSubtipo = Array.isArray(d.porSubtipo) ? (d.porSubtipo as { label: string; total: number }[]) : [];
  const topSub = porSubtipo
    .slice(0, 3)
    .map((r) => `${r.label} ${fmtPen(r.total)}`)
    .join(', ');
  return `Vehículo #${numero}: Ingresos ${fmtPen(ing)}, Gastos ${fmtPen(gas)}, Utilidad ${fmtPen(util)}.${topSub ? ` Principales rubros: ${topSub}.` : ''} ${conclusion}`.trim();
}

function formatGastosVehiculoDesgloseSummary(d: Record<string, unknown>): string {
  const numero = Number(d.numeroUnidad ?? 0);
  if (d.encontrado !== true) return `No encontré el vehículo #${numero}.`;
  const total = Number(d.total ?? 0);
  const filtro = d.filtroTexto ? ` (filtro: ${d.filtroTexto})` : '';
  const porSubtipo = Array.isArray(d.porSubtipo) ? (d.porSubtipo as { label: string; total: number; count: number }[]) : [];
  const nSub = Number(d.cantidadSubtipos ?? porSubtipo.length);
  if (porSubtipo.length === 0) {
    return `Vehículo #${numero}${filtro}: sin gastos operativos registrados en utilidad real.`;
  }
  const lista = porSubtipo
    .slice(0, 6)
    .map((r) => `${r.label} ${fmtPen(r.total)} (${r.count})`)
    .join(', ');
  return `Vehículo #${numero}${filtro}: total ${fmtPen(total)} en ${nSub} subtipo${nSub !== 1 ? 's' : ''}. ${lista}.`;
}

function formatVehiculoPorNumeroSummary(d: Record<string, unknown>): string {
  const numero = Number(d.numeroUnidad ?? d.vehicleId ?? 0);
  if (d.encontrado !== true) {
    return `No encontré el vehículo #${numero} en la flota.`;
  }
  const placa = String(d.placa ?? '—');
  const conductor = d.conductorAsignado as { nombre?: string } | null;
  if (conductor?.nombre) {
    return `El vehículo #${numero} tiene placa ${placa} y está asignado a ${conductor.nombre}.`;
  }
  return `El vehículo #${numero} tiene placa ${placa} y no tiene conductor asignado.`;
}

function formatConductorPorNumeroSummary(d: Record<string, unknown>): string {
  const numero = Number(d.numero ?? 0);
  if (d.encontrado !== true) {
    return `No encontré el conductor #${numero} en el listado.`;
  }
  const nombre = String(d.nombre ?? '—');
  const veh = d.vehiculoAsignado as { numeroUnidad?: number; placa?: string } | null;
  if (veh?.placa) {
    return `El conductor #${numero} es ${nombre}. Está asignado al vehículo #${veh.numeroUnidad ?? '—'}, placa ${veh.placa}.`;
  }
  return `El conductor #${numero} es ${nombre}.`;
}

function makeNavigateAction(
  label: string,
  description: string,
  copilotAction: CopilotActionId,
  copilotParams: CopilotNavigateParams = {},
): AiSuggestedAction {
  return {
    label,
    description,
    actionType: 'navigate',
    payload: { copilotAction, copilotParams },
  };
}

export function suggestedActionsForPreRoute(
  intent: CopilotIntentId,
  user: PermissionUser,
  data?: Record<string, unknown>,
): AiSuggestedAction[] {
  const actions: AiSuggestedAction[] = [];

  if (
    (intent === 'flota_conteo' ||
      intent === 'flota_vehiculos_con_conductor' ||
      intent === 'flota_sin_conductor') &&
    canViewSection(user, 'vehiculos')
  ) {
    actions.push(
      makeNavigateAction('Ver flota', 'Abrir inventario de vehículos.', 'navigate_flota_inventario'),
    );
  }

  if (intent === 'conductores_conteo' && canViewSection(user, 'operaciones')) {
    actions.push(
      makeNavigateAction('Ver conductores', 'Abrir listado de conductores.', 'navigate_conductores'),
    );
  }

  if (intent === 'vehiculo_por_numero' && canViewSection(user, 'vehiculos')) {
    const vehicleId = data?.vehicleId;
    if (vehicleId != null) {
      actions.push(
        makeNavigateAction('Ver vehículo', 'Abrir detalle del vehículo.', 'navigate_vehiculo', {
          vehicleId: String(vehicleId),
        }),
      );
    } else {
      actions.push(
        makeNavigateAction('Ver flota', 'Abrir inventario de vehículos.', 'navigate_flota_inventario'),
      );
    }
  }

  if (intent === 'conductor_por_numero' && canViewSection(user, 'operaciones')) {
    actions.push(
      makeNavigateAction('Ver conductores', 'Abrir listado de conductores.', 'navigate_conductores'),
    );
  }

  if (intent === 'alertas_operativas' || intent === 'alertas_detalle') {
    actions.push(
      makeNavigateAction(
        'Ver alertas',
        'Abrir Qué hacer hoy en Inicio.',
        'navigate_home_alertas',
        { view: 'alertas' },
      ),
    );
  }

  if (intent === 'documentos_resumen' && canViewSection(user, 'operaciones')) {
    actions.push(
      makeNavigateAction('Ver documentación', 'Abrir módulo de documentación.', 'navigate_documentacion'),
    );
  }

  if (intent === 'pendientes_resumen' && canViewSection(user, 'operaciones')) {
    actions.push(
      makeNavigateAction('Ver pendientes', 'Abrir pendientes del equipo.', 'navigate_pendientes_equipo'),
    );
  }

  return actions;
}

function buildStructuredFromPreRoute(
  summary: string,
  intent: CopilotIntentId,
  data: Record<string, unknown>,
  user: PermissionUser,
): AiStructuredResponse {
  return {
    summary,
    insights: [],
    data,
    warnings: [],
    suggestedActions: suggestedActionsForPreRoute(intent, user, data),
    confidence: 1,
  };
}

export async function tryCopilotPreRoute(opts: {
  query: string;
  ctx: AiToolContext;
  user: PermissionUser;
  conversationContext?: CopilotConversationContext;
  onStatus?: (label: string) => void;
}): Promise<CopilotPreRouteResult | null> {
  logCopilotQuery(opts.query);
  const conv = opts.conversationContext ?? EMPTY_COPILOT_CONTEXT;
  setCopilotExecutionContext(conv);
  const match = matchCopilotPreRoute(opts.query, conv);
  if (!match) return null;

  console.log(
    '[copilot:pre_route]',
    JSON.stringify({
      query: opts.query,
      matchedIntent: match.matchedIntent,
      tool: match.tool,
      args: match.args ?? {},
    }),
  );

  if (!canExecuteAiTool(opts.user, match.tool)) {
    const summary = 'No tienes permiso para consultar esta información de flota.';
    return {
      matchedIntent: match.matchedIntent,
      tool: match.tool,
      summary,
      structured: {
        summary,
        warnings: [summary],
        suggestedActions: [],
        confidence: null,
      },
      toolsUsed: [],
      toolData: null,
      durationMs: 0,
    };
  }

  opts.onStatus?.(loadingLabelForTool(match.tool, match.args ?? {}));
  const t0 = performance.now();
  const result = await executeAiTool(match.tool, match.args ?? {}, opts.ctx);
  const durationMs = performance.now() - t0;

  console.log(
    '[copilot:pre_route:result]',
    JSON.stringify({
      tool: match.tool,
      ok: result.ok,
      result: result.ok ? result.data : { error: result.error },
    }),
  );

  if (!result.ok) {
    const summary = result.denied
      ? 'No tienes permiso para consultar esta información.'
      : 'No pude consultar esta información en este momento.';
    return {
      matchedIntent: match.matchedIntent,
      tool: match.tool,
      summary,
      structured: {
        summary,
        warnings: [result.error ?? summary],
        suggestedActions: [],
        confidence: null,
      },
      toolsUsed: [],
      toolData: null,
      durationMs,
    };
  }

  if (result.data == null || typeof result.data !== 'object') {
    const summary = 'No pude consultar esta información en este momento.';
    return {
      matchedIntent: match.matchedIntent,
      tool: match.tool,
      summary,
      structured: {
        summary,
        warnings: [summary],
        suggestedActions: [],
        confidence: null,
      },
      toolsUsed: [],
      toolData: null,
      durationMs,
    };
  }

  const raw = result.data as Record<string, unknown>;
  const payload = sanitizeCountPayload(match.matchedIntent, raw);

  let summary: string;
  switch (match.matchedIntent) {
    case 'flota_conteo':
      summary = formatFlotaSummary(payload);
      break;
    case 'flota_vehiculos_con_conductor':
      summary = formatFlotaConConductorSummary(payload);
      break;
    case 'flota_sin_conductor':
      summary = formatFlotaSinConductorSummary(payload);
      break;
    case 'conductores_conteo':
      summary = formatConductoresSummary(payload);
      break;
    case 'alertas_operativas':
      summary = formatAlertasSummary(payload);
      break;
    case 'documentos_resumen':
      summary = formatDocumentosResumenSummary(payload);
      break;
    case 'pendientes_resumen':
      summary = formatPendientesResumenSummary(payload);
      break;
    case 'alertas_detalle':
      summary = formatAlertasDetalleSummary(raw);
      break;
    case 'utilidad_vehiculo':
      summary = formatUtilidadVehiculoSummary(raw);
      break;
    case 'ingresos_vehiculo':
      summary = formatIngresosVehiculoSummary(raw);
      break;
    case 'gastos_vehiculo':
      summary = formatGastosVehiculoSummary(raw);
      break;
    case 'documentos_por_rango':
      summary = formatDocumentosPorRangoSummary(raw);
      break;
    case 'documentos_vehiculo':
      summary = formatDocumentosVehiculoSummary(raw);
      break;
    case 'utilidad_ranking':
      summary = formatTopUtilidadSummary(raw);
      break;
    case 'utilidad_vehiculo_detalle':
      summary = formatUtilidadVehiculoDetalleSummary(raw);
      break;
    case 'gastos_vehiculo_desglose':
      summary = formatGastosVehiculoDesgloseSummary(raw);
      break;
    case 'vehiculo_por_numero':
      summary = formatVehiculoPorNumeroSummary(raw);
      break;
    case 'conductor_por_numero':
      summary = formatConductorPorNumeroSummary(raw);
      break;
    default:
      summary = 'Consulta completada.';
  }

  const structuredData =
    match.matchedIntent === 'vehiculo_por_numero' ||
    match.matchedIntent === 'conductor_por_numero' ||
    match.matchedIntent === 'utilidad_vehiculo' ||
    match.matchedIntent === 'ingresos_vehiculo' ||
    match.matchedIntent === 'gastos_vehiculo' ||
    match.matchedIntent === 'utilidad_vehiculo_detalle' ||
    match.matchedIntent === 'gastos_vehiculo_desglose' ||
    match.matchedIntent === 'utilidad_ranking' ||
    match.matchedIntent === 'documentos_por_rango' ||
    match.matchedIntent === 'documentos_vehiculo' ||
    match.matchedIntent === 'alertas_detalle'
      ? raw
      : payload;

  persistFollowUpFromPreRoute(match.tool, match.args ?? {}, result.data);

  return {
    matchedIntent: match.matchedIntent,
    tool: match.tool,
    summary,
    structured: buildStructuredFromPreRoute(summary, match.matchedIntent, structuredData, opts.user),
    toolsUsed: [match.tool],
    toolData: result.data,
    durationMs,
  };
}

function persistFollowUpFromPreRoute(
  tool: AiToolName,
  args: Record<string, unknown>,
  data: unknown,
): void {
  updateCopilotFollowUpFromTool(tool, args, data);
}
