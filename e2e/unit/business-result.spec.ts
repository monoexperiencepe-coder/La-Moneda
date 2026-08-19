import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { buildCascadaFinanciera, calculateBusinessResult, ingresosSinTipoCambio } from '../../src/utils/businessResult';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import type { Gasto, Ingreso } from '../../src/data/types';

// ── fixtures ──────────────────────────────────────────────────────────────────

function mkIngreso(overrides: Partial<Ingreso> = {}): Ingreso {
  return {
    id: '1',
    fecha: '2024-03-15',
    fechaRegistro: '2024-03-15',
    vehicleId: null,
    tipo: 'ALQUILER',
    subTipo: null,
    fechaDesde: null,
    fechaHasta: null,
    metodoPago: 'EFECTIVO',
    metodoPagoDetalle: '',
    celularMetodo: null,
    signo: '+',
    monto: 10000,
    moneda: 'PEN',
    tipoCambio: null,
    montoPENReferencia: null,
    comentarios: '',
    ...overrides,
  } as Ingreso;
}

function mkGasto(overrides: Partial<Gasto> = {}): Gasto {
  return {
    id: '1',
    fecha: '2024-03-15',
    vehicleId: null,
    tipo_gasto: 'operativo_vehiculo',
    subtipo_gasto: null,
    monto: 7000,
    comentarios: '',
    ...overrides,
  } as unknown as Gasto;
}

// ── IDENTIDAD FINANCIERA ──────────────────────────────────────────────────────

test('resultado = ingresos − gastos (identidad básica)', () => {
  const ingresos = [mkIngreso({ monto: 10000 })];
  const gastos = [mkGasto({ monto: 7000 })];
  const r = calculateBusinessResult(ingresos, gastos, null, null);
  expect(r.totalIngresos).toBe(10000);
  expect(r.totalGastos).toBe(7000);
  expect(r.resultado).toBe(3000);
});

test('resultado negativo cuando gastos > ingresos', () => {
  const ingresos = [mkIngreso({ monto: 5000 })];
  const gastos = [mkGasto({ monto: 8000 })];
  const r = calculateBusinessResult(ingresos, gastos, null, null);
  expect(r.resultado).toBe(-3000);
});

test('sin datos: resultado = 0, hasMovement = false', () => {
  const r = calculateBusinessResult([], [], null, null);
  expect(r.totalIngresos).toBe(0);
  expect(r.totalGastos).toBe(0);
  expect(r.resultado).toBe(0);
  expect(r.hasMovement).toBe(false);
});

// ── CATEGORÍAS DE GASTO ───────────────────────────────────────────────────────

test('todas las categorías de gasto se incluyen exactamente una vez', () => {
  const categorias = [
    'operativo_vehiculo',
    'operativo_flota_general',
    'administrativo_empresa',
    'planilla_laboral',
    'otros_gastos_varios',
    'gastos_globales',
    'pendiente_revision',
  ];
  const gastos = categorias.map((tipo_gasto, idx) =>
    mkGasto({ id: String(idx + 1), tipo_gasto, monto: 1000 }),
  );
  const r = calculateBusinessResult([], gastos, null, null);
  // cada gasto de S/1000 se incluye una vez → total = categorias.length * 1000
  expect(r.totalGastos).toBe(categorias.length * 1000);
});

test('financiero_prestamo reduce resultado general', () => {
  const ingresos = [mkIngreso({ monto: 5000 })];
  const gastos = [mkGasto({ tipo_gasto: 'financiero_prestamo', monto: 2000 })];
  const r = calculateBusinessResult(ingresos, gastos, null, null);
  expect(r.resultado).toBe(3000);
  expect(r.totalGastos).toBe(2000);
});

test('pendiente_revision reduce resultado general', () => {
  const ingresos = [mkIngreso({ monto: 5000 })];
  const gastos = [mkGasto({ tipo_gasto: 'pendiente_revision', monto: 1500 })];
  const r = calculateBusinessResult(ingresos, gastos, null, null);
  expect(r.resultado).toBe(3500);
});

// ── MUTACIONES ────────────────────────────────────────────────────────────────

test('crear gasto S/500 → resultado baja S/500', () => {
  const ingresos = [mkIngreso({ monto: 10000 })];
  const antes = calculateBusinessResult(ingresos, [], null, null);
  const despues = calculateBusinessResult(
    ingresos,
    [mkGasto({ monto: 500 })],
    null,
    null,
  );
  expect(despues.resultado).toBe(antes.resultado - 500);
});

