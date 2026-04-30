import React, { useState, useEffect } from 'react';
import DrawerBase from './DrawerBase';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import { todayStr } from '../../utils/formatting';

const DOC_TYPES = ['SOAT', 'R.T. Particular', 'R.T. Detaxi', 'AFOCAT Taxi', 'GNV Quinquenal', 'BREVETE', 'Otro'];

const QuickDocumentationDrawer: React.FC = () => {
  const { openDrawer, close, lastVehicleId, setLastVehicleId } = useDrawer();
  const { vehicles, addDocumentacion } = useRegistrosContext();
  const isOpen = openDrawer === 'documentation';

  const [vehicleId, setVehicleId] = useState('');
  const [docTipo, setDocTipo] = useState(DOC_TYPES[0]);
  const [vencimiento, setVencimiento] = useState('');
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setVehicleId(lastVehicleId ? String(lastVehicleId) : (vehicles[0] ? String(vehicles[0].id) : ''));
      setDocTipo(DOC_TYPES[0]);
      setVencimiento('');
      setNotas('');
    }
  }, [isOpen]);

  const activeVehicles = vehicles.filter(v => v.activo);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId || !vencimiento) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 350));
    const soat = docTipo === 'SOAT' ? vencimiento : '';
    const rtParticular = docTipo === 'R.T. Particular' ? vencimiento : '';
    const rtDetaxi = docTipo === 'R.T. Detaxi' ? vencimiento : '';
    const afocatTaxi = docTipo === 'AFOCAT Taxi' ? vencimiento : '';
    addDocumentacion({
      fecha: todayStr(),
      vehicleId: Number(vehicleId),
      motivo: `Renovación ${docTipo}`,
      descripcion: `Vencimiento ${docTipo}`,
      valorTiempo: 'Inmediato',
      soat,
      rtParticular,
      rtDetaxi,
      afocatTaxi,
      notas,
    });
    if (vehicleId) setLastVehicleId(Number(vehicleId));
    setLoading(false);
    close();
  };

  return (
    <DrawerBase
      isOpen={isOpen}
      onClose={close}
      title="Registrar Documento"
      subtitle="Vencimiento de documentación"
      icon="📋"
      accentColor="from-purple-500 to-pink-600"
      footer={
        <div className="flex gap-3">
          <button onClick={close} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit as React.MouseEventHandler}
            disabled={!vehicleId || !vencimiento || loading}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-600 text-white text-sm font-bold shadow-md disabled:opacity-50 transition-all"
          >
            {loading ? '...' : '✅ GUARDAR'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-purple-50 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-purple-700 font-medium">📅 Hoy</span>
          <span className="text-sm font-bold text-purple-800">{new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}</span>
        </div>

        <div>
          <label className="label">Vehículo</label>
          <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} className="input-field appearance-none">
            <option value="">Seleccionar...</option>
            {activeVehicles.map(v => (
              <option key={v.id} value={v.id}>#{v.id} — {v.marca} {v.modelo} ({v.placa})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Tipo de Documento</label>
          <div className="grid grid-cols-2 gap-2">
            {DOC_TYPES.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setDocTipo(t)}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border-2 transition-all text-left
                  ${docTipo === t
                    ? 'bg-purple-500 border-purple-500 text-white shadow-md'
                    : 'border-gray-200 text-gray-600 hover:border-purple-300'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Fecha de Vencimiento</label>
          <input
            type="date"
            value={vencimiento}
            onChange={e => setVencimiento(e.target.value)}
            className="input-field"
            required
          />
        </div>

        <div>
          <label className="label">Notas <span className="text-gray-400 font-normal">(opcional)</span></label>
          <input type="text" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Renovado en Trujillo..." className="input-field" />
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
          <span className="text-amber-500 mt-0.5">⏰</span>
          <p className="text-xs text-amber-700">
            Se te alertará automáticamente <strong>30 días antes</strong> del vencimiento.
          </p>
        </div>
      </form>
    </DrawerBase>
  );
};

export default QuickDocumentationDrawer;
