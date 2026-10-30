import { test, expect } from '@playwright/test';

/** Espejo de la lógica post-SELECT en fetchNextNumeroUnidad (vehiculosService). */
function nextNumeroUnidadFromMax(max: number | null | undefined): number {
  const n = max != null && Number.isFinite(Number(max)) ? Math.round(Number(max)) : 0;
  const next = n + 1;
  if (!Number.isFinite(next) || next <= 0 || !Number.isInteger(next)) {
    throw new Error('No se pudo asignar número de unidad');
  }
  return next;
}

test('flota en 98 asigna siguiente unidad 99 y 100', () => {
  expect(nextNumeroUnidadFromMax(98)).toBe(99);
  expect(nextNumeroUnidadFromMax(99)).toBe(100);
});

test('sin filas previas empieza en 1', () => {
  expect(nextNumeroUnidadFromMax(null)).toBe(1);
  expect(nextNumeroUnidadFromMax(0)).toBe(1);
});
