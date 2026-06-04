/** Tipos de mutación reversibles. */
export type UndoActionType = 'create' | 'update' | 'delete' | 'move';

/** Entidades con soporte de undo (extensible). */
export type UndoEntityType =
  | 'gasto'
  | 'ingreso'
  | 'conductor'
  | 'aporte'
  | 'kilometraje'
  | 'pendiente'
  | 'prestamo'
  | 'control_fecha'
  | 'other';

/** Última acción reversible en memoria (solo esta sesión de pestaña). */
export type UndoAction = {
  id: string;
  type: UndoActionType;
  /** Descripción humana: «Conductor actualizado», «Gasto eliminado», etc. */
  label: string;
  entityType: UndoEntityType;
  entityId?: string;
  timestamp: number;
  undo: () => Promise<void>;
};

export type RegisterUndoInput = Omit<UndoAction, 'id' | 'timestamp'>;

export type UndoExecuteResult = 'ok' | 'fail' | 'noop' | 'stale';

/** Duración del toast de éxito (independiente del undo en sesión). */
export { TOAST_UNDO_MS as DEFAULT_UNDO_TOAST_MS } from '../config/toastTiming';
