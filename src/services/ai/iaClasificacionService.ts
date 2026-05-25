import { supabase } from '../../lib/supabase';
import { EMPRESA_ID } from '../../config/app';
import { executeAiTool } from '../../modules/ai/tools/runner';
import { canExecuteAiTool } from '../../modules/ai/permissions';
import type {
  IaClasificacionAuditAction,
  IaClasificacionAuditRow,
  IaPendienteSugerencia,
  IaPendientesConSugerenciaPayload,
} from '../../modules/ai/iaClasificacionTypes';
import { IA_CLASIFICACION_QUEUE_TIPOS } from '../../modules/ai/iaClasificacionTypes';
import { getAuthenticatedUserIdForAudit } from '../authAuditUser';
import { fetchGastoByIdForTenant } from '../gastosService';
import {
  canMoveGastoToTipo,
  canViewGastoTipo,
  filterGastosForUser,
  permissionUserFromAuth,
  type PermissionUser,
} from '../../utils/permissions';
import type { AppUserProfile, Gasto, Vehicle } from '../../data/types';
import { moveGastoCategoria } from '../../utils/gastoCategoriaMove';
import {
  buildTextoMemoriaFromGastoParts,
  guardarClasificacionMemoriaHumana,
} from './clasificacionMemoriaService';
import { registrarFeedbackAplicacion } from './clasificacionFeedbackService';
import type { ClasificacionFeedbackRow } from '../../modules/ai/clasificacionFeedbackTypes';
import { tipoGastoRequiereVehiculo } from '../../utils/gastoMoveCategoriaDefaults';
import { FINANZA_MOVE_TARGET_TIPO_GASTO } from '../../utils/permissions';

function resolveEmpresaId(tenantEmpresaId?: string | null): string {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  if (!id) throw new Error('Empresa no configurada');
  return id;
}

export function canUseIaClasificacionCentro(user: PermissionUser | null | undefined): boolean {
  return canExecuteAiTool(user, 'getPendientesConSugerencia');
}

function parsePendientesPayload(data: unknown): IaPendientesConSugerenciaPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const raw = d.sugerencias;
  if (!Array.isArray(raw)) return null;
  const sugerencias = raw
    .filter((x): x is IaPendienteSugerencia => {
      return x != null && typeof x === 'object' && typeof (x as IaPendienteSugerencia).id === 'number';
    })
    .map((s) => ({
      ...s,
      fuente: s.fuente ?? 'heuristica',
      memoria_match: s.memoria_match ?? null,
    }));
  return {
    count: Number(d.count) || sugerencias.length,
    totalPendientes: Number(d.totalPendientes) || 0,
    totalGlobales: Number(d.totalGlobales) || 0,
    sugerencias,
    nota: typeof d.nota === 'string' ? d.nota : undefined,
  };
}

/** Analiza pendientes + globales con heurística local (sin modificar gastos). */
export async function fetchPendientesConSugerencia(
  user: AppUserProfile,
  email: string | null | undefined,
  empresaId: string,
  limit = 40,
): Promise<
  | { ok: true; payload: IaPendientesConSugerenciaPayload; durationMs: number }
  | { ok: false; error: string; denied?: boolean }
> {
  const permUser = permissionUserFromAuth(user, email);
  if (!canUseIaClasificacionCentro(permUser)) {
    return { ok: false, error: 'No tienes permiso para el centro de clasificación IA.', denied: true };
  }
  const t0 = performance.now();
  const res = await executeAiTool(
    'getPendientesConSugerencia',
    { limit },
    { user: permUser, empresaId: resolveEmpresaId(empresaId) },
  );
  const durationMs = Math.round(performance.now() - t0);
  if (!res.ok) {
    return { ok: false, error: res.error, denied: res.denied };
  }
  const payload = parsePendientesPayload(res.data);
  if (!payload) {
    return { ok: false, error: 'Respuesta de sugerencias inválida.' };
  }
  return { ok: true, payload, durationMs };
}

export type IaClasificacionAuditInput = {
  gastoId?: number | null;
  action: IaClasificacionAuditAction;
  batchId?: string | null;
  tipoActual?: string | null;
  subtipoActual?: string | null;
  tipoSugerido?: string | null;
  subtipoSugerido?: string | null;
  tipoAplicado?: string | null;
  subtipoAplicado?: string | null;
  confianza?: number | null;
  razon?: string | null;
  aplicadoManual?: boolean;
  userRole?: string | null;
};

