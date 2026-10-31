import { supabase } from '../lib/supabase';
import type { AppRole } from '../data/types';
import { isUiAssignableRole, type UiAssignableRole } from '../config/userRolesUi';
import { mapRoleChangeRpcError } from '../utils/userRoleAdmin';

export type UserProfileRow = { id: string; name: string; email: string };

export type UserProfileAdminRow = UserProfileRow & {
  role: AppRole;
  is_active: boolean;
};

export type UserRolesAuditSummary = {
  totalUsuarios: number;
  admins: number;
  contadores: number;
  otrosRoles: number;
};

/** Mapa id → etiqueta para UI (RLS: solo admin activo del tenant ve perfiles de su empresa). */
export async function fetchUserProfilesLookup(): Promise<Map<string, UserProfileRow>> {
  const { data, error } = await supabase.from('user_profiles').select('id,name,email');
  if (error || !data?.length) {
    return new Map();
  }
  const m = new Map<string, UserProfileRow>();
  for (const row of data as UserProfileRow[]) {
    m.set(row.id, {
      id: row.id,
      name: row.name ?? '',
      email: row.email ?? '',
    });
  }
  return m;
}

/** Lista perfiles del tenant (admin). */
export async function fetchUserProfilesForAdmin(): Promise<UserProfileAdminRow[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id,name,email,role,is_active')
    .order('email');
  if (error || !data?.length) return [];
  return (data as UserProfileAdminRow[]).map((row) => ({
    id: row.id,
    name: row.name ?? '',
    email: row.email ?? '',
    role: row.role,
    is_active: row.is_active ?? true,
  }));
}

export function summarizeUserRolesAudit(rows: readonly UserProfileAdminRow[]): UserRolesAuditSummary {
  const visible = rows.filter((r) => r.is_active && isUiAssignableRole(r.role));
  return {
    totalUsuarios: visible.length,
    admins: visible.filter((r) => r.role === 'admin').length,
    contadores: visible.filter((r) => r.role === 'contador').length,
    otrosRoles: rows.filter((r) => !r.is_active || !isUiAssignableRole(r.role)).length,
  };
}

export function logUserRolesAudit(rows: readonly UserProfileAdminRow[]): UserRolesAuditSummary {
  const summary = summarizeUserRolesAudit(rows);
  console.info('[usuarios:roles:audit]', summary);
  return summary;
}

/**
 * Cambio de rol vía RPC `admin_update_user_role` (LM-03).
 * Requiere migración SQL aplicada en Supabase; sin ella el trigger bloquea UPDATE directo.
 */
export async function updateUserProfileRole(
  userId: string,
  role: UiAssignableRole,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc('admin_update_user_role', {
    p_target_user_id: userId,
    p_new_role: role,
  });
  if (error) {
    return { ok: false, message: mapRoleChangeRpcError(error.message) };
  }
  return { ok: true };
}
