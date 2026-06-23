/**
 * Cálculos y helpers solo para la pantalla Utilidad (presentación).
 * Reutiliza utilidadReal / financialGlobalKpis sin alterar su lógica base.
 */
import type { Gasto, Ingreso, Vehicle } from '../data/types';
import { computeGlobalUtilidadPEN, sumIngresosGlobalPEN } from './financialGlobalKpis';
import type { GastosFinancialSummary } from './gastosFinancialSummary';
import { summaryCategoria } from './gastosFinancialSummary';
import { toDateOnlyString, todayStr } from './formatting';
import { ingresoMontoPEN } from './moneda';
import { tipoGastoEffective } from './gastosTipoGasto';
import { formatVehicleIdPlaca, getVehicleDisplayNumber } from './vehicleDisplayNumber';
import {
  calcularUtilidadRealEnRango,
  type UtilidadRealMes,
  type UtilidadRealVehiculo,
} from './utilidadReal';
import { mesLabelFromKey, monthKeyFromFecha } from './utilidadOperativa';

export const UTILIDAD_OFICIAL_NOTA =
  'Toda la utilidad ahora se calcula desde ingresos y gastos reales registrados.';

export type UtilidadPeriodoModo = 'mes' | 'anio' | 'historico';
export type UtilidadVistaModo = 'operativa' | 'global';

export type UtilidadTablaSortKey =
  | 'utilidad_desc'
  | 'utilidad_asc'
  | 'ingreso_desc'
  | 'gasto_desc'
  | 'margen_desc'
  | 'margen_asc'
  | 'vehicle_id_asc'
  | 'vehicle_id_desc'
  | 'placa_asc';

export const UTILIDAD_MODULO_LS = {
  periodo: 'utilidad_modulo_periodo',
  periodValue: 'utilidad_modulo_period_value',
  vista: 'utilidad_modulo_vista',
  sort: 'utilidad_modulo_sort',
  page: 'utilidad_modulo_page',
} as const;

export const UTILIDAD_TABLA_PAGE_SIZE = 15;

export const UTILIDAD_SORT_OPTIONS: { value: UtilidadTablaSortKey; label: string }[] = [
  { value: 'utilidad_desc', label: 'Mayor utilidad' },
  { value: 'utilidad_asc', label: 'Menor utilidad' },
  { value: 'ingreso_desc', label: 'Mayor ingreso' },
  { value: 'gasto_desc', label: 'Mayor gasto' },
  { value: 'margen_desc', label: 'Mayor margen %' },
  { value: 'margen_asc', label: 'Menor margen %' },
  { value: 'vehicle_id_asc', label: 'Vehicle ID asc' },
  { value: 'vehicle_id_desc', label: 'Vehicle ID desc' },
  { value: 'placa_asc', label: 'Placa A–Z' },
];

export type UtilidadDistribucionBucket = {
  key: string;
  label: string;
  monto: number;
  pct: number;
};

export type UtilidadMesEvolucion = UtilidadRealMes & {
  margenPct: number | null;
  variacionPct: number | null;
};

export type UtilidadResumenEjecutivo = {
  operativa: { utilidad: number; ingresos: number; gastos: number; margenPct: number | null };
  global: { utilidad: number; ingresos: number; gastos: number; margenPct: number | null };
  impactoNoOperativo: number;
};

export type UtilidadVehiculoFila = UtilidadRealVehiculo & {
  margenPct: number | null;
  placa: string;
  label: string;
  numeroUnidad: number;
};

export type UtilidadInsightCard = {
  id: string;
  emoji: string;
  title: string;
  vehicleId: number;
  placa: string;
  value: string;
  sub?: string;
};

const DISTRIBUCION_BUCKETS: { key: string; label: string; tipos: string[] }[] = [
  {
    key: 'operativos',
    label: 'Operativos',
    tipos: ['operativo_vehiculo', 'operativo_flota_general'],
  },
  { key: 'administrativos', label: 'Administrativos', tipos: ['administrativo_empresa', 'planilla_laboral'] },
  { key: 'financieros', label: 'Financieros', tipos: ['financiero_prestamo', 'financiero'] },
  { key: 'inversion', label: 'Inversión', tipos: ['inversion_compra'] },
  {
    key: 'otros',
    label: 'Otros',
    tipos: ['gastos_globales', 'representacion_interna', 'pendiente_revision', 'personal_socios_familiares'],
  },
];

