import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  realtimeLogCleanup,
  realtimeLogSubscribe,
  realtimeRegistry,
} from '../utils/realtimeDebug';
import {
  createRemoteDbChangeHandler,
  type RemoteDbEvent,
  type RemoteDbPayload,
  type RemoteDbTable,
} from '../utils/handleRemoteDbChange';
import {
  mapCajaNegocioVehiculoRow,
  mapConductorRow,
  mapGastoCajaRow,
  mapGastoRow,
  mapIngresoRow,
  mapInversionVehiculoRow,
  mapKilometrajeRow,
  mapPendienteRow,
  mapRegistroTiempoRow,
  mapUnidadRow,
  mapVehiculoRow,
} from '../services/supabaseMappers';
import type {
  CajaNegocioVehiculo,
  Conductor,
  Gasto,
  GastoCaja,
  Ingreso,
  InversionVehiculo,
  KilometrajeRegistro,
  Pendiente,
  RegistroTiempo,
  UnidadRegistro,
  Vehicle,
} from '../data/types';
import type { ApplyGastoLocalOpts } from '../utils/gastoLocalMutations';
import {
  canUseIngresos,
  canUseInversiones,
  canViewFinancialAuditLogs,
  canViewGastoTipo,
  type PermissionUser,
} from '../utils/permissions';
import {
  mountRealtimeDebugUnfilteredChannel,
  unmountRealtimeDebugUnfilteredChannel,
} from '../utils/realtimeDebugUnfilteredChannel';
import {
  ensureRealtimeSocketReady,
  getRealtimeSocketDiag,
  logRealtimeSocket,
  reconnectRealtimeSocket,
} from '../utils/realtimeSocketDiag';
import {
  isRealtimeDebugEnv,
  logRealtimeBoot,
  logRealtimeDisabled,
  logRealtimeModuleLoaded,
  logRealtimeMounted,
  logRealtimeParseMiss,
  logRealtimeRawPayload,
  logRealtimeSubscribeDone,
  logRealtimeSubscribeStart,
  logRealtimeUnmounted,
} from '../utils/realtimeBootLog';

logRealtimeModuleLoaded('useEmpresaRegistrosRealtime');

/** Historial del sistema: recargar lista al insertar un log (local o remoto). */
export const AUDIT_LOGS_REALTIME_EVENT = 'la-moneda:audit-logs-changed';

type RealtimePayload = RemoteDbPayload & {
  eventType: RemoteDbEvent;
};

export type EmpresaRealtimeHandlers = {
  upsertGasto: (row: Gasto, opts?: ApplyGastoLocalOpts) => void;
  removeGastoLocal: (id: string, opts?: ApplyGastoLocalOpts) => void;
  upsertIngreso: (row: Ingreso) => void;
  removeIngresoLocal: (id: string) => void;
  upsertConductor: (row: Conductor) => void;
  removeConductorLocal: (id: string) => void;
  upsertUnidad: (row: UnidadRegistro) => void;
  removeUnidadLocal: (id: string) => void;
  upsertVehicle: (row: Vehicle) => void;
  removeVehicleLocal: (id: number) => void;
  mergeKilometraje: (row: KilometrajeRegistro) => void;
  removeKilometrajeLocal: (id: number) => void;
  mergePendiente: (row: Pendiente) => void;
  removePendienteLocal: (id: number) => void;
  upsertRegistroTiempo: (row: RegistroTiempo) => void;
  removeRegistroTiempoLocal: (id: number) => void;
  upsertInversionVehiculo: (row: InversionVehiculo) => void;
  removeInversionVehiculoLocal: (id: number) => void;
  upsertGastoCaja: (row: GastoCaja) => void;
  removeGastoCajaLocal: (id: number) => void;
  upsertCajaNegocio: (row: CajaNegocioVehiculo) => void;
  removeCajaNegocioLocal: (id: number) => void;
  refreshControlFechasViews: () => void | Promise<void>;
  reloadKilometrajesOnly: () => void | Promise<void>;
  reloadControlFechasLatest: () => void | Promise<void>;
  reloadGastosOnly: () => void | Promise<void>;
  reloadIngresosOnly: () => void | Promise<void>;
  reloadGastosFinancialSummary?: (opts?: { silent?: boolean }) => Promise<void>;
};

type RealtimeBootMeta = {
  isAuthenticated?: boolean;
  authLoading?: boolean;
  profileLoaded?: boolean;
  profileEmpresaId?: string | null;
  role?: string | null;
  userId?: string | null;
};

