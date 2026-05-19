import React from 'react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import LoadingOverlay from './LoadingOverlay';

/**
 * Overlay global mientras carga el primer batch de datos post-auth.
 * Evita pantalla “vacía” / clicks prematuros sin bloquear el header.
 */
const DataBootstrapOverlay: React.FC = () => {
  const { registrosBootstrapLoading, registrosBootstrapComplete } = useRegistrosContext();
  const active = registrosBootstrapLoading && !registrosBootstrapComplete;

  if (!active) return null;

  return (
    <LoadingOverlay
      active={active}
      variant="fixed"
      message="Preparando datos"
      submessage="Cargando información de la flota y finanzas…"
      className="!top-16"
    />
  );
};

export default DataBootstrapOverlay;
