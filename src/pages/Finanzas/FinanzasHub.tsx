import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { calculateKPIs } from '../../utils/calculations';
import { formatCurrency } from '../../utils/formatting';
const FinanzasHub: React.FC = () => {
  const navigate = useNavigate();
  const { ingresos, gastos } = useRegistrosContext();
  const kpis = calculateKPIs(ingresos, gastos, []);

  const options = [
    { title: 'Ingresos', desc: 'Tabla y gráficos de ingresos', emoji: '💰', path: '/finanzas/ingresos', gradient: 'from-emerald-500/10 to-teal-500/10', border: 'border-emerald-200 hover:border-emerald-400', stat: formatCurrency(kpis.totalIngresos), statColor: 'text-emerald-600' },
    { title: 'Resumen', desc: 'Por mes/año y vehículo (tipo Excel)', emoji: '📋', path: '/finanzas/resumen', gradient: 'from-violet-500/10 to-fuchsia-500/10', border: 'border-violet-200 hover:border-violet-400', stat: formatCurrency(kpis.margenNeto), statColor: kpis.margenNeto >= 0 ? 'text-violet-700' : 'text-red-600' },
    { title: 'Gastos', desc: 'Tabla y categorías de gastos', emoji: '💸', path: '/finanzas/gastos', gradient: 'from-red-500/10 to-orange-500/10', border: 'border-red-200 hover:border-red-400', stat: formatCurrency(kpis.totalGastos), statColor: 'text-red-500' },
    { title: 'Reportes', desc: 'Análisis y comparativas', emoji: '📊', path: '/finanzas/reportes', gradient: 'from-purple-500/10 to-pink-500/10', border: 'border-purple-200 hover:border-purple-400', stat: formatCurrency(kpis.margenNeto), statColor: kpis.margenNeto >= 0 ? 'text-primary-600' : 'text-red-600' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💰 Finanzas</h1>
          <p className="text-sm text-gray-500">Gestión financiera completa</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {options.map(o => (
          <button key={o.path} onClick={() => navigate(o.path)}
            className={`mission-btn bg-gradient-to-br ${o.gradient} border-2 ${o.border} group text-left`}>
            <div className="flex items-start justify-between mb-3">
              <span className="text-4xl group-hover:scale-110 transition-transform">{o.emoji}</span>
              <span className={`text-base font-bold ${o.statColor}`}>{o.stat}</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">{o.title}</h3>
            <p className="text-sm text-gray-500">{o.desc}</p>
            <div className="mt-4 flex items-center gap-1 text-xs text-gray-400 group-hover:text-primary-500 font-semibold transition-colors">
              Ver {o.title} <ChevronRight size={14} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default FinanzasHub;
