import {
  CREDIT_MOVEMENT_TYPES,
  DEBIT_MOVEMENT_TYPES,
  getReversalOriginalMovementType,
  hasActiveFinalRefund,
  isContributionMovementType,
  isMovementReverted,
  isReversalMovement,
  isSensitiveReversalType,
  type DriverGuarantee,
  type GuaranteeComputed,
  type GuaranteeDirection,
  type GuaranteeMovement,
  type GuaranteeMovementType,
  type GuaranteeStatus,
} from '../data/garantiasTypes';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function directionForMovementType(type: GuaranteeMovementType): GuaranteeDirection {
  if (type === 'required_amount_change') return 'credit'; // amount ignored for balance
  if (type === 'reversal_credit') return 'credit';
  if (type === 'reversal_debit') return 'debit';
  if ((CREDIT_MOVEMENT_TYPES as readonly string[]).includes(type)) return 'credit';
  if ((DEBIT_MOVEMENT_TYPES as readonly string[]).includes(type)) return 'debit';
  return 'credit';
}

export function isDeductionType(type: GuaranteeMovementType): boolean {
  return (
    type === 'fine_deduction' ||
    type === 'damage_deduction' ||
    type === 'repair_deduction' ||
    type === 'other_deduction'
  );
}

/**
 * Calcula saldos y estado desde movimientos (fuente de verdad).
 * `requiredAmount` / flags de cierre vienen del encabezado de garantía.
 */
export function computeGuaranteeFromMovements(
  requiredAmount: number,
  movements: readonly Pick<
    GuaranteeMovement,
    'movementType' | 'amount' | 'direction' | 'metadata' | 'id' | 'relatedMovementId'
  >[],
  opts?: { closed?: boolean; fullyRefunded?: boolean },
): GuaranteeComputed {
  let totalContributed = 0;
  let totalDeducted = 0;
  let totalRefunded = 0;
  let balance = 0;
  let deductionSum = 0;
  let replenishmentSum = 0;

  for (const m of movements) {
    if (m.movementType === 'required_amount_change') continue;
    const amt = round2(Math.abs(Number(m.amount) || 0));
    if (amt <= 0) continue;

    const isRev = isReversalMovement(m);
    const origType = isRev
      ? getReversalOriginalMovementType(m) ?? m.movementType
      : m.movementType;

    if (m.direction === 'credit') {
      balance = round2(balance + amt);
      if (isRev) {
        if (isDeductionType(origType) || origType === 'adjustment_debit') {
          totalDeducted = round2(totalDeducted - amt);
        }
        if (origType === 'final_refund') {
          totalRefunded = round2(totalRefunded - amt);
        }
        if (origType === 'replenishment') {
          replenishmentSum = round2(replenishmentSum - amt);
        }
        if (isDeductionType(origType)) {
          deductionSum = round2(deductionSum - amt);
        }
      } else {
        if (isContributionMovementType(m.movementType)) {
          totalContributed = round2(totalContributed + amt);
        }
        if (m.movementType === 'replenishment') {
          replenishmentSum = round2(replenishmentSum + amt);
        }
      }
    } else {
      balance = round2(balance - amt);
      if (isRev) {
        if (isContributionMovementType(origType)) {
          totalContributed = round2(totalContributed - amt);
        }
      } else {
        if (isDeductionType(m.movementType) || m.movementType === 'adjustment_debit') {
          totalDeducted = round2(totalDeducted + amt);
        }
        if (isDeductionType(m.movementType)) {
          deductionSum = round2(deductionSum + amt);
        }
        if (m.movementType === 'final_refund') {
          totalRefunded = round2(totalRefunded + amt);
        }
      }
    }
  }

  totalContributed = round2(Math.max(0, totalContributed));
  totalDeducted = round2(Math.max(0, totalDeducted));
  totalRefunded = round2(Math.max(0, totalRefunded));

  const pendingAmount = round2(Math.max(0, requiredAmount - balance));
  const refundableAmount = round2(Math.max(0, balance));
  const hasOpenDeductionGap = deductionSum > replenishmentSum + 0.001;
  const activeFinalRefund = hasActiveFinalRefund(movements as GuaranteeMovement[]);

  let status: GuaranteeStatus;
  if (opts?.fullyRefunded || (activeFinalRefund && balance <= 0.001)) {
    status = 'devuelta';
  } else if (opts?.closed) {
    status = 'cerrada';
  } else if (totalContributed <= 0 && balance <= 0) {
    status = 'sin_garantia';
  } else if (hasOpenDeductionGap && balance < requiredAmount - 0.001) {
    status = 'con_descuentos_pendientes';
  } else if (pendingAmount <= 0.001 && balance + 0.001 >= requiredAmount) {
    status = 'completa';
  } else if (totalContributed > 0 && pendingAmount > 0.001) {
    status = pendingAmount >= requiredAmount - 0.001 ? 'pendiente' : 'incompleta';
  } else {
    status = 'pendiente';
  }

  return {
    totalContributed,
    totalDeducted,
    totalRefunded,
    currentBalance: balance,
    pendingAmount,
    refundableAmount,
    status,
    hasOpenDeductionGap,
  };
}

