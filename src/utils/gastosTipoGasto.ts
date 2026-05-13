import type { Gasto } from '../data/types';

/** Legacy tipo_gasto antes de migración (compat). */
export const LEGACY_TIPO_MAP: Record<string, string> = {
  financiero: 'financiero_prestamo',
  inversion: 'inversion_compra',
  personal_socios: 'personal_socios_familiares',
  operativo_flota_global: 'gastos_globales',
};

export function tipoGastoEffective(g: Gasto): string | null {
  const raw = g.tipo_gasto?.trim();
  if (!raw) {
    if (g.vehicleId != null) return 'operativo_vehiculo';
    return 'gastos_globales';
  }
  return LEGACY_TIPO_MAP[raw] ?? raw;
}

function isRepresentacionInternaBucket(eff: string): boolean {
  return (
    eff === 'representacion_interna' ||
    eff === 'personal_socios_familiares' ||
    eff === 'personal_socios' ||
    eff === 'personales'
  );
}

/** Valor unificado para tabs y modal «mover» (histórico personales → representacion_interna). */
export function tipoGastoUiCanonical(g: Gasto): string | null {
  const eff = tipoGastoEffective(g);
  if (!eff) return null;
  if (isRepresentacionInternaBucket(eff)) return 'representacion_interna';
  return eff;
}

export function gastoMatchesTipoGasto(g: Gasto, tabTipo: string): boolean {
  const eff = tipoGastoEffective(g) ?? '';
  if (tabTipo === 'representacion_interna') return isRepresentacionInternaBucket(eff);
  if (isRepresentacionInternaBucket(eff)) return false;
  return eff === tabTipo;
}
