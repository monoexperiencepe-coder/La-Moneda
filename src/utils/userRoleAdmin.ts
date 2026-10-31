import type { AppRole } from '../data/types';
import { isUiAssignableRole, type UiAssignableRole } from '../config/userRolesUi';
import {
  isProtectedRoleManagerUserId,
  isRoleManagerUserId,
} from '../config/roleManagers';

export type RoleChangeBlockReason =
  | 'not_role_manager'
  | 'self_change'
  | 'protected_primary_admin'
  | 'invalid_role'
  | 'inactive_target'
  | 'legacy_role'
  | 'no_change';

export type RoleChangePrecheck = {
  allowed: true;
  previousRole: UiAssignableRole;
  newRole: UiAssignableRole;
} | {
  allowed: false;
  reason: RoleChangeBlockReason;
  message: string;
};

export function precheckAdminRoleChange(params: {
  actorCanManageRoles: boolean;
  actorUserId: string | null;
  targetUserId: string;
  targetIsActive: boolean;
  targetCurrentRole: AppRole;
  requestedRole: AppRole;
}): RoleChangePrecheck {
  if (!params.actorCanManageRoles || !isRoleManagerUserId(params.actorUserId)) {
    return {
      allowed: false,
      reason: 'not_role_manager',
      message: 'Solo los administradores principales pueden cambiar roles.',
    };
  }
  if (!params.targetIsActive) {
    return { allowed: false, reason: 'inactive_target', message: 'La cuenta destino está inactiva.' };
  }
  if (!isUiAssignableRole(params.targetCurrentRole)) {
    return { allowed: false, reason: 'legacy_role', message: 'Este usuario tiene un rol legado no editable desde aquí.' };
  }
  if (!isUiAssignableRole(params.requestedRole)) {
    return { allowed: false, reason: 'invalid_role', message: 'Rol no permitido. Solo Administrador o Contador.' };
  }
  if (params.actorUserId && params.actorUserId === params.targetUserId) {
    return { allowed: false, reason: 'self_change', message: 'No puedes cambiar tu propio rol.' };
  }
  if (
    isProtectedRoleManagerUserId(params.targetUserId) &&
    params.targetCurrentRole === 'admin' &&
    params.requestedRole !== 'admin'
  ) {
    return {
      allowed: false,
      reason: 'protected_primary_admin',
      message: 'Esta cuenta de administrador principal no puede degradarse desde la aplicación.',
    };
  }
  if (params.targetCurrentRole === params.requestedRole) {
    return { allowed: false, reason: 'no_change', message: 'El rol seleccionado es igual al actual.' };
  }
  return {
    allowed: true,
    previousRole: params.targetCurrentRole,
    newRole: params.requestedRole,
  };
}

/** Mensajes de error RPC → UI */
export function mapRoleChangeRpcError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('not_role_manager')) {
    return 'No estás autorizado para administrar roles. Solo los administradores principales pueden hacerlo.';
  }
  if (m.includes('protected_primary_admin')) {
    return 'Esta cuenta de administrador principal no puede degradarse.';
  }
  if (m.includes('self_role_change')) {
    return 'No puedes cambiar tu propio rol.';
  }
  if (m.includes('role_change_requires_rpc')) {
    return 'El cambio de rol debe realizarse desde Usuarios y roles (RPC segura).';
  }
  if (m.includes('concurrent_role_change') || m.includes('p0002')) {
    return 'Otro administrador modificó este rol. Recarga la lista e intenta de nuevo.';
  }
  return message || 'No se pudo actualizar el rol.';
}
