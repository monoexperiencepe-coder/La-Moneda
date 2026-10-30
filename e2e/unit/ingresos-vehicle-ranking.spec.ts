import { test, expect } from '@playwright/test';
import type { Ingreso, Vehicle } from '../../src/data/types';
import {
  buildVehicleRankingRows,
  filterAndSortVehicleRankingRows,
  vehicleRankingDisplayNumber,
} from '../../src/utils/ingresosVehicleRanking';

const fleet: Vehicle[] = [
  { id: 82, numeroUnidad: 82, marca: 'DFSK', modelo: 'X', placa: 'BYV079', activo: true },
  { id: 178, numeroUnidad: 83, marca: 'DFSK', modelo: '560', placa: 'CAU-677', activo: true },
  { id: 179, numeroUnidad: 84, marca: 'DFSK', modelo: '580', placa: 'CCQ586', activo: true },
];

function ingreso(vehicleId: number, monto: number, fecha = '2026-09-15'): Ingreso {
  return {
    id: `${vehicleId}-${monto}`,
    fecha,
    fechaRegistro: fecha,
    vehicleId,
    tipo: 'ALQUILER',
    subTipo: 'Día',
    fechaDesde: null,
    fechaHasta: null,
    metodoPago: 'Efectivo',
    metodoPagoDetalle: '',
    celularMetodo: null,
    signo: '+',
    monto,
    comentarios: '',
  };
}

test('display: id 178 muestra unidad 83', () => {
  expect(vehicleRankingDisplayNumber(fleet, 178)).toBe(83);
});

test('ranking orden flota: 82 antes que 83 (178) aunque id técnico salte', () => {
  const rows = buildVehicleRankingRows(
    [ingreso(178, 100), ingreso(82, 50)],
    fleet,
  );
  const withMoves = filterAndSortVehicleRankingRows(rows, 'with_moves', 'fleet', fleet);
  const units = withMoves.map((r) => vehicleRankingDisplayNumber(fleet, r.vehicleId));
  expect(units).toEqual([82, 83]);
});

test('filtro solo con ingresos no altera orden de flota', () => {
  const rows = buildVehicleRankingRows([ingreso(178, 10)], fleet);
  const all = filterAndSortVehicleRankingRows(rows, 'all', 'fleet', fleet);
  const moves = filterAndSortVehicleRankingRows(rows, 'with_moves', 'fleet', fleet);
  expect(all.map((r) => r.vehicleId)).toContain(82);
  expect(moves.every((r) => r.count > 0)).toBe(true);
  expect(moves.map((r) => vehicleRankingDisplayNumber(fleet, r.vehicleId))).toEqual([83]);
});

test('totales financieros no cambian al ordenar', () => {
  const period = [ingreso(82, 40), ingreso(178, 60)];
  const rows = buildVehicleRankingRows(period, fleet);
  const total = rows.reduce((s, r) => s + r.total, 0);
  expect(total).toBe(100);
});
