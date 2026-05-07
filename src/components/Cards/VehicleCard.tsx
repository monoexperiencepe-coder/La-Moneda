import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Vehicle, Ingreso, Gasto, Documentacion } from '../../data/types';
import { formatCurrency, formatUSD, todayStr, isExpiringSoon, isExpired } from '../../utils/formatting';
import { ingresoMontoPEN } from '../../utils/moneda';
import { gastosOperativosSolamente } from '../../utils/cajaNegocio';
import { Eye, Edit } from 'lucide-react';

interface VehicleCardProps {
  vehicle: Vehicle;
  ingresos: Ingreso[];
  gastos: Gasto[];
  documentaciones: Documentacion[];
  /** Costo histórico de adquisición (USD); null si no hay fila en inversiones_vehiculo. */
  inversionTotalUsd?: number | null;
}

const VehicleCard: React.FC<VehicleCardProps> = ({ vehicle, ingresos, gastos, documentaciones, inversionTotalUsd }) => {
  const navigate = useNavigate();

  const todayIngresos = ingresos
    .filter(i => i.vehicleId === vehicle.id && i.fecha === todayStr())
    .reduce((s, i) => s + ingresoMontoPEN(i), 0);

  const monthIngresos = ingresos
    .filter(i => i.vehicleId === vehicle.id)
    .reduce((s, i) => s + ingresoMontoPEN(i), 0);

  const monthGastos = gastosOperativosSolamente(gastos)
    .filter(g => g.vehicleId === vehicle.id)
    .reduce((s, g) => s + g.monto, 0);

  const margen = monthIngresos - monthGastos;
  const rentability = monthIngresos > 0 ? (margen / monthIngresos) * 100 : 0;
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

  return (
    <div
      className={`game-card bg-gradient-to-br ${gradient} border border-gray-100 overflow-hidden
        ${!vehicle.activo ? 'opacity-60' : ''}`}
    >
      {/* Status badge */}
      {!vehicle.activo && (
        <div className="bg-gray-200 text-gray-600 text-xs font-semibold text-center py-1">
          INACTIVO
        </div>
      )}

      <div className="p-3.5">
        {/* Header */}
        <div className="flex items-start justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-white rounded-lg shadow-soft flex items-center justify-center text-xl">
              🚙
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-medium">CARRO #{vehicle.id}</p>
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
          {inversionTotalUsd != null && (
            <div className="bg-amber-50/90 rounded-lg p-2 backdrop-blur-sm border border-amber-100 col-span-2">
              <p className="text-[9px] text-amber-800 uppercase tracking-wide mb-0.5">Inversión adquisición (hist.)</p>
              <p className="text-xs font-bold text-amber-950 tabular-nums">{formatUSD(inversionTotalUsd)}</p>
              <p className="text-[9px] text-amber-800/90 mt-0.5">No es gasto operativo mensual</p>
            </div>
          )}
          <div className="bg-white/70 rounded-lg p-2 backdrop-blur-sm">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">📊 HOY</p>
            <p className="text-xs font-bold text-gray-900">{formatCurrency(todayIngresos)}</p>
          </div>
          <div className="bg-white/70 rounded-lg p-2 backdrop-blur-sm">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">💰 MES</p>
            <p className="text-xs font-bold text-gray-900">{formatCurrency(monthIngresos)}</p>
          </div>
          <div className="bg-white/70 rounded-lg p-2 backdrop-blur-sm col-span-2">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">📈 MARGEN</p>
            <div className="flex items-center justify-between">
              <p className={`text-xs font-bold ${margen >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {formatCurrency(margen)}
              </p>
              <div className="flex-1 ml-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${margen >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                  style={{ width: `${Math.min(100, Math.abs(rentability))}%` }}
                />
              </div>
            </div>
          </div>
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

export default VehicleCard;