type Options = {
  enabled: boolean;
  empresaId: string | null | undefined;
  permissionUser: PermissionUser | null;
  handlers: EmpresaRealtimeHandlers;
  onRemoteActivity?: (info: { count: number }) => void;
  onRemoteMutation?: () => void;
  bootMeta?: RealtimeBootMeta;
};

const BATCH_MS = 2500;

const EMPRESA_TABLES = [
  'vehiculos',
  'unidades',
  'conductores',
  'ingresos',
  'gastos',
  'control_fechas',
  'kilometrajes',
  'pendientes',
  'registros_tiempo',
  'inversiones_vehiculo',
  'gastos_caja',
  'caja_negocio_vehiculo',
] as const satisfies readonly RemoteDbTable[];

function parsePayload(payload: {
  eventType?: string;
  event?: string;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}): RealtimePayload | null {
  const rawType = payload.eventType ?? payload.event ?? '';
  if (rawType !== 'INSERT' && rawType !== 'UPDATE' && rawType !== 'DELETE') return null;
  return {
    eventType: rawType,
    new: payload.new ?? null,
    old: payload.old ?? null,
  };
}

function idFromRow(
  row: Record<string, unknown> | null,
  numeric: boolean,
): string | number | null {
  if (!row) return null;
  const raw = row.id ?? row.ID;
  if (raw == null || raw === '') return null;
  if (numeric) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return String(raw);
}

