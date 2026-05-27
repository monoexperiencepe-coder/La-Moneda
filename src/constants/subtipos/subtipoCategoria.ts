import type { FinanzaGastoRegistroValue } from '../../data/finanzaGastoRegistro';

export type GastoSubtipoCategoria =
  | FinanzaGastoRegistroValue
  | 'financiero'
  | 'inversion'
  | 'pendiente_revision';

export const FINANZA_CATEGORIAS_CON_CATALOGO: readonly FinanzaGastoRegistroValue[] = [
  'operativo_vehiculo',
  'operativo_flota_general',
  'administrativo_empresa',
  'financiero_prestamo',
  'planilla_laboral',
  'representacion_interna',
  'gastos_globales',
  'inversion_compra',
];

const FINANZA_CATEGORIAS_SET = new Set<string>(FINANZA_CATEGORIAS_CON_CATALOGO);

/** Resuelve tipo_gasto → categoría de catálogo. */
export function resolveCategoriaFinanzaParaSubtipos(tipoGasto: string): FinanzaGastoRegistroValue | null {
  const t = tipoGasto.trim();
  if (t === 'financiero') return 'financiero_prestamo';
  if (t === 'inversion') return 'inversion_compra';
  if (FINANZA_CATEGORIAS_SET.has(t)) return t as FinanzaGastoRegistroValue;
  return null;
}
