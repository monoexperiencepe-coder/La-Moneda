/**
 * Tests Lote 6 — Padrón actual por vehículo (tab "Actuales").
 *
 * La vista "Actuales" ES el padrón: parte de vehículos, no de garantías.
 * Solo existe la tab "Historial" para cerradas/devueltas.
 *
 * Cubre:
 * 1.  Garantias.tsx NO tiene tab "Padrón" separada (fue fusionada con Actuales).
 * 2.  Garantias.tsx define padronRows desde vehicles cuando tab='active'.
 * 3.  padronRows ordena por numeroUnidad ASC (nulls al final).
 * 4.  padronRows incluye vehículos sin garantía (guarantee null).
 * 5.  padronRows excluye vehículos inactivos.
 * 6.  Tabla Actuales tiene columna "Unidad".
 * 7.  Tabla Actuales tiene columna "Placa".
 * 8.  Tabla Actuales muestra "Sin garantía" para vehículos sin garantía.
 * 9.  tab es GarantiasListMode ('active'|'history'), sin estado 'padron'.
 * 10. filteredPadron aplica búsqueda sobre padronRows.
 * 11. Hook se invoca con tab directamente (no hay hookMode).
 * 12. KPIs muestran "Unidades activas" (no "Activas") en Actuales.
 */

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

function resolveSource(relPath: string): string {
  return readFileSync(new URL(relPath, import.meta.url), 'utf8');
}

// ── 1. No tab "Padrón" separada ───────────────────────────────────────────────
test("Garantias: NO tiene tab 'Padrón' separada", () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  // No debe haber botón ni handleTabChange('padron')
  expect(src).not.toContain("handleTabChange('padron')");
  expect(src).not.toContain("tab === 'padron'");
  // Solo dos tabs
  expect(src).toContain("handleTabChange('active')");
  expect(src).toContain("handleTabChange('history')");
});

// ── 2. padronRows se computa cuando tab='active' ──────────────────────────────
test("Garantias: padronRows se construye solo cuando tab='active'", () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  expect(src).toContain('padronRows');
  expect(src).toContain("tab !== 'active'");
});

// ── 3. Ordenamiento por numeroUnidad ASC ──────────────────────────────────────
test('Garantias: padronRows ordena por numeroUnidad', () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  expect(src).toContain('numeroUnidad');
  expect(src).toContain('.sort(');
  expect(src).toContain('Infinity'); // nulls al final
});

// ── 4. Incluye vehículos sin garantía ────────────────────────────────────────
test('Lógica: padronRows asigna null a vehículos sin garantía activa', () => {
  type VLike = { id: number; numeroUnidad?: number | null; activo: boolean };
  type GLike = { currentVehicleId: number | null };

  function buildPadron(vs: VLike[], gs: GLike[]) {
    const map = new Map<number, GLike>();
    for (const g of gs) if (g.currentVehicleId != null) map.set(g.currentVehicleId, g);
    return vs
      .filter((v) => v.activo)
      .slice()
      .sort((a, b) => {
        const na = a.numeroUnidad ?? Infinity;
        const nb = b.numeroUnidad ?? Infinity;
        return na !== nb ? na - nb : a.id - b.id;
      })
      .map((v) => ({ vehicle: v, guarantee: map.get(v.id) ?? null }));
  }

  const vs: VLike[] = [
    { id: 1, numeroUnidad: 2, activo: true },
    { id: 2, numeroUnidad: 1, activo: true },
    { id: 3, numeroUnidad: 3, activo: false },
  ];
  const gs: GLike[] = [{ currentVehicleId: 1 }];
  const result = buildPadron(vs, gs);

  expect(result).toHaveLength(2);        // excluye inactivo
  expect(result[0].vehicle.id).toBe(2);  // #1 primero
  expect(result[0].guarantee).toBeNull(); // sin garantía
  expect(result[1].guarantee).not.toBeNull(); // tiene garantía
});

// ── 5. Excluye vehículos inactivos ────────────────────────────────────────────
test('Garantias: padronRows filtra v.activo antes del sort', () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  const idxActivo = src.indexOf('v.activo');
  const idxSort = src.indexOf('.sort(');
  expect(idxActivo).toBeGreaterThan(-1);
  expect(idxSort).toBeGreaterThan(-1);
  expect(idxActivo).toBeLessThan(idxSort);
});

// ── 6. Columna "Unidad" en tabla ──────────────────────────────────────────────
test('Garantias: tabla Actuales tiene encabezado "Unidad"', () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  expect(src).toContain('>Unidad<');
});

// ── 7. Columna "Placa" en tabla ───────────────────────────────────────────────
test('Garantias: tabla Actuales tiene encabezado "Placa"', () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  expect(src).toContain('>Placa<');
});

// ── 8. "Sin garantía" en tabla ────────────────────────────────────────────────
test('Garantias: tabla Actuales muestra "Sin garantía"', () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  expect(src).toContain('Sin garantía');
});

// ── 9. tab es GarantiasListMode, no LocalTab ─────────────────────────────────
test('Garantias: no usa LocalTab ni estado padron', () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  expect(src).not.toContain('LocalTab');
  expect(src).not.toContain("'padron'");
});

// ── 10. filteredPadron aplica búsqueda ────────────────────────────────────────
test('Garantias: define filteredPadron con búsqueda sobre padronRows', () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  expect(src).toContain('filteredPadron');
  expect(src).toContain('placa.includes(needle)');
  expect(src).toContain('unidad.includes(needle)');
  expect(src).toContain('conductor.includes(needle)');
});

// ── 11. Hook recibe tab directamente ──────────────────────────────────────────
test('Garantias: pasa tab directamente al hook (no hookMode intermedio)', () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  expect(src).not.toContain('hookMode');
  expect(src).toContain('useGarantiasListData(');
});

// ── 12. KPI muestra "Unidades activas" ───────────────────────────────────────
test('Garantias: KPI usa "Unidades activas" (padrón, no garantía-céntrico)', () => {
  const src = resolveSource('../../src/pages/Operaciones/Garantias.tsx');
  expect(src).toContain('Unidades activas');
  expect(src).toContain('Con garantía');
  expect(src).toContain('Sin garantía / incompleta');
});
