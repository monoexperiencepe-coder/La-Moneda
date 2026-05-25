import type { ClasificacionFeedbackRow } from '../modules/ai/clasificacionFeedbackTypes';
import type { ClasificacionSugerenciaFuente } from '../modules/ai/clasificacionMemoriaTypes';
import type { IaClasificacionUiStatus, IaPendienteSugerencia } from '../modules/ai/iaClasificacionTypes';
import { labelTipoGastoFinanciero } from './tipoGastoLabels';
import type { IaClasificacionUiMap } from './iaClasificacionUiState';
import { normKey } from './subtipoFinancieroLabel';

/** Umbrales del panel de calidad (distintos del badge legacy en tabla). */
export const IA_CALIDAD_ALTA_MIN = 0.85;
export const IA_CALIDAD_MEDIA_MIN = 0.6;
export const IA_CALIDAD_DEBIL_MAX = 0.7;
export const IA_CALIDAD_MONTO_ALTO_MIN = 2000;

export type IaCalidadConfianzaBanda = 'alta' | 'media' | 'baja';

export type IaCalidadFiltroRapido =
  | 'all'
  | 'alta'
  | 'baja'
  | 'sin_subtipo'
  | 'requiere_revision';

export type IaCalidadMetricas = {
  total: number;
  alta: number;
  media: number;
  baja: number;
  revisados: number;
  aplicados: number;
  ignorados: number;
  errores: number;
  requiereRevision: number;
  umbralMontoAlto: number;
  memoriaHumana: number;
  heuristica: number;
  mixto: number;
  pctMemoria: number;
};

export type IaPatronAprendido = {
  key: string;
  label: string;
  count: number;
  fuente: ClasificacionSugerenciaFuente;
};

export type IaFeedbackMetricas = {
  total: number;
  correctos: number;
  parciales: number;
  incorrectos: number;
  ignorados: number;
  precisionPct: number;
  porCategoriaPrecision: IaCalidadAgrupacion[];
  porSubtipoPrecision: IaCalidadAgrupacion[];
  topErrores: IaCalidadAgrupacion[];
  topAciertos: IaCalidadAgrupacion[];
};

export type IaCalidadAgrupacion = {
  key: string;
  label: string;
  count: number;
};

export type IaSugerenciaCalidadEval = {
  requiereRevision: boolean;
  motivos: string[];
  banda: IaCalidadConfianzaBanda;
};

export function iaCalidadConfianzaBanda(confianza: number | null | undefined): IaCalidadConfianzaBanda {
  const c = Number(confianza);
  if (!Number.isFinite(c)) return 'baja';
  if (c >= IA_CALIDAD_ALTA_MIN) return 'alta';
  if (c >= IA_CALIDAD_MEDIA_MIN) return 'media';
  return 'baja';
}

export function iaCalidadBandaLabel(banda: IaCalidadConfianzaBanda): string {
  if (banda === 'alta') return `Alta (≥${IA_CALIDAD_ALTA_MIN * 100}%)`;
  if (banda === 'media') return `Media (${IA_CALIDAD_MEDIA_MIN * 100}–${IA_CALIDAD_ALTA_MIN * 100 - 1}%)`;
  return `Baja (<${IA_CALIDAD_MEDIA_MIN * 100}%)`;
}

function textoOperativo(row: IaPendienteSugerencia): string {
  return normKey([row.motivo, row.comentario].filter(Boolean).join(' '));
}

export function isMotivoComentarioAmbiguo(row: IaPendienteSugerencia): boolean {
  const t = textoOperativo(row);
  if (!t || t.length < 5) return true;
  const palabras = t.split(/\s+/).filter(Boolean);
  if (palabras.length <= 2) return true;
  return /\b(otro|varios|misc|pendiente|revisar|sin\s+clasificar|pago|gasto|transferencia|abono|vario)\b/.test(
    t,
  );
}

export function resolveUmbralMontoAlto(rows: IaPendienteSugerencia[]): number {
  const montos = rows.map((r) => r.monto).filter((m) => Number.isFinite(m) && m > 0);
  if (montos.length < 4) return IA_CALIDAD_MONTO_ALTO_MIN;
  const sorted = [...montos].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75));
  return Math.max(IA_CALIDAD_MONTO_ALTO_MIN, sorted[idx] ?? IA_CALIDAD_MONTO_ALTO_MIN);
}

