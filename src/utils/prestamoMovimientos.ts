import type { Moneda, PrestamoFinanciero, PrestamoFinancieroTramo } from '../data/types';
import { cuotaMensualDesdeCapitalYTasaAnual } from './prestamosFinancierosCalc';

export type PrestamoMovimientoTipo =
  | 'creacion'
  | 'retiro_capital'
  | 'aumento_capital'
  | 'amortizacion'
  | 'ajuste'
  | 'edicion'
  | 'renegociacion'
  | 'eliminacion_restaurada';

export type PrestamoTimelineEntry = {
  id: string;
  fecha: string;
  tipo: PrestamoMovimientoTipo;
  titulo: string;
  badge: string;
  capitalAnterior: number | null;
  capitalNuevo: number | null;
  deltaCapital: number | null;
  interesAnterior: number | null;
  interesNuevo: number | null;
  monedaCapital: Moneda;
  monedaPago: Moneda;
  comentario: string;
  tramoId?: number;
};

const EVENTO_TIPO_MAP: Record<string, PrestamoMovimientoTipo> = {
  inicio: 'creacion',
  creacion: 'creacion',
  retiro_capital: 'retiro_capital',
  retiro: 'retiro_capital',
  aumento_capital: 'aumento_capital',
  aumento: 'aumento_capital',
  amortizacion: 'amortizacion',
  ajuste: 'ajuste',
  edicion: 'edicion',
  renegociacion: 'renegociacion',
  eliminacion_restaurada: 'eliminacion_restaurada',
};

export function movimientoTipoFromEvento(evento: string, nota = ''): PrestamoMovimientoTipo {
  const e = evento.trim().toLowerCase().replace(/\s+/g, '_');
  const n = nota.trim().toLowerCase();
  if (EVENTO_TIPO_MAP[e]) return EVENTO_TIPO_MAP[e];
  if (e.includes('retiro') || n.includes('retiro')) return 'retiro_capital';
  if (e.includes('aumento') || n.includes('aumento')) return 'aumento_capital';
  if (e.includes('amortiz')) return 'amortizacion';
  if (e.includes('renegoci')) return 'renegociacion';
  if (e.includes('ajust')) return 'ajuste';
  if (e.includes('edic')) return 'edicion';
  return 'ajuste';
}

export function movimientoBadgeLabel(tipo: PrestamoMovimientoTipo): string {
  switch (tipo) {
    case 'creacion':
      return 'Creación';
    case 'retiro_capital':
      return 'Retiro parcial';
    case 'aumento_capital':
      return 'Aumento capital';
    case 'amortizacion':
      return 'Amortización';
    case 'renegociacion':
      return 'Renegociado';
    case 'edicion':
      return 'Edición';
    case 'eliminacion_restaurada':
      return 'Restaurado';
    default:
      return 'Ajuste';
  }
}

export function movimientoTitulo(tipo: PrestamoMovimientoTipo): string {
  switch (tipo) {
    case 'creacion':
      return 'Creación del préstamo';
    case 'retiro_capital':
      return 'Retiro parcial de capital';
    case 'aumento_capital':
      return 'Aumento de capital';
    case 'amortizacion':
      return 'Amortización';
    case 'renegociacion':
      return 'Renegociación';
    case 'edicion':
      return 'Edición de condiciones';
    case 'eliminacion_restaurada':
      return 'Préstamo restaurado';
    default:
      return 'Ajuste financiero';
  }
}

/** Recalcula cuota mensual según modalidad del préstamo. */
export function recalcularCuotaMensualPrestamo(
  prestamo: Pick<
    PrestamoFinanciero,
    'modalidadPago' | 'tasaAnual' | 'cuotaFijaMensual' | 'interesMensualActual'
  >,
  nuevoCapital: number,
): number {
  if (prestamo.modalidadPago === 'cuota_fija') {
    if (prestamo.cuotaFijaMensual != null && Number.isFinite(prestamo.cuotaFijaMensual)) {
      return prestamo.cuotaFijaMensual;
    }
    return prestamo.interesMensualActual;
  }
  const tasa = prestamo.tasaAnual ?? 0;
  return cuotaMensualDesdeCapitalYTasaAnual(nuevoCapital, tasa);
}

export function buildTimelineFromDetalle(
  prestamo: PrestamoFinanciero,
  tramos: PrestamoFinancieroTramo[],
): PrestamoTimelineEntry[] {
  const sorted = [...tramos].sort((a, b) => a.orden - b.orden || a.id - b.id);
  const entries: PrestamoTimelineEntry[] = [];

  if (sorted.length === 0) {
    entries.push({
      id: `creacion-${prestamo.id}`,
      fecha: prestamo.fechaInicio,
      tipo: 'creacion',
      titulo: movimientoTitulo('creacion'),
      badge: movimientoBadgeLabel('creacion'),
      capitalAnterior: null,
      capitalNuevo: prestamo.capitalActualEstimado,
      deltaCapital: prestamo.montoOriginal,
      interesAnterior: null,
      interesNuevo: prestamo.interesMensualActual,
      monedaCapital: prestamo.monedaCapital,
      monedaPago: prestamo.monedaPago,
      comentario: prestamo.observaciones?.trim() || prestamo.notas?.trim() || '',
    });
    return entries.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;
    const tipo = movimientoTipoFromEvento(t.evento, t.nota);
    const capNuevo = t.capitalReferencial ?? prestamo.capitalActualEstimado;
    const capAnterior = prev?.capitalReferencial ?? (i === 0 ? prestamo.montoOriginal : null);
    const intNuevo = t.interesMensual ?? prestamo.interesMensualActual;
    const intAnterior = prev?.interesMensual ?? null;
    let delta: number | null = null;
    if (capAnterior != null && capNuevo != null) delta = Math.round((capNuevo - capAnterior) * 100) / 100;

    entries.push({
      id: `tramo-${t.id}`,
      fecha: t.desde,
      tipo,
      titulo: movimientoTitulo(tipo),
      badge: movimientoBadgeLabel(tipo),
      capitalAnterior: capAnterior,
      capitalNuevo: capNuevo,
      deltaCapital: delta,
      interesAnterior: intAnterior,
      interesNuevo: intNuevo,
      monedaCapital: t.monedaCapital,
      monedaPago: t.monedaPago,
      comentario: t.nota?.trim() || t.evento?.trim() || '',
      tramoId: t.id,
    });
  }

  return entries.sort((a, b) => {
    const fc = b.fecha.localeCompare(a.fecha);
    if (fc !== 0) return fc;
    return (b.tramoId ?? 0) - (a.tramoId ?? 0);
  });
}

export function nextTramoOrden(tramos: PrestamoFinancieroTramo[]): number {
  if (tramos.length === 0) return 0;
  return Math.max(...tramos.map((t) => t.orden)) + 1;
}
