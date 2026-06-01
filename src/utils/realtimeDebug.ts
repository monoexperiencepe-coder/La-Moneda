import {
  isRealtimeDebugEnv,
  logRealtimeRawPayload,
  logRealtimeStatus,
  logRealtimeSubscribeDone,
  logRealtimeSubscribeStart,
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

/** @deprecated use logRealtimeSubscribeStart per-table from hook */
export function realtimeLogSubscribe(meta: RealtimeDebugMeta): void {
  if (!isRealtimeDebugEnv()) return;
  console.info(
    `[realtime:subscribe] table=${meta.table ?? '?'} empresa_id=${meta.empresaId ?? '?'}`,
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
  if (!isRealtimeDebugEnv()) return;
  console.info(
    `[realtime:event] table=${meta.table ?? '?'} event=${meta.event ?? '?'} id=${meta.rowId ?? '?'} empresa_id=${meta.empresaId ?? '?'}`,
    meta.extra ?? '',
  );
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