export function margenPct(ingresos: number, utilidad: number): number | null {
  if (ingresos <= 0) return null;
  return (utilidad / ingresos) * 100;
}

export function pctVariacion(actual: number, anterior: number): number | null {
  if (anterior === 0) {
    if (actual === 0) return null;
    return actual > 0 ? 100 : -100;
  }
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}

export function lastDayOfMonth(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const last = new Date(y, mo, 0).getDate();
  return `${y}-${String(mo).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

export function resolvePeriodRange(
  modo: UtilidadPeriodoModo,
  periodValue: string,
): { desde: string | null; hasta: string | null; label: string } {
  if (modo === 'historico') {
    return { desde: null, hasta: null, label: 'Histórico completo' };
  }
  if (modo === 'anio') {
    const y = periodValue || todayStr().slice(0, 4);
    return { desde: `${y}-01-01`, hasta: `${y}-12-31`, label: `Año ${y}` };
  }
  const ym = /^\d{4}-\d{2}$/.test(periodValue) ? periodValue : todayStr().slice(0, 7);
  return {
    desde: `${ym}-01`,
    hasta: lastDayOfMonth(ym),
    label: mesLabelFromKey(ym),
  };
}

function normalizeTipoGastoBucket(raw: string | null | undefined, hasVehicle: boolean): string {
  const t = (raw ?? '').trim();
  if (!t) return hasVehicle ? 'operativo_vehiculo' : 'gastos_globales';
  const legacy: Record<string, string> = {
    financiero: 'financiero_prestamo',
    inversion: 'inversion_compra',
    operativo_flota_global: 'gastos_globales',
  };
  return legacy[t] ?? t;
}

export function sumUtilidadOperativaFlotaEnRango(
  vehicles: readonly Vehicle[],
  ingresos: readonly Ingreso[],
  gastos: readonly Gasto[],
  desde: string | null,
  hasta: string | null,
): { utilidad: number; ingresos: number; gastos: number } {
  let utilidad = 0;
  let ingresosSum = 0;
  let gastosSum = 0;
  for (const v of vehicles) {
    if (v.activo === false) continue;
    const r = calcularUtilidadRealEnRango(ingresos, gastos, desde, hasta, v.id);
    utilidad += r.utilidadReal;
    ingresosSum += r.ingresos;
    gastosSum += r.gastos;
  }
  return { utilidad, ingresos: ingresosSum, gastos: gastosSum };
}

function aggregateGlobalEnRango(
  ingresos: readonly Ingreso[],
  gastos: readonly Gasto[],
  desde: string | null,
  hasta: string | null,
): { ingresos: number; gastos: number; utilidad: number } {
  let ing = 0;
  let gas = 0;
  const bounded = Boolean(desde && hasta);
  for (const i of ingresos) {
    const d = toDateOnlyString(i.fecha);
    if (!d) continue;
    if (bounded && (d < desde! || d > hasta!)) continue;
    ing += ingresoMontoPEN(i);
  }
  for (const g of gastos) {
    const d = toDateOnlyString(g.fecha);
    if (!d) continue;
    if (bounded && (d < desde! || d > hasta!)) continue;
    gas += g.monto;
  }
  return { ingresos: ing, gastos: gas, utilidad: ing - gas };
}

export function buildResumenEjecutivo(opts: {
  vehicles: readonly Vehicle[];
  ingresos: readonly Ingreso[];
  gastos: readonly Gasto[];
  desde: string | null;
  hasta: string | null;
  historico: boolean;
  gastosFinancialSummary: GastosFinancialSummary | null;
}): UtilidadResumenEjecutivo {
  const { vehicles, ingresos, gastos, desde, hasta, historico, gastosFinancialSummary } = opts;

  const op = sumUtilidadOperativaFlotaEnRango(
    vehicles,
    ingresos,
    gastos,
    historico ? null : desde,
    historico ? null : hasta,
  );
  const operativa = {
    utilidad: op.utilidad,
    ingresos: op.ingresos,
    gastos: op.gastos,
    margenPct: margenPct(op.ingresos, op.utilidad),
  };

  let global: UtilidadResumenEjecutivo['global'];
  if (historico && gastosFinancialSummary) {
    const ingList = [...ingresos];
    const ing = sumIngresosGlobalPEN(ingList);
    const gas = gastosFinancialSummary.totalGastos;
    const util = computeGlobalUtilidadPEN(ingList, {
      source: 'rpc',
      total: gas,
      loadingLabel: null,
      movementCount: gastosFinancialSummary.totalCount,
    });
    global = {
      utilidad: util ?? ing - gas,
      ingresos: ing,
      gastos: gas,
      margenPct: margenPct(ing, util ?? ing - gas),
    };
  } else if (historico) {
    const agg = aggregateGlobalEnRango(ingresos, gastos, null, null);
    global = {
      utilidad: agg.utilidad,
      ingresos: agg.ingresos,
      gastos: agg.gastos,
      margenPct: margenPct(agg.ingresos, agg.utilidad),
    };
  } else {
    const agg = aggregateGlobalEnRango(ingresos, gastos, desde, hasta);
    global = {
      utilidad: agg.utilidad,
      ingresos: agg.ingresos,
      gastos: agg.gastos,
      margenPct: margenPct(agg.ingresos, agg.utilidad),
    };
  }

  return {
    operativa,
    global,
    impactoNoOperativo: operativa.utilidad - global.utilidad,
  };
}

export function buildDistribucionGastosModulo(
  gastos: readonly Gasto[],
  desde: string | null,
  hasta: string | null,
  historico: boolean,
  summary: GastosFinancialSummary | null,
): UtilidadDistribucionBucket[] {
  if (historico && summary) {
    const total = summary.totalGastos;
    return DISTRIBUCION_BUCKETS.map((b) => {
      const monto = b.tipos.reduce((s, t) => s + summaryCategoria(summary, t).monto, 0);
      return {
        key: b.key,
        label: b.label,
        monto,
        pct: total > 0 ? (monto / total) * 100 : 0,
      };
    })
      .filter((d) => d.monto > 0)
      .sort((a, b) => b.monto - a.monto);
  }

  const acc = Object.fromEntries(DISTRIBUCION_BUCKETS.map((b) => [b.key, 0]));
  const bounded = Boolean(desde && hasta);
  for (const g of gastos) {
    const d = toDateOnlyString(g.fecha);
    if (!d) continue;
    if (bounded && (d < desde! || d > hasta!)) continue;
    const tipo = normalizeTipoGastoBucket(g.tipo_gasto ?? tipoGastoEffective(g), g.vehicleId != null);
    const bucket = DISTRIBUCION_BUCKETS.find((b) => b.tipos.includes(tipo)) ?? DISTRIBUCION_BUCKETS[4];
    acc[bucket.key] = (acc[bucket.key] ?? 0) + g.monto;
  }
  const total = Object.values(acc).reduce((s, n) => s + n, 0);
  return DISTRIBUCION_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    monto: acc[b.key] ?? 0,
    pct: total > 0 ? ((acc[b.key] ?? 0) / total) * 100 : 0,
  }))
    .filter((d) => d.monto > 0)
    .sort((a, b) => b.monto - a.monto);
}

export function filterMesesPorPeriodo(
  meses: UtilidadRealMes[],
  modo: UtilidadPeriodoModo,
  periodValue: string,
): UtilidadRealMes[] {
  if (modo === 'historico') return meses;
  if (modo === 'anio') {
    const y = periodValue || todayStr().slice(0, 4);
    return meses.filter((m) => m.mes.startsWith(`${y}-`));
  }
  const ym = periodValue;
  return meses.filter((m) => m.mes === ym);
}

export function buildMesesEvolucion(
  meses: UtilidadRealMes[],
  modo: UtilidadPeriodoModo,
  periodValue: string,
): UtilidadMesEvolucion[] {
  const filtered = filterMesesPorPeriodo(meses, modo, periodValue);
  const sorted = [...filtered].sort((a, b) => a.mes.localeCompare(b.mes));
  const indexByMes = new Map(meses.map((m, i) => [m.mes, i]));

  return sorted.map((m) => {
    const idx = indexByMes.get(m.mes);
    const prev = idx != null && idx > 0 ? meses[idx - 1] : null;
    const margen = margenPct(m.ingresos, m.utilidadReal);
    const variacion =
      prev != null ? pctVariacion(m.utilidadReal, prev.utilidadReal) : null;
    return { ...m, margenPct: margen, variacionPct: variacion };
  });
}

export function buildFilasVehiculoEnRango(
  vehicles: readonly Vehicle[],
  ingresos: readonly Ingreso[],
  gastos: readonly Gasto[],
  desde: string | null,
  hasta: string | null,
  historico: boolean,
  porVehiculoHistorico: UtilidadRealVehiculo[],
): UtilidadVehiculoFila[] {
  const activos = vehicles.filter((v) => v.activo !== false);
  if (historico) {
    const map = new Map(porVehiculoHistorico.map((r) => [r.vehicleId, r]));
    return activos.map((v) => {
      const row = map.get(v.id) ?? {
        vehicleId: v.id,
        ingresosTotal: 0,
        gastosTotal: 0,
        utilidadReal: 0,
      };
      return {
        ...row,
        margenPct: margenPct(row.ingresosTotal, row.utilidadReal),
        placa: v.placa,
        label: formatVehicleIdPlaca(v),
        numeroUnidad: getVehicleDisplayNumber(v),
      };
    });
  }
  return activos.map((v) => {
    const r = calcularUtilidadRealEnRango(ingresos, gastos, desde, hasta, v.id);
    return {
      vehicleId: v.id,
      ingresosTotal: r.ingresos,
      gastosTotal: r.gastos,
      utilidadReal: r.utilidadReal,
      margenPct: margenPct(r.ingresos, r.utilidadReal),
      placa: v.placa,
      label: formatVehicleIdPlaca(v),
      numeroUnidad: getVehicleDisplayNumber(v),
    };
  });
}

export function sortFilasVehiculo(
  filas: UtilidadVehiculoFila[],
  sortKey: UtilidadTablaSortKey,
): UtilidadVehiculoFila[] {
  const copy = [...filas];
  const cmpNum = (a: number, b: number) => a - b;
  switch (sortKey) {
    case 'utilidad_asc':
      return copy.sort((a, b) => cmpNum(a.utilidadReal, b.utilidadReal));
    case 'ingreso_desc':
      return copy.sort((a, b) => cmpNum(b.ingresosTotal, a.ingresosTotal));
    case 'gasto_desc':
      return copy.sort((a, b) => cmpNum(b.gastosTotal, a.gastosTotal));
    case 'margen_desc':
      return copy.sort((a, b) => (b.margenPct ?? -999) - (a.margenPct ?? -999));
    case 'margen_asc':
      return copy.sort((a, b) => (a.margenPct ?? 999) - (b.margenPct ?? 999));
    case 'vehicle_id_asc':
      return copy.sort((a, b) => a.numeroUnidad - b.numeroUnidad);
    case 'vehicle_id_desc':
      return copy.sort((a, b) => b.numeroUnidad - a.numeroUnidad);
    case 'placa_asc':
      return copy.sort((a, b) => a.placa.localeCompare(b.placa, 'es'));
    case 'utilidad_desc':
    default:
      return copy.sort(
        (a, b) =>
          cmpNum(b.utilidadReal, a.utilidadReal)
          || a.numeroUnidad - b.numeroUnidad,
      );
  }
}

export function buildInsightsVehiculos(
  filas: UtilidadVehiculoFila[],
  formatAmount: (n: number) => string,
): UtilidadInsightCard[] {
  if (filas.length === 0) return [];
  const withIng = filas.filter((f) => f.ingresosTotal > 0);
  const picks: UtilidadInsightCard[] = [];

  const best = [...filas].sort((a, b) => b.utilidadReal - a.utilidadReal)[0];
  if (best) {
    picks.push({
      id: 'best',
      emoji: '🏆',
      title: 'Mejor vehículo',
      vehicleId: best.vehicleId,
      placa: best.placa,
      value: formatAmount(best.utilidadReal),
      sub: 'Mayor utilidad',
    });
  }

  const worst = [...filas].sort((a, b) => a.utilidadReal - b.utilidadReal)[0];
  if (worst && worst.vehicleId !== best?.vehicleId) {
    picks.push({
      id: 'worst',
      emoji: '📉',
      title: 'Menor utilidad',
      vehicleId: worst.vehicleId,
      placa: worst.placa,
      value: formatAmount(worst.utilidadReal),
    });
  }

  if (withIng.length > 0) {
    const topMargen = [...withIng].sort((a, b) => (b.margenPct ?? 0) - (a.margenPct ?? 0))[0];
    if (topMargen && !picks.some((p) => p.vehicleId === topMargen.vehicleId && p.id === 'margen')) {
      picks.push({
        id: 'margen',
        emoji: '🔥',
        title: 'Mayor margen',
        vehicleId: topMargen.vehicleId,
        placa: topMargen.placa,
        value: topMargen.margenPct != null ? `${topMargen.margenPct.toFixed(1)}%` : '—',
      });
    }
  }

  const topIng = [...filas].sort((a, b) => b.ingresosTotal - a.ingresosTotal)[0];
  if (topIng && picks.length < 5 && !picks.some((p) => p.id === 'ingreso')) {
    picks.push({
      id: 'ingreso',
      emoji: '💰',
      title: 'Mayor ingreso',
      vehicleId: topIng.vehicleId,
      placa: topIng.placa,
      value: formatAmount(topIng.ingresosTotal),
    });
  }

  const topGas = [...filas].sort((a, b) => b.gastosTotal - a.gastosTotal)[0];
  if (topGas && picks.length < 5 && !picks.some((p) => p.id === 'gasto')) {
    picks.push({
      id: 'gasto',
      emoji: '⚠',
      title: 'Mayor gasto',
      vehicleId: topGas.vehicleId,
      placa: topGas.placa,
      value: formatAmount(topGas.gastosTotal),
    });
  }

  return picks.slice(0, 5);
}

export function readUtilidadModuloPrefs(): {
  periodo: UtilidadPeriodoModo;
  periodValue: string;
  vista: UtilidadVistaModo;
  sort: UtilidadTablaSortKey;
  page: number;
} {
  const defYm = todayStr().slice(0, 7);
  const defY = todayStr().slice(0, 4);
  try {
    const periodo = (localStorage.getItem(UTILIDAD_MODULO_LS.periodo) ?? 'historico') as UtilidadPeriodoModo;
    const periodValue =
      localStorage.getItem(UTILIDAD_MODULO_LS.periodValue) ?? (periodo === 'anio' ? defY : defYm);
    const vista = (localStorage.getItem(UTILIDAD_MODULO_LS.vista) ?? 'operativa') as UtilidadVistaModo;
    const sort = (localStorage.getItem(UTILIDAD_MODULO_LS.sort) ?? 'utilidad_desc') as UtilidadTablaSortKey;
    const page = Math.max(1, Number(localStorage.getItem(UTILIDAD_MODULO_LS.page) ?? '1') || 1);
    return {
      periodo: periodo === 'mes' || periodo === 'anio' ? periodo : 'historico',
      periodValue,
      vista: vista === 'global' ? 'global' : 'operativa',
      sort: UTILIDAD_SORT_OPTIONS.some((o) => o.value === sort) ? sort : 'utilidad_desc',
      page,
    };
  } catch {
    return { periodo: 'historico', periodValue: defY, vista: 'operativa', sort: 'utilidad_desc', page: 1 };
  }
}

export function persistUtilidadModuloPrefs(partial: {
  periodo?: UtilidadPeriodoModo;
  periodValue?: string;
  vista?: UtilidadVistaModo;
  sort?: UtilidadTablaSortKey;
  page?: number;
}): void {
  try {
    if (partial.periodo) localStorage.setItem(UTILIDAD_MODULO_LS.periodo, partial.periodo);
    if (partial.periodValue) localStorage.setItem(UTILIDAD_MODULO_LS.periodValue, partial.periodValue);
    if (partial.vista) localStorage.setItem(UTILIDAD_MODULO_LS.vista, partial.vista);
    if (partial.sort) localStorage.setItem(UTILIDAD_MODULO_LS.sort, partial.sort);
    if (partial.page != null) localStorage.setItem(UTILIDAD_MODULO_LS.page, String(partial.page));
  } catch {
    /* private mode */
  }
}

export function availableYearsFromMeses(meses: UtilidadRealMes[]): number[] {
  const ys = new Set<number>();
  for (const m of meses) {
    const y = Number(m.mes.slice(0, 4));
    if (Number.isFinite(y)) ys.add(y);
  }
  if (ys.size === 0) ys.add(Number(todayStr().slice(0, 4)));
  return [...ys].sort((a, b) => b - a);
}

export function availableMonthsFromMeses(meses: UtilidadRealMes[]): { value: string; label: string }[] {
  return [...meses]
    .sort((a, b) => b.mes.localeCompare(a.mes))
    .map((m) => ({ value: m.mes, label: m.mesLabel }));
}
