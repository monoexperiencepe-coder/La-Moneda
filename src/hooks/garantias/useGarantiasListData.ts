import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { DriverGuarantee } from '../../data/garantiasTypes';
import { fetchDriverGuarantees } from '../../services/garantiasService';

const REALTIME_DEBOUNCE_MS = 250;
const MUTATION_SUPPRESS_MS = 900;

type LoadOptions = {
  background?: boolean;
};

export type GarantiasListMode = 'active' | 'history';

export function useGarantiasListData(
  empresaId: string | null | undefined,
  enabled: boolean,
  mode: GarantiasListMode = 'active',
) {
  const [rows, setRows] = useState<DriverGuarantee[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const rowsRef = useRef<DriverGuarantee[]>([]);
  const requestIdRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressRealtimeUntilRef = useRef(0);
  const empresaIdRef = useRef(empresaId);
  empresaIdRef.current = empresaId;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  rowsRef.current = rows;

  const load = useCallback(async (opts?: LoadOptions) => {
    const tenantId = empresaIdRef.current;
    if (!tenantId) return;

    const requestId = ++requestIdRef.current;
    const background = opts?.background ?? hasLoadedRef.current;

    if (background) {
      setRefreshing(true);
    } else if (!hasLoadedRef.current) {
      setInitialLoading(true);
    }

    try {
      const activeOnly = modeRef.current === 'active';
      const data = await fetchDriverGuarantees(tenantId, { activeOnly });
      if (requestId !== requestIdRef.current) return;

      if (background && hasLoadedRef.current && data.length === 0 && rowsRef.current.length > 0) {
        console.warn('[garantias list] Respuesta vacía en refresh; se conserva el último estado.');
        return;
      }

      setRows(data);
      setError('');
      hasLoadedRef.current = true;
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      if (requestId === requestIdRef.current) {
        setInitialLoading(false);
        setRefreshing(false);
      }
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

  // Recarga inicial o cuando cambian empresa, modo habilitado, o modo activo/historial.
  useEffect(() => {
    if (!enabled || !empresaId) {
      setInitialLoading(false);
      return;
    }
    hasLoadedRef.current = false;
    setRows([]);
    void loadRef.current({ background: false });
  }, [enabled, empresaId, mode]);

  useEffect(() => {
    if (!enabled || !empresaId) return undefined;

    const channel = supabase
      .channel(`garantias-list-${empresaId}-${mode}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_guarantees',
          filter: `empresa_id=eq.${empresaId}`,
        },
        () => scheduleRealtimeRefresh(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'guarantee_movements',
          filter: `empresa_id=eq.${empresaId}`,
        },
        () => scheduleRealtimeRefresh(),
      )
      .subscribe();

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [enabled, empresaId, mode, scheduleRealtimeRefresh]);

  return {
    rows,
    initialLoading,
    refreshing,
    error,
    load,
    refreshAfterMutation,
  };
}
