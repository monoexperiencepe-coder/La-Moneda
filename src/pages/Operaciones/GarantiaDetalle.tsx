import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useAmountDisplay } from '../../hooks/useAmountDisplay';
import { isGuaranteesModuleEnabled } from '../../config/featureFlags';
import { GUARANTEE_VEHICLE_TYPE_LABELS } from '../../config/guaranteeAmounts';
import {
  GUARANTEE_MOVEMENT_LABELS,
  GUARANTEE_STATUS_LABELS,
  getGuaranteeExternalReference,
  isMovementReverted,
  isReversalMovement,
} from '../../data/garantiasTypes';
import { mergeGuaranteeComputed } from '../../utils/garantiasCalc';
import {
  canRegisterDeposit,
  canRegisterSensitiveMovement,
  canRevertMovement,
  canViewGarantias,
} from '../../utils/garantiasPermissions';
import { permissionUserFromAuth } from '../../utils/permissions';
import { formatConductorDisplayLabel } from '../../utils/fleetPanel';
import { formatVehicleSelectLabel } from '../../utils/vehicleDisplayNumber';
import { formatDate } from '../../utils/formatting';
import RegistrarMovimientoModal from '../../components/garantias/RegistrarMovimientoModal';
import CambioTipoVehiculoModal from '../../components/garantias/CambioTipoVehiculoModal';
import RevertirMovimientoModal from '../../components/garantias/RevertirMovimientoModal';
import EditarGarantiaModal from '../../components/garantias/EditarGarantiaModal';
import { useGarantiaDetalleData } from '../../hooks/garantias/useGarantiaDetalleData';

