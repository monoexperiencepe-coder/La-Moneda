import type { InversionGeneralVehiculo, InversionVehiculo, Moneda } from '../data/types';
import { totalInversionUsdForVehicle } from '../services/inversionesVehiculoService';

export type VehicleInversionDisplay = {
  monto: number;
  moneda: Moneda;
  source: 'inversiones_generales_vehiculo' | 'inversiones_vehiculo';
};

export type InversionGeneralesIndex = {
  byVehicleId: Map<number, InversionGeneralVehiculo>;
  byPlaca: Map<string, InversionGeneralVehiculo>;
};

export function buildInversionGeneralesIndex(
  rows: readonly InversionGeneralVehiculo[],
): InversionGeneralesIndex {
  const byVehicleId = new Map<number, InversionGeneralVehiculo>();
  const byPlaca = new Map<string, InversionGeneralVehiculo>();
  for (const row of rows) {
    if (row.vehiculoNumero != null) byVehicleId.set(row.vehiculoNumero, row);
    const placa = row.placa?.trim().toUpperCase();
    if (placa) byPlaca.set(placa, row);
  }
  return { byVehicleId, byPlaca };
}

function generalesRowForVehicle(
  vehicleId: number,
  placa: string,
  index: InversionGeneralesIndex,
): InversionGeneralVehiculo | undefined {
  return (
    index.byVehicleId.get(vehicleId)
    ?? (placa.trim() ? index.byPlaca.get(placa.trim().toUpperCase()) : undefined)
  );
}

/** Fuente canónica UI: inversiones_generales_vehiculo; fallback inversiones_vehiculo (Excel histórico). */
export function resolveVehicleInversionDisplay(
  vehicleId: number,
  placa: string,
  generalesIndex: InversionGeneralesIndex,
  inversionesVehiculo: readonly InversionVehiculo[],
): VehicleInversionDisplay | null {
  const generales = generalesRowForVehicle(vehicleId, placa, generalesIndex);
  if (generales) {
    return {
      monto: generales.montoTotal,
      moneda: generales.moneda,
      source: 'inversiones_generales_vehiculo',
    };
  }
  const usd = totalInversionUsdForVehicle([...inversionesVehiculo], vehicleId);
  if (usd == null) return null;
  return { monto: usd, moneda: 'USD', source: 'inversiones_vehiculo' };
}

export function sumInversionGeneralesByMoneda(rows: readonly InversionGeneralVehiculo[]): {
  penSum: number;
  usdSum: number;
} {
  let penSum = 0;
  let usdSum = 0;
  for (const r of rows) {
    if (r.moneda === 'USD') usdSum += r.montoTotal;
    else penSum += r.montoTotal;
  }
  return { penSum, usdSum };
}
