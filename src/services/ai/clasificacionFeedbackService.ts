import { supabase } from '../../lib/supabase';
import { EMPRESA_ID } from '../../config/app';
import type {
  ClasificacionFeedbackInput,
  ClasificacionFeedbackResumen,
  ClasificacionFeedbackRow,
} from '../../modules/ai/clasificacionFeedbackTypes';
import {
  feedbackIgnorado,
  resolveClasificacionFeedback,
} from '../../utils/clasificacionFeedbackResolve';
import { getAuthenticatedUserIdForAudit } from '../authAuditUser';
import type { IaPendienteSugerencia } from '../../modules/ai/iaClasificacionTypes';

function resolveEmpresaId(tenantEmpresaId?: string | null): string {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  if (!id) throw new Error('Empresa no configurada');
  return id;
}

function mapRow(r: Record<string, unknown>): ClasificacionFeedbackRow {
  return {
    id: Number(r.id),
    empresa_id: String(r.empresa_id),
    gasto_id: Number(r.gasto_id),
    sugerencia_original_tipo: r.sugerencia_original_tipo != null ? String(r.sugerencia_original_tipo) : null,
    sugerencia_original_subtipo:
      r.sugerencia_original_subtipo != null ? String(r.sugerencia_original_subtipo) : null,
    resultado_final_tipo: r.resultado_final_tipo != null ? String(r.resultado_final_tipo) : null,
    resultado_final_subtipo: r.resultado_final_subtipo != null ? String(r.resultado_final_subtipo) : null,
    confianza_original: r.confianza_original != null ? Number(r.confianza_original) : null,
    fuente_original: r.fuente_original != null ? String(r.fuente_original) : null,
    feedback_resultado: r.feedback_resultado as ClasificacionFeedbackRow['feedback_resultado'],
    correction_level: r.correction_level as ClasificacionFeedbackRow['correction_level'],
    created_at: String(r.created_at),
  };
}

/** Inserta feedback estructurado (no altera sugerencias futuras automáticamente). */
export async function insertClasificacionFeedback(
  input: ClasificacionFeedbackInput,
  tenantEmpresaId?: string | null,
): Promise<ClasificacionFeedbackRow | null> {
  const empresaId = resolveEmpresaId(tenantEmpresaId);
  const uid = await getAuthenticatedUserIdForAudit();

  const resolved =
    input.feedbackResultado != null && input.correctionLevel != null
      ? {
          feedback_resultado: input.feedbackResultado,
          correction_level: input.correctionLevel,
        }
      : input.feedbackResultado === 'ignorado'
        ? feedbackIgnorado()
        : resolveClasificacionFeedback(
            input.sugerenciaTipo,
            input.sugerenciaSubtipo,
            input.resultadoTipo,
            input.resultadoSubtipo,
          );

  const { data, error } = await supabase
    .from('ai_clasificacion_feedback')
    .insert({
      empresa_id: empresaId,
      gasto_id: input.gastoId,
      sugerencia_original_tipo: input.sugerenciaTipo ?? null,
      sugerencia_original_subtipo: input.sugerenciaSubtipo ?? null,
      resultado_final_tipo: input.resultadoTipo ?? null,
      resultado_final_subtipo: input.resultadoSubtipo ?? null,
      confianza_original: input.confianzaOriginal ?? null,
      fuente_original: input.fuenteOriginal ?? null,
      feedback_resultado: resolved.feedback_resultado,
      correction_level: resolved.correction_level,
      created_by: uid,
    })
    .select(
      'id,empresa_id,gasto_id,sugerencia_original_tipo,sugerencia_original_subtipo,resultado_final_tipo,resultado_final_subtipo,confianza_original,fuente_original,feedback_resultado,correction_level,created_at',
    )
    .single();

  if (error) {
    if (import.meta.env.DEV) console.warn('[ai_clasificacion_feedback:insert]', error.message);
    return null;
  }
  return mapRow(data as Record<string, unknown>);
}

export async function registrarFeedbackIgnorado(
  row: IaPendienteSugerencia,
  tenantEmpresaId?: string | null,
): Promise<ClasificacionFeedbackRow | null> {
  return insertClasificacionFeedback(
    {
      gastoId: row.id,
      sugerenciaTipo: row.tipo_gasto_sugerido,
      sugerenciaSubtipo: row.subtipo_sugerido,
      resultadoTipo: null,
      resultadoSubtipo: null,
      confianzaOriginal: row.confianza,
      fuenteOriginal: row.fuente,
      feedbackResultado: 'ignorado',
      correctionLevel: 'none',
    },
    tenantEmpresaId,
  );
}

export async function registrarFeedbackAplicacion(
  row: IaPendienteSugerencia,
  resultadoTipo: string,
  resultadoSubtipo: string | null,
  tenantEmpresaId?: string | null,
): Promise<ClasificacionFeedbackRow | null> {
  return insertClasificacionFeedback(
    {
      gastoId: row.id,
      sugerenciaTipo: row.tipo_gasto_sugerido,
      sugerenciaSubtipo: row.subtipo_sugerido,
      resultadoTipo,
      resultadoSubtipo,
      confianzaOriginal: row.confianza,
      fuenteOriginal: row.fuente,
    },
    tenantEmpresaId,
  );
}

/** Último feedback por gasto_id (para badges en el lote actual). */
export async function fetchUltimoFeedbackPorGastos(
  gastoIds: number[],
  tenantEmpresaId?: string | null,
  limit = 800,
): Promise<Map<number, ClasificacionFeedbackResumen>> {
  const map = new Map<number, ClasificacionFeedbackResumen>();
  if (gastoIds.length === 0) return map;

  const empresaId = resolveEmpresaId(tenantEmpresaId);
  const { data, error } = await supabase
    .from('ai_clasificacion_feedback')
    .select('gasto_id,feedback_resultado,correction_level,created_at')
    .eq('empresa_id', empresaId)
    .in('gasto_id', gastoIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (import.meta.env.DEV) console.warn('[ai_clasificacion_feedback:select]', error.message);
    return map;
  }

  for (const r of data ?? []) {
    const gid = Number(r.gasto_id);
    if (map.has(gid)) continue;
    map.set(gid, {
      feedback_resultado: r.feedback_resultado as ClasificacionFeedbackResumen['feedback_resultado'],
      correction_level: r.correction_level as ClasificacionFeedbackResumen['correction_level'],
    });
  }
  return map;
}

/** Feedback reciente de la empresa para métricas del panel. */
export async function fetchClasificacionFeedbackReciente(
  tenantEmpresaId?: string | null,
  limit = 500,
): Promise<ClasificacionFeedbackRow[]> {
  const empresaId = resolveEmpresaId(tenantEmpresaId);
  const { data, error } = await supabase
    .from('ai_clasificacion_feedback')
    .select(
      'id,empresa_id,gasto_id,sugerencia_original_tipo,sugerencia_original_subtipo,resultado_final_tipo,resultado_final_subtipo,confianza_original,fuente_original,feedback_resultado,correction_level,created_at',
    )
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (import.meta.env.DEV) console.warn('[ai_clasificacion_feedback:list]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}
