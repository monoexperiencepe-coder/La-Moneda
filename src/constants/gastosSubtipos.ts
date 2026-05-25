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
import { INVERSION_SUBTIPO_OPTIONS } from '../utils/inversionSubtipo';
import {
  getRepresentacionInternaSubtipoLabel,
  normalizeRepresentacionInternaSubtipo,
} from '../utils/representacionInternaSubtipoLabel';
import { getOperativoSubtipoLabel, resolveOperativoSubtipoGastoCanon } from '../utils/operativoSubtipo';
import { getInversionSubtipoDedupeKey, getInversionSubtipoLabel, normalizeInversionSubtipo } from '../utils/inversionSubtipo';
import {
  ADMINISTRATIVO_SUBTIPO_OPTIONS,
  getAdministrativoSubtipoLabel,
  normalizeAdministrativoSubtipo,
  resolveAdministrativoSubtipoGastoCanon,
} from '../utils/administrativoSubtipo';
import { getSubtipoFinancieroLabel, normKey } from '../utils/subtipoFinancieroLabel';
import { tipoGastoUsaSubtipoOperativo } from '../utils/gastoMoveCategoriaDefaults';
import { dedupeOptionsByKey } from '../utils/dedupeSelectOptions';
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
    'movilidad',
    'multas_callao',
    'atu',
    'sat',
    'sunarp',
    'sunat',
    'sutran',
    'taxi',
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
    'adquisicion_vehiculo',
    'compra_terreno',
    'acondicionamiento_areas',
    'laptops',
    'electrodomesticos',
    'sistema_seguridad',
    'equipamiento_taller',
    'compra_software_gestion',
    'muebles_enseres',
    'equipamiento_oficina',
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
  adquisicion_auto: 'adquisicion_vehiculo',
  vehiculo: 'adquisicion_vehiculo',
  inversion_vehicular: 'adquisicion_vehiculo',
  compra_activo_vehiculo: 'adquisicion_vehiculo',
  inversion_terreno: 'compra_terreno',
  terreno: 'compra_terreno',
  laptops: 'laptops',
  computadoras: 'laptops',
  equipos_de_computo: 'laptops',
  arreglo_linea_escape: 'arreglo_linea_escape',
  linea_escape: 'arreglo_linea_escape',
  tubo_escape: 'arreglo_linea_escape',
  silenciador: 'arreglo_linea_escape',
  mofle: 'arreglo_linea_escape',
  autoparte: 'autopartes',
  autopartes: 'autopartes',
  repuesto: 'autopartes',
  repuestos: 'autopartes',
  movilidad: 'movilidad',
  pasaje: 'movilidad',
  pasajes: 'movilidad',
  traslado: 'movilidad',
  traslados: 'movilidad',
  multas_callao: 'multas_callao',
  multa_callao: 'multas_callao',
  'multas callao': 'multas_callao',
  atu: 'atu',
  'autorizacion atu': 'atu',
  sat: 'sat',
  sunarp: 'sunarp',
  suanrp: 'sunarp',
  sunat: 'sunat',
  sutran: 'sutran',
  taxi: 'taxi',
  'rt-taxi': 'taxi',
  'rt taxi': 'taxi',
  'revision tecnica taxi': 'taxi',
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

const FINANZA_CATEGORIAS_SET = new Set<string>(FINANZA_CATEGORIAS_CON_CATALOGO);

/** Resuelve tipo_gasto → categoría de catálogo. NO depende de SUBTIPOS_OFICIALES_POR_CATEGORIA. */
export function resolveCategoriaFinanzaParaSubtipos(tipoGasto: string): FinanzaGastoRegistroValue | null {
  const t = tipoGasto.trim();
  if (t === 'financiero') return 'financiero_prestamo';
  if (t === 'inversion') return 'inversion_compra';
  if (FINANZA_CATEGORIAS_SET.has(t)) return t as FinanzaGastoRegistroValue;
  return null;
}

/** Dedupe key cuando la categoría ya es conocida (evita TDZ durante init del catálogo). */
function getSubtipoOptionDedupeKeyForCat(cat: FinanzaGastoRegistroValue, value: string): string {
  const v = value.trim();
  if (!v) return '';
  if (cat === 'inversion_compra') return getInversionSubtipoDedupeKey(v);
  if (cat === 'administrativo_empresa') {
    return resolveAdministrativoSubtipoGastoCanon(v) ?? normKey(v);
  }
  if (cat === 'representacion_interna') {
    return normalizeRepresentacionInternaSubtipo(v) || normKey(v);
  }
  if (tipoGastoUsaSubtipoOperativo(cat)) {
    return resolveOperativoSubtipoGastoCanon(v) ?? normKey(v);
  }
  return normKey(v);
}

/** Valor canónico cuando la categoría ya es conocida. */
function getSubtipoOptionCanonicalValueForCat(cat: FinanzaGastoRegistroValue, value: string): string {
  const v = value.trim();
  if (!v) return v;
  if (cat === 'inversion_compra') return normalizeInversionSubtipo(v) ?? v;
  if (cat === 'administrativo_empresa') {
    return normalizeAdministrativoSubtipo(v) ?? v;
  }
  if (cat === 'representacion_interna') {
    return normalizeRepresentacionInternaSubtipo(v) || v;
  }
  if (tipoGastoUsaSubtipoOperativo(cat)) {
    return resolveOperativoSubtipoGastoCanon(v) ?? v;
  }
  return v;
}

