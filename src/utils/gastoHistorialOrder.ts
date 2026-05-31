import type { Gasto } from '../data/types';

/** Ventana para badge «Reclasificado» / pin local tras mover. */
export const HISTORIAL_RECENTLY_MOVED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Timestamp ISO de última actividad: revisado_at (≈ updated_at) → createdAt → fechaRegistro → fecha. */
export function gastoHistorialActivityStamp(g: Gasto, pinnedAtMs?: number): string {
  if (pinnedAtMs != null && pinnedAtMs > 0) {
    return new Date(pinnedAtMs).toISOString();
  }
  const updated = g.revisado_at?.trim();
  if (updated) {
    const norm = updated.includes('T') ? updated : updated.replace(' ', 'T');
    if (norm.length >= 19) return norm.slice(0, 19);
    if (norm.length >= 10) return `${norm.slice(0, 10)}T23:59:59`;
  }
  const created = g.createdAt?.trim();
  if (created) {
    const norm = created.includes('T') ? created : created.replace(' ', 'T');
    if (norm.length >= 19) return norm.slice(0, 19);
    if (norm.length >= 10) return `${norm.slice(0, 10)}T23:59:59`;
  }
  const fr = g.fechaRegistro?.trim().slice(0, 10);
  if (fr && /^\d{4}-\d{2}-\d{2}$/.test(fr)) return `${fr}T23:59:59`;
  const f = g.fecha?.trim().slice(0, 10);
  if (f && /^\d{4}-\d{2}-\d{2}$/.test(f)) return `${f}T12:00:00`;
  return '1970-01-01T00:00:00';
}

export type GastosHistorialSortMode = 'actividad' | 'fecha';

export function sortGastosHistorialByFecha(rows: Gasto[]): Gasto[] {
  return [...rows].sort((a, b) => {
    const fa = a.fecha?.trim().slice(0, 10) ?? '';
    const fb = b.fecha?.trim().slice(0, 10) ?? '';
    const cmp = fb.localeCompare(fa);
    if (cmp !== 0) return cmp;
    return String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
  });
}

export function sortGastosHistorialByActivity(
  rows: Gasto[],
  pinnedAtById?: ReadonlyMap<string, number>,
): Gasto[] {
  return [...rows].sort((a, b) => {
    const sa = gastoHistorialActivityStamp(a, pinnedAtById?.get(String(a.id)));
    const sb = gastoHistorialActivityStamp(b, pinnedAtById?.get(String(b.id)));
    const cmp = sb.localeCompare(sa);
    if (cmp !== 0) return cmp;
    return String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
  });
}

function stampWithinWindow(stamp: string | null | undefined, now: number, windowMs: number): boolean {
  const s = stamp?.trim();
  if (!s) return false;
  const t = new Date(s.includes('T') ? s : s.replace(' ', 'T')).getTime();
  return Number.isFinite(t) && now - t <= windowMs;
}

/** Alta reciente, pin local o revisado_at reciente: omitir filtro año/mes en vista rápida. */
export function isGastoRecentlyReclassified(
  g: Gasto,
  pinnedAtMs?: number,
  windowMs = HISTORIAL_RECENTLY_MOVED_WINDOW_MS,
): boolean {
  const now = Date.now();
  if (pinnedAtMs != null && now - pinnedAtMs <= windowMs) return true;
  if (stampWithinWindow(g.revisado_at, now, windowMs)) return true;
  if (stampWithinWindow(g.createdAt, now, windowMs)) return true;
  return false;
}

/** Asegura timestamps de actividad tras crear/editar para orden y visibilidad local. */
export function enrichGastoHistorialActivity(gasto: Gasto): Gasto {
  const nowIso = new Date().toISOString();
  return {
    ...gasto,
    revisado_at: gasto.revisado_at?.trim() || nowIso,
    createdAt: gasto.createdAt?.trim() || nowIso,
  };
}

/** Une filas del servidor con pins locales (sin duplicar). */
export function mergeHistorialRowsWithPins(
  serverRows: Gasto[],
  pinnedRows: ReadonlyMap<string, Gasto>,
  pinnedAtById: ReadonlyMap<string, number>,
): Gasto[] {
  const byId = new Map<string, Gasto>();
  for (const g of serverRows) byId.set(String(g.id), g);
  for (const [id, g] of pinnedRows) {
    if (!byId.has(id)) byId.set(id, g);
    else byId.set(id, { ...byId.get(id)!, ...g });
  }
  return sortGastosHistorialByActivity([...byId.values()], pinnedAtById);
}
