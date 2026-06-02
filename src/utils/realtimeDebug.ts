import {
  isRealtimeDebugEnv,
  logRealtimeRawPayload,
  logRealtimeStatus,
  logRealtimeSubscribeDone,
  logRealtimeSubscribeStart,
  rtMandatoryLog,
} from './realtimeBootLog';

/** Logs DEV para sincronización realtime (Supabase postgres_changes). */

export type RealtimeDebugMeta = {
  channel?: string;
  table?: string;
  event?: string;
  rowId?: string | number | null;
  empresaId?: string;
  extra?: Record<string, unknown>;
};

function stamp(): string {
  return new Date().toISOString().slice(11, 23);
}

/** @deprecated use logRealtimeSubscribeMode from hook */
export function realtimeLogSubscribe(
  meta: RealtimeDebugMeta & { hasSupabaseFilter?: boolean },
): void {
  if (!isRealtimeDebugEnv()) return;
  const manual = meta.hasSupabaseFilter === false;
  console.info(
    `[realtime:subscribe] table=${meta.table ?? '?'} mode=${manual ? 'manual_empresa_filter' : 'supabase_channel_filter'} hasSupabaseFilter=${!manual}`,
  );
}

export function realtimeLogStatus(meta: RealtimeDebugMeta & { status: string }): void {
  logRealtimeStatus({
    channel: meta.channel ?? null,
    status: meta.status,
    empresaId: meta.empresaId ?? null,
    tables: meta.extra?.tables ?? null,
  });
}

export function realtimeLogEvent(meta: RealtimeDebugMeta): void {
  rtMandatoryLog('[realtime:event]', {
    table: meta.table ?? null,
    event: meta.event ?? null,
    rowId: meta.rowId ?? null,
    empresaId: meta.empresaId ?? null,
    extra: meta.extra ?? null,
  });
}

export function realtimeLogUpdate(meta: RealtimeDebugMeta): void {
  if (!isRealtimeDebugEnv()) return;
  console.info(`[realtime:update] ${stamp()}`, meta);
}

export function realtimeLogRefresh(meta: RealtimeDebugMeta): void {
  if (!isRealtimeDebugEnv()) return;
  console.info(
    `[realtime:refresh] table=${meta.table ?? '?'} reason=${meta.extra?.reason ?? 'remote_event'}`,
    meta.extra ?? '',
  );
}

export function realtimeLogRefreshDone(meta: RealtimeDebugMeta): void {
  if (!isRealtimeDebugEnv()) return;
  const count = meta.extra?.count;
  const err = meta.extra?.error;
  if (err) {
    console.warn(`[realtime:refresh:done] table=${meta.table ?? '?'} error=${err}`);
    return;
  }
  console.info(
    `[realtime:refresh:done] table=${meta.table ?? '?'}${count != null ? ` count=${count}` : ''}`,
  );
}

export function realtimeLogEmpresaMismatch(meta: RealtimeDebugMeta): void {
  if (!isRealtimeDebugEnv()) return;
  console.warn(
    `[realtime:empresa-mismatch] table=${meta.table ?? '?'} event=${meta.event ?? '?'} subscription=${meta.empresaId ?? '?'} row=${meta.extra?.rowEmpresaId ?? '?'}`,
  );
}

export function realtimeLogCleanup(meta: RealtimeDebugMeta): void {
  if (!isRealtimeDebugEnv()) return;
  console.info(`[realtime:cleanup] ${stamp()}`, meta);
}

/** Registro global de canales activos (solo DEV). */
export const realtimeRegistry = {
  activeChannels: new Set<string>(),
  register(name: string): void {
    if (!isRealtimeDebugEnv()) return;
    this.activeChannels.add(name);
    console.info('[realtime:registry] register', name, 'total=', this.activeChannels.size);
  },
  unregister(name: string): void {
    if (!isRealtimeDebugEnv()) return;
    this.activeChannels.delete(name);
    console.info('[realtime:registry] unregister', name, 'total=', this.activeChannels.size);
  },
};

export { logRealtimeRawPayload, logRealtimeSubscribeStart, logRealtimeSubscribeDone, logRealtimeStatus };
