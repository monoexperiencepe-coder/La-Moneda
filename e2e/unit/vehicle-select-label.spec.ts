import { expect, test } from '@playwright/test';
import { mapVehiculoRow, parseNumeroUnidadFromRow } from '../../src/services/supabaseMappers';
import { formatVehicleSelectLabel } from '../../src/utils/vehicleDisplayNumber';
import { mergeVehicleRecord } from '../../src/utils/vehiculoMerge';

const PROD_CASES = [
  { id: 178, numero_unidad: 83, marca: 'DFSK', modelo: 'GLORY 560', placa: 'CAU-677' },
  { id: 179, numero_unidad: 84, marca: 'DFSK', modelo: 'GLORY 580', placa: 'CCQ586' },
  { id: 181, numero_unidad: 85, marca: 'DFSK', modelo: 'GLORY 580', placa: 'ABC-001' },
  { id: 182, numero_unidad: 86, marca: 'DFSK', modelo: 'GLORY 580', placa: 'ABC-002' },
  { id: 183, numero_unidad: 87, marca: 'DFSK', modelo: 'GLORY 580', placa: 'ABC-003' },
  { id: 184, numero_unidad: 88, marca: 'DFSK', modelo: 'GLORY 580', placa: 'ABC-004' },
] as const;

for (const row of PROD_CASES) {
  test(`mapVehiculoRow id ${row.id} → numeroUnidad ${row.numero_unidad}`, () => {
    const vehicle = mapVehiculoRow({ ...row, activo: true });
    expect(vehicle.id).toBe(row.id);
    expect(vehicle.numeroUnidad).toBe(row.numero_unidad);
  });

  test(`formatVehicleSelectLabel id ${row.id} → #${row.numero_unidad}`, () => {
    const vehicle = mapVehiculoRow({ ...row, activo: true });
    expect(formatVehicleSelectLabel(vehicle)).toBe(
      `#${row.numero_unidad} — ${row.marca} ${row.modelo} (${row.placa})`,
    );
  });
}

test('select value interno sigue siendo vehiculos.id (FK técnica)', () => {
  const vehicle = mapVehiculoRow({ ...PROD_CASES[0], activo: true });
  expect(String(vehicle.id)).toBe('178');
  expect(vehicle.numeroUnidad).toBe(83);
});

test('parseNumeroUnidadFromRow acepta bigint desde PostgREST', () => {
  expect(parseNumeroUnidadFromRow({ numero_unidad: 83n })).toBe(83);
});

test('mergeVehicleRecord conserva numeroUnidad ante payload realtime parcial', () => {
  const full = mapVehiculoRow({ ...PROD_CASES[0], activo: true });
  const partial = mapVehiculoRow({
    id: 178,
    marca: 'DFSK',
    modelo: 'GLORY 560',
    placa: 'CAU-677',
    activo: true,
  });
  expect(partial.numeroUnidad).toBeNull();

  const merged = mergeVehicleRecord(full, partial);
  expect(merged.numeroUnidad).toBe(83);
  expect(formatVehicleSelectLabel(merged)).toContain('#83 —');
});

test('mergeVehicleRecord prioriza numeroUnidad entrante si es válido', () => {
  const prev = mapVehiculoRow({ id: 178, numero_unidad: 83, marca: 'A', modelo: 'B', placa: 'X', activo: true });
  const incoming = mapVehiculoRow({ id: 178, numero_unidad: 90, marca: 'A', modelo: 'B', placa: 'X', activo: true });
  expect(mergeVehicleRecord(prev, incoming).numeroUnidad).toBe(90);
});
