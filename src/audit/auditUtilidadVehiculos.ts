/**
 * Auditoría SOLO LECTURA: utilidad por vehículo vs fórmula esperada (ingresos − gastos).
 * No modifica datos. Consola DEV: await window.auditUtilidadVehiculos()
 */
import type {
  CajaNegocioVehiculo,
  Descuento,
  Gasto,
  GastoCaja,
  Ingreso,
  Vehicle,
} from '../data/types';
import { calculateVehicleRentability } from '../utils/calculations';
import { gastosOperativosSolamente, isCajaNegocioGasto } from '../utils/cajaNegocio';
import { ingresoMontoPEN } from '../utils/moneda';
import {
  buildUtilidadHistoricaPorVehiculo,
  getUtilidadCorteHistorico,
  isGastoOperativoUtilidadVehiculo,
} from '../utils/utilidadOperativa';
import { calcularUtilidadRealVehiculo, sumUtilidadRealFlota } from '../utils/utilidadReal';
import { tipoGastoEffective } from '../utils/gastosTipoGasto';
import { formatVehicleLabelFull } from '../utils/vehicleDisplayNumber';

export type AuditUtilidadVehiculosInput = {
  vehicles: readonly Vehicle[];
  ingresos: readonly Ingreso[];
  gastos: readonly Gasto[];
  cajaNegocioVehiculo: readonly CajaNegocioVehiculo[];
  gastosCaja?: readonly GastoCaja[];
  descuentos?: readonly Descuento[];
  gastosLoadScope?: 'recent' | 'full';
};

export type AuditUtilidadVehiculoRow = {
  vehicleId: number;
  placa: string;
  unidadLabel: string;
  activo: boolean;
  ingresos_total: number;
  gastos_total_todos: number;
  gastos_operativos_vehiculo: number;
  gastos_globales_asignados: number;
  gastos_sin_vehiculo_excluidos: number;
  utilidad_esperada: number;
  utilidad_esperada_solo_operativo: number;
  utilidad_actual_ui: number;
  utilidad_historica_importada: number;
  /** Alias de utilidad_actual_ui (métrica principal en pantallas). */
  utilidad_acumulada_ui: number;
  margen_operativo_detalle: number;
  margen_reportes_legacy: number;
  diferencia_vs_esperada_historica: number;
  diferencia_vs_esperada_ui: number;
  diferencia_vs_esperada_acumulada: number;
  diferencia_vs_esperada_margen_reportes: number;
  cantidad_ingresos: number;
  cantidad_gastos_todos: number;
  cantidad_gastos_operativos: number;
  cantidad_caja_negocio: number;
  observaciones: string[];
};

export type AuditUtilidadVehiculosResult = {
  formulaEsperadaDueno: string;
  fuentes: Record<string, unknown>;
  formulaActualUi: Record<string, unknown>;
  resumen: {
    vehiculosActivos: number;
    utilidadRealFlota: number;
    gastos_en_memoria: number;
    gastos_load_scope: 'recent' | 'full';
    subconteo_probable_bootstrap: boolean;
    conDiferenciaHistoricaVsEsperada: number;
    conDiferenciaUiVsEsperada: number;
    ingresosSinVehiculo: number;
    gastosSinVehiculo: number;
    gastosGlobalesSinVehiculo: number;
  };
  porVehiculo: AuditUtilidadVehiculoRow[];
};

