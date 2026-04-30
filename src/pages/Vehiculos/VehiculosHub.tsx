import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatCurrency } from '../../utils/formatting';
import { calculateVehicleRentability } from '../../utils/calculations';

const VehiculosHub: React.FC = () => {
  const navigate = useNavigate();
  const { vehicles, ingresos, gastos, descuentos } = useRegistrosContext();
  const rentability = calculateVehicleRentability(vehicles, ingresos, gastos, descuentos);

  const options = [
    {
      title: 'Inventario',
      desc: 'Cards de todos los vehículos',
      emoji: '🗂️',
      path: '/vehiculos/inventario',
      gradient: 'from-blue-500/10 to-indigo-500/10',
      border: 'border-blue-200 hover:border-blue-400',
    },
    {
      title: 'Rentabilidad',
      desc: 'Análisis por vehículo',
      emoji: '📈',
      path: '/vehiculos/rentabilidad',
      gradient: 'from-emerald-500/10 to-teal-500/10',
      border: 'border-emerald-200 hover:border-emerald-400',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🚗 Vehículos</h1>
          <p className="text-sm text-gray-500">{vehicles.filter(v => v.activo).length} activos de {vehicles.length} total</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {options.map(o => (
          <button key={o.path} onClick={() => navigate(o.path)}
            className={`mission-btn bg-gradient-to-br ${o.gradient} border-2 ${o.border} group text-left`}>
            <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">{o.emoji}</div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">{o.title}</h3>
            <p className="text-sm text-gray-500">{o.desc}</p>
            <div className="mt-4 flex items-center gap-1 text-xs text-gray-400 group-hover:text-primary-500 font-semibold transition-colors">
              Ir a {o.title} <ChevronRight size={14} />
            </div>
          </button>
        ))}
      </div>

      {/* Quick vehicle list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Ranking de Rentabilidad</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {rentability.map((r, i) => (
            <div key={r.vehicle.id}
              className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => navigate(`/vehiculos/${r.vehicle.id}`)}>
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0
                ${i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-600' : 'bg-gray-200 text-gray-600'}`}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{r.vehicle.marca} {r.vehicle.modelo}</p>
                <p className="text-xs text-gray-400 font-mono">{r.vehicle.placa}</p>
              </div>
              <span className={`text-sm font-bold ${r.margen >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {formatCurrency(r.margen)}
              </span>
              <ChevronRight size={14} className="text-gray-300" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VehiculosHub;
