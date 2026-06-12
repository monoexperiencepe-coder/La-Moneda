/**
 * Preview / auditoría: gastos operativo_vehiculo con texto DEVOLUCION … GARANTIA
 * → reclasificación planificada a financiero_prestamo / compra_activo.
 * NO persiste cambios; solo análisis en cliente.
 */
import type { Gasto } from '../data/types';
import {
  cleanOperationalCommentForUi,
  gastoObservacionParaLista,
  isTechnicalImportFragment,
} from '../utils/cleanOperationalComment';
import { extractSearchablePartsFromRecord, gastoComentariosForSearch } from '../utils/recordSearch';
import { labelTipoGastoFinanciero } from '../utils/tipoGastoLabels';
import { gastoIncluidoEnUtilidadReal } from '../utils/utilidadReal';
import { tipoGastoEffective } from '../utils/gastosTipoGasto';
import { getSubtipoFinancieroLabel } from '../utils/subtipoFinancieroLabel';

/** Referencia del historial manual (búsqueda «devolucion») para comparar en preview. */
export const DEVOLUCION_GARANTIA_REFERENCIA_MANUAL = {
  cantidad: 42,
  montoTotal: 28250,
} as const;

export const DEVOLUCION_GARANTIA_TARGET_TIPO = 'financiero_prestamo' as const;
export const DEVOLUCION_GARANTIA_TARGET_SUBTIPO = 'compra_activo' as const;
export const DEVOLUCION_GARANTIA_AUDIT_ACTION = 'move_expense_category' as const;

export type DevolucionGarantiaCandidato = {
  id: string;
  fecha: string;
  vehicleId: number | string;
  /** Texto legible del registro (comentarios / import / motivo), no el subtipo canónico. */
  textoReal: string;
  monto: number;
  categoriaActual: string;
  categoriaActualLabel: string;
  subtipoActual: string | null;
  categoriaNueva: string;
  categoriaNuevaLabel: string;
  subtipoNuevo: string;
  subtipoNuevoLabel: string;
  incluidoEnUtilidadHoy: boolean;
};

export type DevolucionGarantiaImpacto = {
  cantidad: number;
  montoTotal: number;
  /** Utilidad operativa sube al sacar estos gastos del cálculo operativo. */
  deltaUtilidadOperativa: number;
  dashboard: {
    operativoVehiculo: { deltaMonto: number; deltaCount: number };
    financieroPrestamo: { deltaMonto: number; deltaCount: number };
    totalGastos: { deltaMonto: number; deltaCount: number };
  };
};

export type DevolucionGarantiaAuditPlanEntry = {
  action_type: typeof DEVOLUCION_GARANTIA_AUDIT_ACTION;
  entity_type: 'gasto';
  entity_id: string;
  old_data: {
    tipo_gasto: string | null;
    subtipo_gasto: string | null;
    vehicle_id: number | string | null;
    monto: number;
    motivo: string;
  };
  new_data: {
    tipo_gasto: typeof DEVOLUCION_GARANTIA_TARGET_TIPO;
    subtipo_gasto: typeof DEVOLUCION_GARANTIA_TARGET_SUBTIPO;
    vehicle_id: number | string | null;
  };
  reason: string;
  status: 'planned';
};

function normalizeSearchText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function flattenExcelExtraStrings(obj: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > 6 || obj == null) return out;
  if (typeof obj === 'string') {
    const t = obj.trim();
    if (t && t.length <= 8000) out.push(t);
    return out;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    out.push(String(obj));
    return out;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) flattenExcelExtraStrings(item, depth + 1, out);
    return out;
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj as Record<string, unknown>)) {
      if (typeof v === 'string') out.push(v);
      else flattenExcelExtraStrings(v, depth + 1, out);
    }
  }
  return out;
}

function isLikelyInternalSlug(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^[a-z][a-z0-9_]{2,48}$/.test(t) && t.includes('_')) return true;
  return false;
}

