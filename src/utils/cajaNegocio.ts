import type { Gasto } from '../data/types';

function normalizeForCajaNegocioMatch(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto ya normalizado (minúsculas, sin tildes). */
export function matchesCajaNegocioNormalizedText(normalized: string): boolean {
  return /\b(cajas?|caj)\s+((del|de)\s+)?negocio\b/u.test(normalized);
}

export type GastoFieldsCajaNegocio = Pick<
  Gasto,
  'tipo' | 'motivo' | 'categoria' | 'comentarios' | 'categoriaReal' | 'subcategoria' | 'detalleOperativo'
>;

export function gastoTextoNormalizadoCajaNegocio(g: GastoFieldsCajaNegocio): string {
  const raw = [
    g.tipo,
    g.motivo,
    g.categoria,
    g.comentarios,
    g.categoriaReal,
    g.subcategoria,
    g.detalleOperativo,
  ]
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .join(' ');
  return normalizeForCajaNegocioMatch(raw);
}

/** Coincide con variaciones de «caja negocio» en tipo/motivo/categoría/comentarios. */
export function isCajaNegocioGasto(g: GastoFieldsCajaNegocio): boolean {
  return matchesCajaNegocioNormalizedText(gastoTextoNormalizadoCajaNegocio(g));
}

export function gastosOperativosSolamente(gastos: Gasto[]): Gasto[] {
  return gastos.filter((g) => !isCajaNegocioGasto(g));
}
