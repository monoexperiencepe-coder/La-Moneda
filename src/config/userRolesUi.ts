import type { AppRole } from '../data/types';

/** Roles asignables desde la UI de gestión (dueño: solo admin y contador). */
export const UI_ASSIGNABLE_ROLES = ['admin', 'contador'] as const satisfies readonly AppRole[];

export type UiAssignableRole = (typeof UI_ASSIGNABLE_ROLES)[number];

export function isUiAssignableRole(role: string): role is UiAssignableRole {
  return (UI_ASSIGNABLE_ROLES as readonly string[]).includes(role);
}

export function isUiEnabledRole(role: string): boolean {
  return isUiAssignableRole(role);
}

export const UI_ROLE_LABELS: Record<UiAssignableRole, string> = {
  admin: 'Administrador',
  contador: 'Contador',
};

export const LEGACY_ROLE_LABELS: Partial<Record<AppRole, string>> = {
  socio: 'Socio (no habilitado)',
  operador: 'Operador (no habilitado)',
};

export function roleDisplayLabel(role: AppRole): string {
  if (isUiAssignableRole(role)) return UI_ROLE_LABELS[role];
  return LEGACY_ROLE_LABELS[role] ?? `Rol no habilitado (${role})`;
}
