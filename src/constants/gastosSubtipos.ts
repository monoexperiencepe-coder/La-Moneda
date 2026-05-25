/**
 * Catálogo híbrido de subtipos por categoría financiera (`tipo_gasto`).
 * Oficiales: Excel dueño + Fact acotado por categoría + códigos sintéticos del sistema.
 * Históricos: distinct en memoria (no altera BD).
 */
import { getSubtiposGasto } from '../data/factCatalog';
import {
  getFactTiposForFinanza,
  type FinanzaGastoRegistroValue,
} from '../data/finanzaGastoRegistro';
import { SUBTIPOS_REPRESENTACION_INTERNA } from '../data/representacionInterna';
import { OPERATIVO_SUBTIPO_OPTIONS } from '../utils/operativoSubtipo';
import { getRepresentacionInternaSubtipoLabel } from '../utils/representacionInternaSubtipoLabel';
import { getOperativoSubtipoLabel } from '../utils/operativoSubtipo';
import { getSubtipoFinancieroLabel, normKey } from '../utils/subtipoFinancieroLabel';
import { gastoMatchesTipoGasto } from '../utils/gastosTipoGasto';
import type { Gasto } from '../data/types';

export type GastoSubtipoCategoria =
  | FinanzaGastoRegistroValue
  | 'financiero'
  | 'inversion'
  | 'pendiente_revision';

export interface GastoSubtipoOption {
  value: string;
  label: string;
  isHistorico?: boolean;
}

/** Mapeo hojas / rubros Excel → `tipo_gasto` en Supabase. */
export const EXCEL_CATEGORIA_A_TIPO_GASTO: Record<string, GastoSubtipoCategoria> = {
  'gasto administrativo': 'administrativo_empresa',
  'gastos administrativos': 'administrativo_empresa',
  'g. administrativo': 'administrativo_empresa',
  'g. financieros': 'financiero_prestamo',
  'g financieros': 'financiero_prestamo',
  'g.inversiones': 'inversion_compra',
  'g inversiones': 'inversion_compra',
  'g. de representacion': 'representacion_interna',
  'g de representacion': 'representacion_interna',
  operativo_vehiculo: 'operativo_vehiculo',
  operativo_flota_general: 'operativo_flota_general',
};

/**
 * Subtipos oficiales adicionales (Excel) no siempre presentes en `factSubtiposGastos.json`.
 * Se fusionan con la unión Fact por categoría.
 */
const EXCEL_EXTRAS_POR_CATEGORIA: Partial<Record<FinanzaGastoRegistroValue, readonly string[]>> = {
  administrativo_empresa: [
    'administrativo_general',
    'EQUIPAMIENTO DE TALLER',
    'ÚTILES DE OFICINA',
    'MOBILIARIO',
    'ALOJAMIENTOS',
    'SERVICIOS DE LIMPIEZA',
    'PAPELERÍA',
  ],
  financiero_prestamo: [
    'prestamo',
    'cuota',
    'interes',
    'prestamo_interes_banca',
    'tarjeta_banco',
  ],
  inversion_compra: [
    // Subtipos canónicos nuevos (snake_case) — aparecen primero en filtros/historial
    'inversion_vehicular',
    'inversion_terreno',
    'inversion_inmueble',
    'inversion_general',
    'otros_activos',
    // Legacy (compatibilidad hacia atrás)
    'inversion_compra',
    'Adquisición vehículo',
    'LAPTOPS',
    'COMPUTADORAS',
    'EQUIPOS DE CÓMPUTO',
  ],
  representacion_interna: ['regalos', 'alojamientos'],
  gastos_globales: ['global_no_asignado'],
  planilla_laboral: [],
};

/** Alias normKey → valor canónico oficial (solo deduplicación en UI; no reescribe BD). */
export const SUBTIPO_ALIASES_NORM_KEY: Record<string, string> = {
  alojameintos: 'ALOJAMIENTOS',
  equipameinto_de_taller: 'EQUIPAMIENTO DE TALLER',
  prestamos: 'prestamo',
  intereses: 'interes',
  cuotas: 'cuota',
  adquisicion_vehiculo: 'Adquisición vehículo',
  adquisicion_auto: 'VEHÍCULO',
  vehiculo: 'VEHÍCULO',
  arreglo_linea_escape: 'arreglo_linea_escape',
  linea_escape: 'arreglo_linea_escape',
  tubo_escape: 'arreglo_linea_escape',
  silenciador: 'arreglo_linea_escape',
  mofle: 'arreglo_linea_escape',
  autoparte: 'autopartes',
  autopartes: 'autopartes',
  repuesto: 'autopartes',
  repuestos: 'autopartes',
};

