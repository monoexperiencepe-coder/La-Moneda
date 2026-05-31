/**
 * Auditoría unificada de calidad de subtipos + sugerencias de conciliación (solo lectura).
 */
import type { Gasto } from '../data/types';
import { mapSubtipoToFactTipo } from '../constants/subtipos/mapSubtipoToFactTipo';
import { subtipoDedupeKey } from '../constants/subtipos/subtipoDedupeKey';
import { normKey } from '../utils/normKey';
import { inferCategoriaFromTipoGasto } from '../utils/factMappers';
import { resolveSubtipoCanonForGastoEdit } from '../utils/gastoMoveCategoriaDefaults';
import { motivoFromSubtipoCanon } from '../utils/gastoEditSubtipoMotivo';
import {
  auditSubtipoFactData,
  inferFactFromFinancialSubtipo,
  type OfficialSubtipoCategoria,
} from './auditSubtipoFact';
import { suggestAdministrativoFromGasto } from './auditAdministrativosSubtipos';
import { suggestFinancieroFromText } from './auditFinancierosSubtipos';
import { getDataQualityLocalAction } from '../data/dataQualitySubtipoStore';
import {
  hasRealSubtipoChange,
  isAutoApplyEligible,
  refineDataQualityConfidence,
  transitionKey,
} from './dataQualitySubtipoPolicy';

const AUDIT_CATEGORIAS: OfficialSubtipoCategoria[] = [
  'administrativo_empresa',
  'operativo_vehiculo',
  'operativo_flota_general',
  'representacion_interna',
  'inversion_compra',
  'financiero_prestamo',
];

export type DataQualityConfidence = 'high' | 'medium' | 'low';

export type DataQualityIssue =
  | 'ok'
  | 'sin_subtipo'
  | 'subtipo_no_reconocido'
  | 'mismatch_tipo_fact'
  | 'mismatch_subtipo_fact'
  | 'subtipo_no_canonico'
  | 'fact_desalineado';

export interface SubtipoQualitySuggestion {
  gastoId: string;
  categoria: string;
  subtipoActual: string;
  tipoFactActual: string | null;
  subTipoFactActual: string | null;
  subtipoOficialSugerido: string | null;
  tipoFactSugerido: string | null;
  subTipoFactSugerido: string | null;
  confidence: DataQualityConfidence;
  razon: string;
  issue: DataQualityIssue;
  needsChange: boolean;
  localAction?: 'ignored' | 'manual_review';
}

export interface DataQualitySubtiposAuditPayload {
  total: number;
  ok: number;
  requiresReview: number;
  highConfidence: number;
  lowConfidence: number;
  byCategory: Record<
    string,
    {
      total: number;
      ok: number;
      requiresReview: number;
      highConfidence: number;
    }
  >;
  byCurrentSubtipo: Record<string, number>;
  examples: SubtipoQualitySuggestion[];
  suggestedActions: SubtipoQualitySuggestion[];
  suggestions: SubtipoQualitySuggestion[];
  factDataSummary: ReturnType<typeof auditSubtipoFactData>;
}

function mapConf(
  c: 'alta' | 'media' | 'baja',
): DataQualityConfidence {
  if (c === 'alta') return 'high';
  if (c === 'media') return 'medium';
  return 'low';
}

function factSubMatches(factSub: string, expected: string): boolean {
  const a = subtipoDedupeKey(factSub);
  const b = subtipoDedupeKey(expected);
  if (a === b) return true;
  const nkA = normKey(factSub);
  const nkB = normKey(expected);
  if (nkA === nkB) return true;
  if (nkA.includes(nkB) || nkB.includes(nkA)) {
    return nkB.length >= 4 || nkA.length >= 4;
  }
  return false;
}

function collectText(
  g: Pick<Gasto, 'subtipo_gasto' | 'motivo' | 'comentarios' | 'pagadoA' | 'tipo' | 'subTipo'>,
): string {
  return [g.subtipo_gasto, g.motivo, g.comentarios, g.pagadoA, g.tipo, g.subTipo]
    .filter(Boolean)
    .join(' ');
}

