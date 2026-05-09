import type {
  PrestamoFinanciero,
  PrestamoFinancieroCalculoInfo,
  PrestamoFinancieroTramo,
} from '../data/types';

/** Último día del mes calendario anterior al mes de `reference`. */
export function endOfPreviousMonthIso(reference: Date = new Date()): string {
  const d = new Date(reference.getFullYear(), reference.getMonth(), 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function lastDayOfMonthIso(isoYmd: string): string {
  const head = isoYmd.trim().slice(0, 10);
  const [ys, ms] = head.split('-');
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return head;
  const d = new Date(y, m, 0);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Comparación lexicográfica YYYY-MM-DD. */
function minIso(a: string, b: string): string {
  return a <= b ? a : b;
}

function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}

function yearMonthIndex(isoYmd: string): number {
  const head = isoYmd.trim().slice(0, 10);
  const [y, m] = head.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 0;
  return y * 12 + (m - 1);
}

/** Meses calendario inclusivos entre dos fechas (por año-mes de cada ISO). */
export function monthsInclusiveCalendar(isoStart: string, isoEnd: string): number {
  const a = yearMonthIndex(isoStart);
  const b = yearMonthIndex(isoEnd);
  return Math.max(0, b - a + 1);
}

function computeFechaTopeCalculo(p: PrestamoFinanciero, reference: Date): string {
  const prev = endOfPreviousMonthIso(reference);
  if (p.estado === 'cancelado' && p.fechaCancelacion?.trim()) {
    const cancelCap = lastDayOfMonthIso(p.fechaCancelacion);
    return minIso(prev, cancelCap);
  }
  return prev;
}

function clipSegment(
  loanStart: string,
  calculationEnd: string,
  tramoDesde: string,
  tramoHasta: string | null,
): { desde: string; hasta: string } | null {
  const openEnd = tramoHasta?.trim() ? tramoHasta.trim().slice(0, 10) : calculationEnd;
  const hastaCap = lastDayOfMonthIso(openEnd);
  let desdeEff = maxIso(tramoDesde.trim().slice(0, 10), loanStart.trim().slice(0, 10));
  let hastaEff = minIso(hastaCap, calculationEnd);
  desdeEff = desdeEff.slice(0, 10);
  hastaEff = hastaEff.slice(0, 10);
  if (desdeEff > hastaEff) return null;
  return { desde: desdeEff, hasta: hastaEff };
}

/**
 * Cuota mensual estimada según modalidad (montos coherentes con moneda de pago en UI).
 * - cuota_fija: cuota_fija_mensual o interes_mensual_actual.
 * - tasa_anual: capital × tasa / 12, o interes_mensual_actual si no hay tasa.
 */
export function interesMensualEstimadoPrestamo(p: PrestamoFinanciero): number {
  if (p.modalidadPago === 'cuota_fija') {
    const v = p.cuotaFijaMensual;
    if (v != null && Number.isFinite(v)) return v;
    return p.interesMensualActual;
  }
  const rate = p.tasaAnual;
  if (rate != null && Number.isFinite(rate)) {
    return (p.capitalActualEstimado * rate) / 12;
  }
  return p.interesMensualActual;
}

function interesMensualEfectivoTramo(t: PrestamoFinancieroTramo, fallbackCapital: number): number {
  if (t.modalidadPago === 'cuota_fija') {
    if (t.interesMensual != null && Number.isFinite(t.interesMensual)) return t.interesMensual;
    if (t.cuotaFijaMensual != null && Number.isFinite(t.cuotaFijaMensual)) return t.cuotaFijaMensual;
    return 0;
  }
  if (t.interesMensual != null && Number.isFinite(t.interesMensual)) return t.interesMensual;
  const cap = t.capitalReferencial ?? fallbackCapital;
  const rate = t.tasaAnual;
  if (rate != null && Number.isFinite(rate)) return (cap * rate) / 12;
  return 0;
}

/**
 * Estima meses y total pagado por interés sin crear movimientos contables.
 * Los montos de cuota siguen la moneda de pago del tramo/préstamo en la UI.
 */
export function calcularPrestamoFinancieroInfo(
  p: PrestamoFinanciero,
  tramos: PrestamoFinancieroTramo[],
  reference: Date = new Date(),
): PrestamoFinancieroCalculoInfo {
  const fechaTopeCalculo = computeFechaTopeCalculo(p, reference);
  const loanStart = p.fechaInicio.trim().slice(0, 10);
  const interesMensualEstimado = interesMensualEstimadoPrestamo(p);

  const tramosOrdenados = [...tramos].sort((a, b) => a.orden - b.orden || a.id - b.id);

  if (tramosOrdenados.length === 0) {
    const seg = clipSegment(loanStart, fechaTopeCalculo, loanStart, null);
    const meses = seg ? monthsInclusiveCalendar(seg.desde, seg.hasta) : 0;
    const total = meses * interesMensualEstimado;
    return {
      fechaTopeCalculo,
      mesesPagadosEstimados: meses,
      totalInteresPagadoEstimado: Math.round(total * 100) / 100,
      capitalActualEstimado: p.capitalActualEstimado,
      interesMensualEstimado: Math.round(interesMensualEstimado * 100) / 100,
      porTramo: [],
    };
  }

  let mesesTotal = 0;
  let interesTotal = 0;
  const porTramo: PrestamoFinancieroCalculoInfo['porTramo'] = [];

  for (const t of tramosOrdenados) {
    const seg = clipSegment(loanStart, fechaTopeCalculo, t.desde, t.hasta);
    if (!seg) continue;
    const meses = monthsInclusiveCalendar(seg.desde, seg.hasta);
    const im = interesMensualEfectivoTramo(t, p.capitalActualEstimado);
    const sub = meses * im;
    mesesTotal += meses;
    interesTotal += sub;
    porTramo.push({
      tramoId: t.id,
      orden: t.orden,
      meses,
      interesMensualEfectivo: Math.round(im * 100) / 100,
      subtotalInteres: Math.round(sub * 100) / 100,
      desdeEfectivo: seg.desde,
      hastaEfectivo: seg.hasta,
    });
  }

  return {
    fechaTopeCalculo,
    mesesPagadosEstimados: mesesTotal,
    totalInteresPagadoEstimado: Math.round(interesTotal * 100) / 100,
    capitalActualEstimado: p.capitalActualEstimado,
    interesMensualEstimado: Math.round(interesMensualEstimado * 100) / 100,
    porTramo,
  };
}
