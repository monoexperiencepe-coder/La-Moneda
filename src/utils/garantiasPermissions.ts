import type { PermissionUser } from './permissions';
import { getUserRole, isFinancialOperadorRestricted } from './permissions';
import { isGuaranteesModuleEnabled } from '../config/featureFlags';
import type { GuaranteeMovementType, GuaranteeMovement } from '../data/garantiasTypes';
import {
  isMovementReverted,
  isReversalMovement,
  isSensitiveReversalType,
} from '../data/garantiasTypes';
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
  if (type === 'reversal_credit' || type === 'reversal_debit') {
    return false;
  }
  return false;
}

export function canAuditGarantias(user: PermissionUser | null | undefined): boolean {
  return canViewGarantias(user);
}

/** Revertir movimiento: admin cualquiera; socio/contador solo propios; sensibles solo admin. */
export function canRevertMovement(
  user: PermissionUser | null | undefined,
  movement: Pick<GuaranteeMovement, 'movementType' | 'metadata' | 'createdBy' | 'id' | 'relatedMovementId'>,
  movements: readonly Pick<GuaranteeMovement, 'relatedMovementId' | 'metadata' | 'movementType'>[],
): boolean {
  if (!canViewGarantias(user) || !user) return false;
  const role = getUserRole(user);
  if (role !== 'admin' && role !== 'socio' && role !== 'contador') return false;

  if (isReversalMovement(movement)) return false;
  if (movement.movementType === 'required_amount_change') return false;
  if (isMovementReverted(movements, movement.id)) return false;

  if (isSensitiveReversalType(movement.movementType)) {
    return role === 'admin';
  }
  if (role === 'admin') return true;
  return !!movement.createdBy && movement.createdBy === user.id;
}
