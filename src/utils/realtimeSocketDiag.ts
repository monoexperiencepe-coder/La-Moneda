import { supabase } from '../lib/supabase';
import { isRealtimeDebugEnv } from './realtimeBootLog';

export type RealtimeSocketReadyResult = {
  hasSession: boolean;
  sessionUserId: string | null;
  socketOpen: boolean;
  socketState: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function logRealtimeSocketError(phase: string, error: unknown, extra?: Record<string, unknown>): void {
  if (!isRealtimeDebugEnv()) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const payload = {
    phase,
    message: err.message,
    name: err.name,
    stack: err.stack ?? null,
    ...getRealtimeSocketDiag(),
    ...extra,
  };
  console.error('[realtime:socket:error]', payload);
  console.error('[realtime:socket:error:json]', JSON.stringify(payload, null, 2));
}

/** Espera a que el WebSocket pase a open (connect() es sync; el handshake no). */
export async function waitForRealtimeSocketOpen(options?: {
  timeoutMs?: number;
  pollMs?: number;
}): Promise<{ opened: boolean; reason?: string; waitedMs: number }> {
  const timeoutMs = options?.timeoutMs ?? 8000;
  const pollMs = options?.pollMs ?? 100;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (supabase.realtime.isConnected()) {
      return { opened: true, waitedMs: Date.now() - start };
    }
    const state = supabase.realtime.connectionState?.();
    if (state === 'open') {
      return { opened: true, waitedMs: Date.now() - start };
    }
    await sleep(pollMs);
  }

  return {
    opened: false,
    reason: 'timeout',
    waitedMs: Date.now() - start,
  };
}

function invokeConnect(): void {
  try {
    supabase.realtime.connect();
  } catch (error) {
    logRealtimeSocketError('connect_throw', error, {
      hint: 'WebSocket bloqueado (CSP), URL inválida o entorno sin WebSocket',
    });
    throw error;
  }
}

/** setAuth → connect → esperar open. */
export async function ensureRealtimeSocketReady(): Promise<RealtimeSocketReadyResult> {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? null;

  logRealtimeSocket('before_connect', {
    hasSession: Boolean(sessionData.session),
    sessionUserId: sessionData.session?.user?.id ?? null,
    sessionError: sessionErr?.message ?? null,
    tokenPresent: Boolean(token),
  });

  if (token) {
    await supabase.realtime.setAuth(token);
  } else {
    await supabase.realtime.setAuth();
  }

  if (!supabase.realtime.isConnected()) {
    invokeConnect();
  }

  const wait = await waitForRealtimeSocketOpen({ timeoutMs: 8000 });

  logRealtimeSocket('after-connect', {
    hasSession: Boolean(sessionData.session),
    sessionUserId: sessionData.session?.user?.id ?? null,
    tokenPresent: Boolean(token),
    socketOpen: wait.opened,
    waitReason: wait.reason ?? null,
    waitedMs: wait.waitedMs,
  });

  const socketState =
    typeof supabase.realtime.connectionState === 'function'
      ? String(supabase.realtime.connectionState())
      : null;

  return {
    hasSession: Boolean(sessionData.session),
    sessionUserId: sessionData.session?.user?.id ?? null,
    socketOpen: wait.opened,
    socketState,
  };
}

/** Desconectar, limpiar canales, re-autenticar y reconectar. */
export async function reconnectRealtimeSocket(reason: string): Promise<boolean> {
  logRealtimeSocket('reconnect_start', { reason });

  const existing = [...(supabase.realtime.getChannels?.() ?? [])];
  for (const ch of existing) {
    try {
      await supabase.removeChannel(ch);
    } catch (error) {
      logRealtimeSocketError('remove_channel', error, { reason });
    }
  }

  try {
    await supabase.realtime.disconnect();
  } catch (error) {
    logRealtimeSocketError('disconnect', error, { reason });
  }

  await sleep(200);

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? null;
  if (token) {
    await supabase.realtime.setAuth(token);
  } else {
    await supabase.realtime.setAuth();
  }

  try {
    invokeConnect();
  } catch {
    return false;
  }

  const wait = await waitForRealtimeSocketOpen({ timeoutMs: 5000 });

  logRealtimeSocket('reconnect_done', {
    reason,
    socketOpen: wait.opened,
    waitReason: wait.reason ?? null,
    waitedMs: wait.waitedMs,
  });

  return wait.opened;
}