export function mergeGuaranteeComputed(
  guarantee: DriverGuarantee,
  movements: readonly GuaranteeMovement[],
): DriverGuarantee & GuaranteeComputed {
  const activeFinalRefund = hasActiveFinalRefund(movements);
  const closed =
    (guarantee.closedAt != null && activeFinalRefund) ||
    guarantee.status === 'cerrada' ||
    (guarantee.status === 'devuelta' && activeFinalRefund);
  const fullyRefunded = activeFinalRefund && guarantee.status === 'devuelta';
  const computed = computeGuaranteeFromMovements(guarantee.requiredAmount, movements, {
    closed,
    fullyRefunded,
  });
  return {
    ...guarantee,
    ...computed,
    currentBalance: computed.currentBalance,
    totalContributed: computed.totalContributed,
    totalDeducted: computed.totalDeducted,
    status: closed && fullyRefunded ? 'devuelta' : closed ? 'cerrada' : computed.status,
  };
}

export type MovementValidationError =
  | { code: 'invalid_amount'; message: string }
  | { code: 'insufficient_balance'; message: string }
  | { code: 'already_refunded'; message: string }
  | { code: 'closed'; message: string }
  | { code: 'forbidden_type'; message: string };

export function validateNewMovement(args: {
  guarantee: DriverGuarantee;
  movements: readonly GuaranteeMovement[];
  movementType: GuaranteeMovementType;
  amount: number;
}): MovementValidationError | null {
  const { guarantee, movements, movementType, amount } = args;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { code: 'invalid_amount', message: 'El monto debe ser un número positivo.' };
  }
  if (guarantee.status === 'cerrada' || guarantee.status === 'devuelta' || guarantee.closedAt) {
    return { code: 'closed', message: 'La garantía está cerrada o ya fue devuelta.' };
  }
  const computed = computeGuaranteeFromMovements(guarantee.requiredAmount, movements);
  const hasFinalRefund = hasActiveFinalRefund(movements);
  if (hasFinalRefund) {
    return { code: 'already_refunded', message: 'Ya existe una devolución final. Use un ajuste si hace falta corregir.' };
  }
  const direction = directionForMovementType(movementType);
  if (direction === 'debit') {
    if (movementType === 'final_refund') {
      if (amount > computed.refundableAmount + 0.001) {
        return {
          code: 'insufficient_balance',
          message: `La devolución no puede superar el saldo disponible (S/ ${computed.refundableAmount.toFixed(2)}).`,
        };
      }
    } else if (amount > computed.currentBalance + 0.001) {
      return {
        code: 'insufficient_balance',
        message: `El descuento no puede superar el saldo actual (S/ ${computed.currentBalance.toFixed(2)}).`,
      };
    }
  }
  return null;
}

