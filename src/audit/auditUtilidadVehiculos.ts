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
  buildUtilidadPorVehiculo,
  calcularUtilidadAcumulada,
  getUtilidadCorteHistorico,
  isGastoOperativoUtilidadVehiculo,
  UTILIDAD_CALCULO_AUTOMATICO_ACTIVO,
} from '../utils/utilidadOperativa';
import { tipoGastoEffective } from '../utils/gastosTipoGasto';

export type AuditUtilidadVehiculosInput = {
  vehicles: readonly Vehicle[];
  ingresos: readonly Ingreso[];
  gastos: readonly Gasto[];
  cajaNegocioVehiculo: readonly CajaNegocioVehiculo[];
  gastosCaja?: readonly GastoCaja[];
  descuentos?: readonly Descuento[];
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
  utilidad_historica_importada: number;
  utilidad_acumulada_ui: number;
  utilidad_calculada_post_corte: number;
  margen_reportes_legacy: number;
  margen_detalle_vehiculo: number;
  diferencia_vs_esperada_historica: number;
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
    conDiferenciaHistoricaVsEsperada: number;
    conDiferenciaAcumuladaVsEsperada: number;
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
  } = input;

  const activos = vehicles.filter((v) => v.activo !== false);
  const historicaPorVehiculo = buildUtilidadHistoricaPorVehiculo([...cajaNegocioVehiculo]);
  const historicaMap = new Map(historicaPorVehiculo.map((r) => [r.vehicleId, r.monto]));
  const acumulada = calcularUtilidadAcumulada(
    [...cajaNegocioVehiculo],
    [...ingresos],
    [...gastos],
    [...activos],
  );
  const acumuladaMap = new Map(acumulada.porVehiculo.map((r) => [r.vehicleId, r]));
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
      unidadId: 'no se usa unidad_id en ingresos; solo vehicle_id',
      monto: 'ingresoMontoPEN(i) — PEN o monto × tipoCambio si USD',
      estados: 'estadoPago legacy en BD; UI trata ingresos como confirmados (sin filtro anulado en memoria)',
      eliminados: 'no hay soft-delete en cliente; lista = fetchIngresos en bootstrap (registros borrados no aparecen)',
      sinVehiculo: {
        count: ingresosSinVeh.length,
        montoPEN: round2(ingresosSinVeh.reduce((s, i) => s + ingresoMontoPEN(i), 0)),
        esExtraordinario: ingresosSinVeh.filter((i) => i.esExtraordinario).length,
      },
    },
    gastos: {
      tabla: 'public.gastos',
      campoVehiculo: 'vehicle_id → Gasto.vehicleId (number | string | null)',
      unidadId: 'no se usa unidad_id en gastos',
      monto: 'g.monto (signo siempre negativo en tipo)',
      estados: 'sin filtro estado en memoria; borrados no están en bootstrap',
      globalesMezclados: 'gastos con vehicle_id null y tipo_gastos_globales no se asignan a un vehículo en utilidad por unidad',
      cajaNegocioTexto: 'gastos con texto «caja negocio» excluidos de operativos (isCajaNegocioGasto)',
      sinVehiculo: {
        count: gastosSinVeh.length,
        monto: round2(gastosSinVeh.reduce((s, g) => s + g.monto, 0)),
        globalesCount: gastosGlobalesSinVeh.length,
      },
    },
    gastos_caja: {
      tabla: 'public.gastos_caja (Excel GASTOS)',
      aplicaUtilidadVehiculo: false,
      nota: 'caja general sin vehicle_id; no entra en utilidad por vehículo',
      count: gastosCaja.length,
      monto: round2(gastosCaja.reduce((s, g) => s + g.monto, 0)),
    },
    caja_negocio_vehiculo: {
      tabla: 'public.caja_negocio_vehiculo',
      campo: 'vehicle_id, fecha, monto (utilidad histórica importada Excel)',
      esFormulaDueno: false,
      nota: 'Es dato importado, no ingresos−gastos',
      registros: cajaNegocioVehiculo.length,
      corte,
    },
    descuentos: {
      tabla: 'descuentos (memoria)',
      campo: 'vehicle_id',
      enFormulaDueno: false,
      enMargenReportes: 'calculateVehicleRentability suma descuentos al margen',
      count: descuentos.length,
    },
  };

  const formulaActualUi: Record<string, unknown> = {
    formulaEsperadaDueno: 'INGRESOS(vehículo) − GASTOS(vehículo) — todos los gastos con vehicle_id',
    utilidadHistoricaImportada: {
      donde: 'FinanzasHub, /finanzas/utilidad-operativa, Reportes → Utilidad acumulada',
      fuente: 'Σ caja_negocio_vehiculo.monto por vehicle_id',
      funcion: 'buildUtilidadHistoricaPorVehiculo / sumUtilidadHistoricaTotal',
      cache: 'memoria RegistrosContext.cajaNegocioVehiculo (fetch bootstrap)',
      rpc: false,
    },
    utilidadAcumuladaCombinada: {
      donde: 'utilidadOperativa.ts (reportes avanzados si se activa cálculo)',
      formula: 'meses ≤ corte: histórica importada; meses > corte: Σ(ingresos − gastos operativo_vehiculo) por mes',
      funcion: 'buildUtilidadPorVehiculo / calcularUtilidadAcumulada',
      calculoAutomaticoActivo: UTILIDAD_CALCULO_AUTOMATICO_ACTIVO,
      gastosIncluidos: 'solo tipo operativo_vehiculo (excluye globales, admin, financiero, caja negocio texto)',
    },
    rentabilidadReportes: {
      donde: 'Reportes → Rentabilidad por vehículo, VehiculosHub, Metas',
      formula: 'Σ ingresos − Σ gastosOperativosSolamente + Σ descuentos',
      funcion: 'calculateVehicleRentability (calculations.ts)',
      gastos: 'excluye isCajaNegocioGasto; no filtra por tipo_gasto operativo_vehiculo estricto',
    },
    vehiculoDetalle: {
      donde: '/vehiculos/:id',
      formula: 'totalIngresos − totalGastosOperativos + totalDescuentos',
      gastosOperativos: 'gastosOperativosSolamente (sin caja negocio texto)',
    },
    resultadoNetoGlobal: {
      donde: 'FinanzasHub (oculto), Resumen',
      formula: 'Σ ingresos − Σ gastos (todas categorías, RPC summary posible)',
      nota: 'NO es utilidad por vehículo',
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
    const utilidadEsperada = ingTotal - gasTotalTodos;
    const utilidadEsperadaOp = ingTotal - gasOpTotal;
    const historica = historicaMap.get(v.id) ?? 0;
    const acum = acumuladaMap.get(v.id);
    const utilidadAcumulada = acum?.utilidadAcumulada ?? 0;
    const utilidadCalculada = acum?.utilidadCalculada ?? 0;
    const rent = rentMap.get(v.id);
    const margenReportes = rent?.margen ?? 0;
    const margenDetalle =
      (rent?.totalIngresos ?? ingTotal) -
      (rent?.totalGastos ?? gasOpTotal) +
      (rent?.totalDescuentos ?? 0);

    const observaciones: string[] = [];
    if (historica !== 0 && Math.abs(historica - utilidadEsperada) > 0.01) {
      observaciones.push('Utilidad histórica importada ≠ ingresos−gastos (dato Excel, no calculada)');
    }
    if (!UTILIDAD_CALCULO_AUTOMATICO_ACTIVO && utilidadCalculada !== 0) {
      observaciones.push('Hay tramo calculado post-corte aunque UI muestra solo histórica');
    }
    if (Math.abs(margenReportes - utilidadEsperada) > 0.01) {
      observaciones.push('Margen reportes usa gastos operativos+caja texto y descuentos, no todos los gastos');
    }
    if (gasGlobalesEnVeh.length > 0) {
      observaciones.push(`${gasGlobalesEnVeh.length} gasto(s) globales con vehicle_id asignado`);
    }
    if (gasRows.some((g) => isCajaNegocioGasto(g))) {
      observaciones.push('Incluye gastos etiquetados caja negocio en tabla gastos');
    }

    const row: AuditUtilidadVehiculoRow = {
      vehicleId: v.id,
      placa: v.placa,
      unidadLabel: `#${v.id} ${v.marca} ${v.modelo}`,
      activo: v.activo !== false,
      ingresos_total: round2(ingTotal),
      gastos_total_todos: round2(gasTotalTodos),
      gastos_operativos_vehiculo: round2(gasOpTotal),
      gastos_globales_asignados: round2(gasGlobalesEnVeh.reduce((s, g) => s + g.monto, 0)),
      gastos_sin_vehiculo_excluidos: 0,
      utilidad_esperada: round2(utilidadEsperada),
      utilidad_esperada_solo_operativo: round2(utilidadEsperadaOp),
      utilidad_historica_importada: round2(historica),
      utilidad_acumulada_ui: round2(utilidadAcumulada),
      utilidad_calculada_post_corte: round2(utilidadCalculada),
      margen_reportes_legacy: round2(margenReportes),
      margen_detalle_vehiculo: round2(margenDetalle),
      diferencia_vs_esperada_historica: round2(historica - utilidadEsperada),
      diferencia_vs_esperada_acumulada: round2(utilidadAcumulada - utilidadEsperada),
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
  const conDiffAcum = porVehiculo.filter((r) => Math.abs(r.diferencia_vs_esperada_acumulada) > 0.01).length;

  const diferencias = porVehiculo
    .filter(
      (r) =>
        Math.abs(r.diferencia_vs_esperada_historica) > 0.01 ||
        Math.abs(r.diferencia_vs_esperada_acumulada) > 0.01 ||
        Math.abs(r.diferencia_vs_esperada_margen_reportes) > 0.01,
    )
    .map((r) => ({
      vehicleId: r.vehicleId,
      placa: r.placa,
      utilidad_esperada: r.utilidad_esperada,
      utilidad_historica_importada: r.utilidad_historica_importada,
      utilidad_acumulada_ui: r.utilidad_acumulada_ui,
      margen_reportes: r.margen_reportes_legacy,
      dif_historica: r.diferencia_vs_esperada_historica,
      dif_acumulada: r.diferencia_vs_esperada_acumulada,
      dif_margen: r.diferencia_vs_esperada_margen_reportes,
      observaciones: r.observaciones,
    }));

  console.warn('[audit:utilidad:diferencias]', diferencias);

  const result: AuditUtilidadVehiculosResult = {
    formulaEsperadaDueno: 'INGRESOS(vehicle_id) − GASTOS(vehicle_id)',
    fuentes,
    formulaActualUi,
    resumen: {
      vehiculosActivos: activos.length,
      conDiferenciaHistoricaVsEsperada: conDiffHist,
      conDiferenciaAcumuladaVsEsperada: conDiffAcum,
      ingresosSinVehiculo: ingresosSinVeh.length,
      gastosSinVehiculo: gastosSinVeh.length,
      gastosGlobalesSinVehiculo: gastosGlobalesSinVeh.length,
    },
    porVehiculo,
  };

  console.warn('[audit:utilidad:resumen]', result.resumen);
  return result;
}