function unionFactSubtiposForFinanza(cat: FinanzaGastoRegistroValue): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const factTipo of getFactTiposForFinanza(cat)) {
    for (const s of getSubtiposGasto(factTipo)) {
      const t = s.trim();
      if (!t) continue;
      const nk = normKey(t);
      if (seen.has(nk)) continue;
      seen.add(nk);
      out.push(t);
    }
  }
  return out;
}

function appendUniqueStable(target: string[], values: readonly string[]): void {
  const seen = new Set(target.map(normKey));
  for (const raw of values) {
    const t = raw.trim();
    if (!t) continue;
    const nk = normKey(t);
    if (seen.has(nk)) continue;
    seen.add(nk);
    target.push(t);
  }
}

function buildOficialesLista(cat: FinanzaGastoRegistroValue): readonly string[] {
  if (cat === 'operativo_vehiculo' || cat === 'operativo_flota_general') {
    return OPERATIVO_SUBTIPO_OPTIONS.map((o) => o.value);
  }
  if (cat === 'representacion_interna') {
    const base = [...SUBTIPOS_REPRESENTACION_INTERNA];
    appendUniqueStable(base, EXCEL_EXTRAS_POR_CATEGORIA.representacion_interna ?? []);
    return base;
  }
  const out: string[] = [];
  appendUniqueStable(out, EXCEL_EXTRAS_POR_CATEGORIA[cat] ?? []);
  appendUniqueStable(out, unionFactSubtiposForFinanza(cat));
  return out;
}

const FINANZA_CATEGORIAS_CON_CATALOGO: readonly FinanzaGastoRegistroValue[] = [
  'operativo_vehiculo',
  'operativo_flota_general',
  'administrativo_empresa',
  'financiero_prestamo',
  'planilla_laboral',
  'representacion_interna',
  'gastos_globales',
  'inversion_compra',
];

/** Listas oficiales por categoría financiera (orden estable: extras Excel → Fact → códigos). */
export const SUBTIPOS_OFICIALES_POR_CATEGORIA = Object.fromEntries(
  FINANZA_CATEGORIAS_CON_CATALOGO.map((cat) => [cat, buildOficialesLista(cat)]),
) as Record<FinanzaGastoRegistroValue, readonly string[]>;

export function resolveCategoriaFinanzaParaSubtipos(tipoGasto: string): FinanzaGastoRegistroValue | null {
  const t = tipoGasto.trim();
  if (t === 'financiero') return 'financiero_prestamo';
  if (t === 'inversion') return 'inversion_compra';
  if (t in SUBTIPOS_OFICIALES_POR_CATEGORIA) return t as FinanzaGastoRegistroValue;
  return null;
}

export function getOficialesSubtiposForCategoria(tipoGasto: string): readonly string[] {
  const cat = resolveCategoriaFinanzaParaSubtipos(tipoGasto);
  if (!cat) return [];
  return SUBTIPOS_OFICIALES_POR_CATEGORIA[cat];
}

export function isSubtipoOficialEnCategoria(tipoGasto: string, value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  const nk = normKey(v);
  for (const o of getOficialesSubtiposForCategoria(tipoGasto)) {
    if (normKey(o) === nk) return true;
  }
  const alias = SUBTIPO_ALIASES_NORM_KEY[nk];
  if (!alias) return false;
  for (const o of getOficialesSubtiposForCategoria(tipoGasto)) {
    if (normKey(o) === normKey(alias)) return true;
  }
  return false;
}

function resolveAliasOfficialNormKey(value: string, tipoGasto: string): string | null {
  const nk = normKey(value);
  const alias = SUBTIPO_ALIASES_NORM_KEY[nk];
  if (!alias) return null;
  const aNk = normKey(alias);
  for (const o of getOficialesSubtiposForCategoria(tipoGasto)) {
    if (normKey(o) === aNk) return aNk;
  }
  return null;
}

export function labelForSubtipoCatalogo(tipoGasto: string, value: string): string {
  const v = value.trim();
  if (!v) return '—';
  const cat = resolveCategoriaFinanzaParaSubtipos(tipoGasto);
  if (cat === 'representacion_interna') {
    const lab = getRepresentacionInternaSubtipoLabel(v);
    if (lab !== '—' && lab !== v) return lab;
    if (v === 'regalos') return 'Regalos';
    if (v === 'alojamientos') return 'Alojamientos';
  }
  if (cat === 'operativo_vehiculo' || cat === 'operativo_flota_general') {
    return getOperativoSubtipoLabel(v);
  }
  return getSubtipoFinancieroLabel(v, tipoGasto);
}

export function formatSubtipoOptionLabel(
  tipoGasto: string,
  opt: GastoSubtipoOption,
  showHistoricoBadge = true,
): string {
  const base = opt.label || labelForSubtipoCatalogo(tipoGasto, opt.value);
  if (showHistoricoBadge && opt.isHistorico) return `${base} (histórico)`;
  return base;
}

