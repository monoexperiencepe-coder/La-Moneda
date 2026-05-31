/**
 * Catálogo híbrido de subtipos por categoría financiera (`tipo_gasto`).
 * Fuente oficial: Excel (officialSubtiposCatalog) + históricos en memoria (BD).
 */
import type { FinanzaGastoRegistroValue } from '../data/finanzaGastoRegistro';
import { getSubtiposGasto } from '../data/factCatalog';
import { dedupeOptionsByKey } from '../utils/dedupeSelectOptions';
import { gastoMatchesTipoGasto } from '../utils/gastosTipoGasto';
import { normKey } from '../utils/normKey';
import type { Gasto } from '../data/types';
import {
  buildUnifiedSubtipoCatalog,
  getOficialesSubtiposForCategoria as getOficialesUnified,
  getUnifiedSubtipoLabel,
  isSubtipoOficialEnCategoria as isOficialUnified,
} from './subtipos/buildUnifiedSubtipoCatalog';
import { LEGACY_SUBTIPO_ALIASES_NORM_KEY, resolveLegacyAliasNormKey } from './subtipos/legacySubtipoAliases';
import {
  getCanonicalSubtipoDedupeKeyFull,
  resolveCanonicalSubtipoValueFull,
} from './subtipos/subtipoCanonicalResolve';
import {
  FINANZA_CATEGORIAS_CON_CATALOGO,
  resolveCategoriaFinanzaParaSubtipos,
  type GastoSubtipoCategoria,
} from './subtipos/subtipoCategoria';
import { subtipoBelongsToCategoria } from './subtipos/subtipoBelongsToCategoria';
import { OPERATIVO_SUBTIPO_REQUIERE_REVISION } from './subtipos/operativoOficialCatalog';
import { operativoSubtipoRequiresReview } from '../utils/operativoSubtipo';

export type { GastoSubtipoCategoria };
export { resolveCategoriaFinanzaParaSubtipos, FINANZA_CATEGORIAS_CON_CATALOGO };
export { LEGACY_SUBTIPO_ALIASES_NORM_KEY as SUBTIPO_ALIASES_NORM_KEY };

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

function getSubtipoOptionDedupeKeyForCat(cat: FinanzaGastoRegistroValue, value: string): string {
  return getCanonicalSubtipoDedupeKeyFull(cat, value);
}

function getSubtipoOptionCanonicalValueForCat(cat: FinanzaGastoRegistroValue, value: string): string {
  return resolveCanonicalSubtipoValueFull(cat, value);
}

export function getSubtipoOptionDedupeKey(tipoGasto: string, value: string): string {
  const v = value.trim();
  if (!v) return '';
  const cat = resolveCategoriaFinanzaParaSubtipos(tipoGasto);
  if (cat) return getSubtipoOptionDedupeKeyForCat(cat, v);
  return normKey(v);
}

export function getSubtipoOptionCanonicalValue(tipoGasto: string, value: string): string {
  const v = value.trim();
  if (!v) return v;
  const cat = resolveCategoriaFinanzaParaSubtipos(tipoGasto);
  if (cat) return getSubtipoOptionCanonicalValueForCat(cat, v);
  return v;
}

/** Listas oficiales por categoría (Excel, deduplicadas). Lazy — no construir al cargar módulo. */
export function getSubtiposOficialesPorCategoriaMap(): Record<
  FinanzaGastoRegistroValue,
  readonly string[]
> {
  return Object.fromEntries(
    FINANZA_CATEGORIAS_CON_CATALOGO.map((cat) => [cat, getOficialesUnified(cat)]),
  ) as Record<FinanzaGastoRegistroValue, readonly string[]>;
}

export function getOficialesSubtiposForCategoria(tipoGasto: string): readonly string[] {
  return getOficialesUnified(tipoGasto);
}

export function isSubtipoOficialEnCategoria(tipoGasto: string, value: string): boolean {
  return isOficialUnified(tipoGasto, value);
}

export function labelForSubtipoCatalogo(tipoGasto: string, value: string): string {
  return getUnifiedSubtipoLabel(tipoGasto, value);
}

export function formatSubtipoOptionLabel(
  tipoGasto: string,
  opt: GastoSubtipoOption,
  showHistoricoBadge = true,
): string {
  const base = opt.label || labelForSubtipoCatalogo(tipoGasto, opt.value);
  if (showHistoricoBadge && opt.isHistorico) return `${base} (legacy)`;
  return base;
}

/**
 * Unión única: oficiales Excel primero, luego históricos BD no cubiertos por dedupe.
 */
export function mergeSubtiposHistoricosConOficiales(
  tipoGasto: string,
  historicos: Iterable<string> = [],
): GastoSubtipoOption[] {
  const { options } = buildUnifiedSubtipoCatalog(tipoGasto, historicos, { showLegacyBadge: false });
  return options.map((o) => ({
    value: o.value,
    label: o.label,
    isHistorico: o.isLegacy,
  }));
}

function isOperativoTipoGasto(tipoGasto: string): boolean {
  const cat = resolveCategoriaFinanzaParaSubtipos(tipoGasto);
  return cat === 'operativo_vehiculo' || cat === 'operativo_flota_general';
}

