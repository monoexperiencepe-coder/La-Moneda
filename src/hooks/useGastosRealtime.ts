import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { mapGastoRow } from '../services/supabaseMappers';
import type { Gasto } from '../data/types';
import {
  canViewGastoTipo,
  type PermissionUser,
} from '../utils/permissions';

type RealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

type Options = {
  enabled: boolean;
  permissionUser: PermissionUser | null;
  upsertGasto: (row: Gasto) => void;
  removeGastoLocal: (id: string) => void;
  /** IDs en edición local (no pisar sin aviso). */
  editingGastoIds?: ReadonlySet<string>;
  onRemoteActivity?: (info: { count: number; hadConflict: boolean }) => void;
};

const BATCH_MS = 2500;

export function useGastosRealtime({
  enabled,
  permissionUser,
  upsertGasto,
  removeGastoLocal,
  editingGastoIds,
  onRemoteActivity,
}: Options): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const batchRef = useRef({ count: 0, conflict: false });
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushBatch = useRef(() => {
    const b = batchRef.current;
    if (b.count > 0) {
      onRemoteActivity?.({ count: b.count, hadConflict: b.conflict });
    }
    batchRef.current = { count: 0, conflict: false };
  });

  useEffect(() => {
    flushBatch.current = () => {
      const b = batchRef.current;
      if (b.count > 0) {
        onRemoteActivity?.({ count: b.count, hadConflict: b.conflict });
      }
      batchRef.current = { count: 0, conflict: false };
    };
  }, [onRemoteActivity]);

  useEffect(() => {
    if (!enabled || !EMPRESA_ID) {
      setConnected(false);
      return;
    }

    const channelName = `gastos-realtime-${EMPRESA_ID}`;

    const scheduleBatch = (conflict: boolean) => {
      batchRef.current.count += 1;
      if (conflict) batchRef.current.conflict = true;
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      batchTimerRef.current = setTimeout(() => {
        flushBatch.current();
        batchTimerRef.current = null;
      }, BATCH_MS);
    };

    const handlePayload = (payload: RealtimePayload) => {
      const event = payload.eventType;
      if (event === 'DELETE') {
        const oldRow = payload.old;
        const id = oldRow ? String(oldRow.id ?? '') : '';
        if (id) {
          removeGastoLocal(id);
          scheduleBatch(false);
        }
        return;
      }

      const raw = payload.new;
      if (!raw) return;
      const mapped = mapGastoRow(raw);
      const visible = canViewGastoTipo(permissionUser, mapped.tipo_gasto ?? null);

      if (!visible) {
        if (event === 'UPDATE' || event === 'INSERT') {
          removeGastoLocal(mapped.id);
          scheduleBatch(false);
        }
        return;
      }

      const editing = editingGastoIds?.has(mapped.id) ?? false;
      upsertGasto(mapped);
      scheduleBatch(editing);
    };

    if (subscribedRef.current && channelRef.current) {
      return () => {
        if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      };
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gastos',
          filter: `empresa_id=eq.${EMPRESA_ID}`,
        },
        (payload) => {
          handlePayload({
            eventType: payload.eventType as RealtimePayload['eventType'],
            new: (payload.new as Record<string, unknown>) ?? null,
            old: (payload.old as Record<string, unknown>) ?? null,
          });
        },
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
        if (import.meta.env.DEV) {
          console.info('[realtime] gastos channel', status);
        }
      });

    channelRef.current = channel;
    subscribedRef.current = true;

    return () => {
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      subscribedRef.current = false;
      setConnected(false);
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [
    enabled,
    permissionUser?.email,
    permissionUser?.role,
    upsertGasto,
    removeGastoLocal,
    editingGastoIds,
  ]);

  return { connected };
}
