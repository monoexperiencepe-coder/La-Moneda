import { realtimeLogEmpresaMismatch, realtimeLogEvent, realtimeLogRefresh, realtimeLogRefreshDone } from './realtimeDebug';
import { shouldRefetchAfterRealtime } from './realtimeRefetchPolicy';

export type RemoteDbTable =
  | 'gastos'
  | 'ingresos'
  | 'kilometrajes'
  | 'control_fechas'
  | 'financial_audit_logs'
  | 'vehiculos'
  | 'unidades'
  | 'conductores'
  | 'pendientes'
  | 'registros_tiempo'
  | 'inversiones_vehiculo'
  | 'gastos_caja'
  | 'caja_negocio_vehiculo';

export type RemoteDbEvent = 'INSERT' | 'UPDATE' | 'DELETE';

export type RemoteDbPayload = {
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

export interface RemoteDbRefreshHandlers {
  reloadGastosOnly: () => Promise<void>;
  reloadIngresosOnly: () => Promise<void>;
  reloadKilometrajesOnly: () => Promise<void>;
  reloadControlFechasLatest: () => Promise<void>;
  refreshControlFechasViews?: () => Promise<void>;
  reloadGastosFinancialSummary?: (opts?: { silent?: boolean }) => Promise<void>;
  onAuditLogsRemote: () => void;
  bumpRemoteTick?: () => void;
}

const REFETCH_DEBOUNCE_MS = 400;

const TABLE_REFETCH: Partial<Record<RemoteDbTable, keyof RemoteDbRefreshHandlers | 'audit'>> = {
  // gastos/ingresos se aplican incrementalmente; no reconciliar miles de filas
  // después de cada evento normal de Realtime.
  kilometrajes: 'reloadKilometrajesOnly',
  control_fechas: 'reloadControlFechasLatest',
  financial_audit_logs: 'audit',
};

function empresaIdFromPayload(payload: RemoteDbPayload): string {
  const row = payload.new ?? payload.old;
  return String(row?.empresa_id ?? '').trim();
}

export function createRemoteDbChangeHandler(
  handlers: RemoteDbRefreshHandlers,
  subscriptionEmpresaId: string,
) {
  const debounceTimers = new Map<RemoteDbTable, ReturnType<typeof setTimeout>>();
  const inFlight = new Map<RemoteDbTable, Promise<void>>();

  async function executeRefetch(table: RemoteDbTable, reason: string): Promise<void> {
    realtimeLogRefresh({ table, extra: { reason, subscriptionEmpresaId } });
    try {
      if (table === 'gastos') {
        await handlers.reloadGastosOnly();
        await handlers.reloadGastosFinancialSummary?.({ silent: true });
      } else if (table === 'ingresos') {
        await handlers.reloadIngresosOnly();
      } else if (table === 'kilometrajes') {
        await handlers.reloadKilometrajesOnly();
      } else if (table === 'control_fechas') {
        console.warn('[realtime:control_fechas:refresh:start]', { reason });
        await handlers.reloadControlFechasLatest();
        await handlers.refreshControlFechasViews?.();
        console.warn('[realtime:control_fechas:refresh:done]', { reason });
      } else if (table === 'financial_audit_logs') {
        handlers.onAuditLogsRemote();
      }
      realtimeLogRefreshDone({ table, extra: { reason } });
    } catch (err) {
      realtimeLogRefreshDone({
        table,
        extra: { reason, error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  function scheduleRefetch(table: RemoteDbTable, reason: string): void {
    const existing = debounceTimers.get(table);
    if (existing) clearTimeout(existing);
    debounceTimers.set(
      table,
      setTimeout(() => {
        debounceTimers.delete(table);
        const prev = inFlight.get(table);
        const next = (async () => {
          if (prev) await prev.catch(() => undefined);
          await executeRefetch(table, reason);
        })();
        inFlight.set(table, next);
        void next.finally(() => {
          if (inFlight.get(table) === next) inFlight.delete(table);
        });
      }, REFETCH_DEBOUNCE_MS),
    );
  }

  return function handleRemoteDbChange(args: {
    table: RemoteDbTable;
    event: RemoteDbEvent;
    payload: RemoteDbPayload;
    rowId?: string | number | null;
  }): void {
    const { table, event, payload, rowId } = args;
    const rowEmpresaId = empresaIdFromPayload(payload);

    if (rowEmpresaId && subscriptionEmpresaId && rowEmpresaId !== subscriptionEmpresaId) {
      realtimeLogEmpresaMismatch({
        table,
        event,
        rowId,
        empresaId: subscriptionEmpresaId,
        extra: { rowEmpresaId },
      });
      return;
    }

    realtimeLogEvent({
      table,
      event,
      rowId,
      empresaId: subscriptionEmpresaId,
      extra: rowEmpresaId ? { rowEmpresaId } : { note: 'sin empresa_id en payload (DELETE sin REPLICA FULL?)' },
    });

    handlers.bumpRemoteTick?.();

    const refetchKey = shouldRefetchAfterRealtime(table) ? TABLE_REFETCH[table] : undefined;
    if (refetchKey === 'audit') {
      handlers.onAuditLogsRemote();
      realtimeLogRefresh({ table, extra: { reason: 'remote_event_audit' } });
      realtimeLogRefreshDone({ table, extra: { reason: 'remote_event_audit' } });
      return;
    }
    if (refetchKey) {
      scheduleRefetch(table, 'remote_event');
    }
  };
}

export function disposeRemoteDbChangeHandler(
  handler: ReturnType<typeof createRemoteDbChangeHandler>,
): void {
  void handler;
}
