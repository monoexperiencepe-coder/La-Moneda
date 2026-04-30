import React from 'react';
import DocumentationForm from '../Forms/DocumentationForm';
import Card from '../Common/Card';
import Badge from '../Common/Badge';
import { Documentacion, Vehicle } from '../../data/types';
import { formatDate, isExpiringSoon, isExpired } from '../../utils/formatting';
import { FileText, Car, AlertTriangle } from 'lucide-react';

interface DocumentacionViewProps {
  vehicles: Vehicle[];
  documentaciones: Documentacion[];
  onAdd: (doc: Omit<Documentacion, 'id' | 'createdAt'>) => void;
}

const DocDateBadge: React.FC<{ date: string; label: string }> = ({ date, label }) => {
  if (!date) return <span className="text-xs text-gray-300">Sin fecha</span>;
  const expired = isExpired(date);
  const expiring = isExpiringSoon(date, 30);

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
        ${expired ? 'bg-red-50 text-red-600' : expiring ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
        {expired ? '⚠ ' : expiring ? '⏳ ' : '✓ '}{formatDate(date)}
      </span>
    </div>
  );
};

const DocumentacionView: React.FC<DocumentacionViewProps> = ({ vehicles, documentaciones, onAdd }) => {
  const getVehicle = (id: number) => vehicles.find(v => v.id === id);

  const alerts = documentaciones.filter(d =>
    isExpired(d.soat) || isExpired(d.rtParticular) || isExpired(d.rtDetaxi) || isExpired(d.afocatTaxi) ||
    isExpiringSoon(d.soat) || isExpiringSoon(d.rtParticular) || isExpiringSoon(d.rtDetaxi) || isExpiringSoon(d.afocatTaxi)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documentación</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gestión de documentos y fechas de vencimiento</p>
      </div>

      {alerts.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {alerts.length} vehículo{alerts.length > 1 ? 's' : ''} con documentos por vencer o vencidos
            </p>
            <p className="text-xs text-amber-600 mt-0.5">Revisa los detalles a continuación</p>
          </div>
        </div>
      )}

      <DocumentationForm vehicles={vehicles} onSubmit={onAdd} />

      <Card title="Historial de Documentación" subtitle={`${documentaciones.length} registros`}>
        {documentaciones.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            <FileText size={32} className="mx-auto mb-3 text-gray-200" />
            Sin registros de documentación
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {documentaciones.map(d => {
              const vehicle = getVehicle(d.vehicleId);
              return (
                <div key={d.id} className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center">
                        <Car size={16} className="text-purple-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {vehicle ? `${vehicle.marca} ${vehicle.modelo} (${vehicle.placa})` : `Carro #${d.vehicleId}`}
                        </p>
                        <p className="text-xs text-gray-400">{d.motivo} · {formatDate(d.fecha)}</p>
                      </div>
                    </div>
                    {d.valorTiempo && (
                      <Badge variant="neutral" size="sm">{d.valorTiempo}</Badge>
                    )}
                  </div>

                  {d.descripcion && (
                    <p className="text-xs text-gray-500 mb-3">{d.descripcion}</p>
                  )}

                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <DocDateBadge date={d.soat} label="SOAT" />
                    <DocDateBadge date={d.rtParticular} label="R.T. Particular" />
                    <DocDateBadge date={d.rtDetaxi} label="R.T. Detaxi" />
                    <DocDateBadge date={d.afocatTaxi} label="AFOCAT Taxi" />
                  </div>

                  {d.notas && (
                    <p className="text-xs text-gray-400 mt-2 italic">{d.notas}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

export default DocumentacionView;
