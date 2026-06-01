import { supabase } from '../lib/supabase';
import { isRealtimeDebugEnv } from './realtimeBootLog';

export function getRealtimeSocketDiag(): Record<string, unknown> {
  const rt = supabase.realtime;
  return {
    socketConnected: typeof rt.isConnected === 'function' ? rt.isConnected() : null,
    socketConnecting: typeof rt.isConnecting === 'function' ? rt.isConnecting() : null,
    socketDisconnecting: typeof rt.isDisconnecting === 'function' ? rt.isDisconnecting() : null,
    socketState: typeof rt.connectionState === 'function' ? rt.connectionState() : null,
    channelCount: typeof rt.getChannels === 'function' ? rt.getChannels().length : null,
  };
}

export function logRealtimeSocket(phase: string, extra?: Record<string, unknown>): void {
  if (!isRealtimeDebugEnv()) return;
  const payload = { phase, ...getRealtimeSocketDiag(), ...extra };
  console.info('[realtime:socket]', payload);
  console.info('[realtime:socket:json]', JSON.stringify(payload, null, 2));
}

/** Asegura JWT en realtime y socket conectado antes de subscribe. */
export async function ensureRealtimeSocketReady(): Promise<{
  hasSession: boolean;
  sessionUserId: string | null;
}> {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? null;

  if (token) {
    await supabase.realtime.setAuth(token);
  }

  if (!supabase.realtime.isConnected()) {
    supabase.realtime.connect();
  }

  logRealtimeSocket('ensure_ready', {
    hasSession: Boolean(sessionData.session),
    sessionUserId: sessionData.session?.user?.id ?? null,
    sessionError: sessionErr?.message ?? null,
    tokenSet: Boolean(token),
  });

  return {
    hasSession: Boolean(sessionData.session),
    sessionUserId: sessionData.session?.user?.id ?? null,
  };
}
