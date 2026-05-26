import type { Gasto } from '../../data/types';

/** Subtipos operativos vehiculares relacionados con mantenimiento / reparación. */
export const VEHICULAR_MAINTENANCE_SUBTIPOS = new Set([
  'mantenimiento',
  'motor',
  'frenos',
  'suspension',
  'llantas',
  'autopartes',
  'arreglo_linea_escape',
  'electricidad',
  'bateria',
  'planchado_pintura',
  'aire_acondicionado',
  'accesorios',
  'gnv',
  'interior',
]);

export function messageImpliesMaintenance(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(mantenimiento|reparaci[oó]n|taller|repuesto|falla|mec[aá]nic|freno|llanta|motor|caja|suspensi[oó]n|direcci[oó]n|autoparte)\b/.test(t);
}

export function gastoMatchesMaintenanceScope(g: Gasto): boolean {
  if (g.tipo_gasto !== 'operativo_vehiculo') return false;
  const sub = (g.subtipo_gasto ?? '').trim();
  if (!sub) return false;
  return VEHICULAR_MAINTENANCE_SUBTIPOS.has(sub);
}

export function filterGastosMaintenanceScope(gastos: Gasto[]): Gasto[] {
  return gastos.filter(gastoMatchesMaintenanceScope);
}

export function resolveMaintenanceToolArgs(
  args: Record<string, unknown>,
  hintText?: string,
): { soloMantenimiento: boolean; subtipoGasto?: string } {
  const soloFlag =
    args.solo_mantenimiento === true
    || args.subtipo_grupo === 'mantenimiento'
    || (typeof args.alcance === 'string' && args.alcance.toLowerCase().includes('mantenimiento'));

  const subtipoGasto = typeof args.subtipo_gasto === 'string' ? args.subtipo_gasto.trim() : undefined;
  const soloMantenimiento = soloFlag || (!subtipoGasto && hintText != null && messageImpliesMaintenance(hintText));

  return { soloMantenimiento, subtipoGasto };
}
