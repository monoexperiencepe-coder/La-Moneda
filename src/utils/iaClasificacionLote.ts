import type { ClasificacionFeedbackRow } from '../modules/ai/clasificacionFeedbackTypes';
import type { Gasto } from '../data/types';
import type { ClasificacionSugerenciaFuente } from '../modules/ai/clasificacionMemoriaTypes';
import type { IaClasificacionUiStatus, IaPendienteSugerencia } from '../modules/ai/iaClasificacionTypes';
import { canApplyIaSugerencia } from '../services/ai/iaClasificacionService';
import type { PermissionUser } from './permissions';
import {
  IA_CALIDAD_ALTA_MIN,
  type IaSugerenciaCalidadEval,
  iaCalidadConfianzaBanda,
} from './iaClasificacionCalidad';
import { labelTipoGastoFinanciero } from './tipoGastoLabels';
import { labelForSubtipoCatalogo } from '../constants/gastosSubtipos';

/** Umbral por defecto para “alta confianza” en lote supervisado. */
export const IA_LOTE_CONFIANZA_RECOMENDADA = IA_CALIDAD_ALTA_MIN;

export type IaLoteElegibilidad = {
  selectable: boolean;
  motivoNoSelectable: string | null;
  altaConfianza: boolean;
  conRiesgo: boolean;
  recomendadoLote: boolean;
};

const UI_BLOQUEADOS: ReadonlySet<IaClasificacionUiStatus> = new Set([
  'aplicado',
  'ignorado',
  'aplicado_lote',
  'aplicando',
]);

export function evaluaElegibilidadLote(
  row: IaPendienteSugerencia,
  permUser: PermissionUser | null | undefined,
  uiStatus: IaClasificacionUiStatus,
  calidad: IaSugerenciaCalidadEval | undefined,
  umbralConfianza: number,
): IaLoteElegibilidad {
  const tipo = (row.tipo_gasto_sugerido ?? '').trim();
  const sub = (row.subtipo_sugerido ?? '').trim();
  const conf = Number(row.confianza);
  const banda = calidad?.banda ?? iaCalidadConfianzaBanda(row.confianza);

  if (UI_BLOQUEADOS.has(uiStatus)) {
    return bloqueado(`Estado local: ${uiStatus}`);
  }
  if (!tipo) return bloqueado('Sin categoría sugerida');
  if (!sub) return bloqueado('Sin subtipo sugerido');
  if (!Number.isFinite(conf) || conf < umbralConfianza) {
    return bloqueado(`Confianza < ${Math.round(umbralConfianza * 100)}%`);
  }

  const gate = canApplyIaSugerencia(permUser, row);
  if (!gate.ok) return bloqueado(gate.message);

  const requiereRev =
    row.necesita_revision_humana === true || calidad?.requiereRevision === true;
  const fuente = row.fuente ?? 'heuristica';
  const altaConfianza = conf >= IA_LOTE_CONFIANZA_RECOMENDADA && banda === 'alta';
  const fuenteSegura: ClasificacionSugerenciaFuente[] = ['memoria_humana', 'mixto'];
  const recomendadoLote =
    altaConfianza && fuenteSegura.includes(fuente) && !requiereRev && !!tipo && !!sub;

  const conRiesgo =
    !altaConfianza ||
    !fuenteSegura.includes(fuente) ||
    requiereRev ||
    banda !== 'alta';

  return {
    selectable: true,
    motivoNoSelectable: null,
    altaConfianza,
    conRiesgo,
    recomendadoLote,
  };
}

function bloqueado(motivo: string): IaLoteElegibilidad {
  return {
    selectable: false,
    motivoNoSelectable: motivo,
    altaConfianza: false,
    conRiesgo: true,
    recomendadoLote: false,
  };
}

export type IaLoteResumenConfirmacion = {
  total: number;
  altaConfianza: number;
  conRiesgo: number;
  montoTotal: number;
  bajaMediaConfianza: number;
  memoriaHumana: number;
  heuristica: number;
  mixto: number;
  porCategoria: { key: string; label: string; count: number }[];
  porSubtipo: { key: string; label: string; count: number }[];
  idsRiesgo: number[];
};

export function buildLoteResumenConfirmacion(
  rows: IaPendienteSugerencia[],
  elegibilidadPorId: Map<number, IaLoteElegibilidad>,
): IaLoteResumenConfirmacion {
  const catMap = new Map<string, number>();
  const subMap = new Map<string, number>();
  let altaConfianza = 0;
  let conRiesgo = 0;
  let montoTotal = 0;
  let bajaMediaConfianza = 0;
  let memoriaHumana = 0;
  let heuristica = 0;
  let mixto = 0;
  const idsRiesgo: number[] = [];

  for (const r of rows) {
    const ev = elegibilidadPorId.get(r.id);
    if (ev?.altaConfianza) altaConfianza += 1;
    if (ev?.conRiesgo) {
      conRiesgo += 1;
      idsRiesgo.push(r.id);
    }
    montoTotal += Number.isFinite(r.monto) ? r.monto : 0;

    const banda = iaCalidadConfianzaBanda(r.confianza);
    if (banda === 'baja' || banda === 'media') bajaMediaConfianza += 1;

    const fuente = r.fuente ?? 'heuristica';
    if (fuente === 'memoria_humana') memoriaHumana += 1;
    else if (fuente === 'mixto') mixto += 1;
    else heuristica += 1;

    const tipo = r.tipo_gasto_sugerido ?? '';
    const sub = r.subtipo_sugerido ?? '';
    catMap.set(tipo, (catMap.get(tipo) ?? 0) + 1);
    const subKey = `${tipo}|${sub}`;
    subMap.set(subKey, (subMap.get(subKey) ?? 0) + 1);
  }

  const porCategoria = [...catMap.entries()]
    .map(([key, count]) => ({ key, label: labelTipoGastoFinanciero(key), count }))
    .sort((a, b) => b.count - a.count);

  const porSubtipo = [...subMap.entries()]
    .map(([key, count]) => {
      const [tipo, sub] = key.split('|');
      return {
        key,
        label: `${labelTipoGastoFinanciero(tipo)} / ${labelForSubtipoCatalogo(tipo, sub)}`,
        count,
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    total: rows.length,
    altaConfianza,
    conRiesgo,
    montoTotal,
    bajaMediaConfianza,
    memoriaHumana,
    heuristica,
    mixto,
    porCategoria,
    porSubtipo,
    idsRiesgo,
  };
}

export type IaLoteApplyItemResult =
  | {
      gastoId: number;
      ok: true;
      removeFromList: boolean;
      tipoAplicado: string;
      subtipoAplicado: string | null;
      feedback: ClasificacionFeedbackRow | null;
      gastoBefore: Gasto;
      gasto: Gasto;
      movedOutOfView: boolean;
    }
  | { gastoId: number; ok: false; message: string };

export type IaLoteApplySummary = {
  batchId: string;
  total: number;
  exitos: number;
  fallos: number;
  items: IaLoteApplyItemResult[];
};
