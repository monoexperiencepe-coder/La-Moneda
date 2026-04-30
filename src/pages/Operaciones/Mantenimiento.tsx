import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import MaintenanceForm from '../../components/Forms/MaintenanceForm';
import { formatCurrency, formatDate } from '../../utils/formatting';
import Badge from '../../components/Common/Badge';

const Mantenimiento: React.FC = () => {
  const navigate = useNavigate();
  const { mantenimientos, vehicles, addMantenimiento } = useRegistrosContext();
  const { open } = useDrawer();

  const getVehicle = (id: number) => vehicles.find(v => v.id === id);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/operaciones')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🔧 Mantenimiento</h1>
            <p className="text-sm text-gray-500">{mantenimientos.length} registros</p>
          </div>
        </div>
        <button onClick={() => open('maintenance')}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-bold shadow-soft transition-all">
          + Rápido
        </button>
      </div>

      <MaintenanceForm vehicles={vehicles} onSubmit={addMantenimiento} />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Historial de Mantenimientos</h3>
        </div>
        {mantenimientos.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">🔧</p>
            <p className="text-sm">Sin registros de mantenimiento</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {mantenimientos.map(m => {
              const vehicle = getVehicle(m.vehicleId);
              return (
                <div key={m.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {vehicle ? `${vehicle.marca} ${vehicle.modelo}` : `Carro #${m.vehicleId}`}
                        <span className="text-gray-400 font-normal ml-2 text-xs">({vehicle?.placa})</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {m.nombres} {m.apellidos} · {formatDate(m.fechaRegistro)}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{formatCurrency(m.costo)}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500">{m.kilometraje.toLocaleString()} km</span>
                    {m.mantenimientoRealizado && <Badge variant="success" size="sm">Mant. ✓</Badge>}
                    {m.compraBateriaNueva && <Badge variant="primary" size="sm">Batería ✓</Badge>}
                    {m.documentoFirmado && <Badge variant="neutral" size="sm">Firmado ✓</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Mantenimiento;
