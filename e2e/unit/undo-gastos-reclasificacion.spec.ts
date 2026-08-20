/**
 * Tests unitarios para el bug "DESHACER al reclasificar un gasto".
 *
 * Escenarios cubiertos:
 * 1.  Fix confirmado: categoriaManualPatchToRow ya no descarta excel_extra null
 * 2.  patchSummaryForGastoMove: gastos_globales → otros_gastos_varios (forward)
 * 3.  patchSummaryForGastoMove: otros_gastos_varios → gastos_globales (undo)
 * 4.  patchSummaryForGastoMove: otros_gastos_varios → representacion_interna
 * 5.  patchSummaryForGastoMove: representacion_interna → otros_gastos_varios
 * 6.  totalGastos no cambia al hacer move ni al hacer undo
 * 7.  totalCount no cambia al hacer move ni al hacer undo
 * 8.  Undo restaura el bucket de origen exactamente al valor previo
 * 9.  Undo restaura el bucket de destino exactamente al valor previo
 * 10. Múltiples moves en cadena conservan totalGastos
 * 11. move + undo completo → resumen idéntico al estado inicial
 */

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EMPTY_GASTOS_FINANCIAL_SUMMARY,
  type GastosFinancialSummary,
} from '../../src/utils/gastosFinancialSummary';
import {
  patchSummaryAddGasto,
  patchSummaryForGastoMove,
} from '../../src/utils/gastoLocalMutations';
import type { Gasto } from '../../src/data/types';

function resolveSource(relPath: string): string {
  return readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), 'utf8');
}

function makeGasto(overrides: Partial<Gasto> = {}): Gasto {
  return {
    id: 'g-undo-test',
    fecha: '2026-01-01',
    fechaRegistro: '2026-01-01',
    vehicleId: null,
    tipo: 'OTROS GASTOS',
    subTipo: 'OTROS /ESPECIFICAR',
    fechaDesde: null,
    fechaHasta: null,
    metodoPago: 'EFECTIVO',
    metodoPagoDetalle: '',
    celularMetodo: null,
    categoria: 'gastos_extras',
    motivo: '',
    signo: '-',
    monto: 500,
    pagadoA: '',
    comentarios: '',
    tipo_gasto: 'gastos_globales',
    subtipo_gasto: null,
    ...overrides,
  } as Gasto;
}

// ── 1. Fix confirmado en source: null ya no se descarta ────────────────────
test('FIX: categoriaManualPatchToRow no descarta excel_extra null', () => {
  const src = resolveSource('../../src/services/gastosService.ts');
  // La línea del bug era: if (sanitized !== null) row.excel_extra = sanitized;
  // Después del fix, la asignación es directa (sin if-guard sobre null).
  expect(src).not.toMatch(/if\s*\(\s*sanitized\s*!==\s*null\s*\)\s*row\.excel_extra\s*=/);
  // La asignación a row.excel_extra debe existir sin guardia de null
  expect(src).toMatch(/row\.excel_extra\s*=/);
});

// ── 2. Forward move: gastos_globales → otros_gastos_varios ─────────────────
test('forward move: gastos_globales → otros_gastos_varios transfiere monto', () => {
  const antes = makeGasto({ tipo_gasto: 'gastos_globales', monto: 300 });
  const despues = makeGasto({ tipo_gasto: 'otros_gastos_varios', monto: 300 });
  let s = patchSummaryAddGasto(EMPTY_GASTOS_FINANCIAL_SUMMARY, antes, () => true);
  s = patchSummaryForGastoMove(s, antes, despues, () => true);
  expect(s.byTipoGasto['gastos_globales']).toEqual({ monto: 0, count: 0 });
  expect(s.byTipoGasto['otros_gastos_varios']).toEqual({ monto: 300, count: 1 });
});

