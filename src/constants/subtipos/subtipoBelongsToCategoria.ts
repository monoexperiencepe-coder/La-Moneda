/**
 * Valida si un subtipo pertenece al catálogo de una categoría destino (oficial, alias o legacy exclusivo).
 */
import { normalizeAdministrativoSubtipo } from '../../utils/administrativoSubtipo';
import { normalizeFinancieroPrestamoSubtipo } from '../../utils/financieroPrestamoSubtipo';
import { normalizeInversionSubtipo } from '../../utils/inversionSubtipo';
import { normalizeOperativoSubtipo } from '../../utils/operativoSubtipo';
import { normalizeRepresentacionInternaSubtipo } from '../../utils/representacionInternaSubtipoLabel';
import { isSubtipoOficialEnCategoria } from './buildUnifiedSubtipoCatalog';
import type { OfficialSubtipoCategoria } from './officialSubtiposCatalog';
import { resolveCategoriaFinanzaParaSubtipos } from './subtipoCategoria';

const CANON_CATEGORIES: readonly OfficialSubtipoCategoria[] = [
  'administrativo_empresa',
  'financiero_prestamo',
  'inversion_compra',
  'representacion_interna',
  'operativo_vehiculo',
  'operativo_flota_general',
];

function resolveOfficialCanonForCategoria(cat: OfficialSubtipoCategoria, raw: string): string | null {
  switch (cat) {
    case 'inversion_compra':
      return normalizeInversionSubtipo(raw);
    case 'administrativo_empresa':
      return normalizeAdministrativoSubtipo(raw);
    case 'representacion_interna':
      return normalizeRepresentacionInternaSubtipo(raw) || null;
    case 'operativo_vehiculo':
    case 'operativo_flota_general':
      return normalizeOperativoSubtipo(raw);
    case 'financiero_prestamo':
      return normalizeFinancieroPrestamoSubtipo(raw);
    default:
      return null;
  }
}

/** true si otro catálogo canónico reclama este subtipo (p. ej. SUNARP → administrativo). */
function subtipoMapsToOtherCategoriaExclusive(
  raw: string,
  destCat: OfficialSubtipoCategoria,
): boolean {
  for (const c of CANON_CATEGORIES) {
    if (c === destCat) continue;
    if (resolveOfficialCanonForCategoria(c, raw)) return true;
  }
  return false;
}

/**
 * Indica si `subtipo` es válido para la categoría destino (mover / selects / normalización).
 */
export function subtipoBelongsToCategoria(
  categoria: string,
  subtipo: string | null | undefined,
): boolean {
  const raw = (subtipo ?? '').trim();
  if (!raw) return false;

  const cat = resolveCategoriaFinanzaParaSubtipos(categoria);
  if (!cat || !CANON_CATEGORIES.includes(cat as OfficialSubtipoCategoria)) {
    return raw.length > 0;
  }

  const dest = cat as OfficialSubtipoCategoria;
  if (dest === 'operativo_vehiculo' || dest === 'operativo_flota_general') {
    return normalizeOperativoSubtipo(raw) != null;
  }
  if (resolveOfficialCanonForCategoria(dest, raw)) return true;
  if (isSubtipoOficialEnCategoria(categoria, raw)) return true;
  if (subtipoMapsToOtherCategoriaExclusive(raw, dest)) return false;

  return true;
}

/** Alias explícito para flujo «mover categoría». */
export function subtipoBelongsToCategoriaDestino(
  categoriaDestino: string,
  subtipo: string | null | undefined,
): boolean {
  return subtipoBelongsToCategoria(categoriaDestino, subtipo);
}
