import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { isExpiringSoon, isExpired } from '../../utils/formatting';

const OperacionesHub: React.FC = () => {
  const navigate = useNavigate();
  const { mantenimientos, documentaciones } = useRegistrosContext();

  const docAlerts = documentaciones.filter(d =>
    ['soat', 'rtParticular', 'rtDetaxi', 'afocatTaxi'].some(k => {
      const date = d[k as keyof typeof d] as string;
      return date && (isExpired(date) || isExpiringSoon(date, 30));
    })
  ).length;

  const options = [
    { title: 'Mantenimiento', desc: `${mantenimientos.length} registros`, emoji: '🔧', path: '/operaciones/mantenimiento', gradient: 'from-blue-500/10 to-indigo-500/10', border: 'border-blue-200 hover:border-blue-400' },
    { title: 'Documentación', desc: docAlerts > 0 ? `⚠️ ${docAlerts} alertas` : 'Vencimientos al día', emoji: '📋', path: '/operaciones/docs', gradient: docAlerts > 0 ? 'from-amber-500/10 to-orange-500/10' : 'from-purple-500/10 to-pink-500/10', border: docAlerts > 0 ? 'border-amber-300 hover:border-amber-500' : 'border-purple-200 hover:border-purple-400' },
    { title: 'Control Global', desc: 'Unidades, fechas, KMS y conductores', emoji: '🧭', path: '/operaciones/control-global', gradient: 'from-slate-500/10 to-cyan-500/10', border: 'border-slate-200 hover:border-slate-400' },
    { title: 'Valor tiempo', desc: 'Hoja TIEMPO del Excel (operativo)', emoji: '⏱️', path: '/operaciones/tiempo', gradient: 'from-indigo-500/10 to-violet-500/10', border: 'border-indigo-200 hover:border-indigo-400' },
    { title: 'Conductores', desc: 'Gestión de conductores', emoji: '👤', path: '/operaciones/conductores', gradient: 'from-gray-400/10 to-gray-500/10', border: 'border-gray-200 hover:border-gray-400' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🔧 Operaciones</h1>
          <p className="text-sm text-gray-500">Mantenimiento, documentación y conductores</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
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
    </div>
  );
};

export default OperacionesHub;
