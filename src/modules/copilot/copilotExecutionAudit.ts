/**
 * Auditoría de ejecución del copiloto — historial en memoria + logs obligatorios.
 */
import type { AiToolName } from '../ai/types';
import type { CopilotConversationContext } from './copilotConversationContext';
import { followUpSnapshotForAudit } from './copilotFollowUpContext';

export type CopilotRouterAuditEntry = {
  ts: string;
  query: string;
  normalized: string;
  matchedIntent: string | null;
  selectedTool: string | null;
  args: Record<string, unknown>;
  reason: string | null;
};

export type CopilotToolAuditEntry = {
  ts: string;
  tool: AiToolName | string;
  args: Record<string, unknown>;
  ms: number;
  rows: number | null;
  ok: boolean;
  error?: string;
};

export type CopilotResponseAuditEntry = {
  ts: string;
  intent: string | null;
  summaryLength: number;
  cards: number;
  actions: number;
  toolsUsed: string[];
  fromCache: boolean;
};

const MAX_HISTORY = 200;

const routerHistory: CopilotRouterAuditEntry[] = [];
const toolCalls: CopilotToolAuditEntry[] = [];
const responseHistory: CopilotResponseAuditEntry[] = [];

let cacheHits = 0;
let cacheMiss = 0;
let dataCacheHits = 0;
let dataCacheMiss = 0;

let lastContext: CopilotConversationContext = {
  lastVehicleId: null,
  lastVehiclePlaca: null,
  lastTopic: 'general',
};

function trimHistory<T>(arr: T[]): void {
  while (arr.length > MAX_HISTORY) arr.shift();
}

export function normalizeCopilotQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function logCopilotQuery(query: string): void {
  const payload = { query, normalized: normalizeCopilotQuery(query) };
  console.log('[copilot:query]', JSON.stringify(payload));
}

export function recordCopilotRouter(entry: Omit<CopilotRouterAuditEntry, 'ts'>): void {
  const row: CopilotRouterAuditEntry = { ...entry, ts: new Date().toISOString() };
  routerHistory.push(row);
  trimHistory(routerHistory);
  console.log(
    '[copilot:router]',
    JSON.stringify({
      matchedIntent: row.matchedIntent,
      selectedTool: row.selectedTool,
      args: row.args,
      reason: row.reason,
    }),
  );
}

export function logCopilotToolStart(tool: AiToolName | string, args: Record<string, unknown>): void {
  console.log('[copilot:tool:start]', JSON.stringify({ tool, args }));
}

export function logCopilotToolEnd(
  tool: AiToolName | string,
  ms: number,
  rows: number | null,
  ok: boolean,
  args: Record<string, unknown>,
  error?: string,
): void {
  const row: CopilotToolAuditEntry = {
    ts: new Date().toISOString(),
    tool,
    args,
    ms,
    rows,
    ok,
    error,
  };
  toolCalls.push(row);
  trimHistory(toolCalls);
  console.log('[copilot:tool:end]', JSON.stringify({ tool, ms, rows }));
}

export function logCopilotResponse(opts: {
  intent: string | null;
  summaryLength: number;
  cards: number;
  actions: number;
  toolsUsed: string[];
  fromCache?: boolean;
}): void {
  const row: CopilotResponseAuditEntry = {
    ts: new Date().toISOString(),
    intent: opts.intent,
    summaryLength: opts.summaryLength,
    cards: opts.cards,
    actions: opts.actions,
    toolsUsed: opts.toolsUsed,
    fromCache: opts.fromCache ?? false,
  };
  responseHistory.push(row);
  trimHistory(responseHistory);
  console.log(
    '[copilot:response]',
    JSON.stringify({
      intent: row.intent,
      summaryLength: row.summaryLength,
      cards: row.cards,
      actions: row.actions,
    }),
  );
}

export function recordAiResponseCacheHit(): void {
  cacheHits += 1;
}

export function recordAiResponseCacheMiss(): void {
  cacheMiss += 1;
}

export function recordAiDataCacheHit(): void {
  dataCacheHits += 1;
}

export function recordAiDataCacheMiss(): void {
  dataCacheMiss += 1;
}

export function setCopilotExecutionContext(ctx: CopilotConversationContext): void {
  lastContext = { ...ctx };
}

export function countRowsFromToolData(data: unknown): number | null {
  if (data == null || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.count === 'number') return d.count;
  if (typeof d.totalDocumentos === 'number') return d.totalDocumentos;
  if (typeof d.totalAlertasAutomaticas === 'number') return d.totalAlertasAutomaticas;
  if (typeof d.cantidad === 'number') return d.cantidad;
  if (typeof d.cantidadSubtipos === 'number') return d.cantidadSubtipos;
  if (Array.isArray(d.ranking)) return d.ranking.length;
  if (Array.isArray(d.lineas_ranking_compact)) return d.lineas_ranking_compact.length;
  if (Array.isArray(d.items)) return d.items.length;
  if (Array.isArray(d.porSubtipo)) return d.porSubtipo.length;
  return null;
}

export function getCopilotExecutionAuditSnapshot() {
  const toolMs = toolCalls.filter((t) => t.ok).map((t) => t.ms);
  const avgToolMs =
    toolMs.length > 0 ? Math.round(toolMs.reduce((a, b) => a + b, 0) / toolMs.length) : 0;

  return {
    routerHistory: [...routerHistory],
    toolCalls: [...toolCalls],
    responses: [...responseHistory],
    avgToolMs,
    cacheHits,
    cacheMiss,
    dataCacheHits,
    dataCacheMiss,
    context: {
      lastVehicleId: lastContext.lastVehicleId,
      lastVehiclePlaca: lastContext.lastVehiclePlaca,
      lastTopic: lastContext.lastTopic,
      followUp: followUpSnapshotForAudit(),
    },
  };
}

export function auditCopilotExecution() {
  const snap = getCopilotExecutionAuditSnapshot();
  return {
    routerHistory: snap.routerHistory,
    toolCalls: snap.toolCalls,
    avgToolMs: snap.avgToolMs,
    cacheHits: snap.cacheHits,
    cacheMiss: snap.cacheMiss,
    context: {
      lastVehicleId: snap.context.lastVehicleId,
      lastTopic: snap.context.lastTopic,
      followUp: snap.context.followUp,
    },
  };
}

export function clearCopilotExecutionAudit(): void {
  routerHistory.length = 0;
  toolCalls.length = 0;
  responseHistory.length = 0;
  cacheHits = 0;
  cacheMiss = 0;
  dataCacheHits = 0;
  dataCacheMiss = 0;
}