test('editar gasto S/500 → S/350 → resultado sube S/150', () => {
  const ingresos = [mkIngreso({ monto: 10000 })];
  const antes = calculateBusinessResult(ingresos, [mkGasto({ monto: 500 })], null, null);
  const despues = calculateBusinessResult(ingresos, [mkGasto({ monto: 350 })], null, null);
  expect(despues.resultado).toBe(antes.resultado + 150);
});

test('editar gasto S/500 → S/700 → resultado baja S/200', () => {
  const ingresos = [mkIngreso({ monto: 10000 })];
  const antes = calculateBusinessResult(ingresos, [mkGasto({ monto: 500 })], null, null);
  const despues = calculateBusinessResult(ingresos, [mkGasto({ monto: 700 })], null, null);
  expect(despues.resultado).toBe(antes.resultado - 200);
});

test('eliminar gasto S/500 → resultado sube S/500', () => {
  const ingresos = [mkIngreso({ monto: 10000 })];
  const antes = calculateBusinessResult(ingresos, [mkGasto({ monto: 500 })], null, null);
  const despues = calculateBusinessResult(ingresos, [], null, null);
  expect(despues.resultado).toBe(antes.resultado + 500);
});

test('cambiar categoría → total general no se duplica ni pierde', () => {
  const ingresos = [mkIngreso({ monto: 10000 })];
  const montoBase = 500;
  const antes = calculateBusinessResult(
    ingresos,
    [mkGasto({ tipo_gasto: 'operativo_vehiculo', monto: montoBase })],
    null,
    null,
  );
  const despues = calculateBusinessResult(
    ingresos,
    [mkGasto({ tipo_gasto: 'gastos_globales', monto: montoBase })],
    null,
    null,
  );
  // El total de gastos no cambia (mismo monto, distinta categoría)
  expect(despues.totalGastos).toBe(antes.totalGastos);
  expect(despues.resultado).toBe(antes.resultado);
});

test('cambiar vehicle_id → resultado general no cambia si monto no cambia', () => {
  const ingresos = [mkIngreso({ monto: 10000 })];
  const antes = calculateBusinessResult(
    ingresos,
    [mkGasto({ vehicleId: 1, monto: 500 })],
    null,
    null,
  );
  const despues = calculateBusinessResult(
    ingresos,
    [mkGasto({ vehicleId: 2, monto: 500 })],
    null,
    null,
  );
  expect(despues.resultado).toBe(antes.resultado);
});

// ── FILTRO DE PERÍODO ─────────────────────────────────────────────────────────

test('filtra correctamente por período: solo cuenta movimientos en rango', () => {
  const ingresos = [
    mkIngreso({ fecha: '2024-01-15', monto: 5000 }),
    mkIngreso({ fecha: '2024-03-15', monto: 3000 }), // fuera del rango
  ];
  const gastos = [
    mkGasto({ fecha: '2024-01-20', monto: 2000 }),
    mkGasto({ fecha: '2024-03-20', monto: 1000 }), // fuera del rango
  ];
  const r = calculateBusinessResult(ingresos, gastos, '2024-01-01', '2024-01-31');
  expect(r.totalIngresos).toBe(5000);
  expect(r.totalGastos).toBe(2000);
  expect(r.resultado).toBe(3000);
});

// ── USD SIN TIPO DE CAMBIO ────────────────────────────────────────────────────

test('ingresosSinTipoCambio: detecta USD sin TC ni montoPEN', () => {
  const problematico = mkIngreso({ moneda: 'USD', tipoCambio: null, montoPENReferencia: null });
  const conTC = mkIngreso({ id: '2', moneda: 'USD', tipoCambio: 3.8 });
  const conPEN = mkIngreso({ id: '3', moneda: 'USD', montoPENReferencia: 3800 });
  const enSoles = mkIngreso({ id: '4', moneda: 'PEN' });

  const result = ingresosSinTipoCambio([problematico, conTC, conPEN, enSoles]);
  expect(result).toHaveLength(1);
  expect(result[0].id).toBe('1');
});

test('ingresosSinTipoCambio: retorna vacío cuando no hay problemas', () => {
  const ingresos = [
    mkIngreso({ moneda: 'PEN' }),
    mkIngreso({ id: '2', moneda: 'USD', tipoCambio: 3.75 }),
  ];
  expect(ingresosSinTipoCambio(ingresos)).toHaveLength(0);
});