export function useEmpresaRegistrosRealtime({
  enabled,
  empresaId: empresaIdInput,
  permissionUser,
  handlers,
  onRemoteActivity,
  onRemoteMutation,
  bootMeta,
}: Options): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const permissionUserRef = useRef(permissionUser);
  permissionUserRef.current = permissionUser;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const batchRef = useRef({ count: 0 });
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRemoteMutationRef = useRef(onRemoteMutation);
  onRemoteMutationRef.current = onRemoteMutation;

  const scheduleBatch = useRef(() => {
    batchRef.current.count += 1;
    if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    batchTimerRef.current = setTimeout(() => {
      const n = batchRef.current.count;
      batchRef.current.count = 0;
      batchTimerRef.current = null;
      if (n > 0) onRemoteActivity?.({ count: n });
    }, BATCH_MS);
  });

  useEffect(() => {
    scheduleBatch.current = () => {
      batchRef.current.count += 1;
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      batchTimerRef.current = setTimeout(() => {
        const n = batchRef.current.count;
        batchRef.current.count = 0;
        batchTimerRef.current = null;
        if (n > 0) onRemoteActivity?.({ count: n });
      }, BATCH_MS);
    };
  }, [onRemoteActivity]);

  useEffect(() => {
    logRealtimeBoot({
      source: 'useEmpresaRegistrosRealtime',
      isAuthenticated: bootMeta?.isAuthenticated ?? false,
      authLoading: bootMeta?.authLoading,
      profileLoaded: bootMeta?.profileLoaded,
      profileEmpresaId: bootMeta?.profileEmpresaId,
      empresaRealtimeId: (empresaIdInput ?? '').trim(),
      enabled,
      role: bootMeta?.role ?? permissionUser?.role ?? null,
      userId: bootMeta?.userId ?? null,
      hookMounted: true,
    });
  }, [
    enabled,
    empresaIdInput,
    bootMeta?.isAuthenticated,
    bootMeta?.authLoading,
    bootMeta?.profileLoaded,
    bootMeta?.profileEmpresaId,
    bootMeta?.role,
    bootMeta?.userId,
    permissionUser?.role,
  ]);

  useEffect(() => {
    const empresaId = (empresaIdInput ?? '').trim();
    if (!enabled || !empresaId) {
      logRealtimeDisabled({
        source: 'useEmpresaRegistrosRealtime',
        isAuthenticated: bootMeta?.isAuthenticated ?? false,
        authLoading: bootMeta?.authLoading,
        profileLoaded: bootMeta?.profileLoaded,
        profileEmpresaId: bootMeta?.profileEmpresaId,
        empresaRealtimeId: empresaId,
        empresaId: empresaId || null,
        enabled,
        role: bootMeta?.role ?? permissionUser?.role ?? null,
        userId: bootMeta?.userId ?? null,
        hookMounted: true,
      });
      setConnected(false);
      return;
    }

    const empresaFilter = `empresa_id=eq.${empresaId}`;
    const channelName = `empresa-registros-${empresaId}`;

    logRealtimeMounted({
      channel: channelName,
      empresaId,
      filter: empresaFilter,
      tableCount: EMPRESA_TABLES.length,
    });

    logRealtimeSocket('effect_start', { channel: channelName, empresaId });

    let cancelled = false;
    let subscribed = false;
    let retryCount = 0;
    let activeChannel: RealtimeChannel | null = null;
    let debugUnfilteredChannel: RealtimeChannel | null = null;
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const emitSubscribeStatus = (status: string, err?: Error) => {
      if (cancelled) {
        console.warn('[realtime:status:ignored]', {
          status,
          channel: channelName,
          reason: 'effect_cleanup',
        });
        return;
      }

      subscribed = status === 'SUBSCRIBED';
      setConnected(subscribed);

      const statusPayload = {
        status,
        err: err?.message ?? null,
        errName: err?.name ?? null,
        channel: channelName,
        empresaId,
        channelState: activeChannel?.state ?? null,
        subscribed,
        retryCount,
        ...getRealtimeSocketDiag(),
      };

      console.warn('[realtime:status]', statusPayload);
      console.warn('[realtime:status:json]', JSON.stringify(statusPayload, null, 2));

      if (isRealtimeDebugEnv() && status !== 'SUBSCRIBED') {
        console.warn('[realtime:status] canal no SUBSCRIBED — revisar socket, publication o JWT', statusPayload);
      }
    };

    const handleRemoteDbChange = createRemoteDbChangeHandler(
      {
        reloadGastosOnly: () => Promise.resolve(handlersRef.current.reloadGastosOnly()),
        reloadIngresosOnly: () => Promise.resolve(handlersRef.current.reloadIngresosOnly()),
        reloadKilometrajesOnly: () => Promise.resolve(handlersRef.current.reloadKilometrajesOnly()),
        reloadControlFechasLatest: () => Promise.resolve(handlersRef.current.reloadControlFechasLatest()),
        refreshControlFechasViews: () => Promise.resolve(handlersRef.current.refreshControlFechasViews()),
        reloadGastosFinancialSummary: handlersRef.current.reloadGastosFinancialSummary,
        onAuditLogsRemote: () => {
          window.dispatchEvent(new CustomEvent(AUDIT_LOGS_REALTIME_EVENT));
        },
        bumpRemoteTick: () => onRemoteMutationRef.current?.(),
      },
      empresaId,
    );

    const applyIncremental = (table: (typeof EMPRESA_TABLES)[number], parsed: RealtimePayload) => {
      const h = handlersRef.current;
      const pu = permissionUserRef.current;
      const { eventType } = parsed;
      const canFinanzasSecundarias = canUseInversiones(pu);

      switch (table) {
        case 'gastos': {
          if (eventType === 'DELETE') {
            const id = idFromRow(parsed.old, false);
            if (typeof id === 'string' && id) h.removeGastoLocal(id, { source: 'realtime' });
            return;
          }
          if (!parsed.new) return;
          const mapped = mapGastoRow(parsed.new);
          const visible = canViewGastoTipo(pu, mapped.tipo_gasto ?? null);
          if (visible) h.upsertGasto(mapped, { source: 'realtime' });
          else h.removeGastoLocal(mapped.id, { source: 'realtime' });
          return;
        }
        case 'ingresos': {
          if (!canUseIngresos(pu)) return;
          if (eventType === 'DELETE') {
            const id = idFromRow(parsed.old, false);
            if (typeof id === 'string' && id) h.removeIngresoLocal(id);
            return;
          }
          if (parsed.new) h.upsertIngreso(mapIngresoRow(parsed.new));
          return;
        }
        case 'kilometrajes': {
          if (eventType === 'DELETE') {
            const id = idFromRow(parsed.old, true);
            if (typeof id === 'number') h.removeKilometrajeLocal(id);
            return;
          }
          if (parsed.new) h.mergeKilometraje(mapKilometrajeRow(parsed.new));
          return;
        }
        case 'control_fechas':
          return;
        case 'conductores': {
          if (eventType === 'DELETE') {
            const id = idFromRow(parsed.old, false);
            if (typeof id === 'string' && id) h.removeConductorLocal(id);
            return;
          }
          if (parsed.new) h.upsertConductor(mapConductorRow(parsed.new));
          return;
        }
        case 'unidades': {
          if (eventType === 'DELETE') {
            const id = idFromRow(parsed.old, false);
            if (typeof id === 'string' && id) h.removeUnidadLocal(id);
            return;
          }
          if (parsed.new) h.upsertUnidad(mapUnidadRow(parsed.new));
          return;
        }
        case 'vehiculos': {
          if (eventType === 'DELETE') {
            const id = idFromRow(parsed.old, true);
            if (typeof id === 'number') h.removeVehicleLocal(id);
            return;
          }
          if (parsed.new) h.upsertVehicle(mapVehiculoRow(parsed.new));
          return;
        }
        case 'pendientes': {
          if (eventType === 'DELETE') {
            const id = idFromRow(parsed.old, true);
            if (typeof id === 'number') h.removePendienteLocal(id);
            return;
          }
          if (parsed.new) h.mergePendiente(mapPendienteRow(parsed.new));
          return;
        }
        case 'registros_tiempo': {
          if (eventType === 'DELETE') {
            const id = idFromRow(parsed.old, true);
            if (typeof id === 'number') h.removeRegistroTiempoLocal(id);
            return;
          }
          if (parsed.new) h.upsertRegistroTiempo(mapRegistroTiempoRow(parsed.new));
          return;
        }
        case 'inversiones_vehiculo': {
          if (!canFinanzasSecundarias) return;
          if (eventType === 'DELETE') {
            const id = idFromRow(parsed.old, true);
            if (typeof id === 'number') h.removeInversionVehiculoLocal(id);
            return;
          }
          if (parsed.new) h.upsertInversionVehiculo(mapInversionVehiculoRow(parsed.new));
          return;
        }
        case 'gastos_caja': {
          if (!canFinanzasSecundarias) return;
          if (eventType === 'DELETE') {
            const id = idFromRow(parsed.old, true);
            if (typeof id === 'number') h.removeGastoCajaLocal(id);
            return;
          }
          if (parsed.new) h.upsertGastoCaja(mapGastoCajaRow(parsed.new));
          return;
        }
        case 'caja_negocio_vehiculo': {
          if (!canFinanzasSecundarias) return;
          if (eventType === 'DELETE') {
            const id = idFromRow(parsed.old, true);
            if (typeof id === 'number') h.removeCajaNegocioLocal(id);
            return;
          }
          if (parsed.new) h.upsertCajaNegocio(mapCajaNegocioVehiculoRow(parsed.new));
          return;
        }
        default:
          return;
      }
    };

    const scheduleSubscribeRetry = (reason: string) => {
      if (cancelled || retryCount >= 3 || !activeChannel) return;
      retryCount += 1;
      const delayMs = 1500 * retryCount;
      console.warn('[realtime:retry:scheduled]', {
        reason,
        retryCount,
        delayMs,
        channel: channelName,
        ...getRealtimeSocketDiag(),
      });
      retryTimer = setTimeout(() => {
        void (async () => {
          if (cancelled || !activeChannel) return;
          console.warn('[realtime:retry]', { retryCount, reason, channel: channelName });
          if (!supabase.realtime.isConnected()) {
            const reopened = await reconnectRealtimeSocket(`retry_${reason}`);
            if (!reopened || cancelled) return;
          }
          activeChannel.subscribe(emitSubscribeStatus);
        })();
      }, delayMs);
    };

    const buildEmpresaChannel = (): RealtimeChannel => {
      let ch = supabase.channel(channelName);

      for (const table of EMPRESA_TABLES) {
        realtimeLogSubscribe({ channel: channelName, table, empresaId });
        ch = ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: empresaFilter },
          (payload) => {
            const rawType = payload.eventType ?? (payload as { event?: string }).event ?? '';
            logRealtimeRawPayload({
              table,
              rawEventType: rawType,
              hasNew: Boolean(payload.new && Object.keys(payload.new).length),
              hasOld: Boolean(payload.old && Object.keys(payload.old).length),
              rowEmpresaId:
                (payload.new as Record<string, unknown> | undefined)?.empresa_id ??
                (payload.old as Record<string, unknown> | undefined)?.empresa_id ??
                null,
            });

            const parsed = parsePayload(payload);
            if (!parsed) {
              logRealtimeParseMiss({ table, rawEventType: rawType, payload });
              return;
            }

            const rowId = idFromRow(
              parsed.new ?? parsed.old,
              table === 'gastos' || table === 'ingresos' || table === 'conductores' || table === 'unidades'
                ? false
                : true,
            );

            handleRemoteDbChange({
              table,
              event: parsed.eventType,
              payload: parsed,
              rowId,
            });

            applyIncremental(table, parsed);
            scheduleBatch.current();
          },
        );
      }

      if (canViewFinancialAuditLogs(permissionUserRef.current)) {
        realtimeLogSubscribe({
          channel: channelName,
          table: 'financial_audit_logs',
          empresaId,
        });
        ch = ch.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'financial_audit_logs',
            filter: empresaFilter,
          },
          (payload) => {
            const parsed = parsePayload(payload);
            if (!parsed) return;
            handleRemoteDbChange({
              table: 'financial_audit_logs',
              event: 'INSERT',
              payload: parsed,
              rowId: idFromRow(parsed.new, true),
            });
            scheduleBatch.current();
          },
        );
      }

      return ch;
    };

    const subscribeActiveChannel = (ch: RealtimeChannel) => {
      activeChannel = ch;
      channelRef.current = ch;
      ch.subscribe((status, err) => {
        emitSubscribeStatus(status, err);
        if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          scheduleSubscribeRetry(status);
        }
      });
    };

    void (async () => {
      let socketInfo = await ensureRealtimeSocketReady();
      if (cancelled) return;

      if (!socketInfo.socketOpen) {
        const reopened = await reconnectRealtimeSocket('initial_socket_closed');
        if (cancelled) return;
        socketInfo = { ...socketInfo, socketOpen: reopened, socketState: reopened ? 'open' : 'closed' };
      }

      logRealtimeSubscribeStart({
        channel: channelName,
        empresaId,
        filter: empresaFilter,
        tables: [...EMPRESA_TABLES],
        hasSession: socketInfo.hasSession,
        sessionUserId: socketInfo.sessionUserId,
        socketOpen: socketInfo.socketOpen,
        ...getRealtimeSocketDiag(),
      });

      if (cancelled) return;

      realtimeRegistry.register(channelName);
      const channel = buildEmpresaChannel();
      if (cancelled) {
        void supabase.removeChannel(channel);
        return;
      }

      subscribeActiveChannel(channel);

      debugUnfilteredChannel = mountRealtimeDebugUnfilteredChannel({
        adminEmpresaId: empresaId,
        adminUserId: bootMeta?.userId ?? null,
        adminRole: bootMeta?.role ?? permissionUserRef.current?.role ?? null,
        filteredChannel: channelName,
      });

      logRealtimeSubscribeDone({
        channel: channelName,
        empresaId,
        listeners:
          EMPRESA_TABLES.length +
          (canViewFinancialAuditLogs(permissionUserRef.current) ? 1 : 0),
        ...getRealtimeSocketDiag(),
      });

      setTimeout(() => {
        void (async () => {
          if (cancelled || subscribed) return;
          if (supabase.realtime.isConnected()) return;

          console.warn('[realtime:watchdog:3s] socket sigue closed — reconnect + nuevo canal');
          const reopened = await reconnectRealtimeSocket('watchdog_3s');
          if (cancelled || !reopened) return;

          if (activeChannel) {
            await supabase.removeChannel(activeChannel);
          }
          if (cancelled) return;

          const freshChannel = buildEmpresaChannel();
          subscribeActiveChannel(freshChannel);
        })();
      }, 3000);

      watchdogTimer = setTimeout(() => {
        if (cancelled) return;
        const watchdogPayload = {
          subscribed,
          channel: channelName,
          empresaId,
          channelState: activeChannel?.state ?? null,
          retryCount,
          cancelled,
          ...getRealtimeSocketDiag(),
        };
        console.warn('[realtime:watchdog]', watchdogPayload);
        console.warn('[realtime:watchdog:json]', JSON.stringify(watchdogPayload, null, 2));

        if (!subscribed) {
          void (async () => {
            if (cancelled) return;
            if (!supabase.realtime.isConnected()) {
              await reconnectRealtimeSocket('watchdog_5s');
            }
            if (cancelled || !activeChannel) return;
            scheduleSubscribeRetry('watchdog_not_subscribed');
          })();
        }
      }, 5000);
    })();

    return () => {
      cancelled = true;
      if (watchdogTimer) clearTimeout(watchdogTimer);
      if (retryTimer) clearTimeout(retryTimer);
      logRealtimeUnmounted({ channel: channelName, empresaId, reason: 'effect_cleanup' });
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      setConnected(false);
      realtimeLogCleanup({ channel: channelName, empresaId });
      realtimeRegistry.unregister(channelName);
      const ch = activeChannel ?? channelRef.current;
      if (ch) {
        console.warn('[realtime:cleanup]', {
          channel: channelName,
          channelState: ch.state,
          ...getRealtimeSocketDiag(),
        });
        void supabase.removeChannel(ch);
      }
      void unmountRealtimeDebugUnfilteredChannel(debugUnfilteredChannel);
      debugUnfilteredChannel = null;
      activeChannel = null;
      channelRef.current = null;
    };
  }, [enabled, empresaIdInput]);

  return { connected };
}
