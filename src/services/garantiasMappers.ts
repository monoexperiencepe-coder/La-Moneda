import type {
  DriverGuarantee,
  GuaranteeMovement,
  GuaranteeSetting,
  GuaranteeStatus,
  GuaranteeMovementType,
  GuaranteeDirection,
  GuaranteeVehicleType,
} from '../data/garantiasTypes';

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function strOrNull(v: unknown): string | null {
  if (v == null || v === '') return null;
  return String(v);
}

export function mapDriverGuaranteeRow(r: Record<string, unknown>): DriverGuarantee {
  return {
    id: num(r.id),
    empresaId: str(r.empresa_id),
    driverId: str(r.driver_id),
    currentVehicleId: r.current_vehicle_id != null ? num(r.current_vehicle_id) : null,
    vehicleType: (str(r.vehicle_type) as GuaranteeVehicleType) || 'auto',
    requiredAmount: num(r.required_amount),
    currentBalance: num(r.current_balance),
    totalContributed: num(r.total_contributed),
    totalDeducted: num(r.total_deducted),
    status: (str(r.status) as GuaranteeStatus) || 'pendiente',
    closedAt: strOrNull(r.closed_at),
    notes: strOrNull(r.notes),
    createdBy: strOrNull(r.created_by),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function mapGuaranteeMovementRow(r: Record<string, unknown>): GuaranteeMovement {
  const meta = r.metadata;
  return {
    id: num(r.id),
    empresaId: str(r.empresa_id),
    guaranteeId: num(r.guarantee_id),
    driverId: str(r.driver_id),
    vehicleId: r.vehicle_id != null ? num(r.vehicle_id) : null,
    movementType: str(r.movement_type) as GuaranteeMovementType,
    amount: num(r.amount),
    direction: str(r.direction) as GuaranteeDirection,
    observation: strOrNull(r.observation),
    reason: strOrNull(r.reason),
    relatedMovementId: r.related_movement_id != null ? num(r.related_movement_id) : null,
    createdBy: strOrNull(r.created_by),
    movementDate: str(r.movement_date),
    createdAt: str(r.created_at),
    metadata: meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {},
  };
}

export function mapGuaranteeSettingRow(r: Record<string, unknown>): GuaranteeSetting {
  return {
    id: num(r.id),
    empresaId: str(r.empresa_id),
    vehicleType: str(r.vehicle_type) as GuaranteeVehicleType,
    requiredAmount: num(r.required_amount),
    currency: str(r.currency) || 'PEN',
    isActive: r.is_active !== false,
  };
}
