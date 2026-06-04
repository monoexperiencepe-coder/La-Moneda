import { useAmountDisplay } from '../../hooks/useAmountDisplay';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Vehicle, Ingreso, Gasto, Documentacion, Conductor } from '../../data/types';
import { conductorAsignadoLabel } from '../../utils/fleetPanel';
import { UserCog } from 'lucide-react';
import { todayStr, isExpiringSoon, isExpired } from '../../utils/formatting';
import { ingresoMontoPEN } from '../../utils/moneda';
import { calcularUtilidadRealVehiculo, UTILIDAD_REAL_TOOLTIP } from '../../utils/utilidadReal';
import type { Moneda } from '../../data/types';
import type { VehicleInversionDisplay } from '../../utils/vehicleInversionDisplay';
import { Eye, Edit } from 'lucide-react';

interface VehicleCardProps {
  vehicle: Vehicle;
  ingresos: Ingreso[];
  gastos: Gasto[];
  documentaciones: Documentacion[];
  /** Inversión inicial (inversiones_generales_vehiculo o fallback inversiones_vehiculo). */
  inversionDisplay?: VehicleInversionDisplay | null;
  /** @deprecated Usar inversionDisplay */
  inversionTotalUsd?: number | null;
  /** Orden en el inventario (1-based), para enumerar la flota. */
  listaIndice?: number;
  conductores?: Conductor[];
  canAssignConductor?: boolean;
  onAsignarConductor?: () => void;
  gastosReadyForUtilidad?: boolean;
}

