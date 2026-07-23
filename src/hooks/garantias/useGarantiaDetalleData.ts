import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { DriverGuarantee, GuaranteeMovement } from '../../data/garantiasTypes';
import {
  fetchDriverGuaranteeById,
  fetchGuaranteeMovements,
} from '../../services/garantiasService';

const REALTIME_DEBOUNCE_MS = 250;
const MUTATION_SUPPRESS_MS = 900;

type LoadOptions = {
  background?: boolean;
};

export function useGarantiaDetalleData(
  guaranteeId: number,
  empresaId: string | null | undefined,
  enabled: boolean,
) {
  const [guarantee, setGuarantee] = useState<DriverGuarantee | null>(null);
  const [movements, setMovements] = useState<GuaranteeMovement[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const guaranteeRef = useRef<DriverGuarantee | null>(null);
  const movementsRef = useRef<GuaranteeMovement[]>([]);
  const requestIdRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressRealtimeUntilRef = useRef(0);
  const guaranteeIdRef = useRef(guaranteeId);
  const empresaIdRef = useRef(empresaId);
  guaranteeIdRef.current = guaranteeId;
  empresaIdRef.current = empresaId;

  guaranteeRef.current = guarantee;
  movementsRef.current = movements;

  const load = useCallback(async (opts?: LoadOptions) => {
    const gid = guaranteeIdRef.current;
    const tenantId = empresaIdRef.current;
    if (!tenantId || !Number.isFinite(gid)) return;

    const requestId = ++requestIdRef.current;
    const background = opts?.background ?? hasLoadedRef.current;

    if (background) {
      setRefreshing(true);
    } else if (!hasLoadedRef.current) {
      setInitialLoading(true);
    }

    try {
      const [g, movs] = await Promise.all([
        fetchDriverGuaranteeById(gid, tenantId),
        fetchGuaranteeMovements(gid, tenantId),
      ]);
      if (requestId !== requestIdRef.current) return;

      if (background && hasLoadedRef.current && !g && guaranteeRef.current) {
        console.warn('[garantias detalle] Garantía no encontrada en refresh; se conserva el último estado.');
        return;
      }

      if (background && hasLoadedRef.current && movs.length === 0 && movementsRef.current.length > 0) {
        console.warn('[garantias detalle] Historial vacío en refresh; se conserva el último estado.');
        if (g) setGuarantee(g);
        return;
      }

      setGuarantee(g);
      setMovements(movs);
      setError('');
      hasLoadedRef.current = g != null;
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      if (requestId !== requestIdRef.current) return;
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadRef = useRef(load);
  loadRef.current = load;

  const scheduleRealtimeRefresh = useCallback(() => {
    if (Date.now() < suppressRealtimeUntilRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void loadRef.current({ background: true });
    }, REALTIME_DEBOUNCE_MS);
  }, []);

  const refreshAfterMutation = useCallback(() => {
    suppressRealtimeUntilRef.current = Date.now() + MUTATION_SUPPRESS_MS;
    void loadRef.current({ background: hasLoadedRef.current });
  }, []);

  useEffect(() => {
    if (!enabled || !empresaId || !Number.isFinite(guaranteeId)) {
      setInitialLoading(false);
      return;
    }
    hasLoadedRef.current = false;
    setGuarantee(null);
    setMovements([]);
    void loadRef.current({ background: false });
  }, [enabled, empresaId, guaranteeId]);

  useEffect(() => {
    if (!enabled || !empresaId || !Number.isFinite(guaranteeId)) return undefined;

    const channel = supabase
      .channel(`garantias-detalle-${empresaId}-${guaranteeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_guarantees',
          filter: `empresa_id=eq.${empresaId}`,
        },
        (payload) => {
          const row = payload.new as { id?: number } | null;
          const oldRow = payload.old as { id?: number } | null;
          const id = row?.id ?? oldRow?.id;
          if (id != null && id !== guaranteeId) return;
          scheduleRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'guarantee_movements',
          filter: `empresa_id=eq.${empresaId}`,
        },
        (payload) => {
          const row = payload.new as { guarantee_id?: number } | null;
          const oldRow = payload.old as { guarantee_id?: number } | null;
          const gid = row?.guarantee_id ?? oldRow?.guarantee_id;
          if (gid != null && gid !== guaranteeId) return;
          scheduleRealtimeRefresh();
        },
      )
      .subscribe();

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [enabled, empresaId, guaranteeId, scheduleRealtimeRefresh]);

  return {
    guarantee,
    movements,
    initialLoading,
    refreshing,
    error,
    load,
    refreshAfterMutation,
  };
}
