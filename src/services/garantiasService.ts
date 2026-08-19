import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { getDefaultRequiredAmount, type GuaranteeVehicleType } from '../config/guaranteeAmounts';
import type {
  DriverGuarantee,
  GuaranteeMovement,
  GuaranteeMovementType,
  GuaranteeSetting,
} from '../data/garantiasTypes';
import {
  computeGuaranteeFromMovements,
  directionForMovementType,
  mapRevertRpcError,
  validateNewMovement,
} from '../utils/garantiasCalc';
import {
  mapDriverGuaranteeRow,
  mapGuaranteeMovementRow,
  mapGuaranteeSettingRow,
} from './garantiasMappers';

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

export async function fetchGuaranteeSettings(
  tenantEmpresaId?: string | null,
): Promise<GuaranteeSetting[]> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return [];
  const { data, error } = await supabase
    .from('guarantee_settings')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('is_active', true);
  if (error) {
    console.error('[garantias settings]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapGuaranteeSettingRow(r as Record<string, unknown>));
}

export async function resolveRequiredAmount(
  vehicleType: GuaranteeVehicleType,
  tenantEmpresaId?: string | null,
): Promise<number> {
  const settings = await fetchGuaranteeSettings(tenantEmpresaId);
  const row = settings.find((s) => s.vehicleType === vehicleType);
  return row?.requiredAmount ?? getDefaultRequiredAmount(vehicleType);
}

export async function fetchDriverGuarantees(
  tenantEmpresaId?: string | null,
): Promise<DriverGuarantee[]> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return [];
  const { data, error } = await supabase
    .from('driver_guarantees')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('[garantias list]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapDriverGuaranteeRow(r as Record<string, unknown>));
}

export async function fetchDriverGuaranteeById(
  id: number,
  tenantEmpresaId?: string | null,
): Promise<DriverGuarantee | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId || !Number.isFinite(id)) return null;
  const { data, error } = await supabase
    .from('driver_guarantees')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[garantias get]', error.message);
    return null;
  }
  return data ? mapDriverGuaranteeRow(data as Record<string, unknown>) : null;
}

export async function fetchActiveGuaranteeByDriver(
  driverId: string,
  tenantEmpresaId?: string | null,
): Promise<DriverGuarantee | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId || !driverId.trim()) return null;
  const { data, error } = await supabase
    .from('driver_guarantees')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('driver_id', driverId)
    .is('closed_at', null)
    .not('status', 'in', '("cerrada","devuelta")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[garantias by driver]', error.message);
    return null;
  }
  return data ? mapDriverGuaranteeRow(data as Record<string, unknown>) : null;
}

export async function fetchGuaranteeMovements(
  guaranteeId: number,
  tenantEmpresaId?: string | null,
): Promise<GuaranteeMovement[]> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId || !Number.isFinite(guaranteeId)) return [];
  const { data, error } = await supabase
    .from('guarantee_movements')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('guarantee_id', guaranteeId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[garantias movements]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapGuaranteeMovementRow(r as Record<string, unknown>));
}

export type CreateGuaranteeInput = {
  driverId: string;
  currentVehicleId: number | null;
  vehicleType: GuaranteeVehicleType;
  requiredAmount?: number;
  notes?: string | null;
  createdBy?: string | null;
  /** Entrega inicial opcional al crear. */
  initialDeposit?: number | null;
  movementDate?: string;
};

export async function createDriverGuarantee(
  input: CreateGuaranteeInput,
  tenantEmpresaId?: string | null,
): Promise<DriverGuarantee> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) throw new Error('Empresa no configurada.');
  const driverId = input.driverId.trim();
  if (!driverId) throw new Error('Conductor obligatorio.');

  const existing = await fetchActiveGuaranteeByDriver(driverId, empresaId);
  if (existing) {
    throw new Error('Este conductor ya tiene una garantía activa.');
  }

  const requiredAmount =
    input.requiredAmount != null && Number.isFinite(input.requiredAmount)
      ? input.requiredAmount
      : await resolveRequiredAmount(input.vehicleType, empresaId);

  const initialAmount = input.initialDeposit ?? 0;
  if (!Number.isFinite(requiredAmount) || requiredAmount < 0) {
    throw new Error('Monto requerido inválido.');
  }
  if (!Number.isFinite(initialAmount) || initialAmount < 0) {
    throw new Error('Monto entregado inicialmente inválido.');
  }

  // La función de base de datos crea encabezado + depósito + recálculo dentro
  // de una sola transacción. Nunca debe reemplazarse por escrituras separadas.
  const { data, error } = await supabase.rpc('create_driver_guarantee_with_initial_deposit', {
    p_empresa_id: empresaId,
    p_driver_id: driverId,
    p_current_vehicle_id: input.currentVehicleId,
    p_vehicle_type: input.vehicleType,
    p_required_amount: requiredAmount,
    p_initial_amount: initialAmount,
    p_notes: input.notes?.trim() || null,
    p_movement_date: input.movementDate || null,
  });

  if (error) {
    console.error('[garantias create]', error.message);
    if (error.code === '23505') {
      throw new Error('Este conductor ya tiene una garantía activa.');
    }
    throw new Error(error.message || 'No se pudo crear la garantía.');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Respuesta incompleta al crear la garantía.');
  return mapDriverGuaranteeRow(row as Record<string, unknown>);
}

