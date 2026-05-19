import { useRegistrosContext } from '../context/RegistrosContext';

/** True mientras el primer batch de registros post-auth aún no está listo. */
export function useBootstrapPending(): boolean {
  const { registrosBootstrapLoading, registrosBootstrapComplete } = useRegistrosContext();
  return registrosBootstrapLoading && !registrosBootstrapComplete;
}