/** Une texto de todos los campos relevantes del gasto (incl. excel_extra anidado). */
export function gastoTextoBusqueda(g: Gasto): string {
  const record: Record<string, unknown> = {
    observaciones: g.comentarios,
    comentarios: g.comentarios,
    motivo: g.motivo,
    descripcion: g.detalleOperativo,
    detalleOperativo: g.detalleOperativo,
    pagadoA: g.pagadoA,
    subtipo: g.subtipo_gasto,
    subTipo: g.subTipo,
    subcategoria: g.subcategoria,
    categoriaReal: g.categoriaReal,
    tipo: g.tipo,
    metodoPagoDetalle: g.metodoPagoDetalle,
    excel_extra: g.excelExtra,
    excelExtra: g.excelExtra,
    origen_clasificacion: g.origen_clasificacion,
  };

  const parts = extractSearchablePartsFromRecord(record, [
    g.motivo,
    g.comentarios,
    gastoComentariosForSearch(g.comentarios),
    g.subTipo,
    g.subtipo_gasto,
    g.subcategoria,
    g.detalleOperativo,
    g.pagadoA,
    g.tipo,
    g.categoriaReal,
    g.metodoPagoDetalle,
    g.metodoPago,
    g.categoria,
    g.origen_clasificacion,
  ]);

  for (const s of flattenExcelExtraStrings(g.excelExtra)) {
    if (!parts.includes(s)) parts.push(s);
  }

  return parts.join(' ');
}

function hasDevolucionToken(t: string): boolean {
  return t.includes('DEVOLUCION') || t.includes('DEVOLUC');
}

function hasGarantiaToken(t: string): boolean {
  return t.includes('GARANTIA') || t.includes('GARATNIA');
}

/**
 * DEVOLUCION + GARANTIA en cualquier orden (incl. «DEVOLUCION DE GARANTIA», typo GARATNIA).
 */
export function matchesDevolucionGarantiaText(text: string): boolean {
  const t = normalizeSearchText(text);
  if (!hasDevolucionToken(t) || !hasGarantiaToken(t)) return false;
  return true;
}

function isDevolucionGarantiaSubtipo(g: Gasto): boolean {
  const raw = [g.subtipo_gasto, g.subTipo, g.subcategoria].filter(Boolean).join(' ');
  const t = normalizeSearchText(raw.replace(/_/g, ' '));
  return hasDevolucionToken(t) && hasGarantiaToken(t);
}

function isOperativoVehiculoConMonto(g: Gasto): boolean {
  if (tipoGastoEffective(g) !== 'operativo_vehiculo') return false;
  if (g.vehicleId == null || g.vehicleId === '' || g.vehicleId === 0) return false;
  if (!Number.isFinite(g.monto) || g.monto === 0) return false;
  return true;
}

export function isDevolucionGarantiaCandidato(g: Gasto): boolean {
  if (!isOperativoVehiculoConMonto(g)) return false;
  const haystack = gastoTextoBusqueda(g);
  return matchesDevolucionGarantiaText(haystack) || isDevolucionGarantiaSubtipo(g);
}

/** Texto legible para validación fila a fila (prioriza líneas con devolución/garantía). */
export function gastoTextoRealRegistro(g: Gasto): string {
  const candidates: string[] = [];

  const obs = gastoObservacionParaLista(g);
  if (obs) candidates.push(obs);

  const comLimpio = cleanOperationalCommentForUi(g.comentarios);
  if (comLimpio && !candidates.includes(comLimpio)) candidates.push(comLimpio);

  if (g.detalleOperativo?.trim()) {
    const d = cleanOperationalCommentForUi(g.detalleOperativo) ?? g.detalleOperativo.trim();
    if (d && !candidates.includes(d)) candidates.push(d);
  }

  for (const s of flattenExcelExtraStrings(g.excelExtra)) {
    const t = s.trim();
    if (!t || isTechnicalImportFragment(t)) continue;
    if (t.length >= 6 && !candidates.some((c) => c.toLowerCase() === t.toLowerCase())) {
      candidates.push(t);
    }
  }

  if (g.motivo?.trim() && !isLikelyInternalSlug(g.motivo)) candidates.push(g.motivo.trim());
  if (g.categoriaReal?.trim() && !isLikelyInternalSlug(g.categoriaReal)) candidates.push(g.categoriaReal.trim());
  if (g.subcategoria?.trim() && !isLikelyInternalSlug(g.subcategoria)) candidates.push(g.subcategoria.trim());
  if (g.pagadoA?.trim()) candidates.push(g.pagadoA.trim());

  for (const c of candidates) {
    if (matchesDevolucionGarantiaText(c)) return c;
  }

  const sorted = [...candidates].sort((a, b) => b.length - a.length);
  return sorted[0] ?? '—';
}

