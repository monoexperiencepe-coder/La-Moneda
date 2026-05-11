import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import InversionesGeneralesPanel from './InversionesGeneralesPanel';

const InversionesGenerales: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="space-y-3 sm:space-y-4 animate-fade-in max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/finanzas/inversiones')}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
          aria-label="Volver a Inversiones"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-slate-900">📦 Inversiones generales</h1>
      </div>

      <InversionesGeneralesPanel />
    </div>
  );
};

export default InversionesGenerales;
