import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Filter, Plus } from 'lucide-react';
import VehicleCard from '../../components/Cards/VehicleCard';
import RegistrarVehiculoForm from '../../components/vehiculos/RegistrarVehiculoForm';
import AsignarConductorModal from '../../components/vehiculos/AsignarConductorModal';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useAuth } from '../../context/AuthContext';
import { totalInversionUsdForVehicle } from '../../services/inversionesVehiculoService';
import { canMutateVehiculos } from '../../utils/permissions';
import type { Vehicle } from '../../data/types';

const Inventario: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { vehicles, conductores, ingresos, gastos, documentaciones, inversionesVehiculo } =
    useRegistrosContext();
  const [showAll, setShowAll] = useState(false);
  const [showRegistrar, setShowRegistrar] = useState(false);
  const [assignVehicle, setAssignVehicle] = useState<Vehicle | null>(null);
  const canRegister = canMutateVehiculos(user);

  const filteredVehicles = useMemo(() => {
    const list = showAll ? vehicles : vehicles.filter((v) => v.activo);
    return [...list].sort((a, b) => a.id - b.id);
  }, [vehicles, showAll]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/vehiculos')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🚗 Inventario</h1>
            <p className="text-sm text-gray-500">{filteredVehicles.length} vehículo{filteredVehicles.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canRegister ? (
            <button
              type="button"
              onClick={() => setShowRegistrar(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              <Plus size={16} />
              Registrar vehículo
            </button>
          ) : null}
          <button
            onClick={() => setShowAll(!showAll)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors
            ${showAll ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
          >
            <Filter size={14} />
            {showAll ? 'Mostrando todos' : 'Solo activos'}
          </button>
        </div>
      </div>

      {/* Vehicle grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {filteredVehicles.map((vehicle, idx) => (
          <VehicleCard
            key={vehicle.id}
            vehicle={vehicle}
            ingresos={ingresos}
            gastos={gastos}
            documentaciones={documentaciones}
            inversionTotalUsd={totalInversionUsdForVehicle(inversionesVehiculo, vehicle.id)}
            listaIndice={idx + 1}
            conductores={conductores}
            canAssignConductor={canRegister}
            onAsignarConductor={() => setAssignVehicle(vehicle)}
          />
        ))}
      </div>

      {filteredVehicles.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-4">🚗</p>
          <p className="font-medium">No hay vehículos disponibles</p>
          {canRegister ? (
            <button
              type="button"
              onClick={() => setShowRegistrar(true)}
              className="mt-4 text-primary-600 hover:underline text-sm font-medium"
            >
              Registrar el primer vehículo
            </button>
          ) : null}
        </div>
      )}

      <RegistrarVehiculoForm isOpen={showRegistrar} onClose={() => setShowRegistrar(false)} />
      <AsignarConductorModal
        vehicle={assignVehicle}
        isOpen={assignVehicle != null}
        onClose={() => setAssignVehicle(null)}
      />
    </div>
  );
};

export default Inventario;