/** Solo «devolucion» en operativo_vehiculo (como historial manual) — referencia diagnóstica. */
export function countOperativoVehiculoSoloDevolucion(
  gastos: readonly Gasto[],
): { cantidad: number; montoTotal: number } {
  const list = gastos.filter((g) => {
    if (!isOperativoVehiculoConMonto(g)) return false;
    return hasDevolucionToken(normalizeSearchText(gastoTextoBusqueda(g)));
  });
  return {
    cantidad: list.length,
    montoTotal: list.reduce((s, g) => s + g.monto, 0),
  };
}

export function findDevolucionGarantiaCandidatos(gastos: readonly Gasto[]): DevolucionGarantiaCandidato[] {
  return gastos
    .filter(isDevolucionGarantiaCandidato)
    .map((g) => {
      const catActual = tipoGastoEffective(g) ?? 'operativo_vehiculo';
      return {
        id: String(g.id),
        fecha: g.fecha.slice(0, 10),
        vehicleId: g.vehicleId as number | string,
        textoReal: gastoTextoRealRegistro(g),
        monto: g.monto,
        categoriaActual: catActual,
        categoriaActualLabel: labelTipoGastoFinanciero(catActual),
        subtipoActual: g.subtipo_gasto ?? g.subTipo ?? null,
        categoriaNueva: DEVOLUCION_GARANTIA_TARGET_TIPO,
        categoriaNuevaLabel: labelTipoGastoFinanciero(DEVOLUCION_GARANTIA_TARGET_TIPO),
        subtipoNuevo: DEVOLUCION_GARANTIA_TARGET_SUBTIPO,
        subtipoNuevoLabel: getSubtipoFinancieroLabel(
          DEVOLUCION_GARANTIA_TARGET_SUBTIPO,
          DEVOLUCION_GARANTIA_TARGET_TIPO,
        ),
        incluidoEnUtilidadHoy: gastoIncluidoEnUtilidadReal(g),
      };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || String(b.id).localeCompare(String(a.id)));
}

export function computeDevolucionGarantiaImpacto(
  candidatos: readonly DevolucionGarantiaCandidato[],
): DevolucionGarantiaImpacto {
  const montoTotal = candidatos.reduce((s, c) => s + c.monto, 0);
  const enUtilidad = candidatos.filter((c) => c.incluidoEnUtilidadHoy);
  const deltaUtilidad = enUtilidad.reduce((s, c) => s + c.monto, 0);

  return {
    cantidad: candidatos.length,
    montoTotal,
    deltaUtilidadOperativa: deltaUtilidad,
    dashboard: {
      operativoVehiculo: { deltaMonto: -montoTotal, deltaCount: -candidatos.length },
      financieroPrestamo: { deltaMonto: montoTotal, deltaCount: candidatos.length },
      totalGastos: { deltaMonto: 0, deltaCount: 0 },
    },
  };
}

export function buildDevolucionGarantiaAuditPlan(
  gastos: readonly Gasto[],
  candidatos: readonly DevolucionGarantiaCandidato[],
): DevolucionGarantiaAuditPlanEntry[] {
  const byId = new Map(gastos.map((g) => [String(g.id), g]));
  return candidatos.map((c) => {
    const g = byId.get(c.id);
    return {
      action_type: DEVOLUCION_GARANTIA_AUDIT_ACTION,
      entity_type: 'gasto',
      entity_id: c.id,
      old_data: {
        tipo_gasto: g?.tipo_gasto ?? c.categoriaActual,
        subtipo_gasto: g?.subtipo_gasto ?? c.subtipoActual,
        vehicle_id: c.vehicleId,
        monto: c.monto,
        motivo: c.textoReal,
      },
      new_data: {
        tipo_gasto: DEVOLUCION_GARANTIA_TARGET_TIPO,
        subtipo_gasto: DEVOLUCION_GARANTIA_TARGET_SUBTIPO,
        vehicle_id: c.vehicleId,
      },
      reason:
        'Devolución de garantía reclasificada a financiero_prestamo / compra_activo (plan pendiente — confirmación dueño).',
      status: 'planned',
    };
  });
}
