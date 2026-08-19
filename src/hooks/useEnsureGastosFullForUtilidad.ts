import { useEffect } from 'react';
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
    ensureGastosFull,
    gastosFullStatus,
    isLoadingGastosFull,
    hasLoadedGastosOnce,
  } = useRegistrosContext();

  useEffect(() => {
    if (!hasLoadedGastosOnce) return;
    if (gastosFullStatus === 'ready' || gastosFullStatus === 'loading') return;

    if (import.meta.env.DEV) {
      console.info('[utilidad:gastos] esperando caché completa de sesión', { gastosFullStatus });
    }
    void ensureGastosFull().catch(() => {
      /* El módulo muestra el estado error y permite reintentar sin bloquear la app. */
    });
  }, [ensureGastosFull, gastosFullStatus, hasLoadedGastosOnce]);

  return {
    gastosLoadScope,
    isLoadingGastosFull,
    gastosReadyForUtilidad: gastosFullStatus === 'ready' && gastosLoadScope === 'full',
  };
}
