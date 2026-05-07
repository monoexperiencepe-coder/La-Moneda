import type { Gasto } from '../data/types';

/** Verde ≥0.9 · amarillo 0.6–0.89 · rojo &lt;0.6 (o sin dato). */
export type ConfianzaVisualTier = 'alta' | 'media' | 'baja';

export function confianzaTier(conf: number | null | undefined): ConfianzaVisualTier {
  if (conf == null || Number.isNaN(Number(conf))) return 'baja';
  const n = Number(conf);
  if (n >= 0.9) return 'alta';
  if (n >= 0.6) return 'media';
  return 'baja';
}

export function confianzaBadgeVariant(tier: ConfianzaVisualTier): 'success' | 'warning' | 'danger' {
  if (tier === 'alta') return 'success';
  if (tier === 'media') return 'warning';
  return 'danger';
}

/** Gastos con tipo_gasto operativo de unidad (no reemplaza filtros legacy). */
export function gastosOperativoVehiculo(gastos: Gasto[]): Gasto[] {
  return gastos.filter((g) => g.tipo_gasto === 'operativo_vehiculo');
}

export function gastosFinancieros(gastos: Gasto[]): Gasto[] {
  return gastos.filter((g) => {
    const t = g.tipo_gasto ?? '';
    return t === 'financiero' || t === 'financiero_prestamo';
  });
}

export function gastosAdministrativos(gastos: Gasto[]): Gasto[] {
  return gastos.filter((g) => {
    const t = g.tipo_gasto ?? '';
    return t === 'administrativo_empresa' || t === 'planilla_laboral';
  });
}

export function gastosGlobalesCapa(gastos: Gasto[]): Gasto[] {
  return gastos.filter((g) => {
    const t = g.tipo_gasto ?? '';
    return t === 'gastos_globales' || t === 'operativo_flota_global';
  });
}
