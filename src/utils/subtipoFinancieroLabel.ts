import {
  getRepresentacionInternaSubtipoLabel,
  normalizeRepresentacionInternaSubtipo,
} from './representacionInternaSubtipoLabel';
import {
  getOperativoSubtipoLabel,
  resolveOperativoSubtipoGastoCanon,
} from './operativoSubtipo';
import { getInversionSubtipoDedupeKey, getInversionSubtipoLabel, normalizeInversionSubtipo } from './inversionSubtipo';
import {
  getAdministrativoSubtipoLabel,
  normalizeAdministrativoSubtipo,
  resolveAdministrativoSubtipoGastoCanon,
} from './administrativoSubtipo';
import { tipoGastoUsaSubtipoOperativo } from './gastoMoveCategoriaDefaults';
import { normKey } from './normKey';

export { normKey } from './normKey';

/** Valor interno de filtro: agrupa cuota / préstamo / interés sin tocar BD. */
export const SUBTIPO_FILTRO_PRESTAMO_FUSION = '__ui_prestamo_cuota_interes__';

const PRESTAMO_KEYS = new Set(['cuota', 'prestamo', 'interes']);

export function isPrestamoFinancieroFusionRaw(subtipo: string | null | undefined): boolean {
  const k = normKey(subtipo ?? '');
  return PRESTAMO_KEYS.has(k);
}

/**
 * Etiqueta visual para `subtipo_gasto` (financiero y similares). No altera el valor persistido.
 * Con `tipo_gasto` se unifica la pestaña operativos (canónico snake_case vs texto Fact legacy).
 */
export function getSubtipoFinancieroLabel(
  subtipo: string | null | undefined,
  tipoGasto?: string | null,
): string {
  const s = (subtipo ?? '').trim();
  if (!s) return '—';
  const tg = (tipoGasto ?? '').trim();
  if (tg === 'representacion_interna' || !tg) {
    const repCanon = normalizeRepresentacionInternaSubtipo(s);
    if (repCanon) return getRepresentacionInternaSubtipoLabel(repCanon);
  }
  if (tipoGastoUsaSubtipoOperativo(tg)) {
    const c = resolveOperativoSubtipoGastoCanon(s);
    return c ? getOperativoSubtipoLabel(c) : '—';
  }
  if (tg === 'administrativo_empresa') {
    const adminNorm = normalizeAdministrativoSubtipo(s);
    if (adminNorm) return getAdministrativoSubtipoLabel(adminNorm);
  }
  if (tg === 'inversion_compra') {
    return getInversionSubtipoLabel(s);
  }
  const repCanon = normalizeRepresentacionInternaSubtipo(s);
  if (repCanon) return getRepresentacionInternaSubtipoLabel(repCanon);
  const k = normKey(s);
  if (k === 'bateria') return 'Batería';
  if (PRESTAMO_KEYS.has(k)) return 'Préstamo';
  if (k === 'tarjeta_banco') return 'Tarjeta banco';
  if (k === 'prestamo_interes_banca') return 'Interés bancario';
  return s;
}

/** Valor usado en el filtro Select (fusiona cuota/prestamo/interés solo en pestaña financieros). */
export function subtipoFinancieroFilterValue(raw: string, tabTipoGasto: string | undefined): string {
  const t = raw.trim();
  if (!t) return '';
  if (tabTipoGasto === 'representacion_interna') {
    return normalizeRepresentacionInternaSubtipo(t) || '';
  }
  if (tabTipoGasto && tipoGastoUsaSubtipoOperativo(tabTipoGasto)) {
    return resolveOperativoSubtipoGastoCanon(t) ?? '';
  }
  if (tabTipoGasto === 'administrativo_empresa') {
    return resolveAdministrativoSubtipoGastoCanon(t) ?? '';
  }
  if (tabTipoGasto === 'inversion_compra') {
    return normalizeInversionSubtipo(t) ?? t;
  }
  if (tabTipoGasto === 'financiero_prestamo' && isPrestamoFinancieroFusionRaw(t)) {
    return SUBTIPO_FILTRO_PRESTAMO_FUSION;
  }
  return t;
}

export function gastoMatchesSubtipoFinancieroFilter(
  subtipoGasto: string | null | undefined,
  filterValue: string,
  tabTipoGasto: string | undefined,
): boolean {
  if (!filterValue) return true;
  if (filterValue === SUBTIPO_FILTRO_PRESTAMO_FUSION) {
    return tabTipoGasto === 'financiero_prestamo' && isPrestamoFinancieroFusionRaw(subtipoGasto ?? '');
  }
  if (tabTipoGasto === 'representacion_interna') {
    return normalizeRepresentacionInternaSubtipo(subtipoGasto) === filterValue;
  }
  if (tabTipoGasto && tipoGastoUsaSubtipoOperativo(tabTipoGasto)) {
    return resolveOperativoSubtipoGastoCanon(subtipoGasto ?? '') === filterValue;
  }
  if (tabTipoGasto === 'administrativo_empresa') {
    return resolveAdministrativoSubtipoGastoCanon(subtipoGasto ?? '') === filterValue;
  }
  if (tabTipoGasto === 'inversion_compra') {
    return getInversionSubtipoDedupeKey(subtipoGasto ?? '') === getInversionSubtipoDedupeKey(filterValue);
  }
  return (subtipoGasto ?? '').trim() === filterValue;
}
