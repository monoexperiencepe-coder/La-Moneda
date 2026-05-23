import type { AppRole, AppUserProfile } from '../data/types';

/**
 * Restricción financiera por cuenta operador (frontend).
 * Seguridad real requiere RLS/views en Supabase — ver comentarios en README del módulo.
 */
export const OPERADOR_EMAIL = (
  import.meta.env.VITE_OPERADOR_EMAIL ?? 'operador@lamoneda.com'
)
  .trim()
  .toLowerCase();

/** Categorías visibles en tabs / parrilla / historial para cuenta operador restringida. */
export const OPERADOR_VISIBLE_TIPO_GASTO = ['gastos_globales', 'pendiente_revision'] as const;

/** @deprecated Usar OPERADOR_VISIBLE_TIPO_GASTO */
export const OPERADOR_ALLOWED_TIPO_GASTO = OPERADOR_VISIBLE_TIPO_GASTO;

/** Destinos válidos al clasificar/mover gasto (todas las categorías financieras). */
export const FINANZA_MOVE_TARGET_TIPO_GASTO = [
  'operativo_vehiculo',
  'operativo_flota_general',
  'administrativo_empresa',
  'financiero_prestamo',
  'planilla_laboral',
  'representacion_interna',
  'gastos_globales',
  'inversion_compra',
  'pendiente_revision',
] as const;

/** @deprecated Usar FINANZA_MOVE_TARGET_TIPO_GASTO — operador puede mover a todas las categorías financieras. */
export const OPERADOR_MOVE_TARGET_TIPO_GASTO = FINANZA_MOVE_TARGET_TIPO_GASTO;

export type PermissionUser = AppUserProfile & { email?: string | null };

export type AppSection =
  | 'inicio'
  | 'finanzas'
  | 'finanzas_gastos'
  | 'finanzas_ingresos'
  | 'finanzas_resumen'
  | 'finanzas_reportes'
  | 'finanzas_financiamiento'
  | 'finanzas_inversiones'
  | 'finanzas_caja'
  | 'vehiculos'
  | 'operaciones'
  | 'reportes'
  | 'metas'
  | 'configuracion'
  | 'admin';

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/**
 * Cuenta con acceso financiero restringido (solo globales + pendiente revisión).
 * Mismo criterio que RLS `is_restricted_operador_account()`: rol operador o email operador@.
 */
export function isFinancialOperadorRestricted(user: PermissionUser | null | undefined): boolean {
  if (!user) return false;
  const mail = normalizeEmail(user.email);
  if (mail && mail === OPERADOR_EMAIL) return true;
  const role = (user.role ?? '').trim().toLowerCase();
  return role === 'operador';
}

/**
 * Rol efectivo para permisos de app.
 * Cuenta restringida (rol operador o email operador@) se trata como operador en UI.
 */
export function getUserRole(user: PermissionUser | null | undefined): AppRole {
  if (!user) return 'operador';
  if (isFinancialOperadorRestricted(user)) return 'operador';
  return user.role;
}

export function canViewGastoTipo(user: PermissionUser | null | undefined, tipoGasto: string | null | undefined): boolean {
  if (!user) return false;
  if (!isFinancialOperadorRestricted(user)) return true;
  const t = (tipoGasto ?? '').trim();
  return (OPERADOR_VISIBLE_TIPO_GASTO as readonly string[]).includes(t);
}

/** Tipos de gasto visibles en navegación/tabs según rol (operador: solo globales + pendiente). */
export function getVisibleGastoTipoGastoForUser(
  user: PermissionUser | null | undefined,
): readonly string[] | null {
  if (!user || !isFinancialOperadorRestricted(user)) return null;
  return OPERADOR_VISIBLE_TIPO_GASTO;
}

/** Tipos de gasto permitidos como destino en «Mover categoría» / conciliación. */
export function getMoveTargetGastoTipoGastoForUser(
  user: PermissionUser | null | undefined,
): readonly string[] {
  void user;
  return FINANZA_MOVE_TARGET_TIPO_GASTO;
}

/** Puede clasificar un gasto hacia `targetTipo` (independiente de tabs visibles). */
export function canMoveGastoToTipo(
  user: PermissionUser | null | undefined,
  targetTipo: string,
): boolean {
  if (!user) return false;
  const t = targetTipo.trim();
  if (!(FINANZA_MOVE_TARGET_TIPO_GASTO as readonly string[]).includes(t)) return false;
  if (isFinancialOperadorRestricted(user)) return true;
  return user.role === 'admin' || user.role === 'contador';
}

