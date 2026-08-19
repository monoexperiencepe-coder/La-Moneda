import type { AppRole } from '../data/types';

export function canViewFinances(role: AppRole): boolean {
  return role === 'admin' || role === 'socio' || role === 'contador';
}

export function canEditFinances(role: AppRole): boolean {
  return role === 'admin' || role === 'contador';
}

export function canAccessOperativo(role: AppRole): boolean {
  return role === 'admin' || role === 'operador' || role === 'socio' || role === 'contador';
}

export function isAdminRole(role: AppRole): boolean {
  return role === 'admin';
}

/** Actualizar / eliminar ingresos (alineado con RLS can_mutate_ingresos). */
export function canMutateIngresos(role: AppRole): boolean {
  return role === 'admin' || role === 'contador' || role === 'socio';
}

/** Registrar nuevos ingresos desde UI (alineado con RLS can_mutate_ingresos). */
export function canCreateIngresos(role: AppRole): boolean {
  return role === 'admin' || role === 'contador' || role === 'socio';
}

export function canManagePaymentAccounts(role: AppRole): boolean {
  return role === 'admin' || role === 'contador' || role === 'socio';
}
