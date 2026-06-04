/**
 * Registra window.* del copiloto en cuanto hay sesión admin (no depende de /asistente ni /copilot-debug).
 */
import React, { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { permissionUserFromAuth } from '../../utils/permissions';
import { ensureCopilotAuditRegistered } from './registerCopilotAudit';

const CopilotAuditBootstrap: React.FC = () => {
  const { profile, user, isAuthenticated, isAdmin, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || !isAuthenticated || !isAdmin) return;
    ensureCopilotAuditRegistered({
      getUser: () => permissionUserFromAuth(user, profile?.email ?? null),
      getEmpresaId: () => profile?.empresa_id ?? import.meta.env.VITE_EMPRESA_ID ?? null,
    });
  }, [isLoading, isAuthenticated, isAdmin, user, profile?.email, profile?.empresa_id]);

  return null;
};

export default CopilotAuditBootstrap;