// ── CONSISTENCIA RESUMEN VS REPORTES ─────────────────────────────────────────

test('mismo fixture produce mismo resultado en ambos contextos (mes específico)', () => {
  const ingresos = [
    mkIngreso({ fecha: '2024-06-10', monto: 8000 }),
    mkIngreso({ id: '2', fecha: '2024-06-20', monto: 2000 }),
  ];
  const gastos = [
    mkGasto({ fecha: '2024-06-05', monto: 3000, tipo_gasto: 'operativo_vehiculo' }),
    mkGasto({ id: '2', fecha: '2024-06-15', monto: 1500, tipo_gasto: 'administrativo_empresa' }),
    mkGasto({ id: '3', fecha: '2024-06-25', monto: 500, tipo_gasto: 'pendiente_revision' }),
  ];

  // Simula lo que haría Resumen con preset=mes_actual en junio 2024
  const resumen = calculateBusinessResult(ingresos, gastos, '2024-06-01', '2024-06-30');
  // Simula lo que haría RendimientoMensual (misma fórmula ahora)
  const reportes = calculateBusinessResult(ingresos, gastos, '2024-06-01', '2024-06-30');

  expect(resumen.resultado).toBe(reportes.resultado);
  expect(resumen.totalIngresos).toBe(10000);
  expect(resumen.totalGastos).toBe(5000);
  expect(resumen.resultado).toBe(5000);
});

// ── GASTOS GLOBALES NO AFECTAN UTILIDAD POR VEHÍCULO ─────────────────────────

test('verificar en fuente que gastoIncluidoEnUtilidadReal excluye vehicleId=null', () => {
  const src = readFileSync(
    resolve(__dirname, '../../src/utils/utilidadReal.ts'),
    'utf-8',
  );
  // La función debe devolver false cuando vehicleId es null
  expect(src).toContain('vehicleId == null');
});

// ── CASCADA FINANCIERA ────────────────────────────────────────────────────────

test('cascada: suma de layers === totalGastos (reconciles)', () => {
  const dist = [
    { key: 'operativo_vehiculo', monto: 3000 },
    { key: 'administrativo_empresa', monto: 1000 },
    { key: 'financiero_prestamo', monto: 500 },
    { key: 'inversion_compra', monto: 200 },
  ];
  const totalGastos = 4700;
  const c = buildCascadaFinanciera(10000, dist, totalGastos);
  const sumLayers = c.layers.reduce((s, l) => s + l.monto, 0);
  expect(sumLayers).toBe(totalGastos);
  expect(c.reconciles).toBe(true);
});

test('cascada: resultado === totalIngresos − totalGastos (identidad)', () => {
  const dist = [{ key: 'operativo_vehiculo', monto: 4000 }];
  const c = buildCascadaFinanciera(10000, dist, 4000);
  expect(c.resultado).toBe(6000);
  expect(c.resultado).toBe(c.totalIngresos - c.totalGastos);
});

test('cascada: resultado negativo cuando gastos > ingresos', () => {
  const dist = [{ key: 'planilla_laboral', monto: 12000 }];
  const c = buildCascadaFinanciera(8000, dist, 12000);
  expect(c.resultado).toBe(-4000);
  expect(c.resultadoNegocio).toBe(8000 - 12000);
});

test('cascada: subtotales intermedios correctos', () => {
  const dist = [
    { key: 'operativo_vehiculo', monto: 2000 },
    { key: 'administrativo_empresa', monto: 1000 },
    { key: 'financiero_prestamo', monto: 500 },
    { key: 'inversion_compra', monto: 300 },
    { key: 'pendiente_revision', monto: 200 },
  ];
  const c = buildCascadaFinanciera(10000, dist, 4000);
  expect(c.resultadoOperativo).toBe(10000 - 2000); // 8000
  expect(c.resultadoNegocio).toBe(8000 - 1000);    // 7000
  expect(c.resultadoPostFinanciero).toBe(7000 - 500); // 6500
  expect(c.resultadoPostInversion).toBe(6500 - 300);  // 6200
  expect(c.resultado).toBe(10000 - 4000);              // 6000 (autoritativo)
});

test('cascada: editar gasto actualiza capa correcta', () => {
  const dist1 = [{ key: 'operativo_vehiculo', monto: 3000 }];
  const dist2 = [{ key: 'operativo_vehiculo', monto: 2500 }];
  const c1 = buildCascadaFinanciera(10000, dist1, 3000);
  const c2 = buildCascadaFinanciera(10000, dist2, 2500);
  expect(c2.layers[0].monto).toBe(2500);
  expect(c2.resultadoOperativo).toBe(c1.resultadoOperativo + 500);
  expect(c2.resultado).toBe(c1.resultado + 500);
});

