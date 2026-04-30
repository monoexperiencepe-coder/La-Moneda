import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import ValorTiempoSection from '../../components/operaciones/ValorTiempoSection';

const RegistroTiempoPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start gap-3">
        <button type="button" onClick={() => navigate('/operaciones')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 shrink-0">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-bold text-gray-900">Valor tiempo</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Equivalente a la hoja <strong>TIEMPO</strong> del Excel. También disponible dentro de{' '}
            <button type="button" className="font-semibold text-indigo-600 hover:underline" onClick={() => navigate('/operaciones/mantenimiento')}>
              Mantenimiento
            </button>
            .
          </p>
        </div>
      </div>

      <ValorTiempoSection subtitle="Misma funcionalidad que en Mantenimiento — datos en Supabase (registros_tiempo)." />
    </div>
  );
};

export default RegistroTiempoPage;