// ── 3. Undo move: otros_gastos_varios → gastos_globales ────────────────────
test('undo move: otros_gastos_varios → gastos_globales restaura estado', () => {
  const antes = makeGasto({ tipo_gasto: 'gastos_globales', monto: 300 });
  const despues = makeGasto({ tipo_gasto: 'otros_gastos_varios', monto: 300 });
  let s = patchSummaryAddGasto(EMPTY_GASTOS_FINANCIAL_SUMMARY, antes, () => true);
  const snapshotAntes = { ...s.byTipoGasto['gastos_globales'] };
  s = patchSummaryForGastoMove(s, antes, despues, () => true);
  // Undo: apply reverse move
  s = patchSummaryForGastoMove(s, despues, antes, () => true);
  expect(s.byTipoGasto['gastos_globales']).toEqual(snapshotAntes);
  expect(s.byTipoGasto['otros_gastos_varios']).toEqual({ monto: 0, count: 0 });
});

// ── 4. Forward move: otros_gastos_varios → representacion_interna ──────────
test('forward move: otros_gastos_varios → representacion_interna transfiere monto', () => {
  const antes = makeGasto({ tipo_gasto: 'otros_gastos_varios', monto: 180 });
  const despues = makeGasto({ tipo_gasto: 'representacion_interna', monto: 180 });
  let s = patchSummaryAddGasto(EMPTY_GASTOS_FINANCIAL_SUMMARY, antes, () => true);
  s = patchSummaryForGastoMove(s, antes, despues, () => true);
  expect(s.byTipoGasto['otros_gastos_varios']).toEqual({ monto: 0, count: 0 });
  expect(s.byTipoGasto['representacion_interna']).toEqual({ monto: 180, count: 1 });
});

// ── 5. Undo move: representacion_interna → otros_gastos_varios ─────────────
test('undo move: representacion_interna → otros_gastos_varios restaura estado', () => {
  const antes = makeGasto({ tipo_gasto: 'otros_gastos_varios', monto: 180 });
  const despues = makeGasto({ tipo_gasto: 'representacion_interna', monto: 180 });
  let s = patchSummaryAddGasto(EMPTY_GASTOS_FINANCIAL_SUMMARY, antes, () => true);
  s = patchSummaryForGastoMove(s, antes, despues, () => true);
  // Undo
  s = patchSummaryForGastoMove(s, despues, antes, () => true);
  expect(s.byTipoGasto['otros_gastos_varios']).toEqual({ monto: 180, count: 1 });
  expect(s.byTipoGasto['representacion_interna']).toEqual({ monto: 0, count: 0 });
});

// ── 6. totalGastos no cambia en ningún move ni undo ────────────────────────
test('totalGastos no cambia durante move ni durante undo', () => {
  const gasto = makeGasto({ tipo_gasto: 'administrativo_empresa', monto: 750 });
  let s = patchSummaryAddGasto(EMPTY_GASTOS_FINANCIAL_SUMMARY, gasto, () => true);
  const totalOriginal = s.totalGastos;

  const dest = makeGasto({ tipo_gasto: 'otros_gastos_varios', monto: 750 });
  s = patchSummaryForGastoMove(s, gasto, dest, () => true);
  expect(s.totalGastos).toBe(totalOriginal);

  s = patchSummaryForGastoMove(s, dest, gasto, () => true);
  expect(s.totalGastos).toBe(totalOriginal);
});

// ── 7. totalCount no cambia en ningún move ni undo ─────────────────────────
test('totalCount no cambia durante move ni durante undo', () => {
  const gasto = makeGasto({ tipo_gasto: 'gastos_globales', monto: 200 });
  let s = patchSummaryAddGasto(EMPTY_GASTOS_FINANCIAL_SUMMARY, gasto, () => true);
  const totalCountOrig = s.totalCount;

  const dest = makeGasto({ tipo_gasto: 'otros_gastos_varios', monto: 200 });
  s = patchSummaryForGastoMove(s, gasto, dest, () => true);
  expect(s.totalCount).toBe(totalCountOrig);

  s = patchSummaryForGastoMove(s, dest, gasto, () => true);
  expect(s.totalCount).toBe(totalCountOrig);
});

