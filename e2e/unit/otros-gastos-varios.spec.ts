/**
 * Tests unitarios para la categoría "Otros gastos / Gastos varios".
 *
 * Los imports se limitan a módulos que NO transitan por factCatalog.ts
 * (que usa JSON sin 'with { type: "json" }', incompatible con ESM en Playwright).
 * Para los demás assertions se lee el source como texto.
 *
 * Escenarios cubiertos:
 * 1.  La categoría está en GASTOS_SUMMARY_TIPOS
 * 2.  EMPTY_GASTOS_FINANCIAL_SUMMARY inicializa el bucket a cero
 * 3.  mapGastosFinancialSummaryRow mapea las columnas del RPC (total/count)
 * 4.  patchSummaryAddGasto incrementa totalGastos (simula reducción de caja)
 * 5.  patchSummaryAddGasto popula byTipoGasto['otros_gastos_varios']
 * 6.  patchSummaryRemoveGasto revierte correctamente (delete)
 * 7.  patchSummaryForGastoMove traslada monto desde otra categoría
 * 8.  labelTipoGastoFinanciero devuelve etiqueta correcta (reportes / historial)
 * 9.  'otros_gastos_varios' NO está en TIPOS_EXCLUIDOS_UTILIDAD → reduce utilidad por vehículo
 * 10. 'otros_gastos_varios' NO requiere vehicleId (gasto global permitido)
 */

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  GASTOS_SUMMARY_TIPOS,
  EMPTY_GASTOS_FINANCIAL_SUMMARY,
  mapGastosFinancialSummaryRow,
} from '../../src/utils/gastosFinancialSummary';
import {
  patchSummaryAddGasto,
  patchSummaryRemoveGasto,
  patchSummaryForGastoMove,
} from '../../src/utils/gastoLocalMutations';
import { labelTipoGastoFinanciero } from '../../src/utils/tipoGastoLabels';
import type { Gasto } from '../../src/data/types';

const TIPO = 'otros_gastos_varios';

function resolveSource(relPath: string): string {
  return readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), 'utf8');
}

function makeGasto(overrides: Partial<Gasto> = {}): Gasto {
  return {
    id: 'g-test-ogv',
    fecha: '2024-06-01',
    fechaRegistro: '2024-06-01',
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
    tipo_gasto: TIPO,
    subtipo_gasto: 'OTROS /ESPECIFICAR',
    ...overrides,
  } as Gasto;
}

// 1. La categoría está registrada en el array de tipos válidos del resumen.
test('GASTOS_SUMMARY_TIPOS incluye otros_gastos_varios', () => {
  expect(GASTOS_SUMMARY_TIPOS).toContain(TIPO);
});

// 2. El resumen vacío inicializa el bucket a { monto: 0, count: 0 }.
test('EMPTY_GASTOS_FINANCIAL_SUMMARY tiene bucket otros_gastos_varios en cero', () => {
  expect(EMPTY_GASTOS_FINANCIAL_SUMMARY.byTipoGasto[TIPO]).toEqual({ monto: 0, count: 0 });
});

// 3. mapGastosFinancialSummaryRow parsea las columnas que devuelve la migración SQL.
test('mapGastosFinancialSummaryRow mapea total_otros_gastos_varios y count_otros_gastos_varios', () => {
  const rpcRow: Record<string, unknown> = {
    total_gastos: 1000,
    total_count: 5,
    total_operativo_vehiculo: 0, count_operativo_vehiculo: 0,
    total_operativo_flota_general: 0, count_operativo_flota_general: 0,
    total_administrativo_empresa: 0, count_administrativo_empresa: 0,
    total_financiero_prestamo: 0, count_financiero_prestamo: 0,
    total_planilla_laboral: 0, count_planilla_laboral: 0,
    total_inversion_compra: 0, count_inversion_compra: 0,
    total_representacion_interna: 0, count_representacion_interna: 0,
    total_otros_gastos_varios: 400, count_otros_gastos_varios: 2,
    total_gastos_globales: 600, count_gastos_globales: 3,
    total_pendiente_revision: 0, count_pendiente_revision: 0,
  };
  const result = mapGastosFinancialSummaryRow(rpcRow);
  expect(result.totalGastos).toBe(1000);
  expect(result.byTipoGasto[TIPO]).toEqual({ monto: 400, count: 2 });
});

