import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import KilometrajeMantenimientoPanel from '../../components/operaciones/KilometrajeMantenimientoPanel';
import ValorTiempoSection from '../../components/operaciones/ValorTiempoSection';

const Mantenimiento: React.FC = () => {
  const navigate = useNavigate();
  const { vehicles, kilometrajes, addKilometraje, deleteKilometraje, getVehicleLabel } = useRegistrosContext();

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={() => navigate('/operaciones')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 shrink-0">
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">Mantenimiento</h1>
            <p className="text-sm text-gray-500">
              Kilometrajes y valor tiempo se guardan en Supabase. Vencimientos (SOAT, GNV, etc.) en Operaciones → Documentación.
            </p>
          </div>
        </div>
      </div>

      <KilometrajeMantenimientoPanel
        vehicles={vehicles}
        kilometrajes={kilometrajes}
        addKilometraje={addKilometraje}
        deleteKilometraje={deleteKilometraje}
        getVehicleLabel={getVehicleLabel}
      />

      <ValorTiempoSection subtitle="Registros en Supabase (registros_tiempo). Misma pantalla que Operaciones → Valor tiempo." />
    </div>
  );
};

export default Mantenimiento;