export function canApplyIaSugerencia(
  user: PermissionUser | null | undefined,
  row: IaPendienteSugerencia,
): { ok: true } | { ok: false; message: string } {
  if (!user) return { ok: false, message: 'Sesión no válida.' };
  const tipo = (row.tipo_gasto_sugerido ?? '').trim();
  const sub = (row.subtipo_sugerido ?? '').trim();
  if (!tipo || !sub) {
    return { ok: false, message: 'La IA no tiene categoría y subtipo suficientes para aplicar.' };
  }
  if (!(FINANZA_MOVE_TARGET_TIPO_GASTO as readonly string[]).includes(tipo)) {
    return { ok: false, message: 'Categoría sugerida no permitida para reclasificación.' };
  }
  if (!canMoveGastoToTipo(user, tipo)) {
    return { ok: false, message: 'No tienes permiso para mover a esa categoría.' };
  }
  const actual = (row.tipo_actual ?? '').trim();
  if (actual && !canViewGastoTipo(user, actual)) {
    return { ok: false, message: 'No puedes modificar este registro.' };
  }
  if (tipoGastoRequiereVehiculo(tipo)) {
    const vid = row.vehicle_id;
    const n = typeof vid === 'number' ? vid : typeof vid === 'string' && vid ? Number(vid) : NaN;
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, message: 'La sugerencia requiere un vehículo asignado al gasto.' };
    }
  }
  return { ok: true };
}

export function gastoStillInIaQueue(tipoGasto: string | null | undefined): boolean {
  const t = (tipoGasto ?? '').trim();
  return (IA_CLASIFICACION_QUEUE_TIPOS as readonly string[]).includes(t);
}

export type ApplyIaSugerenciaResult =
  | {
      ok: true;
      gastoBefore: Gasto;
      gasto: Gasto;
      movedOutOfView: boolean;
      removeFromIaList: boolean;
      tipoAplicado: string;
      subtipoAplicado: string | null;
      feedback: ClasificacionFeedbackRow | null;
    }
  | { ok: false; message: string };

/** Aplica sugerencia IA tras confirmación humana (RPC/update seguro, sin SQL de IA). */
export async function applyIaClasificacionSugerencia(params: {
  row: IaPendienteSugerencia;
  user: AppUserProfile;
  email: string | null | undefined;
  empresaId: string;
  vehicles: Vehicle[];
  operatorClassifyMode?: boolean;
  /** Destino elegido por humano (si difiere de la sugerencia → feedback parcial/incorrecto). */
  destinoTipo?: string;
  destinoSubtipo?: string;
  /** Si viene de lote supervisado: auditoría con batch_id y action lote. */
  batchId?: string | null;
}): Promise<ApplyIaSugerenciaResult> {
  const { row, user, email, empresaId, vehicles, operatorClassifyMode, destinoTipo, destinoSubtipo, batchId } =
    params;
  const enLote = !!batchId?.trim();
  const auditOkAction: IaClasificacionAuditAction = enLote ? 'aplicar_sugerencia_lote' : 'aplicar_sugerencia';
  const auditErrAction: IaClasificacionAuditAction = enLote ? 'error_aplicar_lote' : 'error_aplicar';
  const permUser = permissionUserFromAuth(user, email);
  const gate = canApplyIaSugerencia(permUser, row);
  if (!gate.ok) return { ok: false, message: gate.message };

  const tipoDestino = (destinoTipo ?? row.tipo_gasto_sugerido ?? '').trim();
  const subDestino = (destinoSubtipo ?? row.subtipo_sugerido ?? '').trim();
  if (!tipoDestino || !subDestino) {
    return { ok: false, message: 'Indica categoría y subtipo de destino.' };
  }
  if (!(FINANZA_MOVE_TARGET_TIPO_GASTO as readonly string[]).includes(tipoDestino)) {
    return { ok: false, message: 'Categoría destino no permitida.' };
  }
  if (!canMoveGastoToTipo(permUser, tipoDestino)) {
    return { ok: false, message: 'No tienes permiso para mover a esa categoría.' };
  }
  const gasto = await fetchGastoByIdForTenant(String(row.id), empresaId);
  if (!gasto) {
    return { ok: false, message: 'No se encontró el gasto o no tienes acceso (RLS).' };
  }
  const visible = filterGastosForUser(permUser, [gasto]);
  if (visible.length === 0) {
    return { ok: false, message: 'Este gasto no está visible para tu rol.' };
  }

  let vehicleId: number | null = null;
  if (tipoGastoRequiereVehiculo(tipoDestino)) {
    const raw = row.vehicle_id ?? gasto.vehicleId;
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw ? Number(raw) : NaN;
    vehicleId = Number.isFinite(n) && n > 0 ? n : null;
  }

  const motivoAudit = [
    'Sugerencia IA aplicada manualmente',
    row.razon ? `· ${row.razon}` : '',
    row.motivo ? `· ${row.motivo}` : '',
  ]
    .join(' ')
    .trim()
    .slice(0, 500);

  const res = await moveGastoCategoria({
    gasto,
    toTipoGasto: tipoDestino,
    toSubtipoGasto: subDestino,
    vehicleId,
    motivo: motivoAudit,
    vehicles,
    tenantEmpresaId: empresaId,
    operatorClassifyMode,
    origenClasificacion: 'sugerencia_ia_aplicada_manual',
    clasificacionConfianza: row.confianza,
    registrarMemoriaHumana: false,
    userRole: user.role,
  });

  if (!res.ok) {
    await insertIaClasificacionAudit(
      {
        gastoId: row.id,
        action: auditErrAction,
        batchId: batchId ?? null,
        tipoActual: row.tipo_actual,
        subtipoActual: row.subtipo_actual,
        tipoSugerido: row.tipo_gasto_sugerido,
        subtipoSugerido: row.subtipo_sugerido,
        confianza: row.confianza,
        razon: res.message,
        aplicadoManual: false,
        userRole: user.role,
      },
      empresaId,
    );
    return { ok: false, message: res.message };
  }

  const tipoAplicado = res.gasto.tipo_gasto ?? tipoDestino;
  const subtipoAplicado = res.gasto.subtipo_gasto ?? subDestino;

  const mismaSugerencia =
    (row.tipo_gasto_sugerido ?? '').trim() === tipoAplicado &&
    (row.subtipo_sugerido ?? '').trim() === (subtipoAplicado ?? '');
  void guardarClasificacionMemoriaHumana(
    {
      textoOriginal: buildTextoMemoriaFromGastoParts({
        motivo: row.motivo,
        comentarios: row.comentario,
        placa: row.placa,
      }),
      tipoGastoFinal: tipoAplicado,
      subtipoFinal: subtipoAplicado ?? subDestino,
      vehicleContext: vehicleId != null ? String(vehicleId) : row.placa,
      confidenceHumana: row.confianza,
      source: 'aplicacion_ia',
      esCorreccion: !mismaSugerencia,
    },
    empresaId,
  );

  await insertIaClasificacionAudit(
    {
      gastoId: row.id,
      action: auditOkAction,
      batchId: batchId ?? null,
      tipoActual: row.tipo_actual,
      subtipoActual: row.subtipo_actual,
      tipoSugerido: row.tipo_gasto_sugerido,
      subtipoSugerido: row.subtipo_sugerido,
      tipoAplicado,
      subtipoAplicado,
      confianza: row.confianza,
      razon: row.razon,
      aplicadoManual: true,
      userRole: user.role,
    },
    empresaId,
  );

  const removeFromIaList =
    res.movedOutOfView === true || !gastoStillInIaQueue(tipoAplicado);

  const feedback = await registrarFeedbackAplicacion(
    row,
    tipoAplicado,
    subtipoAplicado,
    empresaId,
  );

  return {
    ok: true,
    gastoBefore: gasto,
    gasto: res.gasto,
    movedOutOfView: res.movedOutOfView === true,
    removeFromIaList,
    tipoAplicado,
    subtipoAplicado,
    feedback,
  };
}

