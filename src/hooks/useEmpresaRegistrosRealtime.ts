import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
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
  upsertGasto: (row: Gasto) => void;
  removeGastoLocal: (id: string) => void;
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
  permissionUser: PermissionUser | null;
  handlers: EmpresaRealtimeHandlers;
  onRemoteActivity?: (info: { count: number }) => void;
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
  eventType: string;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}): RealtimePayload {
  return {
    eventType: payload.eventType as RealtimePayload['eventType'],
    new: payload.new ?? null,
    old: payload.old ?? null,
  };
}

function idFromRow(row: Record<string, unknown> | null, numeric: boolean): string | number | null {
  if (!row || row.id == null) return null;
  if (numeric) {
    const n = Number(row.id);
    return Number.isFinite(n) ? n : null;
  }
  return String(row.id);
}

export function useEmpresaRegistrosRealtime({
  enabled,
  permissionUser,
  handlers,
  onRemoteActivity,
}: Options): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const batchRef = useRef({ count: 0 });
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlFechasDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (!enabled || !EMPRESA_ID) {
      setConnected(false);
      return;
    }

    const empresaFilter = `empresa_id=eq.${EMPRESA_ID}`;
    const h = handlersRef;

    const handleGastos = (payload: RealtimePayload) => {
      const { eventType } = payload;
      if (eventType === 'DELETE') {
        const id = idFromRow(payload.old, false);
        if (typeof id === 'string' && id) {
          h.current.removeGastoLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      const raw = payload.new;
      if (!raw) return;
      const mapped = mapGastoRow(raw);
      if (!canViewGastoTipo(permissionUser, mapped.tipo_gasto ?? null)) {
        h.current.removeGastoLocal(mapped.id);
      } else {
        h.current.upsertGasto(mapped);
      }
      scheduleBatch.current();
    };

    const canFinanzasSecundarias = canUseInversiones(permissionUser);

    const handleIngresos = (payload: RealtimePayload) => {
      if (!canUseIngresos(permissionUser)) return;
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, false);
        if (typeof id === 'string' && id) {
          h.current.removeIngresoLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        h.current.upsertIngreso(mapIngresoRow(payload.new));
        scheduleBatch.current();
      }
    };

    const handleConductores = (payload: RealtimePayload) => {
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, false);
        if (typeof id === 'string' && id) {
          h.current.removeConductorLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        h.current.upsertConductor(mapConductorRow(payload.new));
        scheduleBatch.current();
      }
    };

    const handleUnidades = (payload: RealtimePayload) => {
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, false);
        if (typeof id === 'string' && id) {
          h.current.removeUnidadLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        h.current.upsertUnidad(mapUnidadRow(payload.new));
        scheduleBatch.current();
      }
    };

    const handleVehiculos = (payload: RealtimePayload) => {
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, true);
        if (typeof id === 'number') {
          h.current.removeVehicleLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        h.current.upsertVehicle(mapVehiculoRow(payload.new));
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
          h.current.removeKilometrajeLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        h.current.mergeKilometraje(mapKilometrajeRow(payload.new));
        scheduleBatch.current();
      }
    };

    const handlePendientes = (payload: RealtimePayload) => {
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, true);
        if (typeof id === 'number') {
          h.current.removePendienteLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        h.current.mergePendiente(mapPendienteRow(payload.new));
        scheduleBatch.current();
      }
    };

    const handleRegistrosTiempo = (payload: RealtimePayload) => {
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, true);
        if (typeof id === 'number') {
          h.current.removeRegistroTiempoLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        h.current.upsertRegistroTiempo(mapRegistroTiempoRow(payload.new));
        scheduleBatch.current();
      }
    };

    const handleInversiones = (payload: RealtimePayload) => {
      if (!canFinanzasSecundarias) return;
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, true);
        if (typeof id === 'number') {
          h.current.removeInversionVehiculoLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        h.current.upsertInversionVehiculo(mapInversionVehiculoRow(payload.new));
        scheduleBatch.current();
      }
    };

    const handleGastosCaja = (payload: RealtimePayload) => {
      if (!canFinanzasSecundarias) return;
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, true);
        if (typeof id === 'number') {
          h.current.removeGastoCajaLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        h.current.upsertGastoCaja(mapGastoCajaRow(payload.new));
        scheduleBatch.current();
      }
    };

    const handleCajaNegocio = (payload: RealtimePayload) => {
      if (!canFinanzasSecundarias) return;
      if (payload.eventType === 'DELETE') {
        const id = idFromRow(payload.old, true);
        if (typeof id === 'number') {
          h.current.removeCajaNegocioLocal(id);
          scheduleBatch.current();
        }
        return;
      }
      if (payload.new) {
        h.current.upsertCajaNegocio(mapCajaNegocioVehiculoRow(payload.new));
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

    const channelName = `empresa-registros-${EMPRESA_ID}`;
    let channel = supabase.channel(channelName);

    for (const table of EMPRESA_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: empresaFilter },
        (payload) => {
          tableHandlers[table](parsePayload(payload));
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
      if (import.meta.env.DEV) {
        console.info('[realtime] empresa registros', status, EMPRESA_TABLES.join(', '));
      }
    });

    channelRef.current = channel;

    return () => {
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      if (controlFechasDebounceRef.current) clearTimeout(controlFechasDebounceRef.current);
      setConnected(false);
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, permissionUser?.email, permissionUser?.role]);

  return { connected };
}
