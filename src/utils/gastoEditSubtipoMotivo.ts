/**
 * Motivo visible al guardar edición según subtipo canónico de la categoría.
 */
import { getAdministrativoSubtipoLabel } from './administrativoSubtipo';
import { getFinancieroPrestamoSubtipoLabel } from './financieroPrestamoSubtipo';
import { getInversionSubtipoLabel } from './inversionSubtipo';
import { getOperativoSubtipoLabel } from './operativoSubtipo';
import { getRepresentacionInternaSubtipoLabel } from './representacionInternaSubtipoLabel';
import {
  tipoGastoUsaSubtipoAdministrativoCanon,
  tipoGastoUsaSubtipoFinancieroCanon,
  tipoGastoUsaSubtipoOperativo,
} from './gastoMoveCategoriaDefaults';

export function motivoFromSubtipoCanon(tipoGasto: string, subtipoCanon: string): string {
  const tg = tipoGasto.trim();
  const s = subtipoCanon.trim();
  if (!s) return '—';
  if (tipoGastoUsaSubtipoAdministrativoCanon(tg)) return getAdministrativoSubtipoLabel(s);
  if (tipoGastoUsaSubtipoFinancieroCanon(tg)) return getFinancieroPrestamoSubtipoLabel(s);
  if (tg === 'inversion_compra') return getInversionSubtipoLabel(s);
  if (tg === 'representacion_interna') return getRepresentacionInternaSubtipoLabel(s);
  if (tipoGastoUsaSubtipoOperativo(tg)) return getOperativoSubtipoLabel(s);
  return s;
}
