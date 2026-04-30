import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react';
import { KPIData } from '../../data/types';
import { formatCurrency } from '../../utils/formatting';

interface KPICardsProps {
  data: KPIData;
}

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  accent: string;
  bgAccent: string;
}

const KPICard: React.FC<KPICardProps> = ({
  title, value, subtitle, icon, trend, trendValue, accent, bgAccent
}) => (
  <div className="bg-white rounded-xl border border-gray-100 shadow-soft p-6 hover:shadow-soft-md transition-all duration-200 hover:-translate-y-0.5">
    <div className="flex items-start justify-between mb-4">
      <div className={`w-10 h-10 ${bgAccent} rounded-lg flex items-center justify-center`}>
        <span className={accent}>{icon}</span>
      </div>
      {trend && trendValue && (
        <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full
          ${trend === 'up' ? 'bg-emerald-50 text-emerald-600' : trend === 'down' ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'}`}>
          {trend === 'up' ? <TrendingUp size={12} /> : trend === 'down' ? <TrendingDown size={12} /> : null}
          {trendValue}
        </div>
      )}
    </div>
    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{title}</p>
    <p className="text-2xl font-bold text-gray-900">{value}</p>
    {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
  </div>
);

const KPICards: React.FC<KPICardsProps> = ({ data }) => {
  const cards: KPICardProps[] = [
    {
      title: 'Total Ingresos',
      value: formatCurrency(data.totalIngresos),
      subtitle: 'Ingresos del período',
      icon: <TrendingUp size={20} />,
      trend: 'up',
      trendValue: '+12.5%',
      accent: 'text-emerald-600',
      bgAccent: 'bg-emerald-50',
    },
    {
      title: 'Total Gastos',
      value: formatCurrency(data.totalGastos),
      subtitle: 'Gastos del período',
      icon: <TrendingDown size={20} />,
      trend: 'down',
      trendValue: '-3.2%',
      accent: 'text-red-500',
      bgAccent: 'bg-red-50',
    },
    {
      title: 'Rebajes (descuentos)',
      value: formatCurrency(data.totalDescuentos),
      subtitle: 'Suma de montos (≤ 0)',
      icon: <Activity size={20} />,
      trend: 'neutral',
      trendValue: '—',
      accent: 'text-amber-700',
      bgAccent: 'bg-amber-50',
    },
    {
      title: 'Margen Neto',
      value: formatCurrency(data.margenNeto),
      subtitle: 'Ingresos − gastos + rebajes',
      icon: <DollarSign size={20} />,
      trend: data.margenNeto >= 0 ? 'up' : 'down',
      trendValue: data.margenNeto >= 0 ? 'Positivo' : 'Negativo',
      accent: 'text-primary-600',
      bgAccent: 'bg-primary-50',
    },
    {
      title: 'Promedio Diario',
      value: formatCurrency(data.promedioIngresoDiario),
      subtitle: 'Por día activo',
      icon: <Activity size={20} />,
      accent: 'text-purple-600',
      bgAccent: 'bg-purple-50',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5">
      {cards.map((card) => (
        <KPICard key={card.title} {...card} />
      ))}
    </div>
  );
};

export default KPICards;
