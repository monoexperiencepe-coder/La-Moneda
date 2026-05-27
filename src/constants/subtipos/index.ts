export {
  OFFICIAL_SUBTIPOS_BY_CATEGORIA,
  getOfficialSubtiposForCategoria,
  getOfficialSubtipoLabel,
  type OfficialSubtipoCategoria,
  type OfficialSubtipoEntry,
} from './officialSubtiposCatalog';

export {
  LEGACY_SUBTIPO_ALIASES_NORM_KEY,
  SUBTIPO_ALIASES_NORM_KEY,
  resolveCanonicalSubtipoValue,
  resolveLegacyAliasNormKey,
  legacyTextMatchesSubtipo,
  getCanonicalSubtipoDedupeKey,
} from './legacySubtipoAliases';

export {
  buildUnifiedSubtipoCatalog,
  getUnifiedSubtipoLabel,
  getOficialesSubtiposForCategoria,
  isSubtipoOficialEnCategoria,
  type UnifiedSubtipoOption,
  type UnifiedSubtipoCatalogResult,
} from './buildUnifiedSubtipoCatalog';

export { subtipoDedupeKey } from './subtipoDedupeKey';
export { resolveCategoriaFinanzaParaSubtipos, FINANZA_CATEGORIAS_CON_CATALOGO } from './subtipoCategoria';
