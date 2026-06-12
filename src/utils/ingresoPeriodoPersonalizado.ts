import type { Ingreso } from '../data/types';
import { formatDate } from './formatting';

/** Subtipo Fact para ingreso por N días (no está en catálogo Excel). */
export const INGRESO_SUBTIPO_PERSONALIZADO = 'Personalizado';

/** Clave en `excel_extra` hasta columna dedicada en BD. */
export const LM_PERIODO_DIAS_KEY = '_lm_periodo_dias';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIngresoPeriodoPersonalizado(ingreso: Pick<Ingreso, 'subTipo'>): boolean {
  return (ingreso.subTipo ?? '').trim().toLowerCase() === INGRESO_SUBTIPO_PERSONALIZADO.toLowerCase();
}

function daysInclusiveBetween(from: string, to: string): number {
  const a = new Date(`${from.slice(0, 10)}T12:00:00`).getTime();
  const b = new Date(`${to.slice(0, 10)}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Suma días calendario a YYYY-MM-DD (sin desfase UTC). */
export function addCalendarDays(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/** Fecha fin = fecha inicio + días − 1. */
export function calcPeriodoPersonalizadoFin(fechaInicio: string, dias: number): string | null {
  const inicio = fechaInicio.trim().slice(0, 10);
  if (!ISO_DATE_RE.test(inicio) || !Number.isFinite(dias) || dias < 1 || dias > 366) return null;
  return addCalendarDays(inicio, Math.round(dias) - 1);
}

export function calcPeriodoPersonalizadoRango(
  fechaInicio: string,
  dias: number,
): { desde: string; hasta: string } | null {
  const inicio = fechaInicio.trim().slice(0, 10);
  const hasta = calcPeriodoPersonalizadoFin(inicio, dias);
  if (!hasta) return null;
  return { desde: inicio, hasta };
}

export function getIngresoPeriodoDias(
  ingreso: Pick<Ingreso, 'subTipo' | 'excelExtra' | 'fechaDesde' | 'fechaHasta'>,
): number | null {
  if (!isIngresoPeriodoPersonalizado(ingreso)) return null;
  const raw = ingreso.excelExtra?.[LM_PERIODO_DIAS_KEY];
  if (raw != null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1) return Math.round(n);
  }
  const d = ingreso.fechaDesde?.trim().slice(0, 10);
  const h = ingreso.fechaHasta?.trim().slice(0, 10);
  if (d && h && ISO_DATE_RE.test(d) && ISO_DATE_RE.test(h)) {
    const n = daysInclusiveBetween(d, h);
    if (n >= 1 && n <= 366) return n;
  }
  return null;
}

/** dd/mm sin año (historial compacto). */
export function formatIngresoFechaCorta(dateStr: string): string {
  if (!dateStr) return '—';
  return formatDate(dateStr).slice(0, 5);
}

/** Etiqueta legible en historial: «Personalizado · 9 días». */
export function formatIngresoPeriodoHistorial(
  ingreso: Pick<Ingreso, 'subTipo' | 'excelExtra' | 'fechaDesde' | 'fechaHasta'>,
): string | null {
  if (!isIngresoPeriodoPersonalizado(ingreso)) return null;
  const dias = getIngresoPeriodoDias(ingreso);
  if (dias == null) return INGRESO_SUBTIPO_PERSONALIZADO;
  return `${INGRESO_SUBTIPO_PERSONALIZADO} · ${dias} día${dias !== 1 ? 's' : ''}`;
}

export type IngresoPeriodoPersonalizadoHistorial = {
  etiqueta: string;
  rango: string | null;
};

/** Historial personalizado: etiqueta + rango «06/11 → 14/11». */
export function ingresoPeriodoPersonalizadoHistorial(
  ingreso: Pick<Ingreso, 'subTipo' | 'excelExtra' | 'fechaDesde' | 'fechaHasta'>,
): IngresoPeriodoPersonalizadoHistorial | null {
  const etiqueta = formatIngresoPeriodoHistorial(ingreso);
  if (!etiqueta) return null;
  const d = ingreso.fechaDesde?.trim().slice(0, 10);
  const h = ingreso.fechaHasta?.trim().slice(0, 10);
  const rango =
    d && h && ISO_DATE_RE.test(d) && ISO_DATE_RE.test(h)
      ? `${formatIngresoFechaCorta(d)} → ${formatIngresoFechaCorta(h)}`
      : null;
  return { etiqueta, rango };
}

export function stampPeriodoDiasExtra(
  extra: Record<string, unknown> | null | undefined,
  dias: number | null,
): Record<string, unknown> | null {
  if (dias == null || dias < 1) {
    if (!extra) return null;
    const next = { ...extra };
    delete next[LM_PERIODO_DIAS_KEY];
    return Object.keys(next).length > 0 ? next : null;
  }
  return { ...(extra ?? {}), [LM_PERIODO_DIAS_KEY]: dias };
}

/** Subtipos ALQUILER + opción personalizado (sin tocar JSON Fact). */
export function subtiposIngresoConPersonalizado(subtipos: string[]): string[] {
  const base = subtipos.filter((s) => s.trim().toLowerCase() !== INGRESO_SUBTIPO_PERSONALIZADO.toLowerCase());
  return [...base, INGRESO_SUBTIPO_PERSONALIZADO];
}
