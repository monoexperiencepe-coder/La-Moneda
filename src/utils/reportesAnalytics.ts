import type { Gasto, Ingreso } from '../data/types';
import { toDateOnlyString } from './formatting';
import { ingresoMontoPEN } from './moneda';
import { matchesOperativoTipoNormalized } from './operativoTipoGasto';

export type ReportesPeriodPreset = 'anio_actual' | 'todo' | 'personalizado';

export const TIPO_GASTO_LABELS: Record<string, string> = {
  operativo_vehiculo: 'Operativos por vehículo',
  operativo_flota_general: 'Operativo flota general',
  administrativo_empresa: 'Administrativos',
  financiero_prestamo: 'Financieros',
  planilla_laboral: 'Planilla',
  inversion_compra: 'Inversión con utilidad',
  representacion_interna: 'Representación interna',
  gastos_globales: 'Globales',
};

export function normalizeTipoGasto(raw: string | null | undefined, hasVehicle: boolean): string {
  const t = (raw ?? '').trim();
  if (!t) return hasVehicle ? 'operativo_vehiculo' : 'gastos_globales';
  const legacyMap: Record<string, string> = {
    financiero: 'financiero_prestamo',
    inversion: 'inversion_compra',
    personal_socios: 'personal_socios_familiares',
    operativo_flota_global: 'gastos_globales',
  };
  const mapped = legacyMap[t] ?? t;
  if (mapped === 'personal_socios_familiares' || mapped === 'representacion_interna' || mapped === 'personales') {
    return 'representacion_interna';
  }
  return mapped;
}

/** Gasto operativo (unidad o flota general) según tipo normalizado. */
export function isOperativoGastoNormalized(normalizedTipo: string): boolean {
  return matchesOperativoTipoNormalized(normalizedTipo);
}

export function fechaEnPeriodo(fecha: string, desde: string, hasta: string): boolean {
  const d = toDateOnlyString(fecha);
  return d !== '' && d >= desde && d <= hasta;
}

export function getReportesPeriodRange(
  preset: ReportesPeriodPreset,
  customYear: number,
): { desde: string | null; hasta: string | null; label: string } {
  const t = toDateOnlyString(new Date().toISOString().slice(0, 10));
  const yy = Number(t.slice(0, 4));
  if (preset === 'anio_actual') {
    return { desde: `${yy}-01-01`, hasta: `${yy}-12-31`, label: `Año ${yy}` };
  }
  if (preset === 'personalizado') {
    return {
      desde: `${customYear}-01-01`,
      hasta: `${customYear}-12-31`,
      label: `Año ${customYear}`,
    };
  }
  return { desde: null, hasta: null, label: 'Histórico completo' };
}

export function filterIngresosPeriod(ingresos: Ingreso[], desde: string | null, hasta: string | null): Ingreso[] {
  if (!desde || !hasta) return ingresos;
  return ingresos.filter((i) => fechaEnPeriodo(i.fecha, desde, hasta));
}

export function filterGastosPeriod(gastos: Gasto[], desde: string | null, hasta: string | null): Gasto[] {
  if (!desde || !hasta) return gastos;
  return gastos.filter((g) => fechaEnPeriodo(g.fecha, desde, hasta));
}

export function ingresosPeriodTotal(ingresos: Ingreso[]): number {
  let s = 0;
  for (const i of ingresos) {
    s += ingresoMontoPEN(i);
  }
  return s;
}

export { ingresosExtraordinariosTotal, ingresosVehicularesTotal } from './ingresoAlcance';

/** @deprecated Alias de `ingresosPeriodTotal` (todos los ingresos son confirmados). */
export const ingresosCobradosTotal = ingresosPeriodTotal;

export function topEntries(
  totals: Record<string, number>,
  labelFn: (key: string) => string,
  limit = 5,
): { key: string; label: string; monto: number }[] {
  return Object.entries(totals)
    .filter(([, m]) => m > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, monto]) => ({ key, label: labelFn(key), monto }));
}
