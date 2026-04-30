import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Filter } from 'lucide-react';
import VehicleCard from '../../components/Cards/VehicleCard';
import { useRegistrosContext } from '../../context/RegistrosContext';

const Inventario: React.FC = () => {
  const navigate = useNavigate();
  const { vehicles, ingresos, gastos, documentaciones } = useRegistrosContext();
  const [showAll, setShowAll] = useState(false);

  const filteredVehicles = showAll ? vehicles : vehicles.filter(v => v.activo);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/vehiculos')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🚗 Inventario</h1>
            <p className="text-sm text-gray-500">{filteredVehicles.length} vehículo{filteredVehicles.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button
          onClick={() => setShowAll(!showAll)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors
            ${showAll ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
        >
          <Filter size={14} />
          {showAll ? 'Mostrando todos' : 'Solo activos'}
        </button>
      </div>

      {/* Vehicle grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {filteredVehicles.map(vehicle => (
          <VehicleCard
            key={vehicle.id}
            vehicle={vehicle}
            ingresos={ingresos}
            gastos={gastos}
            documentaciones={documentaciones}
          />
        ))}
      </div>

      {filteredVehicles.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-4">🚗</p>
          <p className="font-medium">No hay vehículos disponibles</p>
        </div>
      )}
    </div>
  );
};

export default Inventario;
