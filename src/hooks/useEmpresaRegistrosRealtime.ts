import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  realtimeLogCleanup,
  realtimeLogEvent,
  realtimeLogSubscribe,
  realtimeLogUpdate,
  realtimeRegistry,
} from '../utils/realtimeDebug';
import {
  mapCajaNegocioVehiculoRow,
  mapConductorRow,
  mapControlFechaRow,
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

/** Historial del sistema: recargar lista al insertar un log remoto. */
export const AUDIT_LOGS_REALTIME_EVENT = 'la-moneda:audit-logs-changed';

type RealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
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
  /** RPC resumen + historial paginado de controles de fecha. */
  refreshControlFechasViews: () => void | Promise<void>;
};

type Options = {
  enabled: boolean;
  /** Preferir `profile.empresa_id`; fallback `VITE_EMPRESA_ID`. */
  empresaId: string | null | undefined;
  permissionUser: PermissionUser | null;
  handlers: EmpresaRealtimeHandlers;
  onRemoteActivity?: (info: { count: number }) => void;
  /** Llamado en cada INSERT/UPDATE/DELETE remoto (refetch historiales, etc.). */
  onRemoteMutation?: () => void;
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
] as const;

function parsePayload(payload: {
  eventType?: string;
  event?: string;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}): RealtimePayload {
  const rawType = payload.eventType ?? payload.event ?? '';
  return {
    eventType: rawType as RealtimePayload['eventType'],
    new: payload.new ?? null,
    old: payload.old ?? null,
  };
}

