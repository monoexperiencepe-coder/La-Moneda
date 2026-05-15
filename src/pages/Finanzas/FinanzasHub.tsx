import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { calculateKPIs } from '../../utils/calculations';
import { formatCurrency } from '../../utils/formatting';
import SmartClock from '../../components/Common/SmartClock';

type HubCardOption = {
  title: string;
  desc: string;
  emoji: string;
  path: string;
  gradient: string;
  border: string;
  /** Si se omite o es cadena vacía, no se muestra el monto arriba a la derecha. */
  stat?: string;
  statColor?: string;
};

const FinanzasHub: React.FC = () => {
  const navigate = useNavigate();
  const { ingresos, gastos, cajaNegocioVehiculo } = useRegistrosContext();
  const kpis = calculateKPIs(ingresos, gastos, []);
  const totalGastosTabla = useMemo(() => gastos.reduce((s, g) => s + g.monto, 0), [gastos]);
  const totalCajaNegocio = useMemo(() => cajaNegocioVehiculo.reduce((s, x) => s + x.monto, 0), [cajaNegocioVehiculo]);

  const options: HubCardOption[] = [
    {
      title: 'Ingresos',
      desc: 'Tabla y gráficos de ingresos',
      emoji: '💰',
      path: '/finanzas/ingresos',
      gradient: 'from-emerald-500/10 to-teal-500/10',
      border: 'border-emerald-200 hover:border-emerald-400',
      stat: formatCurrency(kpis.totalIngresos),
      statColor: 'text-emerald-600',
    },
    {
      title: 'Gastos',
      desc: 'Gastos clasificados por categoría',
      emoji: '💸',
      path: '/finanzas/gastos',
      gradient: 'from-red-500/10 to-orange-500/10',
      border: 'border-red-200 hover:border-red-400',
      stat: formatCurrency(totalGastosTabla),
      statColor: 'text-red-500',
    },
    {
      title: 'Utilidad',
      desc: 'Por vehículo — aparte de gastos operativos e ingresos',
      emoji: '📈',
      path: '/finanzas/caja-negocio',
      gradient: 'from-teal-500/10 to-cyan-500/10',
      border: 'border-teal-200 hover:border-teal-400',
      stat: formatCurrency(totalCajaNegocio),
      statColor: 'text-teal-800',
    },
    {
      title: 'Inversiones',
      desc: 'Inversión con utilidad (gastos) e inversión inicial por vehículo (Excel)',
      emoji: '🚗',
      path: '/finanzas/inversiones',
      gradient: 'from-purple-500/10 to-violet-500/10',
      border: 'border-purple-200 hover:border-purple-400',
    },
    {
      title: 'Resumen',
      desc: '¿Cómo va el negocio este mes?',
      emoji: '📋',
      path: '/finanzas/resumen',
      gradient: 'from-violet-500/10 to-fuchsia-500/10',
      border: 'border-violet-200 hover:border-violet-400',
    },
    {
      title: 'Financiamiento',
      desc: 'Préstamos y aportes de capital',
      emoji: '🏦',
      path: '/finanzas/financiamiento',
      gradient: 'from-indigo-500/10 to-blue-500/10',
      border: 'border-indigo-200 hover:border-indigo-400',
    },
    {
      title: 'Reportes',
      desc: 'Centro de análisis e histórico',
      emoji: '📊',
      path: '/finanzas/reportes',
      gradient: 'from-purple-500/10 to-pink-500/10',
      border: 'border-purple-200 hover:border-purple-400',
    },
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

      <div className="max-w-xs mx-auto w-full">
        <SmartClock variant="hub" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {options.map((o) => {
          const showStat = o.stat != null && String(o.stat).trim() !== '';
          return (
            <button
              key={o.path}
              type="button"
              onClick={() => navigate(o.path)}
              className={`mission-btn bg-gradient-to-br ${o.gradient} border-2 ${o.border} group text-left`}
            >
              <div
                className={[
                  'flex items-start gap-2 mb-3',
                  showStat ? 'justify-between' : 'justify-start',
                ].join(' ')}
              >
                <span className="text-4xl group-hover:scale-110 transition-transform shrink-0">{o.emoji}</span>
                {showStat ? (
                  <span
                    className={`text-sm sm:text-base font-bold ${o.statColor ?? 'text-gray-800'} text-right leading-snug break-words max-w-[min(100%,14rem)]`}
                  >
                    {o.stat}
                  </span>
                ) : null}
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">{o.title}</h3>
              <p className="text-sm text-gray-500">{o.desc}</p>
              <div className="mt-4 flex items-center gap-1 text-xs text-gray-400 group-hover:text-primary-500 font-semibold transition-colors">
                Ver {o.title} <ChevronRight size={14} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default FinanzasHub;
