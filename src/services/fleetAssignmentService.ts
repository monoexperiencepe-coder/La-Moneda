import { patchConductor } from './conductoresService';
import type { Conductor } from '../data/types';
import { conductorVigentePorVehiculo } from '../modules/fleet/fleetAnalytics';

export type FleetAssignmentLog = {
  conductorId: string;
  previousVehicleId: number | null;
  newVehicleId: number | null;
  previousDriverOnVehicle: string | null;
  reassigned: boolean;
};

export type FleetAssignmentResult = {
  log: FleetAssignmentLog;
  updatedConductores: Conductor[];
};

function logFleetAssignment(log: FleetAssignmentLog): void {
  if (!import.meta.env.DEV) return;
  console.log('[fleet:assignment]', log);
}

/**
 * Asigna o reasigna un conductor vigente a un vehículo.
 * - Desasigna otros conductores vigentes en el vehículo destino.
 * - Si el conductor tenía otro vehículo, queda solo en el nuevo (un conductor → un vehículo).
 * @param vehicleId null = quitar asignación del conductor indicado.
 */
export async function assignConductorToVehicle(
  conductorId: string,
  vehicleId: number | null,
  conductores: readonly Conductor[],
  tenantEmpresaId?: string | null,
): Promise<FleetAssignmentResult> {
  const target = conductores.find((c) => c.id === conductorId);
  if (!target) {
    throw new Error('Conductor no encontrado.');
  }
  if (vehicleId != null && target.estado !== 'VIGENTE') {
    throw new Error('Solo se puede asignar un conductor en estado VIGENTE.');
  }

  const previousVehicleId = target.vehicleId != null ? Number(target.vehicleId) : null;
  const newVehicleId = vehicleId;
  const previousDriverOnVehicle =
    newVehicleId != null
      ? (conductorVigentePorVehiculo(conductores, newVehicleId)?.id ?? null)
      : null;

  const updatedConductores: Conductor[] = [];
  const patchedIds = new Set<string>();

  const applyPatch = async (id: string, patch: Partial<Omit<Conductor, 'id' | 'createdAt'>>) => {
    const row = await patchConductor(id, patch, tenantEmpresaId);
    if (!row) {
      throw new Error('No se pudo actualizar la asignación del conductor.');
    }
    if (!patchedIds.has(row.id)) {
      patchedIds.add(row.id);
      updatedConductores.push(row);
    } else {
      const idx = updatedConductores.findIndex((c) => c.id === row.id);
      if (idx >= 0) updatedConductores[idx] = row;
    }
    return row;
  };

  if (newVehicleId != null) {
    const ocupantes = conductores.filter(
      (c) =>
        c.estado === 'VIGENTE' &&
        c.vehicleId != null &&
        Number(c.vehicleId) === Number(newVehicleId) &&
        c.id !== conductorId,
    );
    for (const c of ocupantes) {
      await applyPatch(c.id, { vehicleId: null });
    }
  }

  await applyPatch(conductorId, { vehicleId: newVehicleId });

  const reassigned =
    previousVehicleId !== newVehicleId ||
    (previousDriverOnVehicle != null && previousDriverOnVehicle !== conductorId);

  const log: FleetAssignmentLog = {
    conductorId,
    previousVehicleId,
    newVehicleId,
    previousDriverOnVehicle,
    reassigned,
  };
  logFleetAssignment(log);

  return { log, updatedConductores };
}

/** Quita el conductor vigente actual de un vehículo (si existe). */
export async function unassignVehiculoConductor(
  vehicleId: number,
  conductores: readonly Conductor[],
  tenantEmpresaId?: string | null,
): Promise<FleetAssignmentResult | null> {
  const actual = conductorVigentePorVehiculo(conductores, vehicleId);
  if (!actual) return null;
  return assignConductorToVehicle(actual.id, null, conductores, tenantEmpresaId);
}
