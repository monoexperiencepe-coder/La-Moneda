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

export function gastoMatchesTipoGasto(g: Gasto, tabTipo: string): boolean {
  return tipoGastoEffective(g) === tabTipo;
}