export function evaluaSugerenciaCalidad(
  row: IaPendienteSugerencia,
  umbralMontoAlto: number,
): IaSugerenciaCalidadEval {
  const motivos: string[] = [];
  const banda = iaCalidadConfianzaBanda(row.confianza);

  if (row.confianza < IA_CALIDAD_DEBIL_MAX) motivos.push('Confianza < 70%');
  if (!row.subtipo_sugerido?.trim()) motivos.push('Sin subtipo sugerido');
  if (!row.tipo_gasto_sugerido?.trim()) motivos.push('Sin categoría sugerida');
  if (row.necesita_revision_humana) motivos.push('IA marcó revisión humana');
  if (isMotivoComentarioAmbiguo(row)) motivos.push('Motivo/comentario ambiguo');
  if (Number.isFinite(row.monto) && row.monto >= umbralMontoAlto) {
    motivos.push(`Monto alto (≥ ${umbralMontoAlto.toLocaleString('es-PE')})`);
  }

  return {
    requiereRevision: motivos.length > 0,
    motivos,
    banda,
  };
}

export function buildCalidadPorId(
  rows: IaPendienteSugerencia[],
  umbralMontoAlto: number,
): Map<number, IaSugerenciaCalidadEval> {
  const map = new Map<number, IaSugerenciaCalidadEval>();
  for (const r of rows) {
    map.set(r.id, evaluaSugerenciaCalidad(r, umbralMontoAlto));
  }
  return map;
}

export function uiStatusFromMap(
  uiMap: IaClasificacionUiMap,
  gastoId: number,
): IaClasificacionUiStatus {
  return uiMap[String(gastoId)] ?? 'pendiente';
}

export function computeIaCalidadMetricas(
  rows: IaPendienteSugerencia[],
  uiMap: IaClasificacionUiMap,
  calidadPorId: Map<number, IaSugerenciaCalidadEval>,
): IaCalidadMetricas {
  let alta = 0;
  let media = 0;
  let baja = 0;
  let revisados = 0;
  let aplicados = 0;
  let ignorados = 0;
  let errores = 0;
  let requiereRevision = 0;
  let memoriaHumana = 0;
  let heuristica = 0;
  let mixto = 0;

  for (const r of rows) {
    const ev = calidadPorId.get(r.id);
    if (ev?.banda === 'alta') alta += 1;
    else if (ev?.banda === 'media') media += 1;
    else baja += 1;
    if (ev?.requiereRevision) requiereRevision += 1;
    if (r.fuente === 'memoria_humana') memoriaHumana += 1;
    else if (r.fuente === 'mixto') mixto += 1;
    else heuristica += 1;

    const st = uiStatusFromMap(uiMap, r.id);
    if (st === 'revisado') revisados += 1;
    else if (st === 'aplicado' || st === 'aplicado_lote') aplicados += 1;
    else if (st === 'ignorado') ignorados += 1;
    else if (st === 'error' || st === 'error_lote') errores += 1;
  }

  const total = rows.length;
  const pctMemoria = total > 0 ? Math.round(((memoriaHumana + mixto) / total) * 100) : 0;

  return {
    total,
    alta,
    media,
    baja,
    revisados,
    aplicados,
    ignorados,
    errores,
    requiereRevision,
    umbralMontoAlto: resolveUmbralMontoAlto(rows),
    memoriaHumana,
    heuristica,
    mixto,
    pctMemoria,
  };
}

