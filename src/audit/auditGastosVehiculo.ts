/**
 * Auditoría DEV: gastos por vehículo en memoria vs fuentes alternativas.
 * Consola: await window.auditGastosVehiculo() o await window.auditGastosVehiculo('ANF-599')
 */
import type { Gasto, Vehicle } from '../data/types';
import { fetchGastosByTipoFullAll, fetchGastosFull } from '../services/gastosService';
import { vehicleIdsEqual } from '../utils/vehicleId';
import { calcularUtilidadRealVehiculo } from '../utils/utilidadReal';

export type AuditGastosVehiculoInput = {
  vehicles: readonly Vehicle[];
  gastos: readonly Gasto[];
  gastosLoadScope: 'recent' | 'full';
  ingresos?: readonly import('../data/types').Ingreso[];
  empresaId?: string | null;
};

function resolveVehicle(
  vehicles: readonly Vehicle[],
  idOrPlaca?: number | string,
): Vehicle | null {
  if (idOrPlaca == null || idOrPlaca === '') return vehicles[0] ?? null;
  if (typeof idOrPlaca === 'number' && Number.isFinite(idOrPlaca)) {
    return vehicles.find((v) => v.id === idOrPlaca) ?? null;
  }
  const q = String(idOrPlaca).trim().toUpperCase();
  const byPlaca = vehicles.find((v) => v.placa?.toUpperCase() === q);
  if (byPlaca) return byPlaca;
  const n = Number(q);
  if (Number.isFinite(n)) return vehicles.find((v) => v.id === n) ?? null;
  return null;
}

function gastoUnidadIdLegacy(g: Gasto): number | string | null | undefined {
  const extra = g.excelExtra;
  if (!extra || typeof extra !== 'object') return undefined;
  const row = extra as Record<string, unknown>;
  return (row.unidad_id ?? row.unidadId ?? row.unidad_numero) as number | string | null | undefined;
}

function matchesVehicleStrict(g: Gasto, vehicleId: number): boolean {
  return g.vehicleId === vehicleId;
}

function matchesVehicleLoose(g: Gasto, vehicleId: number): boolean {
  return vehicleIdsEqual(g.vehicleId, vehicleId);
}

function matchesUnidadLegacy(g: Gasto, vehicleId: number): boolean {
  const u = gastoUnidadIdLegacy(g);
  if (u == null || u === '') return false;
  return String(u) === String(vehicleId);
}

function sumMontos(rows: readonly Gasto[]): number {
  return rows.reduce((s, g) => s + g.monto, 0);
}

export async function auditGastosVehiculo(
  input: AuditGastosVehiculoInput,
  idOrPlaca?: number | string,
): Promise<Record<string, unknown>> {
  const { vehicles, gastos, gastosLoadScope, ingresos = [], empresaId = null } = input;
  const vehicle = resolveVehicle(vehicles, idOrPlaca);
  if (!vehicle) {
    console.warn('[audit:gastos:vehiculo] vehículo no encontrado', { idOrPlaca });
    return { error: 'vehículo no encontrado' };
  }

  const byVehicleStrict = gastos.filter((g) => matchesVehicleStrict(g, vehicle.id));
  const byVehicleLoose = gastos.filter((g) => matchesVehicleLoose(g, vehicle.id));
  const byUnidadLegacy = gastos.filter((g) => matchesUnidadLegacy(g, vehicle.id));
  const byEither = gastos.filter(
    (g) => matchesVehicleLoose(g, vehicle.id) || matchesUnidadLegacy(g, vehicle.id),
  );

  console.group('[audit:gastos:vehiculo]');
  console.log({
    vehicleId: vehicle.id,
    placa: vehicle.placa,
    label: `#${vehicle.id} ${vehicle.marca} ${vehicle.modelo}`,
    gastos_load_scope: gastosLoadScope,
    gastos_en_memoria_count: gastos.length,
    memoria_gastos_total: sumMontos(gastos),
    gastos_filtrados_vehicleId_strict: sumMontos(byVehicleStrict),
    gastos_filtrados_vehicleId_loose: sumMontos(byVehicleLoose),
    gastos_filtrados_unidadId_legacy: sumMontos(byUnidadLegacy),
    cantidad_vehicleId_strict: byVehicleStrict.length,
    cantidad_vehicleId_loose: byVehicleLoose.length,
    cantidad_unidadId_legacy: byUnidadLegacy.length,
    utilidad_real_memoria: calcularUtilidadRealVehiculo(vehicle.id, ingresos, gastos),
    muestra: byEither.slice(0, 20).map((g) => ({
      id: g.id,
      fecha: g.fecha,
      monto: g.monto,
      vehicleId: g.vehicleId,
      tipo_gasto: g.tipo_gasto,
      unidadId_legacy: gastoUnidadIdLegacy(g),
    })),
    nota_bootstrap:
      gastosLoadScope === 'recent'
        ? 'Memoria = fetchGastosRecent (~1000 últimos) + pendiente + globales. Histórico Gastos operativos usa fetchGastosByTipoFullAll (BD completa). Si subconteo, ejecutar reloadGastosFull() o abrir pantalla utilidad (auto-carga).'
        : 'Memoria = histórico completo (fetchGastosFull).',
  });
  console.groupEnd();

  const result: Record<string, unknown> = {
    vehicleId: vehicle.id,
    placa: vehicle.placa,
    gastos_load_scope: gastosLoadScope,
    gastos_en_memoria_count: gastos.length,
    gastos_vehicleId_loose_monto: sumMontos(byVehicleLoose),
    gastos_vehicleId_loose_count: byVehicleLoose.length,
    utilidad_memoria: calcularUtilidadRealVehiculo(vehicle.id, ingresos, gastos),
  };

  if (empresaId && import.meta.env.DEV) {
    console.group('[audit:gastos:vehiculo:bd]');
    try {
      const [fullAll, opFull] = await Promise.all([
        fetchGastosFull(empresaId),
        fetchGastosByTipoFullAll({ tipo_gasto: 'operativo_vehiculo' }, empresaId),
      ]);
      const fullVeh = fullAll.filter((g) => matchesVehicleLoose(g, vehicle.id));
      const opVeh = (opFull.rows ?? []).filter((g) => matchesVehicleLoose(g, vehicle.id));
      console.log({
        bd_gastos_full_total_rows: fullAll.length,
        bd_gastos_vehicleId_monto: sumMontos(fullVeh),
        bd_gastos_vehicleId_count: fullVeh.length,
        bd_operativo_vehiculo_full_monto: sumMontos(opVeh),
        bd_operativo_vehiculo_full_count: opVeh.length,
        diferencia_memoria_vs_bd_full: sumMontos(byVehicleLoose) - sumMontos(fullVeh),
        diferencia_memoria_vs_bd_operativo: sumMontos(byVehicleLoose) - sumMontos(opVeh),
      });
      result.bd = {
        full_vehicle_monto: sumMontos(fullVeh),
        full_vehicle_count: fullVeh.length,
        operativo_full_vehicle_monto: sumMontos(opVeh),
        operativo_full_vehicle_count: opVeh.length,
      };
    } catch (e) {
      console.warn('[audit:gastos:vehiculo:bd] error', e);
      result.bd_error = String(e);
    }
    console.groupEnd();
  }

  return result;
}
