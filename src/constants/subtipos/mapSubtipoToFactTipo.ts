/**
 * Deriva Tipo Fact + subtipo Fact desde categoría financiera y subtipo_gasto.
 */
import { getDefaultFactTipoSubtipoForAdministrativoSubtipo } from '../../utils/administrativoSubtipo';
import { getDefaultFactTipoSubtipoForFinancieroSubtipo } from '../../utils/financieroPrestamoSubtipo';
import { getDefaultFactTipoSubtipoForInversionCanon, normalizeInversionSubtipo } from '../../utils/inversionSubtipo';
import {
  getDefaultFactTipoSubtipoForOperativoCanon,
  normalizeOperativoSubtipo,
} from '../../utils/operativoSubtipo';
import {
  REPRESENTACION_INTERNA_FACT_SUBTIPO,
  REPRESENTACION_INTERNA_FACT_TIPO,
} from '../../data/representacionInterna';
import { resolveCategoriaFinanzaParaSubtipos } from './subtipoCategoria';

export interface MapSubtipoToFactResult {
  tipo: string;
  subTipo: string;
}

export function mapSubtipoToFactTipo(
  categoria: string,
  subtipo: string | null | undefined,
): MapSubtipoToFactResult | null {
  const sub = (subtipo ?? '').trim();
  if (!sub) return null;

  const cat = resolveCategoriaFinanzaParaSubtipos(categoria);
  if (!cat) return null;

  if (cat === 'representacion_interna') {
    return { tipo: REPRESENTACION_INTERNA_FACT_TIPO, subTipo: REPRESENTACION_INTERNA_FACT_SUBTIPO };
  }

  if (cat === 'operativo_vehiculo' || cat === 'operativo_flota_general') {
    const canon = normalizeOperativoSubtipo(sub);
    if (!canon) return null;
    return getDefaultFactTipoSubtipoForOperativoCanon(canon);
  }

  if (cat === 'inversion_compra') {
    const canon = normalizeInversionSubtipo(sub);
    if (!canon) return null;
    return getDefaultFactTipoSubtipoForInversionCanon(canon);
  }

  if (cat === 'financiero_prestamo') {
    return getDefaultFactTipoSubtipoForFinancieroSubtipo(sub);
  }

  if (cat === 'administrativo_empresa') {
    return getDefaultFactTipoSubtipoForAdministrativoSubtipo(sub);
  }

  return null;
}