export function computePatronesAprendidos(rows: IaPendienteSugerencia[], limit = 6): IaPatronAprendido[] {
  const counts = new Map<string, IaPatronAprendido>();
  for (const r of rows) {
    if (r.fuente !== 'memoria_humana' && r.fuente !== 'mixto') continue;
    const tipo = r.tipo_gasto_sugerido ?? '?';
    const sub = r.subtipo_sugerido ?? '?';
    const key = `${tipo}|${sub}`;
    const prev = counts.get(key);
    if (prev) prev.count += 1;
    else {
      counts.set(key, {
        key,
        label: `${tipo} / ${sub}`,
        count: 1,
        fuente: r.fuente,
      });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function agruparPorCampo(
  rows: IaPendienteSugerencia[],
  campo: 'tipo_gasto_sugerido' | 'subtipo_sugerido',
  labelFn: (key: string) => string,
  maxItems = 8,
): IaCalidadAgrupacion[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const raw = r[campo];
    const key = (raw ?? '').trim() || '(sin dato)';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems)
    .map(([key, count]) => ({
      key,
      label: key === '(sin dato)' ? '(sin dato)' : labelFn(key),
      count,
    }));
}

export function pasaFiltroCalidadRapido(
  row: IaPendienteSugerencia,
  filtro: IaCalidadFiltroRapido,
  calidad: IaSugerenciaCalidadEval | undefined,
): boolean {
  if (filtro === 'all') return true;
  if (filtro === 'alta') return calidad?.banda === 'alta';
  if (filtro === 'baja') return calidad?.banda === 'baja';
  if (filtro === 'sin_subtipo') return !row.subtipo_sugerido?.trim();
  if (filtro === 'requiere_revision') return calidad?.requiereRevision === true;
  return true;
}

function pushCount(map: Map<string, { ok: number; total: number }>, key: string, ok: boolean): void {
  const k = key.trim() || '(sin dato)';
  const prev = map.get(k) ?? { ok: 0, total: 0 };
  map.set(k, { ok: prev.ok + (ok ? 1 : 0), total: prev.total + 1 });
}

function mapPrecisionAgg(
  agg: Map<string, { ok: number; total: number }>,
  labelFn: (k: string) => string,
  max = 6,
): IaCalidadAgrupacion[] {
  return [...agg.entries()]
    .map(([key, v]) => ({
      key,
      label: `${labelFn(key)} (${v.total > 0 ? Math.round((v.ok / v.total) * 100) : 0}%)`,
      count: v.ok,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

/** Métricas de precisión IA desde feedback persistido (no altera sugerencias automáticamente). */
export function computeIaFeedbackMetricas(feedbackRows: ClasificacionFeedbackRow[]): IaFeedbackMetricas {
  let correctos = 0;
  let parciales = 0;
  let incorrectos = 0;
  let ignorados = 0;
  const catAgg = new Map<string, { ok: number; total: number }>();
  const subAgg = new Map<string, { ok: number; total: number }>();
  const erroresAgg = new Map<string, number>();
  const aciertosAgg = new Map<string, number>();

  for (const f of feedbackRows) {
    const r = f.feedback_resultado;
    if (r === 'correcto') correctos += 1;
    else if (r === 'parcialmente_correcto') parciales += 1;
    else if (r === 'incorrecto') incorrectos += 1;
    else if (r === 'ignorado') ignorados += 1;

    const tipo = f.sugerencia_original_tipo ?? '';
    const sub = f.sugerencia_original_subtipo ?? '';
    const ok = r === 'correcto';
    if (r !== 'ignorado') {
      pushCount(catAgg, tipo, ok);
      pushCount(subAgg, sub, ok);
    }
    if (r === 'incorrecto' || r === 'parcialmente_correcto') {
      const errKey = `${tipo}|${sub}`;
      erroresAgg.set(errKey, (erroresAgg.get(errKey) ?? 0) + 1);
    }
    if (r === 'correcto') {
      const hitKey = `${tipo}|${sub}`;
      aciertosAgg.set(hitKey, (aciertosAgg.get(hitKey) ?? 0) + 1);
    }
  }

  const evaluados = correctos + parciales + incorrectos;
  const precisionPct = evaluados > 0 ? Math.round((correctos / evaluados) * 100) : 0;

  const topErrores = [...erroresAgg.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, count]) => {
      const [tipo, sub] = key.split('|');
      return {
        key,
        label: `${labelTipoGastoFinanciero(tipo)} / ${sub || '—'}`,
        count,
      };
    });

  const topAciertos = [...aciertosAgg.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, count]) => {
      const [tipo, sub] = key.split('|');
      return {
        key,
        label: `${labelTipoGastoFinanciero(tipo)} / ${sub || '—'}`,
        count,
      };
    });

  return {
    total: feedbackRows.length,
    correctos,
    parciales,
    incorrectos,
    ignorados,
    precisionPct,
    porCategoriaPrecision: mapPrecisionAgg(catAgg, labelTipoGastoFinanciero),
    porSubtipoPrecision: mapPrecisionAgg(subAgg, (k) => k),
    topErrores,
    topAciertos,
  };
}

export function pasaFiltroConfianzaPanel(
  row: IaPendienteSugerencia,
  filtro: 'all' | IaCalidadConfianzaBanda,
  calidad: IaSugerenciaCalidadEval | undefined,
): boolean {
  if (filtro === 'all') return true;
  return calidad?.banda === filtro;
}
