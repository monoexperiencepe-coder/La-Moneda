import React from 'react';
import MaintenanceForm from '../Forms/MaintenanceForm';
import Card from '../Common/Card';
import Badge from '../Common/Badge';
import { Mantenimiento, Vehicle } from '../../data/types';
import { formatCurrency, formatDate } from '../../utils/formatting';
import { Wrench, Car } from 'lucide-react';

interface MantenimientoViewProps {
  vehicles: Vehicle[];
  mantenimientos: Mantenimiento[];
  onAdd: (mant: Omit<Mantenimiento, 'id' | 'createdAt'>) => void;
}

const MantenimientoView: React.FC<MantenimientoViewProps> = ({ vehicles, mantenimientos, onAdd }) => {
  const getVehicle = (id: number) => vehicles.find(v => v.id === id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mantenimiento</h1>
        <p className="text-sm text-gray-500 mt-0.5">Registro de mantenimientos y conductores asignados</p>
      </div>

      <MaintenanceForm vehicles={vehicles} onSubmit={onAdd} />

      <Card title="Historial de Mantenimientos" subtitle={`${mantenimientos.length} registros`}>
        {mantenimientos.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            <Wrench size={32} className="mx-auto mb-3 text-gray-200" />
            Sin registros de mantenimiento
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {mantenimientos.map(m => {
              const vehicle = getVehicle(m.vehicleId);
              return (
                <div key={m.id} className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-primary-50 rounded-lg flex items-center justify-center">
                        <Car size={16} className="text-primary-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {vehicle ? `${vehicle.marca} ${vehicle.modelo} (${vehicle.placa})` : `Carro #${m.vehicleId}`}
                        </p>
                        <p className="text-xs text-gray-400">{formatDate(m.fechaRegistro)}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{formatCurrency(m.costo)}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-gray-400 mb-0.5">Responsable</p>
                      <p className="font-medium text-gray-700">{m.nombres} {m.apellidos}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 mb-0.5">Celular</p>
                      <p className="font-medium text-gray-700">{m.celular}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 mb-0.5">Kilometraje</p>
                      <p className="font-medium text-gray-700">{m.kilometraje.toLocaleString()} km</p>
                    </div>
                    <div>
                      <p className="text-gray-400 mb-1">Estado</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {m.mantenimientoRealizado && <Badge variant="success" size="sm">Mant. ✓</Badge>}
                        {m.compraBateriaNueva && <Badge variant="primary" size="sm">Batería ✓</Badge>}
                        {m.documentoFirmado && <Badge variant="neutral" size="sm">Firmado ✓</Badge>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

export default MantenimientoView;
