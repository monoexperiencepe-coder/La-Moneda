import { useAuth } from '../context/AuthContext';
import { useRegistrosContext } from '../context/RegistrosContext';

/** True mientras los gastos de la sesión actual aún no terminaron de cargar (post-auth o recarga). */
export function useGastosDataPending(): boolean {
  const { isAuthenticated } = useAuth();
  const {
    registrosBootstrapLoading,
    registrosBootstrapComplete,
    isLoadingGastos,
    hasLoadedGastosOnce,
  } = useRegistrosContext();

  if (!isAuthenticated) return false;

  const bootstrapPending = registrosBootstrapLoading && !registrosBootstrapComplete;
  return bootstrapPending || isLoadingGastos || !hasLoadedGastosOnce;
}
