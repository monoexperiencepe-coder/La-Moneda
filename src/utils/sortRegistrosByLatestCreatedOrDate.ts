import type { Gasto, Ingreso } from '../data/types';

export type RegistroHistorialRow = Ingreso | Gasto;

/** Clave comparable: created_at → fecha_registro → fecha movimiento. */
export function registroHistorialSortStamp(row: RegistroHistorialRow): string {
  const created = row.createdAt?.trim();
  if (created) {
    const norm = created.includes('T') ? created : created.replace(' ', 'T');
    if (norm.length >= 19) return norm.slice(0, 19);
    if (norm.length >= 10) return `${norm.slice(0, 10)}T23:59:59`;
  }
  const fr = row.fechaRegistro?.trim().slice(0, 10);
  if (fr && /^\d{4}-\d{2}-\d{2}$/.test(fr)) return `${fr}T23:59:59`;
  const f = row.fecha?.trim().slice(0, 10);
  if (f && /^\d{4}-\d{2}-\d{2}$/.test(f)) return `${f}T12:00:00`;
  return '1970-01-01T00:00:00';
}

/**
 * Comparador para historiales: el más reciente primero (desc).
 * Prioridad: created_at → fecha_registro → fecha → id desc.
 */
export function sortRegistrosByLatestCreatedOrDate(
  a: RegistroHistorialRow,
  b: RegistroHistorialRow,
): number {
  const cmp = registroHistorialSortStamp(b).localeCompare(registroHistorialSortStamp(a));
  if (cmp !== 0) return cmp;
  return String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
}

/** Copia ordenada con el criterio de historial (más reciente arriba). */
export function sortRegistrosLatestFirst<T extends RegistroHistorialRow>(rows: T[]): T[] {
  return [...rows].sort(sortRegistrosByLatestCreatedOrDate);
}
