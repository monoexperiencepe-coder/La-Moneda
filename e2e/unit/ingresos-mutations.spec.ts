import { expect, test } from '@playwright/test';
import type { Ingreso } from '../../src/data/types';
import {
  buildIngresoMoneyPatch,
  mergeIngresoSorted,
  removeIngresoById,
  requireDeletedIngresoRow,
} from '../../src/utils/ingresoMutations';
import { ingresoMontoPEN } from '../../src/utils/moneda';

function ingreso(overrides: Partial<Ingreso> = {}): Ingreso {
  return {
    id: 'income-1', fecha: '2026-07-31', fechaRegistro: '2026-08-05',
    vehicleId: 6, esExtraordinario: false, tipo: 'ALQUILER', subTipo: 'Día',
    fechaDesde: null, fechaHasta: null, metodoPago: 'Yape', metodoPagoDetalle: '',
    celularMetodo: null, signo: '+', monto: 400, moneda: 'PEN', tipoCambio: null,
    montoPENReferencia: 400, comentarios: '', createdAt: '2026-08-05T17:00:00Z',
    ...overrides,
  };
}

for (const [before, after] of [[400, 330], [350, 280], [400, 480]] as const) {
  test(`edición PEN S/${before} → S/${after} alinea historial y KPI`, () => {
    const patch = buildIngresoMoneyPatch({ monto: after, moneda: 'PEN', tipoCambio: null });
    const edited = { ...ingreso({ monto: before, montoPENReferencia: before }), ...patch };
    expect(patch).toEqual({ monto: after, moneda: 'PEN', tipoCambio: null, montoPENReferencia: after });
    expect(edited.monto).toBe(after);
    expect(ingresoMontoPEN(edited)).toBe(after);
  });
}

test('PEN ignora una referencia histórica incorrecta', () => {
  expect(ingresoMontoPEN(ingreso({ monto: 330, montoPENReferencia: 400 }))).toBe(330);
});

test('edición USD recalcula equivalente PEN con la precisión del sistema', () => {
  const patch = buildIngresoMoneyPatch({ monto: 123.456, moneda: 'USD', tipoCambio: 3.81234 });
  expect(patch).toEqual({ monto: 123.46, moneda: 'USD', tipoCambio: 3.8123, montoPENReferencia: 470.67 });
  expect(ingresoMontoPEN({ ...ingreso(), ...patch })).toBe(470.67);
});

test('DELETE confirmado elimina del contexto y de los KPIs', () => {
  const rows = [ingreso(), ingreso({ id: 'income-2', monto: 100, montoPENReferencia: 100 })];
  requireDeletedIngresoRow([{ id: 'income-1' }], 'income-1');
  const remaining = removeIngresoById(rows, 'income-1');
  expect(remaining.map((row) => row.id)).toEqual(['income-2']);
  expect(remaining.reduce((sum, row) => sum + ingresoMontoPEN(row), 0)).toBe(100);
});

test('DELETE de ID inexistente devuelve error verificable', () => {
  expect(() => requireDeletedIngresoRow([], 'missing-id')).toThrow('no existe o no pudo ser eliminado');
});

test('upsert realtime reemplaza por ID y no duplica registros', () => {
  const original = ingreso({ monto: 400, montoPENReferencia: 400 });
  const updated = ingreso({ monto: 330, montoPENReferencia: 330 });
  const result = mergeIngresoSorted([original], updated);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ id: 'income-1', monto: 330, montoPENReferencia: 330 });
});
