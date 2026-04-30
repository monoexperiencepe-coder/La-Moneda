import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import DocumentationForm from '../../components/Forms/DocumentationForm';
import { formatDate, isExpiringSoon, isExpired } from '../../utils/formatting';
import Badge from '../../components/Common/Badge';

const DocDateRow: React.FC<{ label: string; date: string }> = ({ label, date }) => {
  if (!date) return null;
  const expired = isExpired(date);
  const expiring = isExpiringSoon(date, 30);
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={`font-semibold px-2 py-0.5 rounded-full ${expired ? 'bg-red-50 text-red-600' : expiring ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
        {expired ? '❌ ' : expiring ? '⏳ ' : '✅ '}{formatDate(date)}
      </span>
    </div>
  );
};

const Documentacion: React.FC = () => {
  const navigate = useNavigate();
  const { documentaciones, vehicles, addDocumentacion } = useRegistrosContext();
  const { open } = useDrawer();

  const getVehicle = (id: number) => vehicles.find(v => v.id === id);

  const alerts = documentaciones.filter(d =>
    ['soat', 'rtParticular', 'rtDetaxi', 'afocatTaxi'].some(k => {
      const date = d[k as keyof typeof d] as string;
      return date && (isExpired(date) || isExpiringSoon(date, 30));
    })
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/operaciones')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">📋 Documentación</h1>
            <p className="text-sm text-gray-500">{documentaciones.length} registros</p>
          </div>
        </div>
        <button onClick={() => open('documentation')}
          className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl text-sm font-bold shadow-soft transition-all">
          + Rápido
        </button>
      </div>

      {alerts.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle size={18} className="text-amber-500" />
            <p className="text-sm font-bold text-amber-800">{alerts.length} alerta{alerts.length > 1 ? 's' : ''} de documentos</p>
          </div>
          <div className="space-y-1">
            {alerts.map(d => {
              const v = getVehicle(d.vehicleId);
              return (
                <p key={d.id} className="text-xs text-amber-700">
                  • {v ? `${v.marca} ${v.modelo} (${v.placa})` : `Carro #${d.vehicleId}`} — {d.motivo}
                </p>
              );
            })}
          </div>
        </div>
      )}

      <DocumentationForm vehicles={vehicles} onSubmit={addDocumentacion} />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Historial de Documentación</h3>
        </div>
        {documentaciones.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-sm">Sin registros de documentación</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {documentaciones.map(d => {
              const vehicle = getVehicle(d.vehicleId);
              const hasAlert = ['soat', 'rtParticular', 'rtDetaxi', 'afocatTaxi'].some(k => {
                const date = d[k as keyof typeof d] as string;
                return date && (isExpired(date) || isExpiringSoon(date, 30));
              });
              return (
                <div key={d.id} className="px-5 py-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {vehicle ? `${vehicle.marca} ${vehicle.modelo}` : `Carro #${d.vehicleId}`}
                      </p>
                      <p className="text-xs text-gray-500">{d.motivo} · {formatDate(d.fecha)}</p>
                    </div>
                    {hasAlert && <Badge variant="warning" size="sm">Revisar</Badge>}
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                    <DocDateRow label="SOAT" date={d.soat} />
                    <DocDateRow label="R.T. Particular" date={d.rtParticular} />
                    <DocDateRow label="R.T. Detaxi" date={d.rtDetaxi} />
                    <DocDateRow label="AFOCAT" date={d.afocatTaxi} />
                  </div>
                  {d.notas && <p className="text-xs text-gray-400 mt-2 italic">{d.notas}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Documentacion;