/** Registra revisión humana (no aplica clasificación al gasto). */
export async function insertIaClasificacionAudit(
  entry: IaClasificacionAuditInput,
  tenantEmpresaId?: string | null,
): Promise<void> {
  const uid = await getAuthenticatedUserIdForAudit();
  const empresaId = resolveEmpresaId(tenantEmpresaId);
  if (!uid) return;

  const { error } = await supabase.from('ai_clasificacion_reviews').insert({
    user_id: uid,
    empresa_id: empresaId,
    gasto_id: entry.gastoId ?? null,
    batch_id: entry.batchId ?? null,
    action: entry.action,
    tipo_actual: entry.tipoActual ?? null,
    subtipo_actual: entry.subtipoActual ?? null,
    tipo_sugerido: entry.tipoSugerido ?? null,
    subtipo_sugerido: entry.subtipoSugerido ?? null,
    tipo_aplicado: entry.tipoAplicado ?? null,
    subtipo_aplicado: entry.subtipoAplicado ?? null,
    confianza: entry.confianza ?? null,
    razon: entry.razon ?? null,
    aplicado_manual: entry.aplicadoManual === true,
    user_role: entry.userRole ?? null,
  });

  if (error && import.meta.env.DEV) {
    console.warn('[ai_clasificacion_reviews]', error.message);
  }
}

export async function fetchIaClasificacionAuditReciente(
  tenantEmpresaId: string | null | undefined,
  limit = 30,
): Promise<IaClasificacionAuditRow[]> {
  const empresaId = resolveEmpresaId(tenantEmpresaId);
  const { data, error } = await supabase
    .from('ai_clasificacion_reviews')
    .select(
      'id,gasto_id,batch_id,action,tipo_actual,subtipo_actual,tipo_sugerido,subtipo_sugerido,tipo_aplicado,subtipo_aplicado,confianza,razon,aplicado_manual,user_role,created_at',
    )
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (import.meta.env.DEV) console.warn('[ai_clasificacion_reviews:select]', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: Number(r.id),
    gasto_id: r.gasto_id != null ? Number(r.gasto_id) : null,
    batch_id: r.batch_id != null ? String(r.batch_id) : null,
    action: r.action as IaClasificacionAuditAction,
    tipo_actual: r.tipo_actual ?? null,
    subtipo_actual: r.subtipo_actual ?? null,
    tipo_sugerido: r.tipo_sugerido ?? null,
    subtipo_sugerido: r.subtipo_sugerido ?? null,
    tipo_aplicado: r.tipo_aplicado ?? null,
    subtipo_aplicado: r.subtipo_aplicado ?? null,
    confianza: r.confianza != null ? Number(r.confianza) : null,
    razon: r.razon ?? null,
    aplicado_manual: r.aplicado_manual === true,
    user_role: r.user_role ?? null,
    created_at: String(r.created_at),
  }));
}
