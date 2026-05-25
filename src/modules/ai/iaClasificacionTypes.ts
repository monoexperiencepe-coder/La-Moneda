import type {
  ClasificacionMemoriaMatchInfo,
  ClasificacionSugerenciaFuente,
} from './clasificacionMemoriaTypes';

/** Fila del Centro de Clasificación IA (solo sugerencias, sin aplicar). */

export type IaClasificacionUiStatus =
  | 'pendiente'
  | 'revisado'
  | 'aplicado'
  | 'ignorado'
  | 'error'
  | 'seleccionado'
  | 'aplicando'
  | 'aplicado_lote'
  | 'error_lote';

/** Tipos de gasto que muestra el centro IA (cola pendiente + globales). */
export const IA_CLASIFICACION_QUEUE_TIPOS = ['pendiente_revision', 'gastos_globales'] as const;

export type IaPendienteSugerencia = {
  id: number;
  fecha: string;
  monto: number;
  motivo: string | null;
  comentario: string | null;
  tipo_actual: string | null;
  subtipo_actual: string | null;
  vehicle_id: number | string | null;
  placa: string | null;
  tipo_gasto_sugerido: string | null;
  subtipo_sugerido: string | null;
  razon: string;
  confianza: number;
  necesita_revision_humana: boolean;
  fuente: ClasificacionSugerenciaFuente;
  memoria_match: ClasificacionMemoriaMatchInfo | null;
};

export type IaPendientesConSugerenciaPayload = {
  count: number;
  totalPendientes: number;
  totalGlobales: number;
  sugerencias: IaPendienteSugerencia[];
  nota?: string;
};

export type IaClasificacionAuditAction =
  | 'batch_analyze'
  | 'marcar_revisado'
  | 'ocultar'
  | 'reanalizar'
  | 'aplicar_sugerencia'
  | 'error_aplicar'
  | 'aplicar_sugerencia_lote'
  | 'error_aplicar_lote'
  | 'lote_completado';

export type IaClasificacionAuditRow = {
  id: number;
  gasto_id: number | null;
  batch_id: string | null;
  action: IaClasificacionAuditAction;
  tipo_actual: string | null;
  subtipo_actual: string | null;
  tipo_sugerido: string | null;
  subtipo_sugerido: string | null;
  tipo_aplicado: string | null;
  subtipo_aplicado: string | null;
  confianza: number | null;
  razon: string | null;
  aplicado_manual: boolean;
  user_role: string | null;
  created_at: string;
};
