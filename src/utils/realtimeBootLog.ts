import { EMPRESA_ID } from '../config/app';

export type RealtimeDisabledReason =
  | 'supabase_client_missing'
  | 'profile_loading'
  | 'auth=false'
  | 'profile missing'
  | 'empresa_id missing'
  | 'enabled=false'
  | 'hook not mounted'
  | null;

export type RealtimeBootSnapshot = {
  isAuthenticated: boolean;
  profileLoaded?: boolean;
  authLoading?: boolean;
  profileEmpresaId?: string | null;
  empresaRealtimeId: string;
  enabled: boolean;
  role?: string | null;
  userId?: string | null;
  hookMounted?: boolean;
  source?: 'RegistrosContext' | 'useEmpresaRegistrosRealtime';
};

export function isRealtimeDebugEnv(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_REALTIME_DEBUG === '1';
}

export function isSupabaseClientConfigured(): boolean {
  return Boolean(
    (import.meta.env.VITE_SUPABASE_URL ?? '').trim() &&
      (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
  );
}

export function resolveRealtimeDisabledReason(
  snap: RealtimeBootSnapshot,
): RealtimeDisabledReason {
  if (!isSupabaseClientConfigured()) return 'supabase_client_missing';
  if (snap.authLoading) return 'profile_loading';
  if (snap.profileLoaded === false && !snap.authLoading) return 'profile missing';
  if (!snap.isAuthenticated) return 'auth=false';
  if (!snap.empresaRealtimeId.trim()) return 'empresa_id missing';
  if (!snap.enabled) {
    if (snap.hookMounted === false) return 'hook not mounted';
    return 'enabled=false';
  }
  return null;
}

function rtLog(label: string, payload: Record<string, unknown>): void {
  if (!isRealtimeDebugEnv()) return;
  console.info(label, payload);
}

/** Log de arranque — siempre en DEV al evaluar RegistrosContext / hook. */
export function logRealtimeBoot(snap: RealtimeBootSnapshot): void {
  if (!isRealtimeDebugEnv()) return;

  const reasonIfDisabled = resolveRealtimeDisabledReason(snap);

  rtLog('[realtime:boot]', {
    source: snap.source ?? 'unknown',
    isAuthenticated: snap.isAuthenticated,
    profileLoaded: snap.profileLoaded ?? false,
    authLoading: snap.authLoading ?? false,
    role: snap.role ?? null,
    userId: snap.userId ?? null,
    empresaRealtimeId: snap.empresaRealtimeId || null,
    profileEmpresaId: snap.profileEmpresaId ?? null,
    viteEmpresaId: EMPRESA_ID || null,
    enabled: snap.enabled,
    reasonIfDisabled,
    hookMounted: snap.hookMounted ?? null,
    supabaseConfigured: isSupabaseClientConfigured(),
  });
}

export function logRealtimeMounted(meta: Record<string, unknown>): void {
  rtLog('[realtime:mounted]', meta);
}

export function logRealtimeUnmounted(meta: Record<string, unknown>): void {
  rtLog('[realtime:unmounted]', meta);
}

export function logRealtimeSubscribeStart(meta: Record<string, unknown>): void {
  rtLog('[realtime:subscribe:start]', meta);
}

export function logRealtimeSubscribeDone(meta: Record<string, unknown>): void {
  rtLog('[realtime:subscribe:done]', meta);
}

export function logRealtimeStatus(meta: Record<string, unknown>): void {
  rtLog('[realtime:status]', meta);
}

export function logRealtimeRawPayload(meta: Record<string, unknown>): void {
  rtLog('[realtime:raw]', meta);
}

export function logRealtimeParseMiss(meta: Record<string, unknown>): void {
  console.warn('[realtime:parse-miss]', meta);
}

/** Confirmación de que el módulo se cargó (diagnóstico lazy/import). */
export function logRealtimeModuleLoaded(moduleId: string): void {
  rtLog('[realtime:module]', { loaded: moduleId, at: new Date().toISOString() });
}