// ── 8. Undo restaura el bucket de origen exactamente ──────────────────────
test('undo restaura bucket de origen al valor exacto previo al move', () => {
  const g1 = makeGasto({ tipo_gasto: 'planilla_laboral', monto: 400 });
  const g2 = makeGasto({ tipo_gasto: 'planilla_laboral', monto: 100 }); // segundo gasto mismo tipo
  let s = patchSummaryAddGasto(EMPTY_GASTOS_FINANCIAL_SUMMARY, g1, () => true);
  s = patchSummaryAddGasto(s, g2, () => true);

  const snapshotPlanilla = { ...s.byTipoGasto['planilla_laboral'] };

  const gMoved = makeGasto({ tipo_gasto: 'planilla_laboral', monto: 400, id: 'g-undo-test' });
  const gDest = makeGasto({ tipo_gasto: 'otros_gastos_varios', monto: 400, id: 'g-undo-test' });
  s = patchSummaryForGastoMove(s, gMoved, gDest, () => true);
  // planilla debería haber bajado en 400
  expect(s.byTipoGasto['planilla_laboral'].monto).toBe(snapshotPlanilla.monto - 400);

  s = patchSummaryForGastoMove(s, gDest, gMoved, () => true);
  expect(s.byTipoGasto['planilla_laboral']).toEqual(snapshotPlanilla);
});

// ── 9. Undo restaura el bucket de destino exactamente ─────────────────────
test('undo restaura bucket de destino a cero tras move y undo completo', () => {
  const gasto = makeGasto({ tipo_gasto: 'financiero_prestamo', monto: 550 });
  let s = patchSummaryAddGasto(EMPTY_GASTOS_FINANCIAL_SUMMARY, gasto, () => true);
  const dest = makeGasto({ tipo_gasto: 'otros_gastos_varios', monto: 550 });
  s = patchSummaryForGastoMove(s, gasto, dest, () => true);
  expect(s.byTipoGasto['otros_gastos_varios'].monto).toBe(550);
  s = patchSummaryForGastoMove(s, dest, gasto, () => true);
  expect(s.byTipoGasto['otros_gastos_varios']).toEqual({ monto: 0, count: 0 });
});

// ── 10. Moves en cadena conservan totalGastos ─────────────────────────────
test('cadena de moves (A→B→C→D) conserva totalGastos en cada paso', () => {
  const g = makeGasto({ tipo_gasto: 'gastos_globales', monto: 100 });
  let s = patchSummaryAddGasto(EMPTY_GASTOS_FINANCIAL_SUMMARY, g, () => true);
  const expected = s.totalGastos;

  const tipos = ['otros_gastos_varios', 'representacion_interna', 'administrativo_empresa', 'gastos_globales'] as const;
  let prev = g;
  for (const tipo of tipos) {
    const next = makeGasto({ tipo_gasto: tipo, monto: 100 });
    s = patchSummaryForGastoMove(s, prev, next, () => true);
    expect(s.totalGastos).toBe(expected);
    prev = next;
  }
});

// ── 11. Move + undo completo → resumen idéntico al estado inicial ──────────
test('move + undo completo produce resumen idéntico al inicial', () => {
  const gasto = makeGasto({ tipo_gasto: 'gastos_globales', monto: 600 });
  const initial = patchSummaryAddGasto(EMPTY_GASTOS_FINANCIAL_SUMMARY, gasto, () => true);

  const dest = makeGasto({ tipo_gasto: 'otros_gastos_varios', monto: 600 });
  let s = patchSummaryForGastoMove(initial, gasto, dest, () => true);
  s = patchSummaryForGastoMove(s, dest, gasto, () => true);

  // Compara campos relevantes del resumen
  expect(s.totalGastos).toBe(initial.totalGastos);
  expect(s.totalCount).toBe(initial.totalCount);
  expect(s.byTipoGasto['gastos_globales']).toEqual(initial.byTipoGasto['gastos_globales']);
  expect(s.byTipoGasto['otros_gastos_varios']).toEqual(initial.byTipoGasto['otros_gastos_varios']);
});
