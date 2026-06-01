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

export function buildRealtimeBootPayload(snap: RealtimeBootSnapshot): Record<string, unknown> {
  const reasonIfDisabled = resolveRealtimeDisabledReason(snap);
  return {
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
    importMetaDev: import.meta.env.DEV,
    importMetaMode: import.meta.env.MODE,
  };
}

function emitDiagnosticView(
  label: string,
  payload: Record<string, unknown>,
  level: 'info' | 'warn' = 'info',
): void {
  if (!isRealtimeDebugEnv()) return;

  try {
    console.table(payload);
  } catch {
    /* algunos entornos no soportan console.table con ciertos valores */
  }

  const json = JSON.stringify(payload, null, 2);
  const log = level === 'warn' ? console.warn.bind(console) : console.info.bind(console);
  log(`${label}:json`, json);
  log(label, payload);
}

/** Log de arranque — siempre en DEV, incluso si enabled=false. */
export function logRealtimeBoot(snap: RealtimeBootSnapshot): void {
  emitDiagnosticView('[realtime:boot]', buildRealtimeBootPayload(snap), 'info');
}

/** Hook/contexto deshabilitado — payload completo visible en consola. */
export function logRealtimeDisabled(
  snap: RealtimeBootSnapshot & { empresaId?: string | null },
): void {
  const payload = {
    ...buildRealtimeBootPayload(snap),
    empresaId: snap.empresaId ?? (snap.empresaRealtimeId || null),
  };
  emitDiagnosticView('[realtime:disabled]', payload, 'warn');
}

export function logRealtimeMounted(meta: Record<string, unknown>): void {
  if (!isRealtimeDebugEnv()) return;
  console.info('[realtime:mounted]', meta);
}

export function logRealtimeUnmounted(meta: Record<string, unknown>): void {
  if (!isRealtimeDebugEnv()) return;
  console.info('[realtime:unmounted]', meta);
}

export function logRealtimeSubscribeStart(meta: Record<string, unknown>): void {
  if (!isRealtimeDebugEnv()) return;
  emitDiagnosticView('[realtime:subscribe:start]', meta, 'info');
}

export function logRealtimeSubscribeDone(meta: Record<string, unknown>): void {
  if (!isRealtimeDebugEnv()) return;
  console.info('[realtime:subscribe:done]', meta);
}

export function logRealtimeStatus(meta: Record<string, unknown>): void {
  if (!isRealtimeDebugEnv()) return;
  emitDiagnosticView('[realtime:status]', meta, 'info');
}

export function logRealtimeRawPayload(meta: Record<string, unknown>): void {
  if (!isRealtimeDebugEnv()) return;
  console.info('[realtime:raw]', meta);
}

export function logRealtimeParseMiss(meta: Record<string, unknown>): void {
  console.warn('[realtime:parse-miss]', meta);
}

/** Confirmación de que el módulo se cargó (diagnóstico lazy/import). */
export function logRealtimeModuleLoaded(moduleId: string): void {
  if (!isRealtimeDebugEnv()) return;
  console.info('[realtime:module]', { loaded: moduleId, at: new Date().toISOString() });
}
