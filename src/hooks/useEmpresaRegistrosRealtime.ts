import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  realtimeLogCleanup,
  realtimeLogEmpresaMismatch,
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
  logRealtimeSubscribeMode,
  logRealtimeUnmounted,
  rtMandatoryLog,
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

/** Sin filter en postgres_changes — filtro manual en handler (bug Realtime filter). */
const MANUAL_EMPRESA_FILTER_TABLES = new Set<
  (typeof EMPRESA_TABLES)[number] | 'financial_audit_logs'
>(['ingresos', 'gastos', 'kilometrajes', 'control_fechas', 'financial_audit_logs']);

function empresaIdFromPostgresPayload(payload: {
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}): string {
  const row =
    payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old;
  return String(row?.empresa_id ?? '').trim();
}

function usesManualEmpresaFilter(
  table: (typeof EMPRESA_TABLES)[number] | 'financial_audit_logs',
): boolean {
  return MANUAL_EMPRESA_FILTER_TABLES.has(
    table as (typeof EMPRESA_TABLES)[number] | 'financial_audit_logs',
  );
}

function logTableSubscribeMode(
  table: (typeof EMPRESA_TABLES)[number] | 'financial_audit_logs',
  empresaId: string,
): void {
  const manual = usesManualEmpresaFilter(table);
  logRealtimeSubscribeMode({
    table,
    mode: manual ? 'manual_empresa_filter' : 'supabase_channel_filter',
    hasSupabaseFilter: !manual,
    empresaId,
  });
}

