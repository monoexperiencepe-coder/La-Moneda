import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  realtimeLogCleanup,
  realtimeLogStatus,
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

type Options = {
  enabled: boolean;
  empresaId: string | null | undefined;
  permissionUser: PermissionUser | null;
  handlers: EmpresaRealtimeHandlers;
  onRemoteActivity?: (info: { count: number }) => void;
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
}: Options): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
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
    const empresaId = (empresaIdInput ?? '').trim();
    if (!enabled || !empresaId) {
      if (import.meta.env.DEV) {
        console.warn('[realtime:disabled]', {
          enabled,
          empresaId: empresaId || null,
          reason: !enabled ? 'enabled=false' : 'sin empresa_id',
        });
      }
      setConnected(false);
      return;
    }

    const empresaFilter = `empresa_id=eq.${empresaId}`;
    const channelName = `empresa-registros-${empresaId}`;

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
      const { eventType } = parsed;
      const canFinanzasSecundarias = canUseInversiones(permissionUser);

      switch (table) {
        case 'gastos': {
          if (eventType === 'DELETE') {
            const id = idFromRow(parsed.old, false);
            if (typeof id === 'string' && id) h.removeGastoLocal(id, { source: 'realtime' });
            return;
          }
          if (!parsed.new) return;
          const mapped = mapGastoRow(parsed.new);
          const visible = canViewGastoTipo(permissionUser, mapped.tipo_gasto ?? null);
          if (visible) h.upsertGasto(mapped, { source: 'realtime' });
          else h.removeGastoLocal(mapped.id, { source: 'realtime' });
          return;
        }
        case 'ingresos': {
          if (!canUseIngresos(permissionUser)) return;
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

    realtimeRegistry.register(channelName);

    let channel = supabase.channel(channelName);

    for (const table of EMPRESA_TABLES) {
      realtimeLogSubscribe({ channel: channelName, table, empresaId });
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: empresaFilter },
        (payload) => {
          const parsed = parsePayload(payload);
          if (!parsed) return;

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

    if (canViewFinancialAuditLogs(permissionUser)) {
      realtimeLogSubscribe({
        channel: channelName,
        table: 'financial_audit_logs',
        empresaId,
      });
      channel = channel.on(
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

    channel.subscribe((status) => {
      setConnected(status === 'SUBSCRIBED');
      realtimeLogStatus({
        channel: channelName,
        empresaId,
        status,
        extra: { tables: [...EMPRESA_TABLES, 'financial_audit_logs'] },
      });
      if (import.meta.env.DEV && status !== 'SUBSCRIBED') {
        console.warn('[realtime:status] canal no suscrito — revisar publication SQL y RLS', {
          status,
          empresaId,
        });
      }
    });

    channelRef.current = channel;

    return () => {
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
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