function vehicleIdMatches(
  recordId: number | string | null | undefined,
  vehicleId: number,
): boolean {
  if (recordId == null || recordId === '') return false;
  return String(recordId) === String(vehicleId);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function ingresosVehiculo(ingresos: readonly Ingreso[], vehicleId: number): Ingreso[] {
  return ingresos.filter((i) => vehicleIdMatches(i.vehicleId, vehicleId));
}

function gastosVehiculo(gastos: readonly Gasto[], vehicleId: number): Gasto[] {
  return gastos.filter((g) => vehicleIdMatches(g.vehicleId, vehicleId));
}

export function auditUtilidadVehiculos(input: AuditUtilidadVehiculosInput): AuditUtilidadVehiculosResult {
  const {
    vehicles,
    ingresos,
    gastos,
    cajaNegocioVehiculo,
    gastosCaja = [],
    descuentos = [],
    gastosLoadScope = 'recent',
  } = input;

  const activos = vehicles.filter((v) => v.activo !== false);
  const historicaPorVehiculo = buildUtilidadHistoricaPorVehiculo([...cajaNegocioVehiculo]);
  const historicaMap = new Map(historicaPorVehiculo.map((r) => [r.vehicleId, r.monto]));
  const corte = getUtilidadCorteHistorico([...cajaNegocioVehiculo]);

  const rentabilidad = calculateVehicleRentability(
    [...activos],
    [...ingresos],
    [...gastos],
    [...descuentos],
  );
  const rentMap = new Map(rentabilidad.map((r) => [r.vehicle.id, r]));

  const ingresosSinVeh = ingresos.filter((i) => i.vehicleId == null);
  const gastosSinVeh = gastos.filter((g) => g.vehicleId == null);
  const gastosGlobalesSinVeh = gastos.filter(
    (g) => g.vehicleId == null && tipoGastoEffective(g) === 'gastos_globales',
  );

  const fuentes: Record<string, unknown> = {
    ingresos: {
      tabla: 'public.ingresos',
      campoVehiculo: 'vehicle_id → Ingreso.vehicleId (number | null)',
      monto: 'ingresoMontoPEN(i) — PEN o monto × tipoCambio si USD',
      eliminados: 'no hay soft-delete en cliente; lista = fetchIngresos en bootstrap',
      sinVehiculo: {
        count: ingresosSinVeh.length,
        montoPEN: round2(ingresosSinVeh.reduce((s, i) => s + ingresoMontoPEN(i), 0)),
      },
    },
    gastos: {
      tabla: 'public.gastos',
      campoVehiculo: 'vehicle_id → Gasto.vehicleId (number | string | null)',
      monto: 'g.monto (signo siempre negativo en tipo)',
      bootstrap: {
        scope: gastosLoadScope,
        nota:
          gastosLoadScope === 'recent'
            ? 'Memoria = fetchGastosRecent (~1000 últimos) + pendiente + globales. Utilidad subcuenta si hay gastos antiguos no incluidos. Usar reloadGastosFull() o pantallas utilidad (auto-carga).'
            : 'Memoria = fetchGastosFull (histórico completo).',
        filas_en_memoria: gastos.length,
      },
      globalesMezclados: 'gastos con vehicle_id null no se asignan a un vehículo',
      sinVehiculo: {
        count: gastosSinVeh.length,
        monto: round2(gastosSinVeh.reduce((s, g) => s + g.monto, 0)),
        globalesCount: gastosGlobalesSinVeh.length,
      },
    },
    gastos_caja: {
      tabla: 'public.gastos_caja (Excel GASTOS)',
      aplicaUtilidadVehiculo: false,
      count: gastosCaja.length,
    },
    caja_negocio_vehiculo: {
      tabla: 'public.caja_negocio_vehiculo',
      esFormulaDueno: false,
      nota: 'Histórico importado (referencial). Ya no es utilidad principal.',
      registros: cajaNegocioVehiculo.length,
      corte,
    },
    descuentos: {
      enFormulaDueno: false,
      enMargenOperativoDetalle: 'ingresos − gastos operativos + descuentos',
      count: descuentos.length,
    },
  };

  const formulaActualUi: Record<string, unknown> = {
    formulaEsperadaDueno: 'INGRESOS(vehículo) − GASTOS(vehículo) — todos los gastos con vehicle_id',
    utilidadRealPrincipal: {
      donde: 'FinanzasHub, /finanzas/utilidad-operativa, Reportes → Utilidad acumulada, detalle vehículo, cards',
      formula: 'Σ ingresos(vehicle_id) − Σ gastos(vehicle_id)',
      funcion: 'calcularUtilidadRealVehiculo / buildUtilidadRealPorVehiculo / sumUtilidadRealFlota',
    },
    historicoImportadoReferencial: {
      donde: 'Sección aparte en utilidad-operativa, reportes, tab finanzas detalle vehículo',
      fuente: 'Σ caja_negocio_vehiculo.monto por vehicle_id',
      etiqueta: 'Histórico importado (referencial)',
    },
    margenOperativo: {
      donde: 'Detalle vehículo (secundario)',
      formula: 'Σ ingresos − Σ gastosOperativosSolamente + Σ descuentos',
    },
    rentabilidadReportes: {
      donde: 'Reportes → Rentabilidad por vehículo, VehiculosHub, Dashboard TopVehicles',
      formula: 'Σ ingresos − Σ gastos (todos con vehicle_id)',
      funcion: 'calculateVehicleRentability (calculations.ts)',
    },
  };

  console.warn('[audit:utilidad:fuentes]', fuentes);
  console.warn('[audit:utilidad:formula_actual]', formulaActualUi);

  const porVehiculo: AuditUtilidadVehiculoRow[] = activos.map((v) => {
    const ingRows = ingresosVehiculo(ingresos, v.id);
    const gasRows = gastosVehiculo(gastos, v.id);
    const ingTotal = ingRows.reduce((s, i) => s + ingresoMontoPEN(i), 0);
    const gasTotalTodos = gasRows.reduce((s, g) => s + g.monto, 0);
    const gasOp = gasRows.filter((g) => isGastoOperativoUtilidadVehiculo(g));
    const gasOpTotal = gasOp.reduce((s, g) => s + g.monto, 0);
    const gasGlobalesEnVeh = gasRows.filter((g) => tipoGastoEffective(g) === 'gastos_globales');
    const vehicleDescuentos = descuentos.filter((d) => vehicleIdMatches(d.vehicleId, v.id));
    const descTotal = vehicleDescuentos.reduce((s, d) => s + d.monto, 0);

    const utilidadEsperada = ingTotal - gasTotalTodos;
    const utilidadEsperadaOp = ingTotal - gasOpTotal;
    const { utilidadReal: utilidadActualUi } = calcularUtilidadRealVehiculo(v.id, ingresos, gastos);
    const historica = historicaMap.get(v.id) ?? 0;
    const rent = rentMap.get(v.id);
    const margenReportes = rent?.margen ?? utilidadActualUi;
    const margenOperativoDetalle =
      ingTotal - gastosOperativosSolamente(gasRows).reduce((s, g) => s + g.monto, 0) + descTotal;

    const observaciones: string[] = [];
    if (historica !== 0 && Math.abs(historica - utilidadEsperada) > 0.01) {
      observaciones.push('Histórico importado ≠ ingresos−gastos (dato Excel referencial)');
    }
    if (Math.abs(margenOperativoDetalle - utilidadEsperada) > 0.01) {
      observaciones.push('Margen operativo usa solo gastos operativos + descuentos');
    }
    if (gasGlobalesEnVeh.length > 0) {
      observaciones.push(`${gasGlobalesEnVeh.length} gasto(s) globales con vehicle_id asignado`);
    }
    if (gasRows.some((g) => isCajaNegocioGasto(g))) {
      observaciones.push('Incluye gastos etiquetados caja negocio en tabla gastos');
    }
    if (gastosLoadScope === 'recent' && gasRows.length < 5 && ingTotal > 1000) {
      observaciones.push('Bootstrap reciente: pocos gastos en memoria vs ingresos altos — posible subconteo');
    }

    const row: AuditUtilidadVehiculoRow = {
      vehicleId: v.id,
      placa: v.placa,
      unidadLabel: formatVehicleLabelFull(v),
      activo: v.activo !== false,
      ingresos_total: round2(ingTotal),
      gastos_total_todos: round2(gasTotalTodos),
      gastos_operativos_vehiculo: round2(gasOpTotal),
      gastos_globales_asignados: round2(gasGlobalesEnVeh.reduce((s, g) => s + g.monto, 0)),
      gastos_sin_vehiculo_excluidos: 0,
      utilidad_esperada: round2(utilidadEsperada),
      utilidad_esperada_solo_operativo: round2(utilidadEsperadaOp),
      utilidad_actual_ui: round2(utilidadActualUi),
      utilidad_historica_importada: round2(historica),
      utilidad_acumulada_ui: round2(utilidadActualUi),
      margen_operativo_detalle: round2(margenOperativoDetalle),
      margen_reportes_legacy: round2(margenReportes),
      diferencia_vs_esperada_historica: round2(historica - utilidadEsperada),
      diferencia_vs_esperada_ui: round2(utilidadActualUi - utilidadEsperada),
      diferencia_vs_esperada_acumulada: round2(utilidadActualUi - utilidadEsperada),
      diferencia_vs_esperada_margen_reportes: round2(margenReportes - utilidadEsperada),
      cantidad_ingresos: ingRows.length,
      cantidad_gastos_todos: gasRows.length,
      cantidad_gastos_operativos: gasOp.length,
      cantidad_caja_negocio: cajaNegocioVehiculo.filter((c) => c.vehicleId === v.id).length,
      observaciones,
    };

    console.warn('[audit:utilidad:vehiculo]', row);
    return row;
  });

  const conDiffHist = porVehiculo.filter((r) => Math.abs(r.diferencia_vs_esperada_historica) > 0.01).length;
  const conDiffUi = porVehiculo.filter((r) => Math.abs(r.diferencia_vs_esperada_ui) > 0.01).length;

  const diferencias = porVehiculo
    .filter(
      (r) =>
        Math.abs(r.diferencia_vs_esperada_ui) > 0.01 ||
        Math.abs(r.diferencia_vs_esperada_historica) > 0.01,
    )
    .map((r) => ({
      vehicleId: r.vehicleId,
      placa: r.placa,
      ingresos_total: r.ingresos_total,
      gastos_total_todos: r.gastos_total_todos,
      utilidad_esperada: r.utilidad_esperada,
      utilidad_actual_ui: r.utilidad_actual_ui,
      utilidad_historica_importada: r.utilidad_historica_importada,
      dif_ui: r.diferencia_vs_esperada_ui,
      dif_historica: r.diferencia_vs_esperada_historica,
      observaciones: r.observaciones,
    }));

  console.warn('[audit:utilidad:diferencias]', diferencias);

  const result: AuditUtilidadVehiculosResult = {
    formulaEsperadaDueno: 'INGRESOS(vehicle_id) − GASTOS(vehicle_id)',
    fuentes,
    formulaActualUi,
    resumen: {
      vehiculosActivos: activos.length,
      utilidadRealFlota: round2(sumUtilidadRealFlota(ingresos, gastos, activos)),
      gastos_en_memoria: gastos.length,
      gastos_load_scope: gastosLoadScope,
      subconteo_probable_bootstrap: gastosLoadScope === 'recent',
      conDiferenciaHistoricaVsEsperada: conDiffHist,
      conDiferenciaUiVsEsperada: conDiffUi,
      ingresosSinVehiculo: ingresosSinVeh.length,
      gastosSinVehiculo: gastosSinVeh.length,
      gastosGlobalesSinVehiculo: gastosGlobalesSinVeh.length,
    },
    porVehiculo,
  };

  console.warn('[audit:utilidad:resumen]', result.resumen);
  return result;
}
