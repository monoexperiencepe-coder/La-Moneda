/**
 * Matching de filtro por subtipo: canónico + dedupe + aliases (no texto exacto en BD).
 */
import { normKey } from '../../utils/normKey';
import {
  getCanonicalSubtipoDedupeKeyFull,
  resolveCanonicalSubtipoValueFull,
} from './subtipoCanonicalResolve';
import { LEGACY_SUBTIPO_ALIASES_NORM_KEY } from './legacySubtipoAliases';
import { resolveCategoriaFinanzaParaSubtipos } from './subtipoCategoria';
import { getOficialesSubtiposForCategoria } from './buildUnifiedSubtipoCatalog';
import {
  INVERSION_SUBTIPO_OPTIONS,
  normalizeInversionSubtipo,
} from '../../utils/inversionSubtipo';

/** true si la fila coincide con el subtipo seleccionado (oficial, canónico, legacy o alias). */
export function subtipoMatchesFilter(
  categoria: string | undefined,
  rowSubtipo: string | null | undefined,
  selectedSubtipo: string,
): boolean {
  const filter = selectedSubtipo.trim();
  if (!filter) return true;

  const cat = categoria?.trim() ?? '';
  if (!cat) return (rowSubtipo ?? '').trim() === filter;

  const rowKey = getCanonicalSubtipoDedupeKeyFull(cat, rowSubtipo ?? '');
  const filterKey = getCanonicalSubtipoDedupeKeyFull(cat, filter);
  return rowKey === filterKey;
}

/**
 * Valores posibles en BD que deben incluirse en consulta paginada (.in).
 * No cubre todos los históricos desconocidos; el filtro cliente cierra el hueco.
 */
export function getSubtipoFilterDbVariants(categoria: string, selectedSubtipo: string): string[] {
  const filter = selectedSubtipo.trim();
  if (!filter) return [];

  const cat = resolveCategoriaFinanzaParaSubtipos(categoria) ?? categoria.trim();
  const targetKey = getCanonicalSubtipoDedupeKeyFull(cat, filter);
  const variants = new Set<string>();

  variants.add(filter);
  const canon = resolveCanonicalSubtipoValueFull(cat, filter);
  if (canon) variants.add(canon);

  for (const [nk, alias] of Object.entries(LEGACY_SUBTIPO_ALIASES_NORM_KEY)) {
    if (getCanonicalSubtipoDedupeKeyFull(cat, alias) === targetKey) {
      variants.add(nk);
      variants.add(alias);
    }
  }

  for (const oficial of getOficialesSubtiposForCategoria(cat)) {
    if (getCanonicalSubtipoDedupeKeyFull(cat, oficial) === targetKey) {
      variants.add(oficial);
    }
  }

  if (cat === 'inversion_compra') {
    for (const o of INVERSION_SUBTIPO_OPTIONS) {
      if (getCanonicalSubtipoDedupeKeyFull(cat, o.value) === targetKey) {
        variants.add(o.value);
      }
    }
    const norm = normalizeInversionSubtipo(filter);
    if (norm) variants.add(norm);
    for (const raw of collectHistoricosFromInversionAliases(targetKey)) {
      variants.add(raw);
    }
  }

  return [...variants].filter((v) => v.length > 0);
}

function collectHistoricosFromInversionAliases(targetKey: string): string[] {
  const out: string[] = [];
  const seeds = [
    'adquisicion_vehiculo',
    'adquisicion_de_vehiculo',
    'compra_activo_vehiculo',
    'compra_de_vehiculo',
    'compra_vehiculo',
    'compra_auto',
    'inversion_vehicular',
    'vehiculo',
    'compra_terreno',
    'inversion_terreno',
    'terreno',
    'laptops',
    'computadoras',
    'equipamiento_taller',
    'equipamiento_oficina',
    'muebles_enseres',
    'compra_software_gestion',
    'sistema_seguridad',
    'electrodomesticos',
    'acondicionamiento_areas',
  ];
  for (const s of seeds) {
    if (getCanonicalSubtipoDedupeKeyFull('inversion_compra', s) === targetKey) {
      out.push(s);
    }
  }
  return out;
}

/** Categorías con catálogo canónico: evitar eq exacto en servidor. */
export function usesCanonicalSubtipoHistorialFilter(tipoGasto: string | undefined): boolean {
  if (!tipoGasto?.trim()) return false;
  return resolveCategoriaFinanzaParaSubtipos(tipoGasto) != null;
}
