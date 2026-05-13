import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import PrestamosPanel from './PrestamosPanel';

const FinanciamientoPrestamos: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="space-y-2 sm:space-y-3 animate-fade-in max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/finanzas/financiamiento')}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          aria-label="Volver a Financiamiento"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">🏦 Préstamos</h1>
          <p className="text-xs text-slate-500 leading-snug mt-0.5">Financiamiento vía préstamos</p>
        </div>
      </div>

      <PrestamosPanel />
    </div>
  );
};

export default FinanciamientoPrestamos;