const GarantiaDetalle: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const gid = Number(id);
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const permissionUser = user ? permissionUserFromAuth(user, profile?.email ?? null) : null;
  const { formatGlobalAmount } = useAmountDisplay();
  const { conductores, vehicles } = useRegistrosContext();

  const canView = canViewGarantias(permissionUser);
  const moduleEnabled = isGuaranteesModuleEnabled();
  const {
    guarantee,
    movements,
    initialLoading,
    refreshing,
    error,
    load,
    refreshAfterMutation,
  } = useGarantiaDetalleData(gid, profile?.empresa_id, moduleEnabled && canView);

  const [movMode, setMovMode] = useState<'deposit' | 'deduction' | 'adjustment' | 'refund' | null>(null);
  const [showTipo, setShowTipo] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [revertTarget, setRevertTarget] = useState<(typeof movements)[number] | null>(null);

  const computed = useMemo(() => {
    if (!guarantee) return null;
    return mergeGuaranteeComputed(guarantee, movements);
  }, [guarantee, movements]);

  const conductorName = useMemo(() => {
    if (!guarantee) return '—';
    const c = conductores.find((x) => x.id === guarantee.driverId);
    return c ? formatConductorDisplayLabel(c) : guarantee.driverId;
  }, [guarantee, conductores]);

  const vehicleLabel = useMemo(() => {
    if (!guarantee?.currentVehicleId) return '—';
    const v = vehicles.find((x) => x.id === guarantee.currentVehicleId);
    return v ? formatVehicleSelectLabel(v) : `#${guarantee.currentVehicleId}`;
  }, [guarantee, vehicles]);

  const lastMov = movements[0] ?? null;
  const closed =
    !!guarantee?.closedAt ||
    guarantee?.status === 'cerrada' ||
    guarantee?.status === 'devuelta';

  const showPageLoading = initialLoading && !guarantee;
  const showNotFound = !initialLoading && !refreshing && !guarantee;
  const showMovementsEmpty = movements.length === 0 && !initialLoading && !refreshing;

  if (!moduleEnabled || !canView) {
    return (
      <div className="p-8 text-center text-gray-500">
        Módulo no disponible o sin permiso.
      </div>
    );
  }

  if (showPageLoading) {
    return <div className="p-8 text-center text-gray-400">Cargando ficha…</div>;
  }

  if (showNotFound || !guarantee || !computed) {
    return (
      <div className="p-8 text-center text-gray-500">
        Garantía no encontrada.{' '}
        <button type="button" className="text-primary-600 underline" onClick={() => navigate('/operaciones/garantias')}>
          Volver
        </button>
      </div>
    );
  }

  const cards = [
    { label: 'Garantía requerida', value: formatGlobalAmount(guarantee.requiredAmount) },
    { label: 'Total entregado', value: formatGlobalAmount(computed.totalContributed) },
    { label: 'Total descontado', value: formatGlobalAmount(computed.totalDeducted) },
    { label: 'Saldo actual', value: formatGlobalAmount(computed.currentBalance) },
    { label: 'Pendiente por completar', value: formatGlobalAmount(computed.pendingAmount) },
    { label: 'Disponible para devolución', value: formatGlobalAmount(computed.refundableAmount) },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/operaciones/garantias')}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 shrink-0"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{conductorName}</h1>
            <p className="text-sm text-gray-500">
              {vehicleLabel} · {GUARANTEE_VEHICLE_TYPE_LABELS[guarantee.vehicleType]} ·{' '}
              <span className="font-semibold text-gray-700">{GUARANTEE_STATUS_LABELS[computed.status]}</span>
              {refreshing ? (
                <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-gray-400">
                  <RefreshCw size={12} className="animate-spin" /> Actualizando…
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load({ background: true })}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : undefined} /> Actualizar
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-100 bg-white p-3 shadow-soft">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2 text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
        <span>Creada: {formatDate(guarantee.createdAt.slice(0, 10))}</span>
        <span>
          Último movimiento:{' '}
          {lastMov
            ? `${formatDate(lastMov.movementDate)} · ${GUARANTEE_MOVEMENT_LABELS[lastMov.movementType]}`
            : '—'}
        </span>
      </div>

      {!closed ? (
        <div className="flex flex-wrap gap-2">
          {canRegisterDeposit(permissionUser) ? (
            <button
              type="button"
              onClick={() => setMovMode('deposit')}
              className="px-3 py-2 rounded-xl text-sm font-semibold border border-emerald-200 bg-emerald-50 text-emerald-900"
            >
              Abono / entrega
            </button>
          ) : null}
          {canRegisterSensitiveMovement(permissionUser) ? (
            <>
              <button
                type="button"
                onClick={() => setMovMode('deduction')}
                className="px-3 py-2 rounded-xl text-sm font-semibold border border-red-200 bg-red-50 text-red-900"
              >
                Descuento
              </button>
              <button
                type="button"
                onClick={() => setMovMode('adjustment')}
                className="px-3 py-2 rounded-xl text-sm font-semibold border border-amber-200 bg-amber-50 text-amber-950"
              >
                Ajuste
              </button>
              <button
                type="button"
                onClick={() => setMovMode('refund')}
                className="px-3 py-2 rounded-xl text-sm font-semibold border border-violet-200 bg-violet-50 text-violet-950"
              >
                Devolución final
              </button>
            </>
          ) : null}
          {canRegisterDeposit(permissionUser) ? (
            <button
              type="button"
              onClick={() => setShowTipo(true)}
              className="px-3 py-2 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-800"
            >
              Simular cambio auto ↔ camioneta
            </button>
          ) : null}
          {canRegisterSensitiveMovement(permissionUser) ? (
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              className="px-3 py-2 rounded-xl text-sm font-semibold border border-blue-200 bg-blue-50 text-blue-900"
            >
              Editar información
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-gray-500 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          Garantía cerrada / devuelta. Puede revertir movimientos según permisos; el historial no se elimina.
        </p>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Historial de movimientos</h2>
          <p className="text-[11px] text-gray-500">
            Inmutable · correcciones vía ajuste o reversión compensatoria
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] uppercase text-gray-500 bg-gray-50">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Monto</th>
                <th className="px-3 py-2">Dir.</th>
                <th className="px-3 py-2">Vehículo</th>
                <th className="px-3 py-2">Observación</th>
                <th className="px-3 py-2">Ref. externa</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Registro</th>
                <th className="px-3 py-2 w-24">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {showMovementsEmpty ? (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-gray-400">
                    Sin movimientos
                  </td>
                </tr>
              ) : (
                movements.map((m) => {
                  const v = m.vehicleId != null ? vehicles.find((x) => x.id === m.vehicleId) : null;
                  const reverted = isMovementReverted(movements, m.id);
                  const isRev = isReversalMovement(m);
                  const canRevert = canRevertMovement(permissionUser, m, movements);
                  const obsText = isRev
                    ? [m.reason, m.observation].filter(Boolean).join(' · ')
                    : m.observation || m.reason || '—';
                  return (
                    <tr
                      key={m.id}
                      className={
                        reverted ? 'bg-gray-50/80' : isRev ? 'bg-amber-50/50' : undefined
                      }
                    >
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(m.movementDate)}</td>
                      <td className="px-3 py-2">
                        {isRev ? (
                          <span className="font-medium text-amber-900">
                            {GUARANTEE_MOVEMENT_LABELS[m.movementType]}
                          </span>
                        ) : (
                          GUARANTEE_MOVEMENT_LABELS[m.movementType]
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums font-semibold">{formatGlobalAmount(m.amount)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            m.direction === 'credit' ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'
                          }
                        >
                          {m.direction === 'credit' ? '+' : '−'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {v ? formatVehicleSelectLabel(v) : m.vehicleId != null ? `#${m.vehicleId}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600 max-w-[14rem]" title={obsText}>
                        <span className="line-clamp-2">{obsText}</span>
                      </td>
                      <td
                        className="px-3 py-2 text-xs text-gray-600 max-w-[10rem] truncate"
                        title={getGuaranteeExternalReference(m.metadata) ?? ''}
                      >
                        {getGuaranteeExternalReference(m.metadata) ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {reverted ? (
                          <span className="inline-flex px-1.5 py-0.5 rounded-md bg-gray-200 text-gray-700 font-semibold">
                            Movimiento revertido
                          </span>
                        ) : isRev ? (
                          <span className="inline-flex px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 font-semibold">
                            Reversión
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gray-400 whitespace-nowrap">
                        {new Date(m.createdAt).toLocaleString('es-PE')}
                      </td>
                      <td className="px-3 py-2">
                        {canRevert ? (
                          <button
                            type="button"
                            onClick={() => setRevertTarget(m)}
                            className="text-[11px] font-semibold text-amber-800 underline hover:text-amber-950"
                          >
                            Revertir
                          </button>
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {movMode ? (
        <RegistrarMovimientoModal
          isOpen
          onClose={() => setMovMode(null)}
          mode={movMode}
          guarantee={guarantee}
          vehicles={vehicles}
          user={permissionUser}
          empresaId={profile?.empresa_id}
          onSaved={refreshAfterMutation}
        />
      ) : null}

      <CambioTipoVehiculoModal
        isOpen={showTipo}
        onClose={() => setShowTipo(false)}
        guarantee={guarantee}
        currentBalance={computed.currentBalance}
        vehicles={vehicles}
        empresaId={profile?.empresa_id}
        userId={user?.id}
        onSaved={refreshAfterMutation}
      />

      {revertTarget ? (
        <RevertirMovimientoModal
          isOpen
          onClose={() => setRevertTarget(null)}
          movement={revertTarget}
          guarantee={guarantee}
          movements={movements}
          user={permissionUser}
          userId={user?.id}
          empresaId={profile?.empresa_id}
          onSaved={refreshAfterMutation}
        />
      ) : null}

      {showEdit ? (
        <EditarGarantiaModal
          isOpen
          onClose={() => setShowEdit(false)}
          guarantee={guarantee}
          conductores={conductores}
          vehicles={vehicles}
          empresaId={profile?.empresa_id}
          onSaved={refreshAfterMutation}
        />
      ) : null}
    </div>
  );
};

export default GarantiaDetalle;