const REVERT_ERROR_MESSAGES: Record<string, string> = {
  usuario_no_autenticado: 'Debes iniciar sesión.',
  rol_sin_permiso: 'No tienes permiso para revertir movimientos.',
  empresa_no_configurada: 'Empresa no configurada.',
  movimiento_invalido: 'Movimiento inválido.',
  motivo_reversion_obligatorio: 'El motivo de la reversión es obligatorio.',
  movimiento_no_encontrado: 'Movimiento no encontrado.',
  no_revertir_reversion: 'No se puede revertir un movimiento que ya es una reversión.',
  tipo_no_reversible: 'Este tipo de movimiento no se puede revertir.',
  movimiento_ya_revertido: 'Este movimiento ya fue revertido.',
  reversion_sensible_solo_admin: 'Revertir este movimiento requiere permiso de administrador.',
  solo_revertir_propios_movimientos: 'Solo puedes revertir movimientos que registraste tú.',
  garantia_no_encontrada: 'Garantía no encontrada.',
  garantia_cerrada_revertir_devolucion_primero:
    'La garantía está cerrada. Revierte primero la devolución final (administrador).',
  reversion_genera_saldo_negativo: 'La reversión dejaría el saldo en negativo.',
  reversion_genera_totales_incoherentes: 'La reversión generaría totales incoherentes.',
  reversion_fallida: 'No se pudo revertir el movimiento.',
};

export function mapRevertRpcError(code: string): string {
  return REVERT_ERROR_MESSAGES[code] ?? `Error al revertir: ${code}`;
}

export type RevertValidationError =
  | { code: 'forbidden'; message: string }
  | { code: 'already_reverted'; message: string }
  | { code: 'is_reversal'; message: string }
  | { code: 'not_reversible'; message: string }
  | { code: 'negative_balance'; message: string }
  | { code: 'closed'; message: string };

export function validateRevertMovement(args: {
  movement: GuaranteeMovement;
  movements: readonly GuaranteeMovement[];
  guarantee: DriverGuarantee;
  userId: string | null | undefined;
  isAdmin: boolean;
}): RevertValidationError | null {
  const { movement, movements, guarantee, userId, isAdmin } = args;

  if (isReversalMovement(movement)) {
    return { code: 'is_reversal', message: 'No se puede revertir un movimiento que ya es una reversión.' };
  }
  if (movement.movementType === 'required_amount_change') {
    return { code: 'not_reversible', message: 'Los cambios de monto requerido no se revierten desde aquí.' };
  }
  if (isMovementReverted(movements, movement.id)) {
    return { code: 'already_reverted', message: 'Este movimiento ya fue revertido.' };
  }

  const sensitive = isSensitiveReversalType(movement.movementType);
  if (sensitive && !isAdmin) {
    return {
      code: 'forbidden',
      message: 'Revertir devoluciones, ajustes o cierres requiere permiso de administrador.',
    };
  }
  if (!isAdmin && (!movement.createdBy || movement.createdBy !== userId)) {
    return { code: 'forbidden', message: 'Solo puedes revertir movimientos que registraste tú.' };
  }

  const activeFinalRefund = hasActiveFinalRefund(movements);
  if (
    guarantee.closedAt &&
    movement.movementType !== 'final_refund' &&
    activeFinalRefund &&
    !isAdmin
  ) {
    return {
      code: 'closed',
      message: 'La garantía está cerrada. Revierte primero la devolución final.',
    };
  }

  const computed = computeGuaranteeFromMovements(guarantee.requiredAmount, movements);
  const simBalance =
    movement.direction === 'credit'
      ? round2(computed.currentBalance - movement.amount)
      : round2(computed.currentBalance + movement.amount);
  if (simBalance < -0.001) {
    return {
      code: 'negative_balance',
      message: `La reversión dejaría el saldo en negativo (S/ ${simBalance.toFixed(2)}).`,
    };
  }

  return null;
}

/** Simula cambio de tipo de vehículo (Fase 1 manual). */
export function simulateVehicleTypeChange(
  currentRequired: number,
  newRequired: number,
  currentBalance: number,
): {
  requiredAmount: number;
  pendingAmount: number;
  excessRetained: number;
  incomplete: boolean;
} {
  const pendingAmount = round2(Math.max(0, newRequired - currentBalance));
  const excessRetained = round2(Math.max(0, currentBalance - newRequired));
  return {
    requiredAmount: newRequired,
    pendingAmount,
    excessRetained,
    incomplete: pendingAmount > 0.001,
  };
}
