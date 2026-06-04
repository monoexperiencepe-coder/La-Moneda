import { useEffect, useRef } from 'react';
import { useRegistrosContext } from '../context/RegistrosContext';

/**
 * Utilidad real requiere todos los gastos con vehicle_id.
 * Bootstrap carga solo ~1000 recientes; dispara fetchGastosFull hasta scope === 'full'.
 */
export function useEnsureGastosFullForUtilidad(): {
  gastosLoadScope: 'recent' | 'full';
  isLoadingGastosFull: boolean;
  gastosReadyForUtilidad: boolean;
} {
  const {
    gastosLoadScope,
    reloadGastosFull,
    isLoadingGastosFull,
    hasLoadedGastosOnce,
  } = useRegistrosContext();
  const inflightRef = useRef(false);

  useEffect(() => {
    if (!hasLoadedGastosOnce) return;
    if (gastosLoadScope === 'full') return;
    if (isLoadingGastosFull || inflightRef.current) return;

    inflightRef.current = true;
    if (import.meta.env.DEV) {
      console.info('[utilidad:gastos] bootstrap incompleto — cargando histórico completo (fetchGastosFull)');
    }
    void reloadGastosFull().finally(() => {
      inflightRef.current = false;
    });
  }, [gastosLoadScope, reloadGastosFull, hasLoadedGastosOnce, isLoadingGastosFull]);

  return {
    gastosLoadScope,
    isLoadingGastosFull,
    gastosReadyForUtilidad: gastosLoadScope === 'full' && !isLoadingGastosFull,
  };
}