function resolveSuggestedCanon(
  cat: OfficialSubtipoCategoria,
  g: Pick<
    Gasto,
    'subtipo_gasto' | 'motivo' | 'comentarios' | 'pagadoA' | 'tipo' | 'subTipo'
  >,
): { canon: string | null; confidence: DataQualityConfidence; razon: string } {
  const actual = (g.subtipo_gasto ?? '').trim();
  const texto = collectText(g);

  const fromCurrent = resolveSubtipoCanonForGastoEdit(cat, actual);
  if (fromCurrent) {
    const realChange = hasRealSubtipoChange(actual, fromCurrent);
    return {
      canon: fromCurrent,
      confidence: realChange ? 'high' : 'medium',
      razon: realChange
        ? 'normalización del subtipo actual'
        : 'subtipo ya canónico (posible ajuste solo Fact)',
    };
  }

  if (cat === 'administrativo_empresa') {
    const adm = suggestAdministrativoFromGasto({
      id: '',
      subtipo_gasto: g.subtipo_gasto,
      motivo: g.motivo,
      comentarios: g.comentarios,
      pagadoA: g.pagadoA,
      tipo: g.tipo,
      subTipo: g.subTipo,
    });
    if (adm.subtipoOficialSugerido) {
      return {
        canon: adm.subtipoOficialSugerido,
        confidence: mapConf(adm.confianza),
        razon: adm.razon,
      };
    }
  }

  if (cat === 'financiero_prestamo') {
    const fin = suggestFinancieroFromText(texto);
    if (fin.sugerido) {
      return { canon: fin.sugerido, confidence: mapConf(fin.confianza), razon: fin.razon };
    }
  }

  const inferred = inferFactFromFinancialSubtipo(cat, actual || texto);
  if (inferred.recognized && actual) {
    const retry = resolveSubtipoCanonForGastoEdit(cat, actual);
    if (retry) return { canon: retry, confidence: 'medium', razon: 'inferencia Fact parcial' };
  }

  return { canon: null, confidence: 'low', razon: 'sin subtipo oficial sugerido' };
}

function detectIssue(
  g: Pick<Gasto, 'id' | 'tipo_gasto' | 'subtipo_gasto' | 'tipo' | 'subTipo'>,
): DataQualityIssue {
  const cat = (g.tipo_gasto ?? '').trim() as OfficialSubtipoCategoria;
  const sub = (g.subtipo_gasto ?? '').trim();
  if (!sub) return 'sin_subtipo';

  const inferred = inferFactFromFinancialSubtipo(cat, sub);
  if (!inferred.recognized) return 'subtipo_no_reconocido';

  const canon = resolveSubtipoCanonForGastoEdit(cat, sub);
  if (!canon) return 'subtipo_no_canonico';

  const actualTipo = (g.tipo ?? '').trim();
  const actualSub = (g.subTipo ?? '').trim();
  const tipoOk =
    !actualTipo
    || !inferred.tipo
    || actualTipo === inferred.tipo
    || inferred.possibleTipos.includes(actualTipo);
  if (!tipoOk) return 'mismatch_tipo_fact';

  const subOk =
    !actualSub
    || !inferred.subTipo
    || factSubMatches(actualSub, inferred.subTipo)
    || factSubMatches(actualSub, sub);
  if (!subOk) return 'mismatch_subtipo_fact';

  if (subtipoDedupeKey(canon) !== subtipoDedupeKey(sub)) return 'subtipo_no_canonico';

  return 'ok';
}

function buildSuggestionForGasto(g: Gasto): SubtipoQualitySuggestion | null {
  const cat = (g.tipo_gasto ?? '').trim();
  if (!AUDIT_CATEGORIAS.includes(cat as OfficialSubtipoCategoria)) return null;

  const categoria = cat as OfficialSubtipoCategoria;
  const issue = detectIssue(g);
  const subtipoActual = (g.subtipo_gasto ?? '').trim() || '(vacío)';
  const tipoFactActual = (g.tipo ?? '').trim() || null;
  const subTipoFactActual = (g.subTipo ?? '').trim() || null;
  const local = getDataQualityLocalAction(String(g.id));

  if (issue === 'ok') {
    return {
      gastoId: String(g.id),
      categoria: cat,
      subtipoActual,
      tipoFactActual,
      subTipoFactActual,
      subtipoOficialSugerido: resolveSubtipoCanonForGastoEdit(categoria, g.subtipo_gasto) ?? subtipoActual,
      tipoFactSugerido: tipoFactActual,
      subTipoFactSugerido: subTipoFactActual,
      confidence: 'high',
      razon: 'subtipo y Fact coherentes',
      issue: 'ok',
      needsChange: false,
      localAction: local?.action,
    };
  }

  const { canon, confidence, razon } = resolveSuggestedCanon(categoria, g);
  const fact =
    canon != null
      ? mapSubtipoToFactTipo(categoria, canon)
      : inferFactFromFinancialSubtipo(categoria, g.subtipo_gasto);

  const subtipoOficialSugerido = canon;
  const tipoFactSugerido = fact?.tipo ?? null;
  const subTipoFactSugerido = fact?.subTipo ?? null;

  let conf = confidence;
  if (!canon) {
    conf = 'low';
  } else {
    conf = refineDataQualityConfidence(
      categoria,
      subtipoActual,
      canon,
      collectText(g),
      conf,
    );
  }

  const subtipoChanged = canon != null && hasRealSubtipoChange(subtipoActual, canon);
  const factChanged =
    (tipoFactSugerido != null && tipoFactSugerido !== tipoFactActual)
    || (subTipoFactSugerido != null
      && subTipoFactActual
      && !factSubMatches(subTipoFactSugerido, subTipoFactActual));

  const needsChange = subtipoChanged;

  return {
    gastoId: String(g.id),
    categoria: cat,
    subtipoActual,
    tipoFactActual,
    subTipoFactActual,
    subtipoOficialSugerido,
    tipoFactSugerido,
    subTipoFactSugerido,
    confidence: conf,
    razon: `${issue}: ${razon}`,
    issue,
    needsChange,
    localAction: local?.action,
  };
}

