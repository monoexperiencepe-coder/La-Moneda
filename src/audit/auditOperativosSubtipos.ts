/**
 * Auditoría read-only: subtipos operativo_vehiculo y operativo_flota_general.
 */
import type { Gasto } from '../data/types';
import { buildSubtipoSelectOptions } from '../constants/gastosSubtipos';
import {
  getOfficialOperativoSubtipoValues,
  OFFICIAL_OPERATIVO_SUBTIPO_VALUES,
} from '../constants/subtipos/operativoOficialCatalog';
import { LEGACY_SUBTIPO_ALIASES_NORM_KEY } from '../constants/subtipos/legacySubtipoAliases';
import {
  getOperativoSubtipoLabel,
  normalizeOperativoSubtipo,
  operativoSubtipoRequiresReview,
} from '../utils/operativoSubtipo';

const OPERATIVO_CATEGORIAS = ['operativo_vehiculo', 'operativo_flota_general'] as const;
type OperativoCategoria = (typeof OPERATIVO_CATEGORIAS)[number];

export type OperativoSubtipoConfidence = 'alta' | 'media' | 'baja';

export interface OperativoSubtipoSuggestion {
  id?: number | string;
  categoria: OperativoCategoria;
  subtipoActual: string;
  subtipoOficialSugerido: string | null;
  confianza: OperativoSubtipoConfidence;
  razon: string;
  requiresReview: boolean;
}

export interface OperativoCategoriaAuditSection {
  totalRegistros: number;
  officialCatalogCount: number;
  visibleOptions: string[];
  missingOfficial: string[];
  historicalMapped: OperativoSubtipoSuggestion[];
  historicalRequiresReview: OperativoSubtipoSuggestion[];
  hiddenLegacy: string[];
  byCurrentSubtipo: Record<string, number>;
  byOfficialSubtipo: Record<string, number>;
  /** Compat auditoría anterior */
  porSubtipoActual: Record<string, number>;
  subtiposOficiales: readonly string[];
  legacyOnly: OperativoSubtipoSuggestion[];
  suggestedMappings: OperativoSubtipoSuggestion[];
  lowConfidence: OperativoSubtipoSuggestion[];
  sinMapping: OperativoSubtipoSuggestion[];
  examples: OperativoSubtipoSuggestion[];
}

export interface OperativosSubtiposAuditPayload {
  totalRegistros: number;
  officialCatalogCount: number;
  visibleOptions: string[];
  missingOfficial: string[];
  historicalMapped: OperativoSubtipoSuggestion[];
  historicalRequiresReview: OperativoSubtipoSuggestion[];
  hiddenLegacy: string[];
  top50SubtiposHistoricos: Array<{ subtipo: string; count: number; porCategoria: Record<string, number> }>;
  operativo_vehiculo: OperativoCategoriaAuditSection;
  operativo_flota_general: OperativoCategoriaAuditSection;
}

type GastoOperativoRow = Pick<Gasto, 'id' | 'tipo_gasto' | 'subtipo_gasto' | 'motivo' | 'comentarios' | 'tipo' | 'subTipo'>;

function suggestFromGasto(g: GastoOperativoRow, categoria: OperativoCategoria): OperativoSubtipoSuggestion {
  const actual = (g.subtipo_gasto ?? '').trim() || '(vacío)';
  const sugerido = normalizeOperativoSubtipo(actual);
  const requiresReview = operativoSubtipoRequiresReview(actual);
  return {
    id: g.id,
    categoria,
    subtipoActual: actual,
    subtipoOficialSugerido: sugerido,
    confianza: sugerido ? 'alta' : 'baja',
    razon: sugerido
      ? actual === sugerido
        ? 'ya es subtipo oficial'
        : `mapeo histórico → ${sugerido}`
      : 'sin mapping al catálogo oficial',
    requiresReview,
  };
}