export function buildSubtipoSelectOptions(
  tipoGasto: string,
  gastos: readonly Pick<Gasto, 'tipo_gasto' | 'subtipo_gasto'>[] | undefined,
  extraHistoricos: Iterable<string> = [],
  opts?: { showHistoricoBadge?: boolean },
): { value: string; label: string }[] {
  const extrasFiltered = [...extraHistoricos]
    .map((s) => s.trim())
    .filter((s) => s && subtipoBelongsToCategoria(tipoGasto, s));
  const historicos = isOperativoTipoGasto(tipoGasto)
    ? []
    : [
        ...collectHistoricosSubtiposForTipoGasto(gastos ?? [], tipoGasto),
        ...extrasFiltered,
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

export function buildSubtipoFilterSelectOptions(
  tipoGasto: string,
  gastos: readonly Pick<Gasto, 'tipo_gasto' | 'subtipo_gasto'>[],
  opts?: { todosLabel?: string; showHistoricoBadge?: boolean },
): { value: string; label: string }[] {
  const historicos = isOperativoTipoGasto(tipoGasto)
    ? []
    : collectHistoricosSubtiposForTipoGasto(gastos, tipoGasto);
  const merged = mergeSubtiposHistoricosConOficiales(tipoGasto, historicos);
  const showBadge = opts?.showHistoricoBadge ?? true;
  const options = merged.map((o) => ({
    value: o.value,
    label: formatSubtipoOptionLabel(tipoGasto, o, showBadge),
  }));
  const base = [
    { value: '', label: opts?.todosLabel ?? 'Todos subtipo' },
    ...dedupeOptionsByKey(options, (o) =>
      o.value ? getSubtipoOptionDedupeKey(tipoGasto, o.value) : '__todos__',
    ),
  ];
  if (isOperativoTipoGasto(tipoGasto)) {
    const needsReview = gastos.some(
      (g) =>
        g.tipo_gasto === tipoGasto && operativoSubtipoRequiresReview(g.subtipo_gasto),
    );
    if (needsReview) {
      base.push({
        value: OPERATIVO_SUBTIPO_REQUIERE_REVISION,
        label: 'Requiere revisión (histórico sin mapping)',
      });
    }
  }
  return base;
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
  if (
    tipoGasto === 'inversion_compra'
    || tipoGasto === 'financiero_prestamo'
    || tipoGasto === 'administrativo_empresa'
  ) {
    return merged;
  }
  if (!factTipoSeleccionado?.trim()) return merged;
  const forTipo = new Set(getSubtiposGasto(factTipoSeleccionado).map((s) => normKey(s)));
  return merged.filter((o) => o.isHistorico || forTipo.has(normKey(o.value)));
}

export function buildCanonicalInversionSubtipoSelectOptions(): { value: string; label: string }[] {
  return buildSubtipoSelectOptions('inversion_compra', undefined);
}

export function getCanonicalInversionSubtipoValues(): readonly string[] {
  return getOficialesSubtiposForCategoria('inversion_compra');
}

export function buildInversionSubtipoSelectOptions(
  gastos: readonly Pick<Gasto, 'tipo_gasto' | 'subtipo_gasto'>[] | undefined,
  extraHistoricos: Iterable<string> = [],
  opts?: { showHistoricoBadge?: boolean },
): { value: string; label: string }[] {
  return buildSubtipoSelectOptions('inversion_compra', gastos, extraHistoricos, opts);
}

export function logSubtipoInversionDebug(opts: {
  source: string;
  categoria: string;
  options: readonly { value: string; label: string }[];
}): void {
  if (!import.meta.env.DEV) return;
  if (opts.categoria !== 'inversion_compra') return;
  console.log('[subtipos:inversion]', {
    source: opts.source,
    categoria: opts.categoria,
    optionsCount: opts.options.length,
    options: opts.options.map((o) => ({ value: o.value, label: o.label })),
    canonicalValues: [...getCanonicalInversionSubtipoValues()],
  });
}

export function logSubtipoMoverOperativoVehiculoDebug(opts: {
  role?: string | null;
  categoriaSeleccionada: string;
  options: readonly { value: string; label: string }[];
}): void {
  if (!import.meta.env.DEV) return;
  if (opts.categoriaSeleccionada !== 'operativo_vehiculo') return;
  const options = opts.options.map((o) => ({ value: o.value, label: o.label }));
  console.log('[subtipos:mover:operativo_vehiculo]', {
    role: opts.role ?? null,
    categoriaSeleccionada: opts.categoriaSeleccionada,
    subtiposCount: options.length,
    hasRevisionTecnicaTaxi: options.some((o) => o.value === 'revision_tecnica_taxi'),
    hasRevisionTecnicaParticular: options.some((o) => o.value === 'revision_tecnica_particular'),
    options,
  });
}

export function logSubtipoMergeDiagnostico(
  categoria: string,
  historicos: readonly string[],
  merged: readonly GastoSubtipoOption[],
): void {
  if (!import.meta.env.DEV) return;
  buildUnifiedSubtipoCatalog(categoria, historicos);
  console.log('[gastosSubtipos merge]', {
    categoria,
    historicosEncontrados: [...historicos],
    mergeFinal: merged.map((o) => ({
      value: o.value,
      label: o.label,
      isHistorico: Boolean(o.isHistorico),
    })),
  });
}

export { buildUnifiedSubtipoCatalog } from './subtipos/buildUnifiedSubtipoCatalog';
export {
  resolveCanonicalSubtipoValue,
  resolveLegacyAliasNormKey,
  legacyTextMatchesSubtipo,
} from './subtipos/legacySubtipoAliases';
