import type { Ingreso, Vehicle } from '../data/types';
import { ingresoMontoPEN } from './moneda';
import { getVehicleDisplayNumber, vehicleFleetSortKey } from './vehicleDisplayNumber';

export type VehicleRankingRow = {
  vehicleId: number;
  total: number;
  count: number;
};

function fleetSortKeyForVehicleId(vehicles: readonly Vehicle[], vehicleId: number): number {
  const v = vehicles.find((x) => x.id === vehicleId);
  return v ? vehicleFleetSortKey(v) : vehicleId;
}

/** Agrega ingresos por vehicle_id y ordena filas en orden de flota operativa (#numero_unidad). */
export function buildVehicleRankingRows(
  ingresosPeriod: readonly Ingreso[],
  vehicles: readonly Vehicle[],
): VehicleRankingRow[] {
  const map = new Map<number, { total: number; count: number }>();
  for (const i of ingresosPeriod) {
    const raw = i.vehicleId;
    if (raw == null || !Number.isFinite(Number(raw))) continue;
    const id = Number(raw);
    const cur = map.get(id) ?? { total: 0, count: 0 };
    cur.total += ingresoMontoPEN(i);
    cur.count += 1;
    map.set(id, cur);
  }

  const seen = new Set<number>();
  const rows: VehicleRankingRow[] = [];
  const byFleetOrder = [...vehicles].sort((a, b) => vehicleFleetSortKey(a) - vehicleFleetSortKey(b));
  for (const v of byFleetOrder) {
    seen.add(v.id);
    const agg = map.get(v.id) ?? { total: 0, count: 0 };
    rows.push({ vehicleId: v.id, ...agg });
  }
  const orphanIds = [...map.keys()]
    .filter((id) => !seen.has(id))
    .sort((a, b) => fleetSortKeyForVehicleId(vehicles, a) - fleetSortKeyForVehicleId(vehicles, b));
  for (const id of orphanIds) {
    const agg = map.get(id)!;
    rows.push({ vehicleId: id, ...agg });
  }
  return rows;
}

export function filterAndSortVehicleRankingRows(
  rows: readonly VehicleRankingRow[],
  scope: 'all' | 'with_moves',
  sort: 'fleet' | 'moves' | 'total',
  vehicles: readonly Vehicle[],
): VehicleRankingRow[] {
  let out =
    scope === 'with_moves' ? rows.filter((r) => r.count > 0) : [...rows];
  if (sort === 'fleet') {
    return out;
  }
  out = [...out];
  const tie = (a: VehicleRankingRow, b: VehicleRankingRow) =>
    fleetSortKeyForVehicleId(vehicles, a.vehicleId) - fleetSortKeyForVehicleId(vehicles, b.vehicleId);
  if (sort === 'moves') {
    out.sort((a, b) => b.count - a.count || b.total - a.total || tie(a, b));
  } else {
    out.sort((a, b) => b.total - a.total || b.count - a.count || tie(a, b));
  }
  return out;
}

export function vehicleRankingDisplayNumber(
  vehicles: readonly Vehicle[],
  vehicleId: number,
): number {
  const v = vehicles.find((x) => x.id === vehicleId);
  return v ? getVehicleDisplayNumber(v) : vehicleId;
}
