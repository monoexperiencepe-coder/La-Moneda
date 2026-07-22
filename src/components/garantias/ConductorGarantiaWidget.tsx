import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isGuaranteesModuleEnabled } from '../../config/featureFlags';
import { GUARANTEE_STATUS_LABELS } from '../../data/garantiasTypes';
import { fetchActiveGuaranteeByDriver } from '../../services/garantiasService';
import { canViewGarantias } from '../../utils/garantiasPermissions';
import type { PermissionUser } from '../../utils/permissions';
import { useAmountDisplay } from '../../hooks/useAmountDisplay';

type Props = {
  driverId: string;
  empresaId?: string | null;
  user: PermissionUser | null;
};

/**
 * Widget informativo aislado (Fase 1). Fácil de retirar.
 * No altera asignaciones ni P&L.
 */
const ConductorGarantiaWidget: React.FC<Props> = ({ driverId, empresaId, user }) => {
  const { formatGlobalAmount } = useAmountDisplay();
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<Awaited<ReturnType<typeof fetchActiveGuaranteeByDriver>>>(null);

  useEffect(() => {
    if (!isGuaranteesModuleEnabled() || !canViewGarantias(user) || !driverId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchActiveGuaranteeByDriver(driverId, empresaId).then((g) => {
      if (!cancelled) {
        setRow(g);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [driverId, empresaId, user]);

  if (!isGuaranteesModuleEnabled() || !canViewGarantias(user)) return null;

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800">Garantía</p>
      {loading ? (
        <p className="text-xs text-indigo-700/80 mt-1">Cargando…</p>
      ) : !row ? (
        <p className="text-xs text-indigo-800/90 mt-1">
          Sin garantía activa.{' '}
          <Link to="/operaciones/garantias" className="font-semibold underline">
            Ir al módulo
          </Link>
        </p>
      ) : (
        <div className="mt-1 space-y-0.5 text-xs text-indigo-950">
          <p>
            Estado: <strong>{GUARANTEE_STATUS_LABELS[row.status]}</strong>
          </p>
          <p>Requerida: {formatGlobalAmount(row.requiredAmount)}</p>
          <p>Saldo: {formatGlobalAmount(row.currentBalance)}</p>
          <Link
            to={`/operaciones/garantias/${row.id}`}
            className="inline-block mt-1 font-semibold text-primary-700 hover:underline"
          >
            Ver ficha →
          </Link>
        </div>
      )}
    </div>
  );
};

export default ConductorGarantiaWidget;
