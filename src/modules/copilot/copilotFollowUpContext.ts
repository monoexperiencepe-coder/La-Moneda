/**
 * Contexto de follow-up del copiloto — TTL 10 min (memoria + sessionStorage).
 * Permite continuidad: "y el segundo", "solo motor", "comparalo con el siguiente".
 */
import type { AiToolName } from '../ai/types';
import type { CopilotIntentId } from './copilotIntent';
import type { CopilotConversationContext } from './copilotConversationContext';
import { extractGastoFiltroTexto, topicFromToolForFollowUp } from './copilotConversationContext';

const TTL_MS = 10 * 60 * 1000;
const STORAGE_KEY = 'copilot_follow_up_v1';

export type CopilotFollowUpContext = {
  vehicleId: number | null;
  placa: string | null;
  tool: AiToolName | null;
  fecha: string | null;
  categoria: string | null;
  filtro: string | null;
  rankingVehicleIds: number[];
  rankingIndex: number | null;
  updatedAt: number;
};

export const EMPTY_FOLLOW_UP_CONTEXT: CopilotFollowUpContext = {
  vehicleId: null,
  placa: null,
  tool: null,
  fecha: null,
  categoria: null,
  filtro: null,
  rankingVehicleIds: [],
  rankingIndex: null,
  updatedAt: 0,
};

let memoryStore: CopilotFollowUpContext | null = null;

function readSessionStorage(): CopilotFollowUpContext | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CopilotFollowUpContext;
  } catch {
    return null;
  }
}

function writeSessionStorage(ctx: CopilotFollowUpContext): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    /* quota / private mode */
  }
}

