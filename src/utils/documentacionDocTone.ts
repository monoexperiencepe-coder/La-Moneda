import { esControlFechaExcluidoDeEstadoVencido, esControlFechaSinAlertaVencimiento } from '../data/controlFechaCatalog';
import type { TipoControlFecha } from '../data/types';
import { isExpired, isExpiringSoon } from './formatting';

/** Tono de celda por documento y tipo (instalación GNV = referencia, sin semáforo de vencimiento). */
export type DocTone = 'empty' | 'ok' | 'soon' | 'late' | 'neutral' | 'mant';

export function docColumnTone(date: string | undefined, tipo: TipoControlFecha): DocTone {
  if (!date) return 'empty';
  if (esControlFechaSinAlertaVencimiento(tipo)) return 'neutral';
  if (tipo === 'BAT_MANT_REALIZADO') {
    if (isExpired(date)) return 'mant';
    if (isExpiringSoon(date, 30)) return 'mant';
    return 'ok';
  }
  if (isExpired(date)) return 'late';
  if (isExpiringSoon(date, 30)) return 'soon';
  return 'ok';
}

export function docRowWorstTone(
  doc: Partial<Record<TipoControlFecha, string>> | undefined,
  columnas: readonly { tipo: TipoControlFecha }[],
): Exclude<DocTone, 'neutral' | 'mant'> {
  if (!doc) return 'empty';
  let worst: Exclude<DocTone, 'neutral' | 'mant'> = 'empty';
  for (const { tipo } of columnas) {
    if (esControlFechaExcluidoDeEstadoVencido(tipo)) continue;
    const t = docColumnTone(doc[tipo], tipo);
    if (t === 'neutral' || t === 'mant') continue;
    if (t === 'late') return 'late';
    if (t === 'soon') worst = 'soon';
    else if (t === 'ok' && worst === 'empty') worst = 'ok';
  }
  return worst;
}

/** Peor tono incluyendo BAT mant. (solo badge visual, no «Vencido»). */
export function docRowVisualTone(
  doc: Partial<Record<TipoControlFecha, string>> | undefined,
  columnas: readonly { tipo: TipoControlFecha }[],
): Exclude<DocTone, 'neutral'> {
  if (!doc) return 'empty';
  let worst: Exclude<DocTone, 'neutral'> = 'empty';
  for (const { tipo } of columnas) {
    if (esControlFechaSinAlertaVencimiento(tipo)) continue;
    const t = docColumnTone(doc[tipo], tipo);
    if (t === 'neutral') continue;
    if (t === 'late') return 'late';
    if (t === 'mant') {
      if (worst === 'empty' || worst === 'ok') worst = 'mant';
      continue;
    }
    if (t === 'soon') {
      if (worst === 'empty' || worst === 'ok' || worst === 'mant') worst = 'soon';
      continue;
    }
    if (t === 'ok' && worst === 'empty') worst = 'ok';
  }
  return worst;
}

/** Fecha ISO más cercana solo entre tipos con vencimiento operativo (excluye instalación GNV). */
export function docNearestExpiryIso(
  doc: Partial<Record<TipoControlFecha, string>> | undefined,
  columnas: readonly { tipo: TipoControlFecha }[],
): string {
  if (!doc) return '9999';
  let nearest = '9999';
  for (const { tipo } of columnas) {
    if (esControlFechaExcluidoDeEstadoVencido(tipo)) continue;
    const d = doc[tipo];
    if (d && d < nearest) nearest = d;
  }
  return nearest;
}
