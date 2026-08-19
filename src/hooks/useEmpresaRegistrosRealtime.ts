import { useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  realtimeLogCleanup,
  realtimeLogEmpresaMismatch,
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
  removeControlFechaLocal: (id: number) => void;
  refreshControlFechasViews: () => void | Promise<void>;
  reloadKilometrajesOnly: () => void | Promise<void>;
  reloadControlFechasLatest: () => void | Promise<void>;
  reloadGastosOnly: () => void | Promise<void>;
  reloadIngresosOnly: () => void | Promise<void>;
  reloadGastosFinancialSummary?: (opts?: { silent?: boolean }) => Promise<void>;
  markGastosFullStale?: () => void;
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
  userId?: string | null;
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
  if (eventType === 'DELETE' && !rowEmpresaId) {
    return false;
  }
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
  const rawType = (payload.eventType ?? payload.event ?? '').toUpperCase();
  if (rawType !== 'INSERT' && rawType !== 'UPDATE' && rawType !== 'DELETE') return null;
  return {
    eventType: rawType,
    new: rawType === 'DELETE' ? null : (payload.new ?? null),
    old: rawType === 'DELETE' ? (payload.old ?? {}) : (payload.old ?? null),
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
  userId: userIdInput,
  permissionUser,
  handlers,
  onRemoteActivity,
  onRemoteMutation,
  bootMeta,
}: Options): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const realtimeEffectGenRef = useRef(0);
  const realtimeStartedRef = useRef(false);
  const socketReadyUserIdRef = useRef<string | null>(null);
  const bootMetaRef = useRef(bootMeta);
  const permissionUserRef = useRef(permissionUser);
  const handlersRef = useRef(handlers);
  const batchRef = useRef({ count: 0 });
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRemoteMutationRef = useRef(onRemoteMutation);

  useEffect(() => {
    bootMetaRef.current = bootMeta;
    permissionUserRef.current = permissionUser;
    handlersRef.current = handlers;
    onRemoteMutationRef.current = onRemoteMutation;
  }, [bootMeta, handlers, onRemoteMutation, permissionUser]);

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

  const stableEmpresaId = useMemo(() => {
    const id = (empresaIdInput ?? '').trim();
    return id || null;
  }, [empresaIdInput]);

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
    const empresaId = stableEmpresaId ?? '';
    const userId = userIdInput ?? null;
    const meta = bootMetaRef.current;

    console.warn('[realtime:effect:run]', {
      enabled,
      empresaId: empresaId || null,
      userId,
      alreadyStarted: realtimeStartedRef.current,
    });

    if (realtimeStartedRef.current) {
      console.warn('[realtime:effect:skip_already_started]', {
        enabled,
        empresaId: empresaId || null,
        userId,
      });
      return;
    }

    if (!enabled || !empresaId) {
      console.warn('[realtime:waiting_auth]', {
        enabled,
        authLoading: meta?.authLoading ?? false,
        profileLoaded: meta?.profileLoaded ?? false,
        isAuthenticated: meta?.isAuthenticated ?? false,
        empresaId: empresaId || null,
        userId,
        reason: !empresaId ? 'empresa_id missing' : 'auth_or_profile_not_ready',
      });
      if (import.meta.env.DEV && !enabled) {
        logRealtimeDisabled({
          source: 'useEmpresaRegistrosRealtime',
          isAuthenticated: meta?.isAuthenticated ?? false,
          authLoading: meta?.authLoading,
          profileLoaded: meta?.profileLoaded,
          profileEmpresaId: meta?.profileEmpresaId,
          empresaRealtimeId: empresaId,
          empresaId: empresaId || null,
          enabled,
          role: meta?.role ?? permissionUser?.role ?? null,
          userId,
          hookMounted: true,
        });
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- refleja que aún no existe canal activo
      setConnected(false);
      return () => {
        /* esperando auth — sin canal activo */
      };
    }

    realtimeStartedRef.current = true;

    if (typeof window !== 'undefined') {
      (window as Window & { __rt_cancelled?: boolean }).__rt_cancelled = false;
    }

    console.warn('[realtime:start]', {
      enabled,
      authLoading: meta?.authLoading ?? false,
      profileLoaded: meta?.profileLoaded ?? false,
      isAuthenticated: meta?.isAuthenticated ?? false,
      empresaId,
      userId,
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
    const fallbackChannels: RealtimeChannel[] = [];
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const isStaleEffect = () =>
      cancelled || realtimeEffectGenRef.current !== effectGen;

    const myEffectGen = effectGen;
    const effectGenRef = realtimeEffectGenRef;

    const isDead = () => cancelled || myEffectGen !== effectGenRef.current;

    const logEffectAbort = (where: string) => {
      console.warn('[realtime:effect_abort]', {
        where,
        cancelled,
        effectGen,
        currentGen: realtimeEffectGenRef.current,
      });
    };

    const logReturn = (reason: string, extra?: Record<string, unknown>) => {
      console.warn('[realtime:return]', {
        reason,
        cancelled,
        enabled,
        profileLoaded: bootMetaRef.current?.profileLoaded ?? false,
        authLoading: bootMetaRef.current?.authLoading ?? false,
        effectGen,
        currentGen: realtimeEffectGenRef.current,
        empresaId,
        ...extra,
      });
    };

    const emitSubscribeStatus = (status: string, err?: Error) => {
      if (isStaleEffect()) {
        logEffectAbort('emitSubscribeStatus');
        console.warn('[realtime:status:ignored]', {
          status,
          channel: channelName,
          reason: 'effect_cleanup',
        });
        return;
      }

      const wasSubscribed = subscribed;
      subscribed = status === 'SUBSCRIBED';
      setConnected(subscribed);
      if (wasSubscribed && !subscribed) {
        handlersRef.current.markGastosFullStale?.();
      }

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

    const refreshControlFechasAfterRemoteEvent = (reason: string) => {
      const h = handlersRef.current;
      console.warn('[realtime:control_fechas:refresh:start]', { reason });
      void (async () => {
        try {
          await Promise.resolve(h.reloadControlFechasLatest());
          await Promise.resolve(h.refreshControlFechasViews());
          console.warn('[realtime:control_fechas:refresh:done]', { reason });
        } catch (err) {
          console.warn('[realtime:control_fechas:refresh:done]', {
            reason,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
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
            console.warn('[realtime:gastos:delete:local]', { id, old: parsed.old });
            if (typeof id === 'string' && id) {
              h.removeGastoLocal(id, { source: 'realtime' });
            }
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
        case 'control_fechas': {
          if (eventType === 'DELETE') {
            const id = idFromRow(parsed.old, true);
            console.warn('[realtime:control_fechas:delete:local]', { id, old: parsed.old });
            if (typeof id === 'number') {
              h.removeControlFechaLocal(id);
            }
          }
          return;
        }
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
      const rawType = (payload.eventType ?? payload.event ?? '').toUpperCase();
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

      if (table !== 'financial_audit_logs') {
        applyIncremental(table as (typeof EMPRESA_TABLES)[number], parsed);
      }

      if (table === 'control_fechas') {
        refreshControlFechasAfterRemoteEvent('postgres_payload');
      }

      handleRemoteDbChange({
        table: table as RemoteDbTable,
        event: parsed.eventType,
        payload: parsed,
        rowId,
      });

      scheduleBatch.current();
    };

    const mountTableFallbackChannel = (
      table: 'ingresos' | 'gastos' | 'kilometrajes' | 'control_fechas',
    ) => {
      const channel = supabase
        .channel(`fallback-${table}-${empresaId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table,
          },
          (payload) => {
            if (table === 'gastos' && payload.eventType === 'DELETE') {
              console.warn('[fallback:gastos:delete:old]', payload.old);
            }
            if (table === 'control_fechas') {
              console.warn('[fallback:control_fechas:any]', payload);
              console.warn(
                '[fallback:control_fechas:json]',
                JSON.stringify(
                  {
                    eventType: payload.eventType,
                    newEmpresaId: (payload.new as Record<string, unknown> | undefined)
                      ?.empresa_id,
                    oldEmpresaId: (payload.old as Record<string, unknown> | undefined)
                      ?.empresa_id,
                    id:
                      (payload.new as Record<string, unknown> | undefined)?.id ??
                      (payload.old as Record<string, unknown> | undefined)?.id,
                    vehicleId:
                      (payload.new as Record<string, unknown> | undefined)?.vehicle_id ??
                      (payload.old as Record<string, unknown> | undefined)?.vehicle_id,
                    tipo:
                      (payload.new as Record<string, unknown> | undefined)?.tipo ??
                      (payload.old as Record<string, unknown> | undefined)?.tipo,
                  },
                  null,
                  2,
                ),
              );
              if (payload.eventType === 'DELETE') {
                console.warn('[fallback:control_fechas:delete:old]', payload.old);
              }
            } else {
              console.warn(`[fallback:${table}:any]`, payload);
              console.warn(
                `[fallback:${table}:json]`,
                JSON.stringify(
                  {
                    eventType: payload.eventType,
                    newEmpresaId: (payload.new as Record<string, unknown> | undefined)
                      ?.empresa_id,
                    oldEmpresaId: (payload.old as Record<string, unknown> | undefined)
                      ?.empresa_id,
                    id:
                      (payload.new as Record<string, unknown> | undefined)?.id ??
                      (payload.old as Record<string, unknown> | undefined)?.id,
                  },
                  null,
                  2,
                ),
              );
            }

            processPostgresPayload(table, {
              eventType: payload.eventType,
              event: (payload as { event?: string }).event,
              new: (payload.new ?? {}) as Record<string, unknown>,
              old: (payload.old ?? {}) as Record<string, unknown>,
            });

            scheduleBatch.current();
          },
        )
        .subscribe((status, err) => {
          console.warn(`[fallback:${table}:status]`, status, err ?? null);
        });

      return channel;
    };

    const buildEmpresaChannel = (): RealtimeChannel => {

      console.warn('[channel:minimal:start]');
    
      const existing =
        supabase
          .getChannels()
          .find(
            c =>
              c.topic === channelName
          );
    
      if (existing) {
    
        console.warn(
          '[channel:reuse]'
        );
    
        return existing;
    
      }
    
      console.warn(
        '[channel:create]'
      );
    
      const ch =
        supabase.channel(
          channelName
        );
    
      console.warn(
        '[channel:minimal:created]'
      );
    
      return ch;
    
    };

    const attachEmpresaChannelListeners = (ch: RealtimeChannel): void => {
      const attachSafe = (label: string, fn: () => void) => {
        try {
          console.warn('[realtime:listener:add]', label);
          fn();
        } catch (e) {
          console.error(
            '[realtime:listener:error]',
            label,
            e,
            e instanceof Error ? e.stack : undefined,
          );
        }
      };

      let channel = ch;

      const ONLY_TABLES = [
        'vehiculos',
        'ingresos',
        'kilometrajes',
        'control_fechas',
      ] as const;

      for (const table of ONLY_TABLES) {
        console.warn('[listener:before]', table);

        const manualFilter = usesManualEmpresaFilter(table);

        attachSafe(table, () => {
          channel = channel.on(
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
        });

        console.warn('[listener:after]', table);
      }
    };

    const subscribeActiveChannel = (ch: RealtimeChannel) => {
      activeChannel = ch;
      channelRef.current = ch;
      console.warn('[subscribe:call]');
      ch.subscribe((status, err) => {
        emitSubscribeStatus(status, err);
        if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          scheduleSubscribeRetry(status);
        }
      });
      console.warn('[subscribe:return]');
    };

    void (async () => {
      try {
        console.warn('[realtime:flow]', 'before_socket_ready', { effectGen: myEffectGen, channel: channelName, userId });

        let socketInfo: Awaited<ReturnType<typeof ensureRealtimeSocketReady>>;
        const uid = userId ?? '';
        if (uid && socketReadyUserIdRef.current === uid && supabase.realtime.isConnected()) {
          console.warn('[realtime:flow]', 'socket_ready_cached', { userId: uid });
          socketInfo = {
            hasSession: true,
            sessionUserId: uid,
            socketOpen: true,
            socketState: 'open',
          };
        } else {
          if (isDead()) {
            console.warn('[realtime:abort_before_socket]', {
              myEffectGen,
              current: effectGenRef.current,
            });
            return;
          }

          socketInfo = await ensureRealtimeSocketReady();
          if (uid) socketReadyUserIdRef.current = uid;

          if (isDead()) {
            console.warn('[realtime:abort_after_socket]', {
              myEffectGen,
              current: effectGenRef.current,
            });
            return;
          }
        }

        console.warn('[realtime:flow]', 'after_socket_ready', {
          effectGen,
          socketOpen: socketInfo.socketOpen,
          hasSession: socketInfo.hasSession,
        });

        if (isStaleEffect()) {
          logEffectAbort('stale_after_socket_ready');
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
            logEffectAbort('stale_after_reconnect');
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
          logEffectAbort('stale_before_build_channel');
          logReturn('stale_before_build_channel', {
            staleCancelled: cancelled,
            staleGenMismatch: realtimeEffectGenRef.current !== effectGen,
          });
          return;
        }

        console.warn('[channel:build:start]');

        const channel = buildEmpresaChannel();

        console.warn('[channel:build:done]');

        console.warn('[listeners:attach:start]');

        attachEmpresaChannelListeners(channel);

        console.warn('[listeners:attach:done]');

        if (isStaleEffect()) {
          logEffectAbort('stale_after_build_channel');
          logReturn('stale_after_build_channel');
          void supabase.removeChannel(channel);
          return;
        }

        subscribeActiveChannel(channel);

        for (const table of [
          'ingresos',
          'gastos',
          'kilometrajes',
          'control_fechas',
        ] as const) {
          fallbackChannels.push(mountTableFallbackChannel(table));
        }

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
            if (isStaleEffect() || subscribed) {
              if (isStaleEffect()) logEffectAbort('watchdog_3s_stale');
              return;
            }
            if (supabase.realtime.isConnected()) return;

            console.warn('[realtime:watchdog:3s] socket sigue closed — reconnect + nuevo canal');
            const reopened = await reconnectRealtimeSocket('watchdog_3s');
            if (cancelled || !reopened) {
              if (cancelled) logEffectAbort('watchdog_3s_cancelled');
              return;
            }

            if (activeChannel) {
              await supabase.removeChannel(activeChannel);
            }
            if (isStaleEffect()) {
              logEffectAbort('watchdog_3s_after_remove');
              return;
            }

            console.warn('[channel:build:start]');

            const freshChannel = buildEmpresaChannel();

            console.warn('[channel:build:done]');

            console.warn('[listeners:attach:start]');

            attachEmpresaChannelListeners(freshChannel);

            console.warn('[listeners:attach:done]');
            if (isStaleEffect()) {
              logEffectAbort('watchdog_3s_fresh_channel');
              void supabase.removeChannel(freshChannel);
              return;
            }
            subscribeActiveChannel(freshChannel);
          })();
        }, 3000);

        watchdogTimer = setTimeout(() => {
          if (isStaleEffect()) {
            logEffectAbort('watchdog_5s_timer');
            return;
          }
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
              if (isStaleEffect()) {
                logEffectAbort('watchdog_5s_async');
                return;
              }
              if (!supabase.realtime.isConnected()) {
                await reconnectRealtimeSocket('watchdog_5s');
              }
              if (isStaleEffect() || !activeChannel) {
                if (isStaleEffect()) logEffectAbort('watchdog_5s_after_reconnect');
                return;
              }
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
      realtimeStartedRef.current = false;
      socketReadyUserIdRef.current = null;
      cancelled = true;
      if (typeof window !== 'undefined') {
        (window as Window & { __rt_cancelled?: boolean }).__rt_cancelled = true;
      }
      logEffectAbort('cleanupRealtime');
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
      for (const ch of fallbackChannels) {
        void supabase.removeChannel(ch);
      }
      fallbackChannels.length = 0;
    };

    return () => {
      cleanupRealtime();
    };
  }, [enabled, stableEmpresaId, userIdInput]);

  return { connected };
}