const VehicleCard: React.FC<VehicleCardProps> = ({
  vehicle,
  ingresos,
  gastos,
  documentaciones,
  inversionDisplay,
  inversionTotalUsd,
  listaIndice,
  conductores = [],
  canAssignConductor = false,
  onAsignarConductor,
  gastosReadyForUtilidad = true,
}) => {
  const { formatGlobalAmount, formatRecordAmount } = useAmountDisplay();
  const navigate = useNavigate();

  const todayIngresos = ingresos
    .filter(i => i.vehicleId === vehicle.id && i.fecha === todayStr())
    .reduce((s, i) => s + ingresoMontoPEN(i), 0);

  const utilidadCalc = gastosReadyForUtilidad
    ? calcularUtilidadRealVehiculo(vehicle.id, ingresos, gastos)
    : null;
  const monthIngresos = utilidadCalc?.ingresosTotal ?? 0;
  const utilidadReal = utilidadCalc?.utilidadReal ?? 0;
  const rentability = monthIngresos > 0 ? (utilidadReal / monthIngresos) * 100 : 0;
  const stars = Math.max(1, Math.min(5, Math.round(rentability / 20)));

  // Check document alerts
  const vehicleDocs = documentaciones.filter(d => d.vehicleId === vehicle.id);
  let docStatus: 'ok' | 'warning' | 'danger' = 'ok';
  let docLabel = '✅ Docs OK';

  vehicleDocs.forEach(d => {
    const dates = [d.soat, d.rtParticular, d.rtDetaxi, d.afocatTaxi];
    dates.forEach(date => {
      if (date && isExpired(date)) { docStatus = 'danger'; docLabel = '❌ Doc vencido'; }
      else if (date && isExpiringSoon(date, 30) && docStatus !== 'danger') {
        docStatus = 'warning';
        const daysLeft = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        docLabel = `⚠️ Vence en ${daysLeft}d`;
      }
    });
  });

  const marcaColors: Record<string, string> = {
    TOYOTA: 'from-red-400/20 to-red-600/10',
    NISSAN: 'from-blue-400/20 to-blue-600/10',
    KIA: 'from-red-500/20 to-orange-400/10',
    HYUNDAI: 'from-blue-500/20 to-indigo-400/10',
  };

  const gradient = marcaColors[vehicle.marca] ?? 'from-gray-200/40 to-gray-100/20';

  const inversionResolved: { monto: number; moneda: Moneda } | null =
    inversionDisplay != null
      ? { monto: inversionDisplay.monto, moneda: inversionDisplay.moneda }
      : inversionTotalUsd != null
        ? { monto: inversionTotalUsd, moneda: 'USD' }
        : null;

  return (
    <div
      className={`relative game-card bg-gradient-to-br ${gradient} border border-gray-100 overflow-hidden
        ${!vehicle.activo ? 'opacity-60' : ''}`}
    >
      {listaIndice != null ? (
        <div className="absolute top-2 left-2 z-10 flex h-6 min-w-[1.5rem] items-center justify-center rounded-md bg-gray-900/85 px-1.5 text-[10px] font-bold text-white tabular-nums shadow-sm ring-1 ring-white/20">
          {listaIndice}
        </div>
      ) : null}
      {/* Status badge */}
      {!vehicle.activo && (
        <div className="bg-gray-200 text-gray-600 text-xs font-semibold text-center py-1">
          INACTIVO
        </div>
      )}

      <div className="p-3.5">
        {/* Header */}
        <div className="flex items-start justify-between mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-10 h-10 bg-white rounded-lg shadow-soft flex items-center justify-center text-xl shrink-0">
              🚙
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-gray-500 font-medium tabular-nums">
                {listaIndice != null ? <>Lista #{listaIndice} · </> : null}ID {vehicle.id}
              </p>
              <h3 className="text-sm font-bold text-gray-900 leading-tight">{vehicle.marca} {vehicle.modelo}</h3>
              <p className="text-[11px] text-gray-500 font-mono">{vehicle.placa}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={`text-xs ${i < stars ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
              ))}
            </div>
            <span className="text-[9px] text-gray-400">{rentability.toFixed(0)}% rent.</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 mb-2.5">
          {inversionResolved != null && (
            <div className="bg-amber-50/90 rounded-lg p-2 backdrop-blur-sm border border-amber-100 col-span-2">
              <p className="text-[9px] text-amber-800 uppercase tracking-wide mb-0.5">Inversión / valor compra</p>
              <p className="text-xs font-bold text-amber-950 tabular-nums">
                {formatGlobalAmount(inversionResolved.monto, inversionResolved.moneda === 'USD' ? 'USD' : undefined)}
              </p>
              <p className="text-[9px] text-amber-800/90 mt-0.5">
                {inversionDisplay?.source === 'inversiones_vehiculo'
                  ? 'Histórico Excel'
                  : 'Inversiones generales'}
              </p>
            </div>
          )}
          <div className="bg-white/70 rounded-lg p-2 backdrop-blur-sm">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">📊 HOY</p>
            <p className="text-xs font-bold text-gray-900">{formatGlobalAmount(todayIngresos)}</p>
          </div>
          <div className="bg-white/70 rounded-lg p-2 backdrop-blur-sm">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">💰 MES</p>
            <p className="text-xs font-bold text-gray-900">{formatGlobalAmount(monthIngresos)}</p>
          </div>
          <div className="bg-white/70 rounded-lg p-2 backdrop-blur-sm col-span-2" title={UTILIDAD_REAL_TOOLTIP}>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">📈 Utilidad real</p>
            <div className="flex items-center justify-between">
              <p
                className={`text-xs font-bold ${
                  !gastosReadyForUtilidad ? 'text-gray-400' : utilidadReal >= 0 ? 'text-emerald-600' : 'text-red-500'
                }`}
              >
                {gastosReadyForUtilidad ? formatGlobalAmount(utilidadReal) : '…'}
              </p>
              <div className="flex-1 ml-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${utilidadReal >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                  style={{ width: `${Math.min(100, Math.abs(rentability))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Conductor */}
        <div className="rounded-lg px-2.5 py-1.5 mb-2.5 bg-white/70 text-[11px]">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Conductor</p>
          <p className="font-semibold text-gray-800 truncate">
            {conductores.length ? conductorAsignadoLabel(conductores, vehicle.id) : '—'}
          </p>
          {canAssignConductor && onAsignarConductor ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAsignarConductor();
              }}
              className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-primary-600 hover:underline"
            >
              <UserCog size={11} />
              Asignar / Reasignar
            </button>
          ) : null}
        </div>

        {/* Doc status */}
        <div className={`rounded-lg px-2.5 py-1.5 mb-2.5 text-[11px] font-semibold
          ${docStatus === 'ok' ? 'bg-emerald-50 text-emerald-700'
            : docStatus === 'warning' ? 'bg-amber-50 text-amber-700'
            : 'bg-red-50 text-red-700'}`}>
          {docLabel}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/vehiculos/${vehicle.id}`)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary-50 text-primary-600 text-xs font-semibold hover:bg-primary-100 transition-colors"
          >
            <Eye size={13} /> Ver
          </button>
          <button
            onClick={() => navigate(`/vehiculos/${vehicle.id}`)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition-colors"
          >
            <Edit size={13} /> Editar
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(VehicleCard);
