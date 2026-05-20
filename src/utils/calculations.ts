import { Ingreso, Gasto, Descuento, Vehicle, KPIData, VehicleRentability } from '../data/types';
import { ingresoMontoPEN } from './moneda';
import { gastosOperativosSolamente } from './cajaNegocio';
import { matchesOperativoTipoNormalized } from './operativoTipoGasto';

/** KPIs por `tipo_gasto` financiero (no sustituye `calculateKPIs` legacy). */
export interface FinancialKPIData {
  gastos_operativos: number;
  gastos_financieros: number;
  gastos_administrativos: number;
  utilidad_operativa: number;
  utilidad_neta_simple: number;
}

/** Normaliza tipo_gasto legacy + Excel migración final (solo KPI financieros). */
function canonicalTipoGastoFinanciero(g: Gasto): string {
  const raw = (g.tipo_gasto ?? '').trim();
  if (!raw) {
    if (g.vehicleId != null) return 'operativo_vehiculo';
    return '';
  }
  const map: Record<string, string> = {
    financiero: 'financiero_prestamo',
    inversion: 'inversion_compra',
    personal_socios: 'personal_socios_familiares',
    operativo_flota_global: 'gastos_globales',
  };
  const mapped = map[raw] ?? raw;
  if (mapped === 'personal_socios_familiares' || mapped === 'representacion_interna' || mapped === 'personales') {
    return 'representacion_interna';
  }
  return mapped;
}

/**
 * Agrega montos por clasificación financiera y dos utilidades de referencia.
 * Solo suma gastos cuyo `tipo_gasto` coincide; los sin clasificar no entran en los buckets.
 */
export function calculateFinancialKPIs(ingresos: Ingreso[], gastos: Gasto[]): FinancialKPIData {
  const totalIngresos = ingresos.reduce((sum, i) => sum + ingresoMontoPEN(i), 0);

  let gastos_operativos = 0;
  let gastos_financieros = 0;
  let gastos_administrativos = 0;
  let gastos_inversion = 0;
  let gastos_personal_socios = 0;
  let gastos_globales = 0;

  for (const g of gastos) {
    const t = canonicalTipoGastoFinanciero(g);
    const m = g.monto;
    if (matchesOperativoTipoNormalized(t)) gastos_operativos += m;
    else if (t === 'financiero_prestamo') gastos_financieros += m;
    else if (t === 'administrativo_empresa' || t === 'planilla_laboral') gastos_administrativos += m;
    else if (t === 'inversion_compra') gastos_inversion += m;
    else if (t === 'representacion_interna') gastos_personal_socios += m;
    else if (t === 'gastos_globales') gastos_globales += m;
  }

  const gastosClasificadosTotales =
    gastos_operativos +
    gastos_financieros +
    gastos_administrativos +
    gastos_inversion +
    gastos_personal_socios +
    gastos_globales;

  return {
    gastos_operativos,
    gastos_financieros,
    gastos_administrativos,
    utilidad_operativa: totalIngresos - gastos_operativos,
    utilidad_neta_simple: totalIngresos - gastosClasificadosTotales,
  };
}

export const calculateKPIs = (
  ingresos: Ingreso[],
  gastos: Gasto[],
  descuentos: Descuento[] = [],
): KPIData => {
  const gastosOp = gastosOperativosSolamente(gastos);
  const totalIngresos = ingresos.reduce((sum, i) => sum + ingresoMontoPEN(i), 0);
  const totalGastos = gastosOp.reduce((sum, g) => sum + g.monto, 0);
  const totalDescuentos = descuentos.reduce((sum, d) => sum + d.monto, 0);
  /** totalDescuentos suele ser ≤ 0; sumarlo resta del margen de forma consistente */
  const margenNeto = totalIngresos - totalGastos + totalDescuentos;

  const uniqueDates = new Set(ingresos.map(i => i.fecha));
  const promedioIngresoDiario = uniqueDates.size > 0 ? totalIngresos / uniqueDates.size : 0;

  const ingresosPorTipo: Record<string, number> = {};
  ingresos.forEach(i => {
    ingresosPorTipo[i.tipo] = (ingresosPorTipo[i.tipo] ?? 0) + ingresoMontoPEN(i);
  });

  const gastosPorCategoria: Record<string, number> = {};
  gastosOp.forEach(g => {
    gastosPorCategoria[g.categoria] = (gastosPorCategoria[g.categoria] ?? 0) + g.monto;
  });

  const descuentosPorCategoria: Record<string, number> = {};
  descuentos.forEach(d => {
    descuentosPorCategoria[d.categoria] = (descuentosPorCategoria[d.categoria] ?? 0) + d.monto;
  });

  return {
    totalIngresos,
    totalGastos,
    totalDescuentos,
    margenNeto,
    promedioIngresoDiario,
    ingresosPorTipo,
    gastosPorCategoria,
    descuentosPorCategoria,
  };
};

export const calculateVehicleRentability = (
  vehicles: Vehicle[],
  ingresos: Ingreso[],
  gastos: Gasto[],
  descuentos: Descuento[] = [],
): VehicleRentability[] => {
  const gastosOp = gastosOperativosSolamente(gastos);
  return vehicles
    .filter(v => v.activo)
    .map(vehicle => {
      const vehicleIngresos = ingresos.filter(i => i.vehicleId === vehicle.id);
      const vehicleGastos = gastosOp.filter(g => g.vehicleId === vehicle.id);
      const vehicleDescuentos = descuentos.filter(d => d.vehicleId === vehicle.id);

      const totalIngresos = vehicleIngresos.reduce((sum, i) => sum + ingresoMontoPEN(i), 0);
      const totalGastos = vehicleGastos.reduce((sum, g) => sum + g.monto, 0);
      const totalDescuentos = vehicleDescuentos.reduce((sum, d) => sum + d.monto, 0);

      return {
        vehicle,
        totalIngresos,
        totalGastos,
        totalDescuentos,
        margen: totalIngresos - totalGastos + totalDescuentos,
      };
    })
    .sort((a, b) => b.margen - a.margen);
};

export const getPercentageChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};
