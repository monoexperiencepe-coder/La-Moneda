import type { Gasto, Vehicle } from '../data/types';
import { REVISION_USER_LABEL } from '../config/app';
import { updateGastoCategoriaManual } from '../services/gastosService';
import {
  getDefaultSubtipoForTipoGasto,
  normalizeSubtipoForTipoGasto,
  tipoGastoRequiereVehiculo,
} from './gastoMoveCategoriaDefaults';
import { normalizeGastoVehicleFkForDb } from './vehicleId';

export type MoveGastoCategoriaInput = {
  gasto: Gasto;
  toTipoGasto: string;
  toSubtipoGasto: string;
  vehicleId: number | null;
  motivo?: string;
  vehicles: Vehicle[];
  /** Preferir `profile.empresa_id` (RLS). */
  tenantEmpresaId?: string | null;
  /** Operador: UPDATE sin SELECT si destino no es visible en sus tabs. */
  operatorClassifyMode?: boolean;
};

export type MoveGastoCategoriaResult =
  | { ok: true; gasto: Gasto; prevTipo: string | null; prevSub: string | null; movedOutOfView?: boolean }
  | { ok: false; message: string };

export async function moveGastoCategoria(input: MoveGastoCategoriaInput): Promise<MoveGastoCategoriaResult> {
  const { gasto, toTipoGasto, toSubtipoGasto, vehicleId, motivo = '', vehicles, tenantEmpresaId, operatorClassifyMode } = input;
  const targetNeedsVehicle = tipoGastoRequiereVehiculo(toTipoGasto);

  let toVehicleId: number | null = null;
  if (targetNeedsVehicle) {
    const n = vehicleId;
    if (n == null || !Number.isFinite(n) || n <= 0 || !vehicles.some((v) => v.id === n)) {
      return { ok: false, message: 'Selecciona un vehículo válido para esta categoría.' };
    }
    toVehicleId = n;
  }

  const subtipoFinal =
    normalizeSubtipoForTipoGasto(toTipoGasto, toSubtipoGasto).trim()
    || getDefaultSubtipoForTipoGasto(toTipoGasto)
    || null;

  const changedAt = new Date().toISOString();
  const prevExtra =
    gasto.excelExtra && typeof gasto.excelExtra === 'object' ? gasto.excelExtra : {};
  const prevHistRaw = (prevExtra as Record<string, unknown>).correcciones_categoria;
  const prevHist = Array.isArray(prevHistRaw) ? prevHistRaw : [];
  const correction = {
    from_tipo_gasto: gasto.tipo_gasto ?? null,
    to_tipo_gasto: toTipoGasto,
    from_subtipo_gasto: gasto.subtipo_gasto ?? null,
    to_subtipo_gasto: subtipoFinal,
    from_vehicle_id: normalizeGastoVehicleFkForDb(gasto.vehicleId),
    to_vehicle_id: targetNeedsVehicle ? normalizeGastoVehicleFkForDb(toVehicleId) : null,
    motivo: motivo.trim() || null,
    changed_at: changedAt,
  };
  const excelExtraNext: Record<string, unknown> = {
    ...(prevExtra as Record<string, unknown>),
    correcciones_categoria: [...prevHist, correction],
  };

  const prevTipo = gasto.tipo_gasto ?? null;
  const prevSub = gasto.subtipo_gasto ?? null;

  const result = await updateGastoCategoriaManual(
    gasto.id,
    {
      tipo_gasto: toTipoGasto,
      subtipo_gasto: subtipoFinal,
      vehicle_id: normalizeGastoVehicleFkForDb(targetNeedsVehicle ? toVehicleId : null),
      es_global_flota: !targetNeedsVehicle,
      clasificacion_manual: true,
      requiere_revision: false,
      revisado_at: changedAt,
      revisado_por: REVISION_USER_LABEL,
      origen_clasificacion: 'correccion_manual_ui',
      excel_extra: excelExtraNext,
    },
    {
      reason: motivo.trim() || 'Conciliación pendiente de revisión',
      sourceAction: 'move_category',
    },
    tenantEmpresaId,
    { operatorClassifyMode },
  );

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  return {
    ok: true,
    gasto: result.gasto,
    prevTipo,
    prevSub,
    movedOutOfView: result.movedOutOfView,
  };
}
