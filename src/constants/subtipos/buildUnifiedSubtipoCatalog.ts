/**
 * Catálogo unificado: oficiales Excel + históricos BD, con dedupe y aliases.
 */
import type { FinanzaGastoRegistroValue } from '../../data/finanzaGastoRegistro';
import {
  getOfficialSubtipoLabel,
  getOfficialSubtiposForCategoria,
  type OfficialSubtipoCategoria,
} from './officialSubtiposCatalog';
import {
  getCanonicalSubtipoDedupeKeyFull,
  resolveCanonicalSubtipoValueFull,
} from './subtipoCanonicalResolve';
import { resolveLegacyAliasNormKey } from './legacySubtipoAliases';
import { subtipoBelongsToCategoria } from './subtipoBelongsToCategoria';
import { resolveCategoriaFinanzaParaSubtipos } from './subtipoCategoria';
import { subtipoDedupeKey } from './subtipoDedupeKey';
import { isVerboseDebug } from '../../config/verboseDebug';

export interface UnifiedSubtipoOption {
  value: string;
  label: string;
  isLegacy: boolean;
}

export interface UnifiedSubtipoCatalogResult {
  options: UnifiedSubtipoOption[];
  stats: {
    officialCount: number;
    legacyCount: number;
    mergedCount: number;
    duplicatesRemoved: number;
    aliasesResolved: number;
  };
}

/** Label preferido cuando varias filas Excel comparten el mismo valor canónico. */
const PREFERRED_OFFICIAL_LABEL: Partial<Record<OfficialSubtipoCategoria, Record<string, string>>> = {
  financiero_prestamo: {},
  administrativo_empresa: {
    TAXI: 'Taxi',
  },
};

const OPERATIVO_CATEGORIAS = new Set<OfficialSubtipoCategoria>([
  'operativo_vehiculo',
  'operativo_flota_general',
]);

function resolveOfficialCategoria(tipoGasto: string): OfficialSubtipoCategoria | null {
  const cat = resolveCategoriaFinanzaParaSubtipos(tipoGasto);
  if (!cat) return null;
  if (cat === 'planilla_laboral' || cat === 'gastos_globales') return null;
  return cat as OfficialSubtipoCategoria;
}

function labelForUnifiedOption(
  categoria: OfficialSubtipoCategoria,
  canonValue: string,
  fallbackLabel: string,
  isLegacy: boolean,
): string {
  const preferred = PREFERRED_OFFICIAL_LABEL[categoria]?.[canonValue];
  if (preferred) return preferred;
  const official = getOfficialSubtipoLabel(categoria, canonValue);
  if (official) return official;
  return fallbackLabel || canonValue;
}

export function buildUnifiedSubtipoCatalog(
  tipoGasto: string,
  historicos: Iterable<string> = [],
  opts?: { showLegacyBadge?: boolean },
): UnifiedSubtipoCatalogResult {
  const categoria = resolveOfficialCategoria(tipoGasto);
  const showLegacyBadge = opts?.showLegacyBadge ?? false;
  let aliasesResolved = 0;
  let duplicatesRemoved = 0;

  if (!categoria) {
    const histOnly = [...historicos]
      .map((s) => s.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'es'));
    const seen = new Set<string>();
    const options: UnifiedSubtipoOption[] = [];
    for (const raw of histOnly) {
      const dk = subtipoDedupeKey(raw);
      if (seen.has(dk)) {
        duplicatesRemoved += 1;
        continue;
      }
      seen.add(dk);
      options.push({ value: raw, label: raw, isLegacy: true });
    }
    return {
      options,
      stats: {
        officialCount: 0,
        legacyCount: options.length,
        mergedCount: options.length,
        duplicatesRemoved,
        aliasesResolved: 0,
      },
    };
  }

  const officials = getOfficialSubtiposForCategoria(categoria);
  const seenDedupe = new Set<string>();
  const options: UnifiedSubtipoOption[] = [];
  let officialCount = 0;

  for (const entry of officials) {
    const canon = resolveCanonicalSubtipoValueFull(categoria, entry.value);
    const dedupeKey = getCanonicalSubtipoDedupeKeyFull(categoria, canon);
    if (resolveLegacyAliasNormKey(entry.value)) aliasesResolved += 1;
    if (seenDedupe.has(dedupeKey)) {
      duplicatesRemoved += 1;
      continue;
    }
    seenDedupe.add(dedupeKey);
    officialCount += 1;
    options.push({
      value: canon,
      label: labelForUnifiedOption(categoria, canon, entry.label, false),
      isLegacy: false,
    });
  }

  const histSorted = OPERATIVO_CATEGORIAS.has(categoria)
    ? []
    : [...historicos]
        .map((s) => s.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'es'));

  let legacyCount = 0;
  for (const raw of histSorted) {
    if (!subtipoBelongsToCategoria(categoria, raw)) {
      duplicatesRemoved += 1;
      continue;
    }
    const aliasBefore = resolveLegacyAliasNormKey(raw);
    const canon = resolveCanonicalSubtipoValueFull(categoria, raw);
    if (aliasBefore) aliasesResolved += 1;
    const dedupeKey = getCanonicalSubtipoDedupeKeyFull(categoria, canon);
    if (seenDedupe.has(dedupeKey)) {
      duplicatesRemoved += 1;
      continue;
    }
    seenDedupe.add(dedupeKey);
    legacyCount += 1;
    const label = labelForUnifiedOption(categoria, canon, raw, true);
    options.push({
      value: canon,
      label: showLegacyBadge ? `${label} (legacy)` : label,
      isLegacy: true,
    });
  }

  const result: UnifiedSubtipoCatalogResult = {
    options,
    stats: {
      officialCount,
      legacyCount,
      mergedCount: options.length,
      duplicatesRemoved,
      aliasesResolved,
    },
  };

  if (import.meta.env.DEV && isVerboseDebug()) {
    console.log('[subtipos:catalog]', {
      categoria,
      ...result.stats,
    });
  }

  return result;
}

export function getUnifiedSubtipoLabel(tipoGasto: string, value: string): string {
  const v = value.trim();
  if (!v) return '—';
  const categoria = resolveOfficialCategoria(tipoGasto);
  if (!categoria) return v;
  const canon = resolveCanonicalSubtipoValueFull(categoria, v);
  return labelForUnifiedOption(categoria, canon, v, false);
}

/** Oficiales por categoría (valores canónicos únicos, orden Excel). */
export function getOficialesSubtiposForCategoria(tipoGasto: string): readonly string[] {
  const categoria = resolveOfficialCategoria(tipoGasto);
  if (!categoria) return [];
  const { options } = buildUnifiedSubtipoCatalog(tipoGasto, [], { showLegacyBadge: false });
  return options.filter((o) => !o.isLegacy).map((o) => o.value);
}

export function isSubtipoOficialEnCategoria(tipoGasto: string, value: string): boolean {
  const categoria = resolveOfficialCategoria(tipoGasto);
  if (!categoria) return false;
  const canon = resolveCanonicalSubtipoValueFull(categoria, value);
  const key = getCanonicalSubtipoDedupeKeyFull(categoria, canon);
  return getOfficialSubtiposForCategoria(categoria).some(
    (o) => getCanonicalSubtipoDedupeKeyFull(categoria, resolveCanonicalSubtipoValueFull(categoria, o.value)) === key,
  );
}

export type { FinanzaGastoRegistroValue };
