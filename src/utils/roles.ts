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

/** Actualizar / eliminar ingresos (admin y contador). Socios y operadores solo lectura / alta según caso. */
export function canMutateIngresos(role: AppRole): boolean {
  return role === 'admin' || role === 'contador';
}

/** Registrar nuevos ingresos desde UI (admin, contador, operador). */
export function canCreateIngresos(role: AppRole): boolean {
  return role === 'admin' || role === 'contador' || role === 'operador';
}
