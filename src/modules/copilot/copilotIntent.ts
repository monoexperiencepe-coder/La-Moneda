import type { AiToolName } from '../ai/types';

export type CopilotIntentId =
  | 'flota_conteo'
  | 'flota_vehiculos_con_conductor'
  | 'flota_sin_conductor'
  | 'conductores_conteo'
  | 'vehiculo_por_numero'
  | 'conductor_por_numero'
  | 'utilidad_vehiculo'
  | 'ingresos_vehiculo'
  | 'gastos_vehiculo'
  | 'documentos_resumen'
  | 'documentos_por_rango'
  | 'documentos_vehiculo'
  | 'pendientes_resumen'
  | 'alertas_detalle'
  | 'utilidad_vehiculo_detalle'
  | 'gastos_vehiculo_desglose'
  | 'alertas_operativas'
  | 'ingresos_periodo'
  | 'gastos_periodo'
  | 'utilidad_ranking'
  | 'inversiones'
  | 'pendientes'
  | 'clasificacion'
  | 'resumen_financiero'
  | 'general';

export type CopilotIntentGuess = {
  intent: CopilotIntentId;
  confidence: number;
  suggestedTools: AiToolName[];
  note?: string;
};

const INTENT_RULES: Array<{
  intent: CopilotIntentId;
  re: RegExp;
  tools: AiToolName[];
  confidence: number;
  note?: string;
}> = [
  {
    intent: 'utilidad_ranking',
    re: /\b(utilidad|rentabilidad|ranking|mejores veh[ií]culos|top\s*\d*)\b/i,
    tools: ['getTopVehiculosUtilidad'],
    confidence: 0.85,
  },
  {
    intent: 'flota_conteo',
    re: /\b(cu[aá]ntos?\s+veh[ií]culos?|tama[nñ]o de flota|flota tiene)\b/i,
    tools: ['getFlotaResumen'],
    confidence: 0.9,
  },
  {
    intent: 'conductores_conteo',
    re: /\b(cu[aá]ntos?\s+conductores?|choferes?|cu[aá]nta gente maneja)\b/i,
    tools: ['getConteoConductores'],
    confidence: 0.9,
  },
  {
    intent: 'utilidad_vehiculo',
    re: /\b(utilidad|rentabilidad|ganancia)\b.*\b(veh[ií]culo|unidad|carro)\b/i,
    tools: ['getUtilidadVehiculo'],
    confidence: 0.92,
    note: 'Priorizar sobre getVehiculoPorNumero',
  },
  {
    intent: 'alertas_operativas',
    re: /\b(alertas?\s+autom[aá]ticas?|alertas?\s+activas?|qu[eé] hacer hoy|cu[aá]ntas alertas)\b/i,
    tools: ['getAlertasAutomaticas'],
    confidence: 0.85,
  },
  {
    intent: 'alertas_detalle',
    re: /\b(detalle|listar|lista|muestr).*\b(alertas?|vencid|sin ingreso)\b/i,
    tools: ['getDetalleAlertas'],
    confidence: 0.85,
  },
  {
    intent: 'documentos_resumen',
    re: /\b(documentaci[oó]n|documentos)\b.*\b(cu[aá]ntos|total|resumen|estado)\b/i,
    tools: ['getDocumentosResumen'],
    confidence: 0.85,
  },
  {
    intent: 'pendientes_resumen',
    re: /\bpendientes?\b.*\b(equipo|operativ|cu[aá]ntos|total)\b/i,
    tools: ['getPendientesResumen'],
    confidence: 0.8,
    note: 'NO confundir con getPendientesRevision (gastos)',
  },
  {
    intent: 'ingresos_periodo',
    re: /\b(ingresos?|facturaci[oó]n|recaudaci[oó]n)\b/i,
    tools: ['getIngresosPeriodo', 'getIngresosHistoricosPorMes'],
    confidence: 0.75,
  },
  {
    intent: 'gastos_periodo',
    re: /\b(gastos?|opex|capex)\b/i,
    tools: ['getGastosPeriodo', 'getGastosPorCategoria'],
    confidence: 0.75,
  },
  {
    intent: 'inversiones',
    re: /\b(inversi[oó]n|adquisici[oó]n|compra de veh[ií]culo)\b/i,
    tools: ['getRankingInversionVehiculos', 'getInversionesNoVehiculares'],
    confidence: 0.7,
  },
  {
    intent: 'pendientes',
    re: /\b(pendientes?|revisi[oó]n|clasificar)\b/i,
    tools: ['getPendientesRevision', 'getPendientesConSugerencia'],
    confidence: 0.65,
  },
  {
    intent: 'resumen_financiero',
    re: /\b(resumen|mejor mes|peor mes|anomal[ií]a)\b/i,
    tools: ['getResumenFinancieroPeriodo'],
    confidence: 0.65,
  },
];

export function inferCopilotIntent(query: string): CopilotIntentGuess {
  const q = query.trim();
  for (const rule of INTENT_RULES) {
    if (rule.re.test(q)) {
      return {
        intent: rule.intent,
        confidence: rule.confidence,
        suggestedTools: rule.tools,
        note: rule.note,
      };
    }
  }
  return { intent: 'general', confidence: 0.4, suggestedTools: [] };
}

export function intentFromToolsUsed(tools: AiToolName[]): CopilotIntentId {
  if (tools.includes('getUtilidadVehiculoDetalle')) return 'utilidad_vehiculo_detalle';
  if (tools.includes('getGastosVehiculoDesglose')) return 'gastos_vehiculo_desglose';
  if (tools.includes('getDocumentosPorRango')) return 'documentos_por_rango';
  if (tools.includes('getDocumentosVehiculo')) return 'documentos_vehiculo';
  if (tools.includes('getUtilidadVehiculo')) return 'utilidad_vehiculo';
  if (tools.includes('getIngresosVehiculo')) return 'ingresos_vehiculo';
  if (tools.includes('getGastosVehiculo')) return 'gastos_vehiculo';
  if (tools.includes('getDetalleAlertas')) return 'alertas_detalle';
  if (tools.includes('getDocumentosResumen')) return 'documentos_resumen';
  if (tools.includes('getPendientesResumen')) return 'pendientes_resumen';
  if (tools.includes('getTopVehiculosUtilidad')) return 'utilidad_ranking';
  if (tools.includes('getAlertasAutomaticas')) return 'alertas_operativas';
  if (tools.includes('getConteoConductores')) return 'conductores_conteo';
  if (tools.includes('getVehiculoPorNumero')) return 'vehiculo_por_numero';
  if (tools.includes('getConductorPorNumero')) return 'conductor_por_numero';
  if (tools.includes('getFlotaResumen')) return 'flota_conteo';
  if (tools.includes('getIngresosPeriodo') || tools.includes('getIngresosHistoricosPorMes')) {
    return 'ingresos_periodo';
  }
  if (tools.includes('getGastosPeriodo') || tools.includes('getGastosPorCategoria')) {
    return 'gastos_periodo';
  }
  if (tools.length === 0) return 'general';
  return 'general';
}