export function auditDataQualitySubtipos(
  gastos: readonly Gasto[],
): DataQualitySubtiposAuditPayload {
  const suggestions: SubtipoQualitySuggestion[] = [];
  const byCategory: DataQualitySubtiposAuditPayload['byCategory'] = {};
  const byCurrentSubtipo: Record<string, number> = {};

  for (const g of gastos) {
    const s = buildSuggestionForGasto(g);
    if (!s) continue;
    suggestions.push(s);

    const cat = s.categoria;
    if (!byCategory[cat]) {
      byCategory[cat] = { total: 0, ok: 0, requiresReview: 0, highConfidence: 0 };
    }
    byCategory[cat].total += 1;
    if (s.issue === 'ok') byCategory[cat].ok += 1;
    else byCategory[cat].requiresReview += 1;
    if (isAutoApplyEligible(s.confidence, s.subtipoActual, s.subtipoOficialSugerido)) {
      byCategory[cat].highConfidence += 1;
    }

    const subKey = `${cat}::${s.subtipoActual}`;
    byCurrentSubtipo[subKey] = (byCurrentSubtipo[subKey] ?? 0) + 1;
  }

  const ok = suggestions.filter((s) => s.issue === 'ok').length;
  const requiresReview = suggestions.filter(
    (s) => s.needsChange && s.localAction !== 'ignored',
  ).length;
  const highConfidence = suggestions.filter(
    (s) =>
      s.localAction !== 'ignored'
      && isAutoApplyEligible(s.confidence, s.subtipoActual, s.subtipoOficialSugerido),
  ).length;
  const lowConfidence = suggestions.filter(
    (s) => s.needsChange && s.confidence === 'low' && s.localAction !== 'ignored',
  ).length;

  const actionable = suggestions.filter(
    (s) =>
      s.needsChange
      && s.localAction !== 'ignored'
      && s.subtipoOficialSugerido
      && hasRealSubtipoChange(s.subtipoActual, s.subtipoOficialSugerido),
  );

  const factDataSummary = auditSubtipoFactData(gastos);

  const payload: DataQualitySubtiposAuditPayload = {
    total: suggestions.length,
    ok,
    requiresReview,
    highConfidence,
    lowConfidence,
    byCategory,
    byCurrentSubtipo,
    examples: actionable.slice(0, 30),
    suggestedActions: actionable
      .filter((s) => isAutoApplyEligible(s.confidence, s.subtipoActual, s.subtipoOficialSugerido))
      .slice(0, 50),
    suggestions,
    factDataSummary,
  };

  return payload;
}

export function logAuditDataQualitySubtipos(gastos: readonly Gasto[]): DataQualitySubtiposAuditPayload {
  const payload = auditDataQualitySubtipos(gastos);
  console.log('[data-quality:subtipos]', payload);
  return payload;
}

export interface DataQualityPatchPreview {
  gastoId: string;
  fromSubtipo: string;
  toSubtipo: string;
  fromFact: { tipo: string | null; subTipo: string | null };
  toFact: { tipo: string | null; subTipo: string | null };
  confidence: DataQualityConfidence;
  razon: string;
}