test('cascada: cambiar categoría mueve entre capas pero totalGastos no cambia', () => {
  const dist1 = [{ key: 'operativo_vehiculo', monto: 1000 }];
  const dist2 = [{ key: 'administrativo_empresa', monto: 1000 }];
  const c1 = buildCascadaFinanciera(10000, dist1, 1000);
  const c2 = buildCascadaFinanciera(10000, dist2, 1000);
  expect(c1.totalGastos).toBe(c2.totalGastos);
  expect(c1.resultado).toBe(c2.resultado);
  expect(c1.layers[0].monto).toBe(1000);  // operativos
  expect(c1.layers[1].monto).toBe(0);     // negocio
  expect(c2.layers[0].monto).toBe(0);     // operativos
  expect(c2.layers[1].monto).toBe(1000);  // negocio
});

test('cascada: pendiente_revision aparece en capa pendientes y reduce resultado', () => {
  const dist = [{ key: 'pendiente_revision', monto: 800 }];
  const c = buildCascadaFinanciera(5000, dist, 800);
  const pendLayer = c.layers.find((l) => l.id === 'pendientes');
  expect(pendLayer?.monto).toBe(800);
  expect(c.resultado).toBe(4200);
  expect(c.reconciles).toBe(true);
});

test('cascada: todos los tipos canónicos agrupados en exactamente una capa', () => {
  const allTypes = [
    { key: 'operativo_vehiculo', monto: 100 },
    { key: 'operativo_flota_general', monto: 100 },
    { key: 'administrativo_empresa', monto: 100 },
    { key: 'planilla_laboral', monto: 100 },
    { key: 'representacion_interna', monto: 100 },
    { key: 'otros_gastos_varios', monto: 100 },
    { key: 'gastos_globales', monto: 100 },
    { key: 'financiero_prestamo', monto: 100 },
    { key: 'inversion_compra', monto: 100 },
    { key: 'pendiente_revision', monto: 100 },
  ];
  const totalGastos = 1000;
  const c = buildCascadaFinanciera(5000, allTypes, totalGastos);
  const sumLayers = c.layers.reduce((s, l) => s + l.monto, 0);
  expect(sumLayers).toBe(totalGastos);
  expect(c.resultado).toBe(5000 - 1000);
  expect(c.reconciles).toBe(true);
});

test('cascada: sin gastos → resultado = ingresos, todas las capas en cero', () => {
  const c = buildCascadaFinanciera(5000, [], 0);
  expect(c.resultado).toBe(5000);
  expect(c.layers.every((l) => l.monto === 0)).toBe(true);
  expect(c.reconciles).toBe(true);
});

test('cascada: aportes NO deben sumarse a ingresos ni gastos (verificación estructural)', () => {
  // La cascada solo recibe totalIngresos y distribucion de gastos.
  // Los aportes son datos externos y nunca deben aparecer aquí.
  const dist = [{ key: 'operativo_vehiculo', monto: 1000 }];
  const c = buildCascadaFinanciera(5000, dist, 1000);
  // totalIngresos es exactamente lo que se pasó — no hay suma de aportes
  expect(c.totalIngresos).toBe(5000);
  expect(c.totalGastos).toBe(1000);
});

test('cascada: deuda estimada de préstamos NO se suma como gasto adicional', () => {
  // La cascada recibe la distribución real de gastos.
  // La deuda registrada es solo informativa y no aparece en la cascada.
  const dist = [{ key: 'financiero_prestamo', monto: 600 }];
  const c = buildCascadaFinanciera(5000, dist, 600);
  expect(c.layers.find((l) => l.id === 'financieros')?.monto).toBe(600);
  expect(c.resultado).toBe(4400);
});

test('cascada: inversión histórica de flota NO se suma a gastos de la cascada', () => {
  // inversiones_generales_vehiculo es informativa, no está en distribucion de gastos
  const dist = [{ key: 'inversion_compra', monto: 2000 }];
  const c = buildCascadaFinanciera(10000, dist, 2000);
  expect(c.layers.find((l) => l.id === 'inversiones')?.monto).toBe(2000);
  // No hay doble conteo: totalGastos = 2000, no más
  expect(c.totalGastos).toBe(2000);
});
