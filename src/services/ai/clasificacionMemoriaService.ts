import { supabase } from '../../lib/supabase';
import { EMPRESA_ID } from '../../config/app';
import type {
  ClasificacionMemoriaRow,
  ClasificacionMemoriaSource,
} from '../../modules/ai/clasificacionMemoriaTypes';
import {
  buildClasificacionMemoriaTextoOriginal,
  normalizeClasificacionMemoryText,
} from '../../utils/clasificacionMemoriaText';
import { getAuthenticatedUserIdForAudit } from '../authAuditUser';

const MEMORIA_FETCH_LIMIT = 400;

function resolveEmpresaId(tenantEmpresaId?: string | null): string {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  if (!id) throw new Error('Empresa no configurada');
  return id;
}

function mapRow(r: Record<string, unknown>): ClasificacionMemoriaRow {
  return {
    id: Number(r.id),
    empresa_id: String(r.empresa_id),
    texto_normalizado: String(r.texto_normalizado),
    texto_original: String(r.texto_original),
    tipo_gasto_final: String(r.tipo_gasto_final),
    subtipo_final: String(r.subtipo_final),
    vehicle_context: r.vehicle_context != null ? String(r.vehicle_context) : null,
    confidence_humana: r.confidence_humana != null ? Number(r.confidence_humana) : null,
    source: r.source as ClasificacionMemoriaSource,
    veces_usado: Number(r.veces_usado) || 0,
    veces_confirmado: Number(r.veces_confirmado) || 0,
    veces_corregido: Number(r.veces_corregido) || 0,
    updated_at: String(r.updated_at),
  };
}

/** Carga memoria activa de la empresa (orden: más confirmada primero). */
export async function fetchClasificacionMemoriaActivas(
  tenantEmpresaId?: string | null,
  limit = MEMORIA_FETCH_LIMIT,
): Promise<ClasificacionMemoriaRow[]> {
  const empresaId = resolveEmpresaId(tenantEmpresaId);
  const { data, error } = await supabase
    .from('ai_clasificacion_memoria')
    .select(
      'id,empresa_id,texto_normalizado,texto_original,tipo_gasto_final,subtipo_final,vehicle_context,confidence_humana,source,veces_usado,veces_confirmado,veces_corregido,updated_at',
    )
    .eq('empresa_id', empresaId)
    .order('veces_confirmado', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (import.meta.env.DEV) console.warn('[ai_clasificacion_memoria:select]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export type GuardarClasificacionMemoriaInput = {
  textoOriginal: string;
  tipoGastoFinal: string;
  subtipoFinal: string;
  vehicleContext?: string | null;
  confidenceHumana?: number | null;
  source: ClasificacionMemoriaSource;
  /** Si la clasificación difiere de una sugerencia IA previa en el mismo flujo. */
  esCorreccion?: boolean;
};

/** Persiste o refuerza un patrón humano (upsert por texto_normalizado + empresa). */
export async function guardarClasificacionMemoriaHumana(
  input: GuardarClasificacionMemoriaInput,
  tenantEmpresaId?: string | null,
): Promise<void> {
  const empresaId = resolveEmpresaId(tenantEmpresaId);
  const textoOriginal = input.textoOriginal.trim().slice(0, 500);
  const textoNorm = normalizeClasificacionMemoryText(textoOriginal);
  if (!textoNorm || textoNorm.length < 3) return;

  const tipo = input.tipoGastoFinal.trim();
  const sub = input.subtipoFinal.trim();
  if (!tipo || !sub) return;

  const uid = await getAuthenticatedUserIdForAudit();
  const now = new Date().toISOString();

  const { data: existing, error: selErr } = await supabase
    .from('ai_clasificacion_memoria')
    .select('id,tipo_gasto_final,subtipo_final,veces_confirmado,veces_corregido')
    .eq('empresa_id', empresaId)
    .eq('texto_normalizado', textoNorm)
    .maybeSingle();

  if (selErr && import.meta.env.DEV) {
    console.warn('[ai_clasificacion_memoria:lookup]', selErr.message);
    return;
  }

  if (existing?.id != null) {
    const sameClass =
      String(existing.tipo_gasto_final) === tipo && String(existing.subtipo_final) === sub;
    const { error: updErr } = await supabase
      .from('ai_clasificacion_memoria')
      .update({
        texto_original: textoOriginal,
        tipo_gasto_final: tipo,
        subtipo_final: sub,
        vehicle_context: input.vehicleContext ?? null,
        confidence_humana: input.confidenceHumana ?? null,
        source: input.source,
        updated_at: now,
        veces_confirmado: sameClass && !input.esCorreccion
          ? Number(existing.veces_confirmado ?? 0) + 1
          : Number(existing.veces_confirmado ?? 0),
        veces_corregido:
          !sameClass || input.esCorreccion
            ? Number(existing.veces_corregido ?? 0) + 1
            : Number(existing.veces_corregido ?? 0),
      })
      .eq('id', existing.id);

    if (updErr && import.meta.env.DEV) console.warn('[ai_clasificacion_memoria:update]', updErr.message);
    return;
  }

  const { error: insErr } = await supabase.from('ai_clasificacion_memoria').insert({
    empresa_id: empresaId,
    texto_normalizado: textoNorm,
    texto_original: textoOriginal,
    tipo_gasto_final: tipo,
    subtipo_final: sub,
    vehicle_context: input.vehicleContext ?? null,
    confidence_humana: input.confidenceHumana ?? null,
    source: input.source,
    created_by: uid,
    veces_confirmado: input.esCorreccion ? 0 : 1,
    veces_corregido: input.esCorreccion ? 1 : 0,
  });

  if (insErr && import.meta.env.DEV) console.warn('[ai_clasificacion_memoria:insert]', insErr.message);
}

/** Incrementa contador de uso al consultar memoria en una sugerencia (best-effort). */
export async function incrementarMemoriaUsada(memoriaId: number): Promise<void> {
  const { data } = await supabase
    .from('ai_clasificacion_memoria')
    .select('veces_usado')
    .eq('id', memoriaId)
    .maybeSingle();
  if (!data) return;
  await supabase
    .from('ai_clasificacion_memoria')
    .update({
      veces_usado: Number(data.veces_usado ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', memoriaId);
}

export function buildTextoMemoriaFromGastoParts(parts: {
  motivo?: string | null;
  comentarios?: string | null;
  placa?: string | null;
}): string {
  return buildClasificacionMemoriaTextoOriginal([parts.motivo, parts.comentarios, parts.placa]);
}

export function resolveMemoriaSourceFromOrigen(
  origenClasificacion: string,
  userRole?: string,
): ClasificacionMemoriaSource {
  const o = origenClasificacion.trim();
  if (o === 'sugerencia_ia_aplicada_manual') return 'aplicacion_ia';
  if (o === 'correccion_manual_ui') return 'correccion_manual';
  const role = (userRole ?? '').toLowerCase();
  if (role === 'operador') return 'operador';
  if (role === 'admin') return 'admin';
  return 'movimiento_manual';
}
