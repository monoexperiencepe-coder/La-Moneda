import { supabase } from '../lib/supabase';

/** Respuesta de public.debug_can_update_gasto_row() en Supabase. */
export type DebugCanUpdateGastoRow = {
  found: boolean;
  gasto_id?: string;
  old_tipo?: string | null;
  old_tipo_canon?: string | null;
  old_subtipo?: string | null;
  old_empresa_id?: string;
  old_vehicle_id?: unknown;
  old_es_global_flota?: boolean;
  can_using_old?: boolean;
  can_check_target?: boolean;
  would_pass_update_policy?: boolean;
  target_tipo?: string;
  target_tipo_permitido?: boolean;
  old_tipo_visible_operador?: boolean;
  policy_hint?: string;
  reason_flags?: Record<string, boolean>;
  usuario?: Record<string, unknown>;
};

export async function fetchDebugCanUpdateGastoRow(
  gastoId: string,
  targetTipo = 'operativo_flota_general',
  targetSubtipo?: string | null,
): Promise<DebugCanUpdateGastoRow | null> {
  const id = gastoId.trim();
  if (!id) return null;
  const { data, error } = await supabase.rpc('debug_can_update_gasto_row', {
    p_gasto_id: id,
    p_target_tipo: targetTipo,
    p_target_subtipo: targetSubtipo ?? null,
  });
  if (error) {
    console.warn('[rlsDebug] debug_can_update_gasto_row falló', error.message, error.code);
    return null;
  }
  return (data as DebugCanUpdateGastoRow | null) ?? null;
}

/** Respuesta de public.debug_rls_context() en Supabase. */
export type RlsDebugContext = {
  auth_uid: string | null;
  auth_uid_builtin: string | null;
  jwt_sub_claim: string | null;
  jwt_role_claim: string | null;
  current_user_empresa_id: string | null;
  current_user_role: string | null;
  is_active_user: boolean;
  is_restricted_operador_account: boolean;
  profile: {
    id: string;
    email: string;
    role: string;
    is_active: boolean;
    empresa_id: string;
  } | null;
  can_read_gastos_globales: boolean;
  can_read_pendiente_revision: boolean;
  can_read_operativo_flota_general: boolean;
  can_update_using_gastos_globales: boolean;
  can_check_operativo_flota_general: boolean;
  can_check_inversion_compra: boolean;
  profile_cache_loaded?: boolean;
  timing_ms?: {
    profile_cache_ensure?: number;
    helpers_after_cache?: number;
    total?: number;
  };
};

export async function fetchRlsDebugContext(): Promise<RlsDebugContext | null> {
  const { data, error } = await supabase.rpc('debug_rls_context');
  if (error) {
    console.warn('[rlsDebug] debug_rls_context RPC falló', error.message, error.code);
    return null;
  }
  return (data as RlsDebugContext | null) ?? null;
}

/** Log en consola: auth client vs profile vs helpers RLS en servidor. */
export async function logRlsDebugContext(label: string): Promise<RlsDebugContext | null> {
  const [{ data: authUser }, ctx] = await Promise.all([
    supabase.auth.getUser(),
    fetchRlsDebugContext(),
  ]);

  const authId = authUser.user?.id ?? null;
  console.info(`[rlsDebug] ${label}`, {
    authClientUserId: authId,
    profileFromContext: ctx?.profile ?? null,
    rlsServer: ctx,
    authUidMatchesProfile: authId != null && ctx?.auth_uid != null && authId === ctx.auth_uid,
    empresaIdMatchesProfile:
      ctx?.profile?.empresa_id != null
      && ctx?.current_user_empresa_id != null
      && ctx.profile.empresa_id === ctx.current_user_empresa_id,
  });
  return ctx;
}