/**
 * Unión única: oficiales primero (orden estable), luego históricos reales no cubiertos por normKey/alias.
 */
export function mergeSubtiposHistoricosConOficiales(
  tipoGasto: string,
  historicos: Iterable<string> = [],
): GastoSubtipoOption[] {
  const cat = resolveCategoriaFinanzaParaSubtipos(tipoGasto);
  if (!cat) {
    const histOnly = [...historicos]
      .map((s) => s.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'es'));
    const seen = new Set<string>();
    return histOnly
      .filter((v) => {
        const nk = normKey(v);
        if (seen.has(nk)) return false;
        seen.add(nk);
        return true;
      })
      .map((value) => ({
        value,
        label: labelForSubtipoCatalogo(tipoGasto, value),
        isHistorico: true,
      }));
  }

  const oficial = getOficialesSubtiposForCategoria(cat);
  const seenNorm = new Set<string>();
  const out: GastoSubtipoOption[] = [];

  for (const raw of oficial) {
    const value = raw.trim();
    if (!value) continue;
    const nk = normKey(value);
    if (seenNorm.has(nk)) continue;
    seenNorm.add(nk);
    out.push({
      value,
      label: labelForSubtipoCatalogo(cat, value),
      isHistorico: false,
    });
  }

  const histSorted = [...historicos]
    .map((s) => s.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'es'));

  for (const value of histSorted) {
    const nk = normKey(value);
    if (seenNorm.has(nk)) continue;
    const aliasNk = resolveAliasOfficialNormKey(value, cat);
    if (aliasNk && seenNorm.has(aliasNk)) continue;
    seenNorm.add(nk);
    out.push({
      value,
      label: labelForSubtipoCatalogo(cat, value),
      isHistorico: true,
    });
  }

  return out;
}

export function collectHistoricosSubtiposForTipoGasto(
  gastos: readonly Pick<Gasto, 'tipo_gasto' | 'subtipo_gasto'>[],
  tipoGasto: string,
): string[] {
  const out = new Set<string>();
  for (const g of gastos) {
    if (!gastoMatchesTipoGasto(g as Gasto, tipoGasto)) continue;
    const s = g.subtipo_gasto?.trim();
    if (s) out.add(s);
  }
  return [...out];
}

/** Opciones de filtro / select con fila «Todos». */
export function buildSubtipoFilterSelectOptions(
  tipoGasto: string,
  gastos: readonly Pick<Gasto, 'tipo_gasto' | 'subtipo_gasto'>[],
  opts?: { todosLabel?: string; showHistoricoBadge?: boolean },
): { value: string; label: string }[] {
  const historicos = collectHistoricosSubtiposForTipoGasto(gastos, tipoGasto);
  const merged = mergeSubtiposHistoricosConOficiales(tipoGasto, historicos);
  logSubtipoMergeDiagnostico(tipoGasto, historicos, merged);
  const showBadge = opts?.showHistoricoBadge ?? false;
  return [
    { value: '', label: opts?.todosLabel ?? 'Todos subtipo' },
    ...merged.map((o) => ({
      value: o.value,
      label: formatSubtipoOptionLabel(tipoGasto, o, showBadge),
    })),
  ];
}

export function buildSubtipoFormSelectOptions(
  tipoGasto: string,
  gastos: readonly Pick<Gasto, 'tipo_gasto' | 'subtipo_gasto'>[] | undefined,
  factTipoSeleccionado?: string,
  extraHistoricos: Iterable<string> = [],
): GastoSubtipoOption[] {
  const historicos = [
    ...collectHistoricosSubtiposForTipoGasto(gastos ?? [], tipoGasto),
    ...extraHistoricos,
  ];
  const merged = mergeSubtiposHistoricosConOficiales(tipoGasto, historicos);
  logSubtipoMergeDiagnostico(tipoGasto, historicos, merged);
  if (!factTipoSeleccionado?.trim()) return merged;
  const forTipo = new Set(getSubtiposGasto(factTipoSeleccionado).map((s) => normKey(s)));
  return merged.filter((o) => o.isHistorico || forTipo.has(normKey(o.value)));
}

/** Diagnóstico DEV: merge por categoría. */
export function logSubtipoMergeDiagnostico(
  categoria: string,
  historicos: readonly string[],
  merged: readonly GastoSubtipoOption[],
): void {
  if (!import.meta.env.DEV) return;
  const oficiales = getOficialesSubtiposForCategoria(categoria);
  console.log('[gastosSubtipos merge]', {
    categoria,
    historicosEncontrados: [...historicos],
    oficialesExcelFact: [...oficiales],
    mergeFinal: merged.map((o) => ({
      value: o.value,
      label: o.label,
      isHistorico: Boolean(o.isHistorico),
    })),
  });
}
