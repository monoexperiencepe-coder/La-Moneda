import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isGuaranteesModuleEnabled } from '../../config/featureFlags';
import { GUARANTEE_STATUS_LABELS } from '../../data/garantiasTypes';
import { fetchActiveGuaranteeByDriver, fetchDriverGuarantees } from '../../services/garantiasService';
import { canViewGarantias } from '../../utils/garantiasPermissions';
import type { PermissionUser } from '../../utils/permissions';
import { useAmountDisplay } from '../../hooks/useAmountDisplay';
import { formatConductorDisplayLabel } from '../../utils/fleetPanel';
import type { Conductor } from '../../data/types';

type Props = {
  vehicleId: number;
  conductorActual: Conductor | null;
  empresaId?: string | null;
  user: PermissionUser | null;
};

/** Widget informativo en ficha de vehículo. Aislado y reversible. */
const VehiculoGarantiaWidget: React.FC<Props> = ({
  vehicleId,
  conductorActual,
  empresaId,
  user,
}) => {
  const { formatGlobalAmount } = useAmountDisplay();
  const [loading, setLoading] = useState(true);
  const [guaranteeId, setGuaranteeId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [required, setRequired] = useState<number | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!isGuaranteesModuleEnabled() || !canViewGarantias(user)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const run = async () => {
      if (conductorActual?.id) {
        const g = await fetchActiveGuaranteeByDriver(conductorActual.id, empresaId);
        if (cancelled) return;
        if (g) {
          setGuaranteeId(g.id);
          setStatus(g.status);
          setRequired(g.requiredAmount);
          setBalance(g.currentBalance);
          setLoading(false);
          return;
        }
      }
      const all = await fetchDriverGuarantees(empresaId);
      if (cancelled) return;
      const linked = all.find((g) => g.currentVehicleId === vehicleId && !g.closedAt);
      if (linked) {
        setGuaranteeId(linked.id);
        setStatus(linked.status);
        setRequired(linked.requiredAmount);
        setBalance(linked.currentBalance);
      } else {
        setGuaranteeId(null);
        setStatus(null);
        setRequired(null);
        setBalance(null);
      }
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [vehicleId, conductorActual?.id, empresaId, user]);

  if (!isGuaranteesModuleEnabled() || !canViewGarantias(user)) return null;

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-800 mb-1">Garantía (informativo)</p>
      {loading ? (
        <p className="text-xs text-gray-500">Cargando…</p>
      ) : (
        <div className="text-xs text-gray-800 space-y-0.5">
          <p>
            Conductor:{' '}
            <strong>
              {conductorActual ? formatConductorDisplayLabel(conductorActual) : 'Sin conductor vigente'}
            </strong>
          </p>
          {status && required != null && balance != null ? (
            <>
              <p>
                Estado: <strong>{GUARANTEE_STATUS_LABELS[status as keyof typeof GUARANTEE_STATUS_LABELS] ?? status}</strong>
              </p>
              <p>Requerida: {formatGlobalAmount(required)}</p>
              <p>Saldo conductor: {formatGlobalAmount(balance)}</p>
              {guaranteeId != null ? (
                <Link
                  to={`/operaciones/garantias/${guaranteeId}`}
                  className="inline-block mt-1 font-semibold text-primary-700 hover:underline"
                >
                  Ver historial →
                </Link>
              ) : null}
            </>
          ) : (
            <p className="text-gray-600">
              Sin garantía vinculada.{' '}
              <Link to="/operaciones/garantias" className="font-semibold text-primary-700 underline">
                Módulo Garantías
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default VehiculoGarantiaWidget;
