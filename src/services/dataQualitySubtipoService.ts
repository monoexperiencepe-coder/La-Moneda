/**
 * Aplicación segura de sugerencias de conciliación de subtipos (sin tocar monto/fecha/vehículo).
 */
import type { Gasto } from '../data/types';
import {
  suggestionToDetallePatch,
  type DataQualityConfidence,
  type SubtipoQualitySuggestion,
} from '../audit/auditDataQualitySubtipos';
import { isAutoApplyEligible } from '../audit/dataQualitySubtipoPolicy';
import { updateGastoDetalleManual, type GastoDetalleManualPatch } from './gastosService';

export type ApplyDataQualityResult =
  | { ok: true; gasto: Gasto }
  | { ok: false; error: string };

function logApply(
  tag: 'apply-one' | 'apply-batch',
  entry: {
    gastoId: string;
    fromSubtipo: string;
    toSubtipo: string;
    fromFact: { tipo: string | null; subTipo: string | null };
    toFact: { tipo: string | null; subTipo: string | null };
    confidence: DataQualityConfidence;
    appliedBy: string;
  },
): void {
  console.log(`[data-quality:${tag}]`, entry);
}

export async function applyDataQualitySubtipoSuggestion(
  suggestion: SubtipoQualitySuggestion,
  appliedBy: string,
  tenantEmpresaId?: string | null,
): Promise<ApplyDataQualityResult> {
  if (
    !isAutoApplyEligible(
      suggestion.confidence,
      suggestion.subtipoActual,
      suggestion.subtipoOficialSugerido,
    )
  ) {
    return {
      ok: false,
      error: 'Solo se pueden aplicar sugerencias de alta confianza con cambio de subtipo real (alias seguro).',
    };
  }
  if (!suggestion.needsChange || !suggestion.subtipoOficialSugerido) {
    return { ok: false, error: 'La sugerencia no requiere cambios o no tiene subtipo oficial.' };
  }

  const derived = suggestionToDetallePatch(suggestion, appliedBy);
  if (!derived) {
    return { ok: false, error: 'No se pudo derivar el patch Fact desde la sugerencia.' };
  }

  const patch: GastoDetalleManualPatch = {
    subtipo_gasto: derived.subtipo_gasto,
    tipo: derived.tipo,
    subTipo: derived.subTipo,
    categoria: derived.categoria,
    motivo: derived.motivo,
    revisado_at: derived.revisado_at,
    revisado_por: derived.revisado_por,
  };

  logApply('apply-one', {
    gastoId: suggestion.gastoId,
    fromSubtipo: suggestion.subtipoActual,
    toSubtipo: derived.subtipo_gasto,
    fromFact: { tipo: suggestion.tipoFactActual, subTipo: suggestion.subTipoFactActual },
    toFact: { tipo: derived.tipo, subTipo: derived.subTipo },
    confidence: suggestion.confidence,
    appliedBy,
  });

  const res = await updateGastoDetalleManual(suggestion.gastoId, patch, tenantEmpresaId);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, gasto: res.gasto };
}

export async function applyDataQualitySubtipoBatch(
  suggestions: readonly SubtipoQualitySuggestion[],
  appliedBy: string,
  tenantEmpresaId?: string | null,
): Promise<{
  applied: number;
  failed: Array<{ gastoId: string; error: string }>;
}> {
  const high = suggestions.filter((s) =>
    isAutoApplyEligible(s.confidence, s.subtipoActual, s.subtipoOficialSugerido),
  );
  let applied = 0;
  const failed: Array<{ gastoId: string; error: string }> = [];

  for (const s of high) {
    const res = await applyDataQualitySubtipoSuggestion(s, appliedBy, tenantEmpresaId);
    if (res.ok) {
      applied += 1;
      logApply('apply-batch', {
        gastoId: s.gastoId,
        fromSubtipo: s.subtipoActual,
        toSubtipo: s.subtipoOficialSugerido!,
        fromFact: { tipo: s.tipoFactActual, subTipo: s.subTipoFactActual },
        toFact: { tipo: res.gasto.tipo, subTipo: res.gasto.subTipo },
        confidence: s.confidence,
        appliedBy,
      });
    } else {
      failed.push({ gastoId: s.gastoId, error: res.error });
    }
  }

  return { applied, failed };
}