function idFromRow(row: Record<string, unknown> | null, numeric: boolean): string | number | null {
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
}: Options): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const batchRef = useRef({ count: 0 });
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlFechasDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRemoteMutationRef = useRef(onRemoteMutation);
  onRemoteMutationRef.current = onRemoteMutation;

  const notifyRemoteMutation = useRef(() => {
    onRemoteMutationRef.current?.();
  });

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

  const scheduleControlFechasRefresh = useRef(() => {
    if (controlFechasDebounceRef.current) clearTimeout(controlFechasDebounceRef.current);
    controlFechasDebounceRef.current = setTimeout(() => {
      controlFechasDebounceRef.current = null;
      void handlersRef.current.refreshControlFechasViews();
    }, 400);
  });

  useEffect(() => {
    const empresaId = (empresaIdInput ?? '').trim();
    if (!enabled || !empresaId) {
      setConnected(false);
      return;
    }

    const empresaFilter = `empresa_id=eq.${empresaId}`;
    const channelName = `empresa-registros-${empresaId}`;

    const handleGastos = (payload: RealtimePayload) => {
      const { eventType } = payload;
      if (eventType === 'DELETE') {
        const id = idFromRow(payload.old, false);
        if (typeof id === 'string' && id) {
          realtimeLogUpdate({
            channel: channelName,
            table: 'gastos',
            event: 'DELETE',
            rowId: id,
            empresaId,
          });
          handlersRef.current.removeGastoLocal(id, { source: 'realtime' });
          scheduleBatch.current();
        }
        return;
      }
      const raw = payload.new;
      if (!raw) return;
      const mapped = mapGastoRow(raw);
      realtimeLogUpdate({
        channel: channelName,
        table: 'gastos',
        event: eventType,
        rowId: mapped.id,
        empresaId,
        extra: { tipo_gasto: mapped.tipo_gasto },
      });
      const visible = canViewGastoTipo(permissionUser, mapped.tipo_gasto ?? null);
      if (import.meta.env.DEV) {
        void import('../audit/techAuditDiagnostics').then(({ logRealtimeAudit }) => {
          logRealtimeAudit({
            eventType,
            table: 'gastos',
            recordId: mapped.id,
            tipo_gasto: mapped.tipo_gasto,
            refreshTriggered: false,
            handler: visible ? 'upsertGasto' : 'removeGastoLocal',
            visibleToCurrentUser: visible,
          });
        });
      }
      if (!visible) {
        handlersRef.current.removeGastoLocal(mapped.id, { source: 'realtime' });
      } else {
        handlersRef.current.upsertGasto(mapped, { source: 'realtime' });
      }
      scheduleBatch.current();
    };

    const canFinanzasSecundarias = canUseInversiones(permissionUser);

    const handleIngresos = (payload: RealtimePayload) => {
      if (!canUseIngresos(permissionUser)) return;
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, false);
        if (typeof id === 'string' && id) {
          handlersRef.current.removeIngresoLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        handlersRef.current.upsertIngreso(mapIngresoRow(payload.new));
        scheduleBatch.current();
      }
    };

    const handleConductores = (payload: RealtimePayload) => {
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, false);
        if (typeof id === 'string' && id) {
          handlersRef.current.removeConductorLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        handlersRef.current.upsertConductor(mapConductorRow(payload.new));
        scheduleBatch.current();
      }
    };

    const handleUnidades = (payload: RealtimePayload) => {
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, false);
        if (typeof id === 'string' && id) {
          handlersRef.current.removeUnidadLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        handlersRef.current.upsertUnidad(mapUnidadRow(payload.new));
        scheduleBatch.current();
      }
    };

    const handleVehiculos = (payload: RealtimePayload) => {
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, true);
        if (typeof id === 'number') {
          handlersRef.current.removeVehicleLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        handlersRef.current.upsertVehicle(mapVehiculoRow(payload.new));
        scheduleBatch.current();
      }
    };

    const handleControlFechas = () => {
      scheduleControlFechasRefresh.current();
      scheduleBatch.current();
    };

    const handleKilometrajes = (payload: RealtimePayload) => {
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, true);
        if (typeof id === 'number') {
          handlersRef.current.removeKilometrajeLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        const mapped = mapKilometrajeRow(payload.new);
        if (import.meta.env.DEV) {
          void import('../audit/techAuditDiagnostics').then(({ logKmRealtime }) => {
            logKmRealtime(payload.eventType, mapped, 'merge');
          });
        }
        handlersRef.current.mergeKilometraje(mapped);
        scheduleBatch.current();
      }
    };

    const handlePendientes = (payload: RealtimePayload) => {
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, true);
        if (typeof id === 'number') {
          handlersRef.current.removePendienteLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        handlersRef.current.mergePendiente(mapPendienteRow(payload.new));
        scheduleBatch.current();
      }
    };

    const handleRegistrosTiempo = (payload: RealtimePayload) => {
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, true);
        if (typeof id === 'number') {
          handlersRef.current.removeRegistroTiempoLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        handlersRef.current.upsertRegistroTiempo(mapRegistroTiempoRow(payload.new));
        scheduleBatch.current();
      }
    };

    const handleInversiones = (payload: RealtimePayload) => {
      if (!canFinanzasSecundarias) return;
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, true);
        if (typeof id === 'number') {
          handlersRef.current.removeInversionVehiculoLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        handlersRef.current.upsertInversionVehiculo(mapInversionVehiculoRow(payload.new));
        scheduleBatch.current();
      }
    };

    const handleGastosCaja = (payload: RealtimePayload) => {
      if (!canFinanzasSecundarias) return;
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, true);
        if (typeof id === 'number') {
          handlersRef.current.removeGastoCajaLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        handlersRef.current.upsertGastoCaja(mapGastoCajaRow(payload.new));
        scheduleBatch.current();
      }
    };

    const handleCajaNegocio = (payload: RealtimePayload) => {
      if (!canFinanzasSecundarias) return;
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, true);
        if (typeof id === 'number') {
          handlersRef.current.removeCajaNegocioLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        handlersRef.current.upsertCajaNegocio(mapCajaNegocioVehiculoRow(payload.new));
        scheduleBatch.current();
      }
    };

    const tableHandlers: Record<(typeof EMPRESA_TABLES)[number], (p: RealtimePayload) => void> = {
      gastos: handleGastos,
      ingresos: handleIngresos,
      conductores: handleConductores,
      unidades: handleUnidades,
      vehiculos: handleVehiculos,
      control_fechas: handleControlFechas,
      kilometrajes: handleKilometrajes,
      pendientes: handlePendientes,
      registros_tiempo: handleRegistrosTiempo,
      inversiones_vehiculo: handleInversiones,
      gastos_caja: handleGastosCaja,
      caja_negocio_vehiculo: handleCajaNegocio,
    };

    realtimeLogSubscribe({
      channel: channelName,
      empresaId,
      extra: { tables: [...EMPRESA_TABLES] },
    });
    realtimeRegistry.register(channelName);

    let channel = supabase.channel(channelName);

    for (const table of EMPRESA_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: empresaFilter },
        (payload) => {
          const parsed = parsePayload(payload);
          if (!parsed.eventType) return;
          notifyRemoteMutation.current();
          realtimeLogEvent({
            channel: channelName,
            table,
            event: parsed.eventType,
            rowId: idFromRow(parsed.new ?? parsed.old, table === 'gastos' ? false : true),
            empresaId,
          });
          tableHandlers[table](parsed);
        },
      );
    }

    if (canViewFinancialAuditLogs(permissionUser)) {
      channel = channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'financial_audit_logs',
          filter: empresaFilter,
        },
        () => {
          window.dispatchEvent(new CustomEvent(AUDIT_LOGS_REALTIME_EVENT));
          scheduleBatch.current();
        },
      );
    }

    channel.subscribe((status) => {
      setConnected(status === 'SUBSCRIBED');
      realtimeLogSubscribe({
        channel: channelName,
        empresaId,
        extra: { status },
      });
    });

    channelRef.current = channel;

    return () => {
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      if (controlFechasDebounceRef.current) clearTimeout(controlFechasDebounceRef.current);
      setConnected(false);
      realtimeLogCleanup({ channel: channelName, empresaId });
      realtimeRegistry.unregister(channelName);
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, empresaIdInput, permissionUser?.email, permissionUser?.role]);

  return { connected };
}
