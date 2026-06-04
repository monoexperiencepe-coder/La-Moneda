import { COPILOT_STRICT_FACT_MODE } from '../../config/copilotAudit';
import type { AiToolName } from '../ai/types';
import type { CopilotIntentGuess } from './copilotIntent';
import { inferCopilotIntent } from './copilotIntent';

export type CopilotTraceToolResult = {
  tool: AiToolName;
  args: Record<string, unknown>;
  ok: boolean;
  rows: number | null;
  durationMs: number;
  preview: unknown;
  error?: string;
  denied?: boolean;
};

export type CopilotTraceSession = {
  id: string;
  query: string;
  timestamp: string;
  strictMode: boolean;
  intent: CopilotIntentGuess;
  toolsSelected: AiToolName[];
  toolResults: CopilotTraceToolResult[];
  memory: { historyMessages: number; fromCache?: boolean };
  final: {
    summary: string;
    toolsUsed: AiToolName[];
    durationMs: number;
    tokensTotal?: number;
    provider?: string | null;
    model?: string | null;
    toolErrors: Array<{ name: AiToolName; error: string }>;
  } | null;
};

const MAX_HISTORY = 40;
const sessions: CopilotTraceSession[] = [];
let active: CopilotTraceSession | null = null;

function logTag(tag: string, payload: unknown): void {
  if (!import.meta.env.DEV && tag !== '[copilot:final]') return;
  console.log(tag, JSON.stringify(payload, null, 2));
}

function countRowsFromToolData(tool: AiToolName, data: unknown): number | null {
  if (data == null || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.count === 'number') return d.count;
  if (typeof d.totalVehiculos === 'number') return d.totalVehiculos;
  if (typeof d.totalConductores === 'number') return d.totalConductores;
  if (typeof d.totalAlertasAutomaticas === 'number') return d.totalAlertasAutomaticas;
  if (typeof d.total === 'number' && tool === 'getFlotaResumen') return d.total;
  if (Array.isArray(d.ranking)) return d.ranking.length;
  if (Array.isArray(d.filas)) return d.filas.length;
  if (Array.isArray(d.movimientos)) return d.movimientos.length;
  if (Array.isArray(d.vehiculos)) return d.vehiculos.length;
  if (Array.isArray(d.asignados)) return d.asignados.length;
  const ing = d.ingresos as { count?: number } | undefined;
  if (ing?.count != null) return ing.count;
  const gas = d.gastos as { count?: number } | undefined;
  if (gas?.count != null) return gas.count;
  return null;
}

function previewFromToolData(data: unknown): unknown {
  if (data == null || typeof data !== 'object') return data;
  const d = data as Record<string, unknown>;
  const pick: Record<string, unknown> = {};
  for (const k of [
    'total',
    'activos',
    'inactivos',
    'conductoresVigentes',
    'count',
    'empty',
    'mensaje_sin_datos',
    'ranking',
    'lineas_ranking',
    'periodo',
    'datos_faltantes',
  ]) {
    if (d[k] !== undefined) pick[k] = d[k];
  }
  if (Object.keys(pick).length > 0) return pick;
  return Object.fromEntries(Object.entries(d).slice(0, 6));
}

export function startCopilotTrace(query: string): string {
  const id = `cop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const intent = inferCopilotIntent(query);
  active = {
    id,
    query: query.trim(),
    timestamp: new Date().toISOString(),
    strictMode: COPILOT_STRICT_FACT_MODE,
    intent,
    toolsSelected: [],
    toolResults: [],
    memory: { historyMessages: 0 },
    final: null,
  };
  logTag('[copilot:request]', { query: active.query, timestamp: active.timestamp });
  logTag('[copilot:intent]', {
    intent: intent.intent,
    confidence: intent.confidence,
    suggestedTools: intent.suggestedTools,
    note: intent.note,
  });
  return id;
}

export function logCopilotToolsSelected(tools: AiToolName[], argsByTool?: Record<string, unknown>): void {
  if (!active) return;
  for (const t of tools) {
    if (!active.toolsSelected.includes(t)) active.toolsSelected.push(t);
  }
  logTag('[copilot:tool:selected]', {
    tools: active.toolsSelected,
    args: argsByTool ?? null,
  });
}

export function logCopilotToolResult(
  entry: Omit<CopilotTraceToolResult, 'preview' | 'rows'> & { data?: unknown; rows?: number | null },
): void {
  if (!active) return;
  const preview = previewFromToolData(entry.data);
  const row: CopilotTraceToolResult = {
    tool: entry.tool,
    args: entry.args,
    ok: entry.ok,
    rows: entry.rows ?? countRowsFromToolData(entry.tool, entry.data),
    durationMs: Math.round(entry.durationMs),
    preview,
    error: entry.error,
    denied: entry.denied,
  };
  active.toolResults.push(row);
  logTag('[copilot:tool:result]', {
    tool: row.tool,
    rows: row.rows,
    duration: row.durationMs,
    preview: row.preview,
    ok: row.ok,
    error: row.error,
  });
}

export function logCopilotMemory(meta: { historyMessages: number; fromCache?: boolean }): void {
  if (!active) return;
  active.memory = meta;
  logTag('[copilot:memory]', meta);
}

export function finishCopilotTrace(final: CopilotTraceSession['final']): CopilotTraceSession | null {
  if (!active) return null;
  active.final = final;
  logTag('[copilot:final]', {
    summary: final?.summary?.slice(0, 280),
    toolsUsed: final?.toolsUsed,
    durationMs: final?.durationMs,
    tokens: final?.tokensTotal,
    strictMode: active.strictMode,
    toolErrors: final?.toolErrors,
  });
  sessions.unshift({ ...active, toolResults: [...active.toolResults] });
  if (sessions.length > MAX_HISTORY) sessions.length = MAX_HISTORY;
  const done = active;
  active = null;
  return done;
}

export function getCopilotTraceSessions(): readonly CopilotTraceSession[] {
  return sessions;
}

export function getActiveCopilotTrace(): CopilotTraceSession | null {
  return active;
}

export function clearCopilotTraceHistory(): void {
  sessions.length = 0;
  active = null;
}
