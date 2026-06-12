import type { Ingreso } from '../data/types';
import { formatDate, todayStr } from './formatting';
import { sortRegistrosLatestFirst } from './sortRegistrosByLatestCreatedOrDate';

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from.slice(0, 10)}T12:00:00`).getTime();
  const b = new Date(`${to.slice(0, 10)}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export type UltimoIngresoResumen =
  | { kind: 'empty' }
  | { kind: 'found'; fecha: string; label: string; relative: string | null };

/** Ingreso más reciente por fecha de movimiento / registro (misma lógica que historial). */
export function findUltimoIngreso(ingresos: Ingreso[]): Ingreso | null {
  if (ingresos.length === 0) return null;
  const sorted = sortRegistrosLatestFirst(ingresos);
  return sorted[0] ?? null;
}

export function formatUltimoIngresoLabel(ingreso: Ingreso | null, today = todayStr()): UltimoIngresoResumen {
  if (!ingreso) return { kind: 'empty' };
  const fecha = ingreso.fecha.slice(0, 10);
  const dias = daysBetween(fecha, today);
  let relative: string | null = null;
  if (dias === 0) relative = 'hoy';
  else if (dias === 1) relative = 'hace 1 día';
  else if (dias > 1) relative = `hace ${dias} días`;
  else if (dias === -1) relative = 'mañana';
  else if (dias < -1) relative = `en ${Math.abs(dias)} días`;

  const base = formatDate(fecha);
  const label = relative ? `${base} · ${relative}` : base;
  return { kind: 'found', fecha, label, relative };
}
