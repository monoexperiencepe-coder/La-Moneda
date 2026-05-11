import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const Financiamiento: React.FC = () => {
  const navigate = useNavigate();
  const options = [
    {
      title: 'Préstamos',
      desc: 'Préstamos financieros, tramos y estado actual',
      emoji: '🏦',
      path: '/finanzas/financiamiento/prestamos',
      gradient: 'from-indigo-500/10 to-blue-500/10',
      border: 'border-indigo-200 hover:border-indigo-400',
    },
    {
      title: 'Aportes',
      desc: 'Aportes de accionistas y totales por moneda',
      emoji: '🤝',
      path: '/finanzas/financiamiento/aportes',
      gradient: 'from-amber-500/10 to-orange-500/10',
      border: 'border-amber-200 hover:border-amber-400',
    },
  ] as const;

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/finanzas')}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
          aria-label="Volver a Finanzas"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🏦 Financiamiento</h1>
          <p className="text-sm text-gray-500">Elige la sección a revisar</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {options.map((o) => (
          <button
            key={o.path}
            type="button"
            onClick={() => navigate(o.path)}
            className={`mission-btn bg-gradient-to-br ${o.gradient} border-2 ${o.border} group text-left`}
          >
            <div className="flex items-start gap-2 mb-3">
              <span className="text-4xl group-hover:scale-110 transition-transform shrink-0">{o.emoji}</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">{o.title}</h3>
            <p className="text-sm text-gray-500">{o.desc}</p>
            <div className="mt-4 flex items-center gap-1 text-xs text-gray-400 group-hover:text-primary-500 font-semibold transition-colors">
              Entrar a {o.title} <ChevronRight size={14} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Financiamiento;
