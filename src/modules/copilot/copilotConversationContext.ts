/**
 * Memoria contextual corta del copiloto (último vehículo / tema).
 */
import type { AiChatMessage, AiToolName } from '../ai/types';

export type CopilotTopic =
  | 'utilidad'
  | 'gastos'
  | 'ingresos'
  | 'documentos'
  | 'alertas'
  | 'pendientes'
  | 'general';

export type CopilotConversationContext = {
  lastVehicleId: number | null;
  lastVehiclePlaca: string | null;
  lastTopic: CopilotTopic;
};

export const EMPTY_COPILOT_CONTEXT: CopilotConversationContext = {
  lastVehicleId: null,
  lastVehiclePlaca: null,
  lastTopic: 'general',
};

function extractNumeroFromText(text: string): number | null {
  const q = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  const patterns = [
    /vehiculo\s+(?:numero|n[uú]mero|#)?\s*(\d+)/,
    /carro\s+(?:numero|n[uú]mero|#)?\s*(\d+)/,
    /unidad\s+(?:numero|n[uú]mero|#)?\s*(\d+)/,
    /vehiculo\s+#\s*(\d+)/,
    /#\s*(\d+)\b/,
  ];
  for (const re of patterns) {
    const m = q.match(re);
    if (!m) continue;
    const n = Number(m[m.length - 1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function topicFromToolForFollowUp(tool: AiToolName): CopilotTopic {
  return topicFromTool(tool);
}

function topicFromTool(tool: AiToolName): CopilotTopic {
  if (
    tool === 'getUtilidadVehiculo' ||
    tool === 'getUtilidadVehiculoDetalle' ||
    tool === 'getTopVehiculosUtilidad'
  ) {
    return 'utilidad';
  }
  if (tool === 'getGastosVehiculo' || tool === 'getGastosVehiculoDesglose') return 'gastos';
  if (tool === 'getIngresosVehiculo') return 'ingresos';
  if (
    tool === 'getDocumentosResumen' ||
    tool === 'getDocumentosPorRango' ||
    tool === 'getDocumentosVehiculo' ||
    tool === 'getDetalleAlertas'
  ) {
    return 'documentos';
  }
  if (tool === 'getAlertasAutomaticas') return 'alertas';
  if (tool === 'getPendientesResumen') return 'pendientes';
  return 'general';
}

function vehicleFromData(data: unknown): { id: number | null; placa: string | null } {
  if (data == null || typeof data !== 'object') return { id: null, placa: null };
  const d = data as Record<string, unknown>;
  const rawId = d.vehicleId ?? d.numeroUnidad ?? d.numero;
  const id = rawId != null ? Number(rawId) : null;
  const placa = d.placa != null ? String(d.placa) : null;
  return {
    id: id != null && Number.isFinite(id) && id > 0 ? id : null,
    placa,
  };
}

/** Deriva contexto del historial reciente (últimos turnos). */
export function deriveCopilotContextFromHistory(
  history: AiChatMessage[],
): CopilotConversationContext {
  let ctx = { ...EMPTY_COPILOT_CONTEXT };
  const recent = history.slice(-8);
  for (const msg of recent) {
    if (msg.role === 'user') {
      const n = extractNumeroFromText(msg.content);
      if (n != null) ctx.lastVehicleId = n;
    }
    if (msg.role === 'assistant') {
      const tools = msg.toolsUsed ?? [];
      const data = msg.structured?.data;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const v = vehicleFromData(data);
        if (v.id != null) {
          ctx.lastVehicleId = v.id;
          if (v.placa) ctx.lastVehiclePlaca = v.placa;
        }
      }
      if (tools.length > 0) {
        ctx.lastTopic = topicFromTool(tools[tools.length - 1]!);
      }
    }
  }
  return ctx;
}

export function updateCopilotContextFromTool(
  prev: CopilotConversationContext,
  tool: AiToolName,
  data: unknown,
): CopilotConversationContext {
  const next = { ...prev, lastTopic: topicFromTool(tool) };
  const v = vehicleFromData(data);
  if (v.id != null) {
    next.lastVehicleId = v.id;
    if (v.placa) next.lastVehiclePlaca = v.placa;
  }
  return next;
}

/** Resuelve número de unidad: query explícita o contexto. */
export function resolveVehicleNumero(
  query: string,
  ctx: CopilotConversationContext,
): number | null {
  return extractNumeroFromText(query) ?? ctx.lastVehicleId;
}

export function isContextFollowUpQuery(q: string): boolean {
  const n = q
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return (
    /\b(por\s*qu[eé]|porque|explicar|desglosa|desglose|detalle)\b/.test(n) ||
    /\b(categor[ií]a|subtipo|subtipos|motor|frenos|llantas|electricidad|mantenimiento)\b/.test(n) ||
    /\b(esos|estos|ese|esa)\s+gastos?\b/.test(n) ||
    /\bcuantos?\s+subtipos?\b/.test(n) ||
    /\b(?:solo|solamente)\s+\w{3,}\b/.test(n) ||
    /\b(segund[oa]|tercer[oa]|cuart[oa]|quint[oa]|siguiente|anterior|proxim[oa])\b/.test(n) ||
    /\b(compar|versus|\bvs\b)\b/.test(n) ||
    /^\s*(y\s+)?el\s+(segund|tercer|\d)/.test(n)
  );
}

export function extractGastoFiltroTexto(q: string): string | undefined {
  const lower = q
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  const solo = lower.match(/\b(?:solo|solamente|unicamente)\s+(\w{3,})\b/);
  if (solo?.[1]) return solo[1];
  const keywords = [
    'motor',
    'frenos',
    'freno',
    'llantas',
    'llanta',
    'electricidad',
    'documentos',
    'documentacion',
    'mantenimiento',
    'combustible',
    'aceite',
    'neumatico',
    'neumático',
  ];
  for (const k of keywords) {
    if (lower.includes(k)) return k;
  }
  const m = lower.match(/\ben\s+(\w{4,})\b/);
  return m?.[1];
}
