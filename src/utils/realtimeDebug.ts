/** Logs DEV para diagnóstico de sincronización realtime (Supabase postgres_changes). */

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

export function realtimeLogSubscribe(meta: RealtimeDebugMeta): void {
  if (!import.meta.env.DEV) return;
  console.info(`[realtime:subscribe] ${stamp()}`, meta);
}

export function realtimeLogEvent(meta: RealtimeDebugMeta): void {
  if (!import.meta.env.DEV) return;
  console.info(`[realtime:event] ${stamp()}`, meta);
}

export function realtimeLogUpdate(meta: RealtimeDebugMeta): void {
  if (!import.meta.env.DEV) return;
  console.info(`[realtime:update] ${stamp()}`, meta);
}

export function realtimeLogRefetch(meta: RealtimeDebugMeta): void {
  if (!import.meta.env.DEV) return;
  console.info(`[realtime:refetch] ${stamp()}`, meta);
}

export function realtimeLogCleanup(meta: RealtimeDebugMeta): void {
  if (!import.meta.env.DEV) return;
  console.info(`[realtime:cleanup] ${stamp()}`, meta);
}

/** Registro global de canales activos (solo DEV). */
export const realtimeRegistry = {
  activeChannels: new Set<string>(),
  register(name: string): void {
    if (!import.meta.env.DEV) return;
    this.activeChannels.add(name);
    console.info('[realtime:registry] register', name, 'total=', this.activeChannels.size);
  },
  unregister(name: string): void {
    if (!import.meta.env.DEV) return;
    this.activeChannels.delete(name);
    console.info('[realtime:registry] unregister', name, 'total=', this.activeChannels.size);
  },
};
