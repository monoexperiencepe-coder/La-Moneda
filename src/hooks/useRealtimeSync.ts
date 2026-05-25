/**
 * Punto de entrada centralizado para sincronización realtime de la empresa.
 * Delega en useEmpresaRegistrosRealtime (un canal, todas las tablas operativas).
 */
export {
  useEmpresaRegistrosRealtime as useRealtimeSync,
  type EmpresaRealtimeHandlers,
  AUDIT_LOGS_REALTIME_EVENT,
} from './useEmpresaRegistrosRealtime';
export { resolveEmpresaRealtimeId } from '../utils/resolveEmpresaRealtimeId';
export { realtimeRegistry, realtimeLogEvent } from '../utils/realtimeDebug';