export type AddMovementInput = {
  guaranteeId: number;
  movementType: GuaranteeMovementType;
  amount: number;
  vehicleId?: number | null;
  observation?: string | null;
  reason?: string | null;
  relatedMovementId?: number | null;
  createdBy?: string | null;
  movementDate?: string;
  metadata?: Record<string, unknown>;
};

export async function addGuaranteeMovement(
  input: AddMovementInput,
  tenantEmpresaId?: string | null,
): Promise<{ guarantee: DriverGuarantee; movement: GuaranteeMovement }> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) throw new Error('Empresa no configurada.');

  const guarantee = await fetchDriverGuaranteeById(input.guaranteeId, empresaId);
  if (!guarantee) throw new Error('Garantía no encontrada.');

  const movements = await fetchGuaranteeMovements(guarantee.id, empresaId);
  const validation = validateNewMovement({
    guarantee,
    movements,
    movementType: input.movementType,
    amount: input.amount,
  });
  if (validation) throw new Error(validation.message);

  const direction = directionForMovementType(input.movementType);

  const { data: movRow, error: movErr } = await supabase
    .from('guarantee_movements')
    .insert({
      empresa_id: empresaId,
      guarantee_id: guarantee.id,
      driver_id: guarantee.driverId,
      vehicle_id: input.vehicleId ?? guarantee.currentVehicleId,
      movement_type: input.movementType,
      amount: input.amount,
      direction,
      observation: input.observation?.trim() || null,
      reason: input.reason?.trim() || null,
      related_movement_id: input.relatedMovementId ?? null,
      created_by: input.createdBy ?? null,
      movement_date: input.movementDate || undefined,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();

  if (movErr) {
    console.error('[garantias movement]', movErr.message);
    throw new Error(movErr.message || 'No se pudo registrar el movimiento.');
  }

  const movement = mapGuaranteeMovementRow(movRow as Record<string, unknown>);
  const allMovements = [movement, ...movements];
  const isFinalRefund = input.movementType === 'final_refund';
  const computed = computeGuaranteeFromMovements(guarantee.requiredAmount, allMovements, {
    closed: isFinalRefund,
    fullyRefunded: isFinalRefund,
  });

  const patch: Record<string, unknown> = {
    current_balance: computed.currentBalance,
    total_contributed: computed.totalContributed,
    total_deducted: computed.totalDeducted,
    status: computed.status,
    updated_at: new Date().toISOString(),
  };
  if (isFinalRefund) {
    patch.closed_at = new Date().toISOString();
    patch.status = 'devuelta';
  }

  const { data: gRow, error: gErr } = await supabase
    .from('driver_guarantees')
    .update(patch)
    .eq('id', guarantee.id)
    .eq('empresa_id', empresaId)
    .select('*')
    .single();

  if (gErr) {
    console.error('[garantias update balances]', gErr.message);
    throw new Error('Movimiento creado pero no se pudo actualizar saldos.');
  }

  return {
    guarantee: mapDriverGuaranteeRow(gRow as Record<string, unknown>),
    movement,
  };
}

/**
 * Cambio simulado de tipo de vehículo (Fase 1 manual).
 * Actualiza required_amount + vehicle_type; registra movimiento de auditoría.
 * No devuelve excedente automáticamente.
 */
export async function updateGuaranteeVehicleType(
  guaranteeId: number,
  next: {
    vehicleType: GuaranteeVehicleType;
    vehicleId?: number | null;
    requiredAmount?: number;
    createdBy?: string | null;
    observation?: string;
  },
  tenantEmpresaId?: string | null,
): Promise<DriverGuarantee> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) throw new Error('Empresa no configurada.');

  const guarantee = await fetchDriverGuaranteeById(guaranteeId, empresaId);
  if (!guarantee) throw new Error('Garantía no encontrada.');
  if (guarantee.closedAt || guarantee.status === 'cerrada' || guarantee.status === 'devuelta') {
    throw new Error('No se puede cambiar el tipo en una garantía cerrada.');
  }

  const requiredAmount =
    next.requiredAmount != null && Number.isFinite(next.requiredAmount)
      ? next.requiredAmount
      : await resolveRequiredAmount(next.vehicleType, empresaId);

  const movements = await fetchGuaranteeMovements(guaranteeId, empresaId);
  const computed = computeGuaranteeFromMovements(requiredAmount, movements);

  const { error: movErr } = await supabase.from('guarantee_movements').insert({
    empresa_id: empresaId,
    guarantee_id: guaranteeId,
    driver_id: guarantee.driverId,
    vehicle_id: next.vehicleId ?? guarantee.currentVehicleId,
    movement_type: 'required_amount_change',
    amount: Math.abs(requiredAmount - guarantee.requiredAmount) || 0.01,
    direction: 'credit',
    observation:
      next.observation?.trim() ||
      `Cambio de tipo ${guarantee.vehicleType} → ${next.vehicleType} (requerido S/ ${requiredAmount})`,
    reason: 'vehicle_type_change',
    created_by: next.createdBy ?? null,
    metadata: {
      previous_type: guarantee.vehicleType,
      next_type: next.vehicleType,
      previous_required: guarantee.requiredAmount,
      next_required: requiredAmount,
    },
  });

  if (movErr) {
    console.error('[garantias type change mov]', movErr.message);
    throw new Error(movErr.message || 'No se pudo registrar el cambio.');
  }

  const { data, error } = await supabase
    .from('driver_guarantees')
    .update({
      vehicle_type: next.vehicleType,
      required_amount: requiredAmount,
      current_vehicle_id: next.vehicleId !== undefined ? next.vehicleId : guarantee.currentVehicleId,
      current_balance: computed.currentBalance,
      total_contributed: computed.totalContributed,
      total_deducted: computed.totalDeducted,
      status: computed.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', guaranteeId)
    .eq('empresa_id', empresaId)
    .select('*')
    .single();

  if (error) {
    console.error('[garantias type change]', error.message);
    throw new Error(error.message || 'No se pudo actualizar la garantía.');
  }

  return mapDriverGuaranteeRow(data as Record<string, unknown>);
}

export type RevertMovementResult = {
  guarantee: DriverGuarantee;
  reversalMovementId: number;
  originalMovementId: number;
};

type RevertRpcResponse = {
  ok: boolean;
  error?: string;
  detail?: string;
  reversal_movement_id?: number;
  original_movement_id?: number;
  guarantee_id?: number;
};

export async function revertGuaranteeMovement(
  movementId: number,
  reason: string,
  tenantEmpresaId?: string | null,
): Promise<RevertMovementResult> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) throw new Error('Empresa no configurada.');
  if (!Number.isFinite(movementId)) throw new Error('Movimiento inválido.');
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error('El motivo de la reversión es obligatorio.');

  const { data, error } = await supabase.rpc('revert_guarantee_movement', {
    p_movement_id: movementId,
    p_reason: trimmedReason,
    p_empresa_id: empresaId,
  });

  if (error) {
    console.error('[garantias revert rpc]', error.message);
    throw new Error(error.message || 'No se pudo revertir el movimiento.');
  }

  const payload = data as RevertRpcResponse;
  if (!payload?.ok) {
    const code = payload?.error ?? 'reversion_fallida';
    const msg = mapRevertRpcError(code);
    throw new Error(payload?.detail ? `${msg} (${payload.detail})` : msg);
  }

  const guaranteeId = payload.guarantee_id;
  if (!guaranteeId) throw new Error('Respuesta incompleta del servidor.');

  const guarantee = await fetchDriverGuaranteeById(guaranteeId, empresaId);
  if (!guarantee) throw new Error('Garantía no encontrada tras la reversión.');

  return {
    guarantee,
    reversalMovementId: payload.reversal_movement_id ?? 0,
    originalMovementId: payload.original_movement_id ?? movementId,
  };
}
