import type { ControlFecha, TipoControlFecha } from '../data/types';

/** Orden de columnas del cuadro tipo CONTROL.F / Excel. */
export const CONTROL_FECHA_PIVOT_ORDER: TipoControlFecha[] = [
  'BAT_MANT_REALIZADO',
  'BAT_COMPRA_NUEVA',
  'SOAT',
  'RT_PARTICULAR',
  'RT_TAXI',
  'AFOCAT_TAXI',
  'PERMISO_ATU',
  'INSTALACION_GNV',
  'CERT_GNV_ANUAL',
  'QUINQUENAL_GNV',
  'VENC_BREVETE',
  'CREDENCIAL_ATU_BREVETE',
  'GPS',
  'IMPUESTO',
  'OTRO_VENCIMIENTO',
];

export type ControlFechaPivotRow = Record<string, string | number | null> & { vehicleId: number };

/** Máxima fecha por tipo y vehículo (útil para tablas por subconjunto de tipos, ej. Documentación). */
export function buildControlFechasPivotMapByTipos(
  controlFechas: ControlFecha[],
  tipos: TipoControlFecha[],
): Map<number, Partial<Record<TipoControlFecha, string>>> {
  const docSet = new Set(tipos);
  const map = new Map<number, Partial<Record<TipoControlFecha, string>>>();
  for (const c of controlFechas) {
    if (c.vehicleId == null || !docSet.has(c.tipo)) continue;
    const vid = Number(c.vehicleId);
    const row = map.get(vid) ?? {};
    const prev = row[c.tipo];
    if (!prev || c.fechaVencimiento > prev) row[c.tipo] = c.fechaVencimiento;
    map.set(vid, row);
  }
  return map;
}

export function buildControlFechasPivot(controlFechas: ControlFecha[]): ControlFechaPivotRow[] {
  const map = new Map<number, Record<string, string | number | null>>();
  controlFechas.forEach((c) => {
    if (c.vehicleId == null) return;
    const vid = Number(c.vehicleId);
    const row = map.get(vid) ?? { vehicleId: vid };
    const old = row[c.tipo] as string | undefined;
    if (!old || c.fechaVencimiento > old) row[c.tipo] = c.fechaVencimiento;
    map.set(vid, row);
  });
  return Array.from(map.values())
    .sort((a, b) => Number(a.vehicleId) - Number(b.vehicleId))
    .map((r) => {
      const out: ControlFechaPivotRow = { vehicleId: Number(r.vehicleId) };
      CONTROL_FECHA_PIVOT_ORDER.forEach((k) => {
        out[k] = (r[k] as string | undefined) ?? null;
      });
      return out;
    });
}
