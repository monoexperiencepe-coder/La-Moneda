import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/** Solo local (`import.meta.env.DEV`). No usar en producción. */
export function isRealtimeUnfilteredDebugEnabled(): boolean {
  return import.meta.env.DEV;
}

const DEBUG_CHANNEL_NAME = 'debug-all-changes';

const DEBUG_TABLES = ['kilometrajes', 'ingresos'] as const;

export type RealtimeDebugUnfilteredContext = {
  adminEmpresaId: string;
  adminUserId?: string | null;
  adminRole?: string | null;
  filteredChannel?: string | null;
};

function rowEmpresaId(payload: {
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}): string | null {
  const row = payload.new?.id != null ? payload.new : payload.old;
  const raw = row?.empresa_id;
  return raw == null || raw === '' ? null : String(raw);
}

function logUnfilteredEvent(
  table: (typeof DEBUG_TABLES)[number],
  ctx: RealtimeDebugUnfilteredContext,
  payload: {
    eventType?: string;
    new: Record<string, unknown>;
    old: Record<string, unknown>;
  },
): void {
  const eventType = payload.eventType ?? '?';
  const row = payload.new?.id != null ? payload.new : payload.old;
  const empresaIdOnRow = rowEmpresaId(payload);
  const summary = {
    table,
    eventType,
    rowId: row?.id ?? null,
    rowEmpresaId: empresaIdOnRow,
    adminEmpresaId: ctx.adminEmpresaId,
    empresaMatch:
      empresaIdOnRow != null && ctx.adminEmpresaId
        ? empresaIdOnRow === ctx.adminEmpresaId
        : null,
    adminUserId: ctx.adminUserId ?? null,
    adminRole: ctx.adminRole ?? null,
    filteredChannel: ctx.filteredChannel ?? null,
    hint:
      empresaIdOnRow != null && ctx.adminEmpresaId && empresaIdOnRow !== ctx.adminEmpresaId
        ? 'filtro empresa_id probable — row y admin difieren'
        : null,
  };

  console.warn(`[realtime:debug:${table}:any]`, summary, payload);
  console.warn(`[realtime:debug:${table}:any:json]`, JSON.stringify(summary, null, 2));
}

/**
 * Canal DEV sin filtro `empresa_id` para distinguir:
 * - llega debug pero no [realtime:raw] → filtro empresa_id
 * - no llega debug → RLS / publication / SELECT
 */
export function mountRealtimeDebugUnfilteredChannel(
  ctx: RealtimeDebugUnfilteredContext,
): RealtimeChannel | null {
  if (!isRealtimeUnfilteredDebugEnabled()) return null;

  console.warn('[realtime:debug:mount]', {
    channel: DEBUG_CHANNEL_NAME,
    tables: [...DEBUG_TABLES],
    filter: 'none (sin empresa_id)',
    ...ctx,
  });

  let channel = supabase.channel(DEBUG_CHANNEL_NAME);

  for (const table of DEBUG_TABLES) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => {
        logUnfilteredEvent(table, ctx, {
          eventType: payload.eventType,
          new: (payload.new ?? {}) as Record<string, unknown>,
          old: (payload.old ?? {}) as Record<string, unknown>,
        });
      },
    );
  }

  channel.subscribe((status, err) => {
    console.warn('[realtime:debug:status]', {
      status,
      err: err?.message ?? null,
      channel: DEBUG_CHANNEL_NAME,
      tables: [...DEBUG_TABLES],
      ...ctx,
      ...{
        socketConnected: supabase.realtime.isConnected?.() ?? null,
        socketState: supabase.realtime.connectionState?.() ?? null,
      },
    });
  });

  return channel;
}

export async function unmountRealtimeDebugUnfilteredChannel(
  channel: RealtimeChannel | null,
): Promise<void> {
  if (!channel) return;
  console.warn('[realtime:debug:unmount]', { channel: DEBUG_CHANNEL_NAME });
  await supabase.removeChannel(channel);
}