/** Clave de deduplicación UI: colapsa alias/canónicos (inversión, operativo, representación). */
export function getSubtipoOptionDedupeKey(tipoGasto: string, value: string): string {
  const v = value.trim();
  if (!v) return '';
  const cat = resolveCategoriaFinanzaParaSubtipos(tipoGasto);
  if (cat) return getSubtipoOptionDedupeKeyForCat(cat, v);
  return normKey(v);
}

/** Valor preferido en selects (canónico cuando aplica). */
export function getSubtipoOptionCanonicalValue(tipoGasto: string, value: string): string {
  const v = value.trim();
  if (!v) return v;
  const cat = resolveCategoriaFinanzaParaSubtipos(tipoGasto);
  if (cat) return getSubtipoOptionCanonicalValueForCat(cat, v);
  return v;
}

function appendFactSubtiposSinDuplicarCanon(
  target: string[],
  cat: FinanzaGastoRegistroValue,
  factValues: readonly string[],
): void {
  const seenKeys = new Set(target.map((v) => getSubtipoOptionDedupeKeyForCat(cat, v)));
  for (const raw of factValues) {
    const t = raw.trim();
    if (!t) continue;
    const dedupeKey = getSubtipoOptionDedupeKeyForCat(cat, t);
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
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
  if (cat === 'administrativo_empresa') {
    const out: string[] = ADMINISTRATIVO_SUBTIPO_OPTIONS.map((o) => o.value);
    appendUniqueStable(out, EXCEL_EXTRAS_POR_CATEGORIA.administrativo_empresa ?? []);
    appendFactSubtiposSinDuplicarCanon(out, cat, unionFactSubtiposForFinanza(cat));
    return out.map((v) => getSubtipoOptionCanonicalValueForCat(cat, v));
  }
  if (cat === 'inversion_compra') {
    return INVERSION_SUBTIPO_OPTIONS.map((o) => o.value);
  }
  const out: string[] = [];
  appendUniqueStable(out, EXCEL_EXTRAS_POR_CATEGORIA[cat] ?? []);
  appendUniqueStable(out, unionFactSubtiposForFinanza(cat));
  return out;
}

/** Listas oficiales por categoría financiera (orden estable: extras Excel → Fact → códigos). */
export const SUBTIPOS_OFICIALES_POR_CATEGORIA = Object.fromEntries(
  FINANZA_CATEGORIAS_CON_CATALOGO.map((cat) => [cat, buildOficialesLista(cat)]),
) as Record<FinanzaGastoRegistroValue, readonly string[]>;

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
  if (cat === 'administrativo_empresa') {
    return getAdministrativoSubtipoLabel(v);
  }
  if (cat === 'inversion_compra') {
    return getInversionSubtipoLabel(v);
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
 * Unión única: oficiales primero (orden estable), luego históricos no cubiertos por clave canónica.
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
  const seenDedupe = new Set<string>();
  const out: GastoSubtipoOption[] = [];

  const pushOption = (raw: string, isHistorico: boolean) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const dedupeKey = getSubtipoOptionDedupeKeyForCat(cat, trimmed);
    if (seenDedupe.has(dedupeKey)) return;
    const aliasNk = resolveAliasOfficialNormKey(trimmed, cat);
    if (aliasNk && seenDedupe.has(aliasNk)) return;
    seenDedupe.add(dedupeKey);
    const canonValue = getSubtipoOptionCanonicalValueForCat(cat, trimmed);
    out.push({
      value: canonValue,
      label: labelForSubtipoCatalogo(cat, canonValue),
      isHistorico,
    });
  };

  for (const raw of oficial) pushOption(raw, false);

  const histSorted = [...historicos]
    .map((s) => s.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'es'));

  for (const value of histSorted) pushOption(value, true);

  return dedupeOptionsByKey(out, (o) => getSubtipoOptionDedupeKeyForCat(cat, o.value));
}

/** Opciones listas para Select: deduplicadas por valor canónico. */
export function buildSubtipoSelectOptions(
  tipoGasto: string,
  gastos: readonly Pick<Gasto, 'tipo_gasto' | 'subtipo_gasto'>[] | undefined,
  extraHistoricos: Iterable<string> = [],
  opts?: { showHistoricoBadge?: boolean },
): { value: string; label: string }[] {
  const historicos = [
    ...collectHistoricosSubtiposForTipoGasto(gastos ?? [], tipoGasto),
    ...extraHistoricos,
  ];
  const merged = mergeSubtiposHistoricosConOficiales(tipoGasto, historicos);
  const showBadge = opts?.showHistoricoBadge ?? false;
  return merged.map((o) => ({
    value: o.value,
    label: formatSubtipoOptionLabel(tipoGasto, o, showBadge),
  }));
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
  const options = merged.map((o) => ({
    value: o.value,
    label: formatSubtipoOptionLabel(tipoGasto, o, showBadge),
  }));
  return [
    { value: '', label: opts?.todosLabel ?? 'Todos subtipo' },
    ...dedupeOptionsByKey(options, (o) =>
      o.value ? getSubtipoOptionDedupeKey(tipoGasto, o.value) : '__todos__',
    ),
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