export interface DataQualityPreviewPayload {
  dryRun: true;
  totalWouldChange: number;
  highConfidenceCount: number;
  manualReviewCount: number;
  ignoredNoopCount: number;
  byTransition: Record<string, number>;
  manualReviewTransitions: Record<string, number>;
  ignoredNoopTransitions: Record<string, number>;
  examples: DataQualityPatchPreview[];
  patches: DataQualityPatchPreview[];
}

function toPatchPreview(s: SubtipoQualitySuggestion): DataQualityPatchPreview {
  return {
    gastoId: s.gastoId,
    fromSubtipo: s.subtipoActual,
    toSubtipo: s.subtipoOficialSugerido!,
    fromFact: { tipo: s.tipoFactActual, subTipo: s.subTipoFactActual },
    toFact: { tipo: s.tipoFactSugerido, subTipo: s.subTipoFactSugerido },
    confidence: s.confidence,
    razon: s.razon,
  };
}

function bumpTransition(
  bucket: Record<string, number>,
  s: SubtipoQualitySuggestion,
): void {
  const key = transitionKey(s.categoria, s.subtipoActual, s.subtipoOficialSugerido!);
  bucket[key] = (bucket[key] ?? 0) + 1;
}

export function previewDataQualityFixes(
  gastos: readonly Gasto[],
  opts?: { confidence?: 'high' | 'all' },
): DataQualityPreviewPayload {
  const audit = auditDataQualitySubtipos(gastos);
  const minConf = opts?.confidence ?? 'high';

  const active = audit.suggestions.filter(
    (s) => s.localAction !== 'ignored' && s.subtipoOficialSugerido,
  );

  const ignoredNoopTransitions: Record<string, number> = {};
  let ignoredNoopCount = 0;

  for (const s of active) {
    if (hasRealSubtipoChange(s.subtipoActual, s.subtipoOficialSugerido)) continue;
    ignoredNoopCount += 1;
    bumpTransition(ignoredNoopTransitions, s);
  }

  const withRealChange = active.filter((s) =>
    hasRealSubtipoChange(s.subtipoActual, s.subtipoOficialSugerido),
  );

  const autoEligible = withRealChange.filter((s) =>
    isAutoApplyEligible(s.confidence, s.subtipoActual, s.subtipoOficialSugerido),
  );

  const manualReview = withRealChange.filter(
    (s) => !isAutoApplyEligible(s.confidence, s.subtipoActual, s.subtipoOficialSugerido),
  );

  const candidates =
    minConf === 'high'
      ? autoEligible
      : withRealChange.filter((s) => s.confidence === 'high' || s.confidence === 'medium' || s.confidence === 'low');

  const byTransition: Record<string, number> = {};
  const manualReviewTransitions: Record<string, number> = {};

  for (const s of autoEligible) bumpTransition(byTransition, s);
  for (const s of manualReview) bumpTransition(manualReviewTransitions, s);

  const patches: DataQualityPatchPreview[] = candidates.map(toPatchPreview);

  const payload: DataQualityPreviewPayload = {
    dryRun: true,
    totalWouldChange: autoEligible.length,
    highConfidenceCount: autoEligible.length,
    manualReviewCount: manualReview.length,
    ignoredNoopCount,
    byTransition,
    manualReviewTransitions,
    ignoredNoopTransitions,
    examples: patches.slice(0, 25),
    patches,
  };

  console.log('[data-quality:preview]', payload);
  return payload;
}

export function suggestionToDetallePatch(
  s: SubtipoQualitySuggestion,
  revisadoPor: string,
): {
  subtipo_gasto: string;
  tipo: string;
  subTipo: string | null;
  categoria: Gasto['categoria'];
  motivo: string;
  revisado_at: string;
  revisado_por: string;
} | null {
  if (!s.subtipoOficialSugerido || !s.tipoFactSugerido) return null;
  const cat = s.categoria;
  const canon = s.subtipoOficialSugerido;
  const fact =
    mapSubtipoToFactTipo(cat, canon)
    ?? {
      tipo: s.tipoFactSugerido,
      subTipo: s.subTipoFactSugerido ?? '',
    };
  return {
    subtipo_gasto: canon,
    tipo: fact.tipo,
    subTipo: fact.subTipo,
    categoria: inferCategoriaFromTipoGasto(fact.tipo),
    motivo: motivoFromSubtipoCanon(cat, canon),
    revisado_at: new Date().toISOString(),
    revisado_por: revisadoPor,
  };
}