function removeSessionStorage(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function isExpired(ctx: CopilotFollowUpContext): boolean {
  return !ctx.updatedAt || Date.now() - ctx.updatedAt > TTL_MS;
}

export function getCopilotFollowUpContext(): CopilotFollowUpContext | null {
  const raw = memoryStore ?? readSessionStorage();
  if (!raw?.updatedAt) return null;
  if (isExpired(raw)) {
    clearCopilotFollowUpContext();
    return null;
  }
  memoryStore = raw;
  return { ...raw };
}

export function clearCopilotFollowUpContext(): void {
  memoryStore = null;
  removeSessionStorage();
}

/** Solo para QA / auditoría en Node. */
export function seedCopilotFollowUpContext(ctx: Partial<CopilotFollowUpContext>): void {
  const next: CopilotFollowUpContext = {
    ...EMPTY_FOLLOW_UP_CONTEXT,
    ...ctx,
    updatedAt: ctx.updatedAt ?? Date.now(),
  };
  memoryStore = next;
  writeSessionStorage(next);
}

function persist(ctx: CopilotFollowUpContext): void {
  memoryStore = ctx;
  writeSessionStorage(ctx);
}

function vehicleFromPayload(
  args: Record<string, unknown>,
  data: unknown,
): { id: number | null; placa: string | null } {
  const d = data != null && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const rawId = args.numero ?? args.vehicleId ?? d.vehicleId ?? d.numeroUnidad ?? d.numero;
  const id = rawId != null ? Number(rawId) : null;
  const placa = d.placa != null ? String(d.placa) : null;
  return {
    id: id != null && Number.isFinite(id) && id > 0 ? id : null,
    placa,
  };
}

function fechaFromPayload(args: Record<string, unknown>, data: unknown): string | null {
  if (args.periodo != null) return String(args.periodo);
  if (args.desde != null && args.hasta != null) {
    return `${String(args.desde).slice(0, 10)}→${String(args.hasta).slice(0, 10)}`;
  }
  if (args.year != null) return String(args.year);
  const d = data != null && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const periodo = d.periodo;
  if (periodo != null && typeof periodo === 'object') {
    const p = periodo as Record<string, unknown>;
    if (p.label != null) return String(p.label);
    if (p.desde != null && p.hasta != null) return `${p.desde}→${p.hasta}`;
    if (p.periodo != null) return String(p.periodo);
  }
  return null;
}

function rankingIdsFromData(data: unknown): number[] {
  if (data == null || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  const ranking = d.ranking;
  if (!Array.isArray(ranking)) return [];
  return ranking
    .map((row) => {
      if (row == null || typeof row !== 'object') return null;
      const id = (row as Record<string, unknown>).vehicleId;
      const n = Number(id);
      return Number.isFinite(n) && n > 0 ? n : null;
    })
    .filter((n): n is number => n != null);
}

export function updateCopilotFollowUpFromTool(
  tool: AiToolName,
  args: Record<string, unknown>,
  data: unknown,
): CopilotFollowUpContext {
  const prev = getCopilotFollowUpContext() ?? { ...EMPTY_FOLLOW_UP_CONTEXT };
  const next: CopilotFollowUpContext = {
    ...prev,
    tool,
    updatedAt: Date.now(),
  };

  const vehicle = vehicleFromPayload(args, data);
  if (vehicle.id != null) {
    next.vehicleId = vehicle.id;
    if (vehicle.placa) next.placa = vehicle.placa;
    if (next.rankingVehicleIds.length > 0) {
      const idx = next.rankingVehicleIds.indexOf(vehicle.id);
      if (idx >= 0) next.rankingIndex = idx;
    }
  }

  const fecha = fechaFromPayload(args, data);
  if (fecha) next.fecha = fecha;

  const filtroRaw = args.filtroTexto ?? args.filtro ?? args.categoria;
  const dataFiltro =
    data != null && typeof data === 'object'
      ? (data as Record<string, unknown>).filtroTexto
      : undefined;
  const filtro = filtroRaw ?? dataFiltro;
  if (filtro != null && String(filtro).trim()) {
    next.filtro = String(filtro).trim();
  }

  const cat = args.categoria ?? args.tipo;
  if (cat != null && String(cat).trim()) {
    next.categoria = String(cat).trim();
  }

  if (tool === 'getTopVehiculosUtilidad') {
    const ids = rankingIdsFromData(data);
    if (ids.length > 0) {
      next.rankingVehicleIds = ids;
      next.rankingIndex = vehicle.id != null ? ids.indexOf(vehicle.id) : prev.rankingIndex;
    }
  }

  persist(next);
  if (import.meta.env.DEV) {
    console.log('[copilot:followup:update]', {
      vehicleId: next.vehicleId,
      tool: next.tool,
      fecha: next.fecha,
      filtro: next.filtro,
      rankingLen: next.rankingVehicleIds.length,
      rankingIndex: next.rankingIndex,
    });
  }
  return next;
}

export function enrichConversationContextWithFollowUp(
  conv: CopilotConversationContext,
  followUp: CopilotFollowUpContext | null,
): CopilotConversationContext {
  if (!followUp?.vehicleId) return conv;
  const topic = followUp.tool ? topicFromToolForFollowUp(followUp.tool) : conv.lastTopic;
  return {
    lastVehicleId: followUp.vehicleId,
    lastVehiclePlaca: followUp.placa ?? conv.lastVehiclePlaca,
    lastTopic: topic !== 'general' ? topic : conv.lastTopic,
  };
}

const ORDINAL_WORDS: Record<string, number> = {
  primero: 0,
  primer: 0,
  '1ro': 0,
  '1er': 0,
  segundo: 1,
  '2do': 1,
  tercero: 2,
  tercer: 2,
  '3ro': 2,
  '3er': 2,
  cuarto: 3,
  '4to': 3,
  quinto: 4,
  '5to': 4,
  sexto: 5,
  septimo: 5,
  '7mo': 5,
  octavo: 6,
  noveno: 7,
  decimo: 8,
};

export function extractOrdinalIndex(q: string): number | null {
  const mWord = q.match(
    /\b(?:el|la|del|al)?\s*(primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa]|sext[oa]|septim[oa]|octav[oa]|noven[oa]|decim[oa])\b/,
  );
  if (mWord) {
    const key = mWord[1]!
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[oa]$/, '');
    if (key in ORDINAL_WORDS) return ORDINAL_WORDS[key]!;
    if (key.startsWith('segund')) return 1;
    if (key.startsWith('tercer')) return 2;
    if (key.startsWith('cuart')) return 3;
    if (key.startsWith('quint')) return 4;
  }
  const mNum = q.match(/\b(?:el|la|#)?\s*(\d{1,2})(?:º|°|o|a|ro|to|er)?\b/);
  if (mNum) {
    const n = Number(mNum[1]);
    if (n >= 1 && n <= 20) return n - 1;
  }
  return null;
}

export function extractRankingStep(q: string): number | null {
  if (/\b(siguiente|proxim[oa]|otro|otra)\b/.test(q)) return 1;
  if (/\b(anterior|previo|previa)\b/.test(q)) return -1;
  return null;
}

export function extractSoloFiltro(q: string): string | undefined {
  const solo = q.match(/\b(?:solo|solamente|unicamente|únicamente)\s+(\w{3,})\b/);
  if (solo?.[1]) return solo[1].toLowerCase();
  return extractGastoFiltroTexto(q);
}

export function isFollowUpContinuationQuery(q: string): boolean {
  if (extractOrdinalIndex(q) != null) return true;
  if (extractRankingStep(q) != null) return true;
  if (/\b(?:solo|solamente)\s+\w{3,}\b/.test(q)) return true;
  if (/\b(compar|versus|\bvs\b|contra)\b/.test(q) && /\b(siguiente|anterior|otro|segund|tercer)\b/.test(q)) {
    return true;
  }
  if (/^\s*(y\s+)?el\s+(segund|tercer|cuart|quint|\d)/.test(q)) return true;
  if (/^\s*(y\s+)?(solo|solamente)\b/.test(q)) return true;
  if (/^\s*compar/.test(q)) return true;
  return false;
}

const TOOL_DEFAULT_INTENT: Partial<Record<AiToolName, CopilotIntentId>> = {
  getUtilidadVehiculo: 'utilidad_vehiculo',
  getUtilidadVehiculoDetalle: 'utilidad_vehiculo_detalle',
  getGastosVehiculoDesglose: 'gastos_vehiculo_desglose',
  getGastosVehiculo: 'gastos_vehiculo',
  getIngresosVehiculo: 'ingresos_vehiculo',
  getTopVehiculosUtilidad: 'utilidad_ranking',
};

function defaultToolForFollowUp(followUp: CopilotFollowUpContext): AiToolName {
  if (followUp.tool === 'getTopVehiculosUtilidad' || followUp.rankingVehicleIds.length > 0) {
    return 'getUtilidadVehiculo';
  }
  if (followUp.tool === 'getGastosVehiculoDesglose' || followUp.filtro) {
    return 'getGastosVehiculoDesglose';
  }
  return followUp.tool ?? 'getUtilidadVehiculo';
}

function buildToolArgs(
  tool: AiToolName,
  numero: number,
  followUp: CopilotFollowUpContext,
  filtro?: string,
): Record<string, unknown> {
  const args: Record<string, unknown> = { numero };
  if (tool === 'getGastosVehiculoDesglose') {
    const f = filtro ?? followUp.filtro;
    if (f) args.filtroTexto = f;
  }
  if (tool === 'getTopVehiculosUtilidad' && followUp.fecha) {
    args.periodo = followUp.fecha;
  }
  return args;
}

export type FollowUpPreRouteResolution = {
  matchedIntent: CopilotIntentId;
  tool: AiToolName;
  args: Record<string, unknown>;
  reason: string;
};

export function resolveFollowUpPreRoute(
  query: string,
  followUp: CopilotFollowUpContext | null,
): FollowUpPreRouteResolution | null {
  if (!followUp?.updatedAt || isExpired(followUp)) return null;
  if (!isFollowUpContinuationQuery(query)) return null;

  const q = query
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  const soloFiltro = extractSoloFiltro(q);
  if (soloFiltro && followUp.vehicleId != null) {
    const tool = 'getGastosVehiculoDesglose';
    return {
      matchedIntent: 'gastos_vehiculo_desglose',
      tool,
      args: buildToolArgs(tool, followUp.vehicleId, followUp, soloFiltro),
      reason: `followup: solo filtro=${soloFiltro} vehiculo=${followUp.vehicleId}`,
    };
  }

  let targetIndex: number | null = null;
  const ordinal = extractOrdinalIndex(q);
  const step = extractRankingStep(q);

  if (ordinal != null && followUp.rankingVehicleIds.length > ordinal) {
    targetIndex = ordinal;
  } else if (step != null && followUp.rankingVehicleIds.length > 0) {
    const base =
      followUp.rankingIndex ??
      (followUp.vehicleId != null ? followUp.rankingVehicleIds.indexOf(followUp.vehicleId) : -1);
    const from = base >= 0 ? base : 0;
    targetIndex = from + step;
  }

  if (targetIndex != null && followUp.rankingVehicleIds[targetIndex] != null) {
    const numero = followUp.rankingVehicleIds[targetIndex]!;
    const tool = defaultToolForFollowUp(followUp);
    const intent = TOOL_DEFAULT_INTENT[tool] ?? 'utilidad_vehiculo';
    return {
      matchedIntent: intent,
      tool,
      args: buildToolArgs(tool, numero, followUp),
      reason: `followup: ranking pos=${targetIndex + 1} vehiculo=${numero}`,
    };
  }

  if (followUp.vehicleId != null && soloFiltro) {
    const tool = 'getGastosVehiculoDesglose';
    return {
      matchedIntent: 'gastos_vehiculo_desglose',
      tool,
      args: buildToolArgs(tool, followUp.vehicleId, followUp, soloFiltro),
      reason: `followup: desglose filtro=${soloFiltro}`,
    };
  }

  return null;
}

export function followUpSnapshotForAudit(): Record<string, unknown> | null {
  const ctx = getCopilotFollowUpContext();
  if (!ctx) return null;
  return {
    vehicleId: ctx.vehicleId,
    tool: ctx.tool,
    fecha: ctx.fecha,
    categoria: ctx.categoria,
    filtro: ctx.filtro,
    rankingLen: ctx.rankingVehicleIds.length,
    rankingIndex: ctx.rankingIndex,
    ageMs: Date.now() - ctx.updatedAt,
    ttlMs: TTL_MS,
  };
}
