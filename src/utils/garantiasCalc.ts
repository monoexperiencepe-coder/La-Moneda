import {
  CREDIT_MOVEMENT_TYPES,
  DEBIT_MOVEMENT_TYPES,
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
  movements: readonly Pick<GuaranteeMovement, 'movementType' | 'amount' | 'direction'>[],
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
    if (m.direction === 'credit') {
      balance = round2(balance + amt);
      if (
        m.movementType === 'initial_deposit' ||
        m.movementType === 'deposit' ||
        m.movementType === 'replenishment' ||
        m.movementType === 'adjustment_credit'
      ) {
        totalContributed = round2(totalContributed + amt);
      }
      if (m.movementType === 'replenishment') {
        replenishmentSum = round2(replenishmentSum + amt);
      }
    } else {
      balance = round2(balance - amt);
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

  const pendingAmount = round2(Math.max(0, requiredAmount - balance));
  const refundableAmount = round2(Math.max(0, balance));
  const hasOpenDeductionGap = deductionSum > replenishmentSum + 0.001;

  let status: GuaranteeStatus;
  if (opts?.fullyRefunded || (opts?.closed && totalRefunded > 0 && balance <= 0.001)) {
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
  const closed =
    guarantee.closedAt != null ||
    guarantee.status === 'cerrada' ||
    guarantee.status === 'devuelta';
  const fullyRefunded = guarantee.status === 'devuelta';
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
    status: closed ? (fullyRefunded || guarantee.status === 'devuelta' ? 'devuelta' : 'cerrada') : computed.status,
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
  const hasFinalRefund = movements.some((m) => m.movementType === 'final_refund');
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