export function canViewAmounts(user: PermissionUser | null | undefined): boolean {
  if (!user) return false;
  return !isFinancialOperadorRestricted(user);
}

/** Totales globales / conciliación cruzada / KPIs del dueño. */
export function canViewGlobalTotals(user: PermissionUser | null | undefined): boolean {
  return canViewAmounts(user);
}

export function canEditGastoTipo(user: PermissionUser | null | undefined, tipoGasto: string | null | undefined): boolean {
  if (!user) return false;
  if (isFinancialOperadorRestricted(user)) {
    return canViewGastoTipo(user, tipoGasto);
  }
  return user.role === 'admin' || user.role === 'contador';
}

/** @deprecated Usar canMoveGastoToTipo */
export function canMovePendienteToTipo(
  user: PermissionUser | null | undefined,
  targetTipo: string,
): boolean {
  return canMoveGastoToTipo(user, targetTipo);
}

export function canUseIngresos(user: PermissionUser | null | undefined): boolean {
  if (!user || isFinancialOperadorRestricted(user)) return false;
  return user.role === 'admin' || user.role === 'socio' || user.role === 'contador';
}

/** Historial del sistema / financial_audit_logs (alineado con RLS SELECT). */
export function canViewFinancialAuditLogs(user: PermissionUser | null | undefined): boolean {
  if (!user || isFinancialOperadorRestricted(user)) return false;
  return user.role === 'admin' || user.role === 'socio' || user.role === 'contador';
}

export function canUseReports(user: PermissionUser | null | undefined): boolean {
  if (!user || isFinancialOperadorRestricted(user)) return false;
  return user.role === 'admin' || user.role === 'socio' || user.role === 'contador';
}

export function canUseResumen(user: PermissionUser | null | undefined): boolean {
  return canUseReports(user);
}

export function canUseFinanciamiento(user: PermissionUser | null | undefined): boolean {
  if (!user || isFinancialOperadorRestricted(user)) return false;
  return user.role === 'admin' || user.role === 'socio' || user.role === 'contador';
}

export function canUseInversiones(user: PermissionUser | null | undefined): boolean {
  if (!user || isFinancialOperadorRestricted(user)) return false;
  return user.role === 'admin' || user.role === 'socio' || user.role === 'contador';
}

export function canViewSection(user: PermissionUser | null | undefined, section: AppSection): boolean {
  if (!user) return false;
  if (isFinancialOperadorRestricted(user)) {
    switch (section) {
      case 'finanzas':
      case 'finanzas_gastos':
        return true;
      default:
        return false;
    }
  }
  switch (section) {
    case 'inicio':
      return true;
    case 'finanzas':
    case 'finanzas_gastos':
    case 'finanzas_ingresos':
      return user.role === 'admin' || user.role === 'socio' || user.role === 'contador';
    case 'finanzas_resumen':
      return canUseResumen(user);
    case 'finanzas_reportes':
      return canUseReports(user);
    case 'finanzas_financiamiento':
      return canUseFinanciamiento(user);
    case 'finanzas_inversiones':
    case 'finanzas_caja':
      return canUseInversiones(user) || user.role === 'admin' || user.role === 'socio' || user.role === 'contador';
    case 'vehiculos':
      return user.role === 'admin' || user.role === 'operador' || user.role === 'socio' || user.role === 'contador';
    case 'operaciones':
      return user.role === 'admin' || user.role === 'operador' || user.role === 'socio' || user.role === 'contador';
    case 'reportes':
      return canUseReports(user);
    case 'metas':
      return user.role === 'admin' || user.role === 'socio' || user.role === 'contador';
    case 'configuracion':
      return true;
    case 'admin':
      return user.role === 'admin';
    default:
      return false;
  }
}

export function filterGastosForUser<T extends { tipo_gasto?: string | null }>(
  user: PermissionUser | null | undefined,
  gastos: T[],
): T[] {
  if (!user || !isFinancialOperadorRestricted(user)) return gastos;
  return gastos.filter((g) => canViewGastoTipo(user, g.tipo_gasto ?? null));
}

export function permissionUserFromAuth(
  user: AppUserProfile,
  email: string | null | undefined,
): PermissionUser {
  return { ...user, email };
}