function auditCategoria(
  categoria: OperativoCategoria,
  gastos: readonly GastoOperativoRow[],
): OperativoCategoriaAuditSection {
  const rows = gastos.filter((g) => g.tipo_gasto === categoria);
  const porSubtipoActual: Record<string, number> = {};
  const byOfficialSubtipo: Record<string, number> = {};
  const historicalMapped: OperativoSubtipoSuggestion[] = [];
  const historicalRequiresReview: OperativoSubtipoSuggestion[] = [];
  const hiddenLegacySet = new Set<string>();

  for (const g of rows) {
    const actual = (g.subtipo_gasto ?? '').trim() || '(vacío)';
    porSubtipoActual[actual] = (porSubtipoActual[actual] ?? 0) + 1;

    const entry = suggestFromGasto(g, categoria);
    if (entry.requiresReview) {
      historicalRequiresReview.push(entry);
      hiddenLegacySet.add(actual);
    } else if (entry.subtipoOficialSugerido && entry.subtipoActual !== entry.subtipoOficialSugerido) {
      historicalMapped.push(entry);
    }

    const official = entry.subtipoOficialSugerido ?? normalizeOperativoSubtipo(actual);
    if (official) {
      byOfficialSubtipo[official] = (byOfficialSubtipo[official] ?? 0) + 1;
    }
  }

  const visibleOptions = buildSubtipoSelectOptions(categoria, gastos).map((o) => o.value);
  const officialSet = new Set<string>(OFFICIAL_OPERATIVO_SUBTIPO_VALUES);
  const missingOfficial = visibleOptions.filter((v) => !officialSet.has(v));

  const lowConfidence = [...historicalMapped, ...historicalRequiresReview].filter(
    (e) => e.confianza !== 'alta',
  );

  return {
    totalRegistros: rows.length,
    officialCatalogCount: OFFICIAL_OPERATIVO_SUBTIPO_VALUES.length,
    visibleOptions,
    missingOfficial,
    historicalMapped,
    historicalRequiresReview,
    hiddenLegacy: [...hiddenLegacySet].sort((a, b) => a.localeCompare(b, 'es')),
    byCurrentSubtipo: porSubtipoActual,
    byOfficialSubtipo,
    porSubtipoActual,
    subtiposOficiales: getOfficialOperativoSubtipoValues(),
    legacyOnly: historicalRequiresReview,
    suggestedMappings: [...historicalMapped, ...historicalRequiresReview],
    lowConfidence,
    sinMapping: historicalRequiresReview,
    examples: [...historicalMapped, ...historicalRequiresReview].slice(0, 25),
  };
}

function buildTop50Historicos(
  gastos: readonly GastoOperativoRow[],
): OperativosSubtiposAuditPayload['top50SubtiposHistoricos'] {
  const counts = new Map<string, Record<string, number>>();
  for (const cat of OPERATIVO_CATEGORIAS) {
    for (const g of gastos.filter((x) => x.tipo_gasto === cat)) {
      const s = (g.subtipo_gasto ?? '').trim() || '(vacío)';
      const row = counts.get(s) ?? {};
      row[cat] = (row[cat] ?? 0) + 1;
      counts.set(s, row);
    }
  }
  return [...counts.entries()]
    .map(([subtipo, porCategoria]) => ({
      subtipo,
      count: Object.values(porCategoria).reduce((a, b) => a + b, 0),
      porCategoria,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);
}

export function auditOperativosSubtipos(
  gastos: readonly GastoOperativoRow[],
): OperativosSubtiposAuditPayload {
  const veh = auditCategoria('operativo_vehiculo', gastos);
  const flota = auditCategoria('operativo_flota_general', gastos);
  const visibleOptions = [
    ...new Set([...veh.visibleOptions, ...flota.visibleOptions]),
  ].sort((a, b) => a.localeCompare(b, 'es'));

  return {
    totalRegistros: veh.totalRegistros + flota.totalRegistros,
    officialCatalogCount: OFFICIAL_OPERATIVO_SUBTIPO_VALUES.length,
    visibleOptions,
    missingOfficial: [...new Set([...veh.missingOfficial, ...flota.missingOfficial])],
    historicalMapped: [...veh.historicalMapped, ...flota.historicalMapped],
    historicalRequiresReview: [
      ...veh.historicalRequiresReview,
      ...flota.historicalRequiresReview,
    ],
    hiddenLegacy: [...new Set([...veh.hiddenLegacy, ...flota.hiddenLegacy])].sort((a, b) =>
      a.localeCompare(b, 'es'),
    ),
    top50SubtiposHistoricos: buildTop50Historicos(gastos),
    operativo_vehiculo: veh,
    operativo_flota_general: flota,
  };
}

export function logOperativosSubtiposAudit(
  gastos: readonly GastoOperativoRow[],
): OperativosSubtiposAuditPayload {
  const payload = auditOperativosSubtipos(gastos);
  console.log('[operativos:audit-subtipos]', payload);
  console.log('[operativos:audit-subtipos:aliases]', {
    operativoLegacyNormKeys: Object.entries(LEGACY_SUBTIPO_ALIASES_NORM_KEY).filter(([, v]) =>
      (OFFICIAL_OPERATIVO_SUBTIPO_VALUES as readonly string[]).includes(v),
    ),
  });
  return payload;
}

/** Etiqueta de visualización (histórico → oficial). */
export function labelOperativoSubtipoForDisplay(
  tipoGasto: string,
  subtipo: string | null | undefined,
): string {
  void tipoGasto;
  return getOperativoSubtipoLabel(subtipo);
}
