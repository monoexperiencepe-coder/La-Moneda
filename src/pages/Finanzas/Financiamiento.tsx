import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import PrestamosPanel from './PrestamosPanel';
import AportesPanel from './AportesPanel';

type TabKey = 'prestamos' | 'aportes';

const Financiamiento: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('prestamos');

  return (
    <div className="space-y-3 sm:space-y-4 animate-fade-in max-w-3xl mx-auto px-0">
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          onClick={() => navigate('/finanzas')}
          className="mt-0.5 p-1 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          aria-label="Volver a Finanzas"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight leading-tight">Financiamiento</h1>
          <p className="text-[11px] text-slate-500 mt-px">Préstamos y aportes de capital</p>
        </div>
      </div>

      <div
        className="flex rounded-xl border border-indigo-200/80 bg-gradient-to-r from-slate-100 via-indigo-50/60 to-amber-50/70 p-1 sm:p-1.5 gap-1 sm:gap-1.5 shadow-sm shadow-indigo-950/5"
        role="tablist"
        aria-label="Sección financiamiento"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'prestamos'}
          onClick={() => setTab('prestamos')}
          className={[
            'flex-1 rounded-lg px-4 py-2.5 sm:py-3 text-sm font-semibold tracking-tight transition-all duration-200',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50',
            tab === 'prestamos'
              ? 'bg-gradient-to-br from-indigo-600 to-indigo-800 text-white shadow-md shadow-indigo-900/25 ring-2 ring-indigo-400/50 scale-[1.02]'
              : 'bg-white/50 text-indigo-950/65 hover:bg-white/85 hover:text-indigo-950 hover:shadow-sm border border-indigo-100/80',
          ].join(' ')}
        >
          Préstamos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'aportes'}
          onClick={() => setTab('aportes')}
          className={[
            'flex-1 rounded-lg px-4 py-2.5 sm:py-3 text-sm font-semibold tracking-tight transition-all duration-200',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50',
            tab === 'aportes'
              ? 'bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-md shadow-amber-900/20 ring-2 ring-amber-300/60 scale-[1.02]'
              : 'bg-white/50 text-amber-950/75 hover:bg-white/85 hover:text-amber-950 hover:shadow-sm border border-amber-100/90',
          ].join(' ')}
        >
          Aportes
        </button>
      </div>

      {tab === 'prestamos' ? <PrestamosPanel /> : <AportesPanel />}
    </div>
  );
};

export default Financiamiento;