function rejectManualEmpresaMismatch(
  table: string,
  subscriptionEmpresaId: string,
  payload: { new: Record<string, unknown>; old: Record<string, unknown> },
  eventType: string,
): boolean {
  if (!usesManualEmpresaFilter(table as (typeof EMPRESA_TABLES)[number] | 'financial_audit_logs')) {
    return false;
  }
  const rowEmpresaId = String(
    payload.new?.empresa_id ?? payload.old?.empresa_id ?? '',
  ).trim();
  if (rowEmpresaId !== subscriptionEmpresaId) {
    if (rowEmpresaId) {
      realtimeLogEmpresaMismatch({
        table,
        event: eventType,
        empresaId: subscriptionEmpresaId,
        extra: { rowEmpresaId, filterMode: 'manual_handler' },
      });
    }
    return true;
  }
  return false;
}

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
  const realtimeEffectGenRef = useRef(0);
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
      console.warn('[realtime:waiting_auth]', {
        enabled,
        authLoading: bootMeta?.authLoading ?? false,
        profileLoaded: bootMeta?.profileLoaded ?? false,
        isAuthenticated: bootMeta?.isAuthenticated ?? false,
        empresaId: empresaId || null,
        reason: !empresaId ? 'empresa_id missing' : 'auth_or_profile_not_ready',
      });
      if (import.meta.env.DEV && !enabled) {
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
      }
      setConnected(false);
      return () => {
        /* esperando auth — sin canal activo */
      };
    }

    console.warn('[realtime:start]', {
      enabled,
      authLoading: bootMeta?.authLoading ?? false,
      profileLoaded: bootMeta?.profileLoaded ?? false,
      isAuthenticated: bootMeta?.isAuthenticated ?? false,
      empresaId,
    });

    const empresaFilter = `empresa_id=eq.${empresaId}`;
    const channelName = `empresa-registros-${empresaId}`;

    logRealtimeMounted({
      channel: channelName,
      empresaId,
      manualFilterTables: [...MANUAL_EMPRESA_FILTER_TABLES],
      channelFilterNote: 'solo vehiculos/conductores/etc — operativas sin filter en canal',
      tableCount: EMPRESA_TABLES.length,
    });

    logRealtimeSocket('effect_start', { channel: channelName, empresaId });

    const effectGen = ++realtimeEffectGenRef.current;
    let cancelled = false;
    let subscribed = false;
    let retryCount = 0;
    let activeChannel: RealtimeChannel | null = null;
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const isStaleEffect = () =>
      cancelled || realtimeEffectGenRef.current !== effectGen;

    const logReturn = (reason: string, extra?: Record<string, unknown>) => {
      console.warn('[realtime:return]', {
        reason,
        cancelled,
        enabled,
        profileLoaded: bootMeta?.profileLoaded ?? false,
        authLoading: bootMeta?.authLoading ?? false,
        effectGen,
        currentGen: realtimeEffectGenRef.current,
        empresaId,
        ...extra,
      });
    };

    const emitSubscribeStatus = (status: string, err?: Error) => {
      if (isStaleEffect()) {
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

    const processPostgresPayload = (
      table: (typeof EMPRESA_TABLES)[number] | 'financial_audit_logs',
      payload: {
        eventType?: string;
        event?: string;
        new: Record<string, unknown>;
        old: Record<string, unknown>;
      },
    ) => {
      const rawType = payload.eventType ?? payload.event ?? '';
      if (
        rejectManualEmpresaMismatch(table, empresaId, payload, rawType)
      ) {
        return;
      }

      logRealtimeRawPayload({
        table,
        rawEventType: rawType,
        hasNew: Boolean(payload.new && Object.keys(payload.new).length),
        hasOld: Boolean(payload.old && Object.keys(payload.old).length),
        rowEmpresaId: empresaIdFromPostgresPayload(payload) || null,
        filterMode: usesManualEmpresaFilter(
          table as (typeof EMPRESA_TABLES)[number] | 'financial_audit_logs',
        )
          ? 'manual'
          : 'channel',
      });

      const parsed = parsePayload(payload);
      if (!parsed) {
        logRealtimeParseMiss({ table, rawEventType: rawType, payload });
        return;
      }

      const rowId = idFromRow(
        parsed.new ?? parsed.old,
        table === 'gastos' ||
          table === 'ingresos' ||
          table === 'conductores' ||
          table === 'unidades'
          ? false
          : true,
      );

      handleRemoteDbChange({
        table: table as RemoteDbTable,
        event: parsed.eventType,
        payload: parsed,
        rowId,
      });

      if (table !== 'financial_audit_logs') {
        applyIncremental(table as (typeof EMPRESA_TABLES)[number], parsed);
      }
      scheduleBatch.current();
    };

    const buildEmpresaChannel = (): RealtimeChannel => {
      console.warn('[realtime:channel:create:start]', { channel: channelName, effectGen });
      let ch = supabase.channel(channelName);
      console.warn('[realtime:channel:create:done]', { channel: channelName, effectGen });
      let listenerCount = 0;

      rtMandatoryLog('[realtime:listeners:start]', {
        tableCount: EMPRESA_TABLES.length,
        tables: [...EMPRESA_TABLES],
        effectGen,
      });

      for (const table of EMPRESA_TABLES) {
        const manualFilter = usesManualEmpresaFilter(table);
        rtMandatoryLog('[realtime:listener:add]', {
          table,
          manualFilter,
          hasSupabaseFilter: !manualFilter,
          effectGen,
        });
        logTableSubscribeMode(table, empresaId);
        realtimeLogSubscribe({
          channel: channelName,
          table,
          empresaId,
          hasSupabaseFilter: !manualFilter,
        });
        ch = ch.on(
          'postgres_changes',
          manualFilter
            ? { event: '*', schema: 'public', table }
            : { event: '*', schema: 'public', table, filter: empresaFilter },
          (payload) => {
            processPostgresPayload(table, {
              eventType: payload.eventType,
              event: (payload as { event?: string }).event,
              new: (payload.new ?? {}) as Record<string, unknown>,
              old: (payload.old ?? {}) as Record<string, unknown>,
            });
          },
        );
        listenerCount += 1;
      }

      if (canViewFinancialAuditLogs(permissionUserRef.current)) {
        rtMandatoryLog('[realtime:listener:add]', {
          table: 'financial_audit_logs',
          manualFilter: true,
          hasSupabaseFilter: false,
          effectGen,
        });
        logTableSubscribeMode('financial_audit_logs', empresaId);
        realtimeLogSubscribe({
          channel: channelName,
          table: 'financial_audit_logs',
          empresaId,
          hasSupabaseFilter: false,
        });
        ch = ch.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'financial_audit_logs',
          },
          (payload) => {
            processPostgresPayload('financial_audit_logs', {
              eventType: payload.eventType ?? 'INSERT',
              new: (payload.new ?? {}) as Record<string, unknown>,
              old: (payload.old ?? {}) as Record<string, unknown>,
            });
          },
        );
        listenerCount += 1;
      }

      rtMandatoryLog('[realtime:listeners:done]', { count: listenerCount, effectGen });

      return ch;
    };

    const subscribeActiveChannel = (ch: RealtimeChannel) => {
      activeChannel = ch;
      channelRef.current = ch;
      rtMandatoryLog('[realtime:subscribe:call]', { channel: channelName, effectGen });
      ch.subscribe((status, err) => {
        emitSubscribeStatus(status, err);
        if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          scheduleSubscribeRetry(status);
        }
      });
    };

    void (async () => {
      try {
        console.warn('[realtime:flow]', 'before_socket_ready', { effectGen, channel: channelName });
        let socketInfo = await ensureRealtimeSocketReady();
        console.warn('[realtime:flow]', 'after_socket_ready', {
          effectGen,
          socketOpen: socketInfo.socketOpen,
          hasSession: socketInfo.hasSession,
        });

        if (isStaleEffect()) {
          logReturn('stale_after_socket_ready', {
            staleCancelled: cancelled,
            staleGenMismatch: realtimeEffectGenRef.current !== effectGen,
          });
          return;
        }

        if (!socketInfo.socketOpen) {
          console.warn('[realtime:flow]', 'reconnect_attempt', { effectGen });
          const reopened = await reconnectRealtimeSocket('initial_socket_closed');
          if (isStaleEffect()) {
            logReturn('stale_after_reconnect');
            return;
          }
          socketInfo = { ...socketInfo, socketOpen: reopened, socketState: reopened ? 'open' : 'closed' };
        }

        console.warn('[realtime:flow]', 'before_subscribe_start_log', { effectGen });
        logRealtimeSubscribeStart({
          channel: channelName,
          empresaId,
          manualFilterTables: [...MANUAL_EMPRESA_FILTER_TABLES],
          channelFilterTables: EMPRESA_TABLES.filter((t) => !usesManualEmpresaFilter(t)),
          tables: [...EMPRESA_TABLES],
          hasSession: socketInfo.hasSession,
          sessionUserId: socketInfo.sessionUserId,
          socketOpen: socketInfo.socketOpen,
          effectGen,
          ...getRealtimeSocketDiag(),
        });

        if (isStaleEffect()) {
          logReturn('stale_before_build_channel', {
            staleCancelled: cancelled,
            staleGenMismatch: realtimeEffectGenRef.current !== effectGen,
          });
          return;
        }

        console.warn('[realtime:flow]', 'before_build_channel', { effectGen });
        realtimeRegistry.register(channelName);
        const channel = buildEmpresaChannel();

        if (isStaleEffect()) {
          logReturn('stale_after_build_channel');
          void supabase.removeChannel(channel);
          return;
        }

        subscribeActiveChannel(channel);

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
            if (isStaleEffect() || subscribed) return;
            if (supabase.realtime.isConnected()) return;

            console.warn('[realtime:watchdog:3s] socket sigue closed — reconnect + nuevo canal');
            const reopened = await reconnectRealtimeSocket('watchdog_3s');
            if (cancelled || !reopened) return;

            if (activeChannel) {
              await supabase.removeChannel(activeChannel);
            }
            if (isStaleEffect()) return;

            const freshChannel = buildEmpresaChannel();
            if (isStaleEffect()) {
              void supabase.removeChannel(freshChannel);
              return;
            }
            subscribeActiveChannel(freshChannel);
          })();
        }, 3000);

        watchdogTimer = setTimeout(() => {
          if (isStaleEffect()) return;
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
              if (isStaleEffect()) return;
              if (!supabase.realtime.isConnected()) {
                await reconnectRealtimeSocket('watchdog_5s');
              }
              if (isStaleEffect() || !activeChannel) return;
              scheduleSubscribeRetry('watchdog_not_subscribed');
            })();
          }
        }, 5000);
      } catch (e) {
        console.error('[realtime:fatal]', e);
        logReturn('async_fatal', { error: e instanceof Error ? e.message : String(e) });
      }
    })();

    const cleanupRealtime = () => {
      cancelled = true;
      rtMandatoryLog('[realtime:effect:cleanup]', { channel: channelName, effectGen });
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
      activeChannel = null;
      channelRef.current = null;
    };

    return () => {
      cleanupRealtime();
    };
  }, [
    enabled,
    empresaIdInput,
    bootMeta?.authLoading,
    bootMeta?.profileLoaded,
    bootMeta?.isAuthenticated,
    bootMeta?.role,
    bootMeta?.userId,
  ]);

  return { connected };
}
