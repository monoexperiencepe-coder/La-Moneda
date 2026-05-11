import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import Gastos from './Gastos';

const InversionesUtilidad: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/finanzas/inversiones')}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
          aria-label="Volver a Inversiones"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🚗 Inversión con utilidad</h1>
          <p className="text-sm text-slate-500">Inversiones registradas en gastos (inversion_compra)</p>
        </div>
      </div>

      <Gastos mode="inversiones" embeddedInParent />
    </div>
  );
};

export default InversionesUtilidad;
