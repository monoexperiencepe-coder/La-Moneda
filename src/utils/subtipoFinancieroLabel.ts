import {
  getRepresentacionInternaSubtipoLabel,
  normalizeRepresentacionInternaSubtipo,
} from './representacionInternaSubtipoLabel';
import {
  getOperativoSubtipoLabel,
  resolveOperativoSubtipoGastoCanon,
} from './operativoSubtipo';
import { getInversionSubtipoLabel, normalizeInversionSubtipo } from './inversionSubtipo';
import { subtipoMatchesFilter } from '../constants/subtipos/subtipoMatchesFilter';
import {
  getAdministrativoSubtipoLabel,
  normalizeAdministrativoSubtipo,
  resolveAdministrativoSubtipoGastoCanon,
} from './administrativoSubtipo';
import {
  getFinancieroPrestamoSubtipoLabel,
  normalizeFinancieroPrestamoSubtipo,
  resolveFinancieroPrestamoSubtipoGastoCanon,
} from './financieroPrestamoSubtipo';
import {
  tipoGastoUsaSubtipoFinancieroCanon,
  tipoGastoUsaSubtipoOperativo,
} from './gastoMoveCategoriaDefaults';
import { normKey } from './normKey';

export { normKey } from './normKey';

/**
 * Etiqueta visual para `subtipo_gasto` (financiero y similares). No altera el valor persistido.
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
  if (tipoGastoUsaSubtipoFinancieroCanon(tg)) {
    return getFinancieroPrestamoSubtipoLabel(s);
  }
  const repCanon = normalizeRepresentacionInternaSubtipo(s);
  if (repCanon) return getRepresentacionInternaSubtipoLabel(repCanon);
  const k = normKey(s);
  if (k === 'bateria') return 'Batería';
  return s;
}

/** Valor usado en el filtro Select (canónico oficial cuando aplica). */
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
  if (tipoGastoUsaSubtipoFinancieroCanon(tabTipoGasto ?? '')) {
    return resolveFinancieroPrestamoSubtipoGastoCanon(t) ?? t;
  }
  return t;
}

export function gastoMatchesSubtipoFinancieroFilter(
  subtipoGasto: string | null | undefined,
  filterValue: string,
  tabTipoGasto: string | undefined,
): boolean {
  if (!filterValue) return true;
  if (tabTipoGasto === 'representacion_interna') {
    return normalizeRepresentacionInternaSubtipo(subtipoGasto) === filterValue;
  }
  if (tabTipoGasto && tipoGastoUsaSubtipoOperativo(tabTipoGasto)) {
    return resolveOperativoSubtipoGastoCanon(subtipoGasto ?? '') === resolveOperativoSubtipoGastoCanon(filterValue);
  }
  if (tabTipoGasto) {
    return subtipoMatchesFilter(tabTipoGasto, subtipoGasto, filterValue);
  }
  return (subtipoGasto ?? '').trim() === filterValue;
}
