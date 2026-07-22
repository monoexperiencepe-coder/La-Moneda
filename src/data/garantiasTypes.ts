import type { GuaranteeVehicleType } from '../config/guaranteeAmounts';

export type { GuaranteeVehicleType };

export type GuaranteeStatus =
  | 'sin_garantia'
  | 'pendiente'
  | 'completa'
  | 'incompleta'
  | 'con_descuentos_pendientes'
  | 'cerrada'
  | 'devuelta';

export type GuaranteeMovementType =
  | 'initial_deposit'
  | 'deposit'
  | 'fine_deduction'
  | 'damage_deduction'
  | 'repair_deduction'
  | 'other_deduction'
  | 'replenishment'
  | 'adjustment_credit'
  | 'adjustment_debit'
  | 'final_refund'
  | 'required_amount_change';

export type GuaranteeDirection = 'credit' | 'debit';

export interface DriverGuarantee {
  id: number;
  empresaId: string;
  driverId: string;
  currentVehicleId: number | null;
  vehicleType: GuaranteeVehicleType;
  requiredAmount: number;
  currentBalance: number;
  totalContributed: number;
  totalDeducted: number;
  status: GuaranteeStatus;
  closedAt: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GuaranteeMovement {
  id: number;
  empresaId: string;
  guaranteeId: number;
  driverId: string;
  vehicleId: number | null;
  movementType: GuaranteeMovementType;
  amount: number;
  direction: GuaranteeDirection;
  observation: string | null;
  reason: string | null;
  relatedMovementId: number | null;
  createdBy: string | null;
  movementDate: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface GuaranteeSetting {
  id: number;
  empresaId: string;
  vehicleType: GuaranteeVehicleType;
  requiredAmount: number;
  currency: string;
  isActive: boolean;
}

/** Totales derivados (fuente de verdad: movimientos). */
export interface GuaranteeComputed {
  totalContributed: number;
  totalDeducted: number;
  totalRefunded: number;
  currentBalance: number;
  pendingAmount: number;
  refundableAmount: number;
  status: GuaranteeStatus;
  hasOpenDeductionGap: boolean;
}

export const GUARANTEE_STATUS_LABELS: Record<GuaranteeStatus, string> = {
  sin_garantia: 'Sin garantía',
  pendiente: 'Pendiente',
  completa: 'Completa',
  incompleta: 'Incompleta',
  con_descuentos_pendientes: 'Con descuentos pendientes de reposición',
  cerrada: 'Cerrada',
  devuelta: 'Devuelta',
};

export const GUARANTEE_MOVEMENT_LABELS: Record<GuaranteeMovementType, string> = {
  initial_deposit: 'Entrega inicial',
  deposit: 'Abono',
  fine_deduction: 'Descuento por multa',
  damage_deduction: 'Descuento por daño',
  repair_deduction: 'Descuento por reparación',
  other_deduction: 'Otro descuento',
  replenishment: 'Reposición',
  adjustment_credit: 'Ajuste positivo',
  adjustment_debit: 'Ajuste negativo',
  final_refund: 'Devolución final',
  required_amount_change: 'Cambio de monto requerido',
};

export const CREDIT_MOVEMENT_TYPES: readonly GuaranteeMovementType[] = [
  'initial_deposit',
  'deposit',
  'replenishment',
  'adjustment_credit',
] as const;

export const DEBIT_MOVEMENT_TYPES: readonly GuaranteeMovementType[] = [
  'fine_deduction',
  'damage_deduction',
  'repair_deduction',
  'other_deduction',
  'adjustment_debit',
  'final_refund',
] as const;
