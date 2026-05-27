/**
 * Normalización canónica por categoría (runtime). Evita importar esto desde legacySubtipoAliases.
 */
import { normalizeAdministrativoSubtipo, resolveAdministrativoSubtipoGastoCanon } from '../../utils/administrativoSubtipo';
import { normalizeInversionSubtipo } from '../../utils/inversionSubtipo';
import { normalizeOperativoSubtipo, resolveOperativoSubtipoGastoCanon } from '../../utils/operativoSubtipo';
import { normalizeRepresentacionInternaSubtipo } from '../../utils/representacionInternaSubtipoLabel';
import { normKey } from '../../utils/normKey';
import { resolveLegacyAliasNormKey } from './legacySubtipoAliases';
import { resolveCategoriaFinanzaParaSubtipos } from './subtipoCategoria';
import { subtipoDedupeKey } from './subtipoDedupeKey';

const OPERATIVO_TIPOS = new Set(['operativo_vehiculo', 'operativo_flota_general']);

export function resolveCanonicalSubtipoValueFull(categoria: string, raw: string): string {
  let v = raw.trim();
  if (!v) return v;

  const alias = resolveLegacyAliasNormKey(v);
  if (alias) v = alias;

  const cat = resolveCategoriaFinanzaParaSubtipos(categoria);
  if (!cat) return v;

  if (cat === 'inversion_compra') {
    return normalizeInversionSubtipo(v) ?? v;
  }
  if (cat === 'administrativo_empresa') {
    return normalizeAdministrativoSubtipo(v) ?? resolveAdministrativoSubtipoGastoCanon(v) ?? v;
  }
  if (cat === 'representacion_interna') {
    return normalizeRepresentacionInternaSubtipo(v) || v;
  }
  if (OPERATIVO_TIPOS.has(cat)) {
    return resolveOperativoSubtipoGastoCanon(v) ?? normalizeOperativoSubtipo(v) ?? v;
  }
  if (cat === 'financiero_prestamo') {
    const k = normKey(v);
    if (k === 'intereses') return 'interes';
    if (k === 'prestamos') return 'prestamo';
    if (k === 'cuotas') return 'cuota';
  }
  return v;
}

export function getCanonicalSubtipoDedupeKeyFull(categoria: string, raw: string): string {
  return subtipoDedupeKey(resolveCanonicalSubtipoValueFull(categoria, raw));
}
