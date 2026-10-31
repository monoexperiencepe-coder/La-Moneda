/**
 * Administradores principales autorizados para gestionar roles (LM-03).
 * Validación en servidor por UUID (RPC); el rol `admin` operativo no implica esta capacidad.
 *
 * Verificados en Supabase (solo lectura, tenant La Moneda):
 * - Diego SB — diegosb0301@gmail.com
 * - Álvaro SB24 — alvarosb24@gmail.com (≠ alvarosalasvelarde@gmail.com)
 */
export const ROLE_MANAGER_PROFILES = {
  diegoSb: {
    userId: '2418065a-e7b1-41b6-840d-b49dfa353285',
    email: 'diegosb0301@gmail.com',
    label: 'Diego SB',
  },
  alvaroSb24: {
    userId: '9cd68f28-e1dc-4e6b-bbb4-fb557ea1c87f',
    email: 'alvarosb24@gmail.com',
    label: 'Álvaro SB24',
  },
} as const;

export const ROLE_MANAGER_USER_IDS: readonly string[] = [
  ROLE_MANAGER_PROFILES.diegoSb.userId,
  ROLE_MANAGER_PROFILES.alvaroSb24.userId,
];

const ROLE_MANAGER_ID_SET = new Set<string>(ROLE_MANAGER_USER_IDS);

/** Distinto de alvarosalasvelarde@gmail.com (admin operativo, sin gestión de roles). */
export const OPERATIONAL_ADMIN_ALVARO_SALAS = {
  userId: 'd666cb8f-8788-4579-8da2-eb19bbbb31c6',
  email: 'alvarosalasvelarde@gmail.com',
} as const;

export function isRoleManagerUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return ROLE_MANAGER_ID_SET.has(userId);
}

/** Cuentas que no pueden degradarse de administrador vía la app. */
export function isProtectedRoleManagerUserId(userId: string | null | undefined): boolean {
  return isRoleManagerUserId(userId);
}

export function roleManagerLabelForUserId(userId: string | null | undefined): string | null {
  if (userId === ROLE_MANAGER_PROFILES.diegoSb.userId) return 'Administrador principal';
  if (userId === ROLE_MANAGER_PROFILES.alvaroSb24.userId) return 'Administrador principal';
  return null;
}
