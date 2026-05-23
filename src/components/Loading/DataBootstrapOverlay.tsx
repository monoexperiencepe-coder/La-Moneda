import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRegistrosContext } from '../../context/RegistrosContext';
import LoadingOverlay from './LoadingOverlay';

/**
 * Overlay global mientras carga el primer batch de datos post-auth (incl. gastos financieros).
 * Evita pantalla “vacía” / categorías en 0 sin bloquear el header.
 */
const DataBootstrapOverlay: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const {
    isBootstrapLoading,
    isLoadingGastos,
    hasLoadedGastosOnce,
  } = useRegistrosContext();

  const gastosPending = isAuthenticated && (isLoadingGastos || !hasLoadedGastosOnce);
  const active = isBootstrapLoading || gastosPending;

  const [longWait, setLongWait] = useState(false);

  useEffect(() => {
    if (!active) {
      setLongWait(false);
      return;
    }
    const t = window.setTimeout(() => setLongWait(true), 4000);
    return () => window.clearTimeout(t);
  }, [active]);

  if (!active) return null;

  const message = longWait
    ? 'Optimizando registros…'
    : gastosPending
      ? 'Cargando gastos financieros…'
      : 'Preparando datos';

  const submessage = longWait
    ? 'Volúmenes grandes pueden tardar un momento. No cierres la sesión.'
    : gastosPending
      ? 'Sincronizando categorías y montos con Supabase…'
      : 'Cargando información de la flota y finanzas…';

  return (
    <LoadingOverlay
      active={active}
      variant="fixed"
      message={message}
      submessage={submessage}
      className="!top-16"
    />
  );
};

export default DataBootstrapOverlay;