// 4. Agregar el gasto incrementa totalGastos (simula reducción de caja).
test('patchSummaryAddGasto incrementa totalGastos al agregar otros_gastos_varios', () => {
  const gasto = makeGasto({ monto: 300 });
  const summary = patchSummaryAddGasto(EMPTY_GASTOS_FINANCIAL_SUMMARY, gasto, () => true);
  expect(summary.totalGastos).toBe(300);
  expect(summary.totalCount).toBe(1);
});

// 5. El monto queda en el bucket correcto del resumen (visible en reportes).
test('patchSummaryAddGasto popula byTipoGasto[otros_gastos_varios]', () => {
  const gasto = makeGasto({ monto: 200 });
  const summary = patchSummaryAddGasto(EMPTY_GASTOS_FINANCIAL_SUMMARY, gasto, () => true);
  expect(summary.byTipoGasto[TIPO]).toEqual({ monto: 200, count: 1 });
});

// 6. Eliminar el gasto revierte el resumen correctamente (delete).
test('patchSummaryRemoveGasto resta monto y count de otros_gastos_varios', () => {
  const gasto = makeGasto({ monto: 150 });
  let summary = patchSummaryAddGasto(EMPTY_GASTOS_FINANCIAL_SUMMARY, gasto, () => true);
  summary = patchSummaryRemoveGasto(summary, gasto, () => true);
  expect(summary.totalGastos).toBe(0);
  expect(summary.totalCount).toBe(0);
  expect(summary.byTipoGasto[TIPO]).toEqual({ monto: 0, count: 0 });
});

// 7. Mover un gasto desde otra categoría a otros_gastos_varios actualiza ambos buckets.
test('patchSummaryForGastoMove transfiere monto desde administrativo_empresa a otros_gastos_varios', () => {
  const antes = makeGasto({ tipo_gasto: 'administrativo_empresa', monto: 100 });
  const despues = makeGasto({ tipo_gasto: TIPO, monto: 100 });
  let summary = patchSummaryAddGasto(EMPTY_GASTOS_FINANCIAL_SUMMARY, antes, () => true);
  summary = patchSummaryForGastoMove(summary, antes, despues, () => true);
  expect(summary.byTipoGasto['administrativo_empresa']).toEqual({ monto: 0, count: 0 });
  expect(summary.byTipoGasto[TIPO]).toEqual({ monto: 100, count: 1 });
  expect(summary.totalGastos).toBe(100);
});

// 8. La etiqueta visible es correcta en historial y reportes.
test('labelTipoGastoFinanciero devuelve "Otros gastos / Gastos varios"', () => {
  expect(labelTipoGastoFinanciero(TIPO)).toBe('Otros gastos / Gastos varios');
});

// 9. 'otros_gastos_varios' NO está en TIPOS_EXCLUIDOS_UTILIDAD:
//    cuando tiene vehicleId, el gasto reduce la utilidad operativa del vehículo.
test('utilidadReal.ts no excluye otros_gastos_varios de la utilidad real', () => {
  const src = resolveSource('../../src/utils/utilidadReal.ts');
  // Extrae el bloque TIPOS_EXCLUIDOS_UTILIDAD
  const match = src.match(/const TIPOS_EXCLUIDOS_UTILIDAD\s*=\s*new Set\(\[([^\]]*)\]\)/s);
  expect(match).not.toBeNull();
  const block = match![1];
  expect(block).not.toContain(TIPO);
});

// 10. 'otros_gastos_varios' NO aparece en la función tipoGastoRequiereVehiculo
//     (vehículo opcional): permite registrar gastos globales sin vehicleId.
test('gastoMoveCategoriaDefaults.ts no exige vehicleId para otros_gastos_varios', () => {
  const src = resolveSource('../../src/utils/gastoMoveCategoriaDefaults.ts');
  // La función tipoGastoRequiereVehiculo solo delega a isOperativoVehiculoTipoGasto;
  // confirmamos que otros_gastos_varios está en FINANZA_TAB_TIPOS (categoría válida)
  // pero NO está dentro de la condición isOperativoVehiculoTipoGasto.
  expect(src).toContain("'otros_gastos_varios'");
  // No debe aparecer dentro de tipoGastoRequiereVehiculo como valor hardcoded
  const fnMatch = src.match(/function tipoGastoRequiereVehiculo[\s\S]*?\n\}/);
  if (fnMatch) {
    expect(fnMatch[0]).not.toContain('otros_gastos_varios');
  }
});
