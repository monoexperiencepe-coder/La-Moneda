import type { PermissionUser } from './permissions';
import { getUserRole, isFinancialOperadorRestricted } from './permissions';
import { isGuaranteesModuleEnabled } from '../config/featureFlags';
import type { GuaranteeMovementType } from '../data/garantiasTypes';
import { isDeductionType } from './garantiasCalc';

export function canViewGarantias(user: PermissionUser | null | undefined): boolean {
  if (!isGuaranteesModuleEnabled() || !user) return false;
  if (isFinancialOperadorRestricted(user)) return false;
  const role = getUserRole(user);
  return role === 'admin' || role === 'socio' || role === 'contador';
}

export function canCreateGarantia(user: PermissionUser | null | undefined): boolean {
  return canViewGarantias(user);
}

export function canRegisterDeposit(user: PermissionUser | null | undefined): boolean {
  return canViewGarantias(user);
}

/** Descuentos, ajustes y devoluciones: admin o contador. */
export function canRegisterSensitiveMovement(user: PermissionUser | null | undefined): boolean {
  if (!canViewGarantias(user) || !user) return false;
  const role = getUserRole(user);
  return role === 'admin' || role === 'contador';
}

export function canRegisterMovementType(
  user: PermissionUser | null | undefined,
  type: GuaranteeMovementType,
): boolean {
  if (!canViewGarantias(user)) return false;
  if (
    type === 'initial_deposit' ||
    type === 'deposit' ||
    type === 'replenishment' ||
    type === 'required_amount_change'
  ) {
    return canRegisterDeposit(user);
  }
  if (isDeductionType(type) || type === 'adjustment_credit' || type === 'adjustment_debit' || type === 'final_refund') {
    return canRegisterSensitiveMovement(user);
  }
  return false;
}

export function canAuditGarantias(user: PermissionUser | null | undefined): boolean {
  return canViewGarantias(user);
}
