import React, { useState, useEffect, useRef } from 'react';
import DrawerBase from './DrawerBase';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import { todayStr } from '../../utils/formatting';

const QuickMaintenanceDrawer: React.FC = () => {
  const { openDrawer, close, lastVehicleId, setLastVehicleId } = useDrawer();
  const { vehicles, addMantenimiento } = useRegistrosContext();
  const isOpen = openDrawer === 'maintenance';

  const [vehicleId, setVehicleId] = useState('');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [celular, setCelular] = useState('');
  const [kilometraje, setKilometraje] = useState('');
  const [costo, setCosto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [mantenimientoRealizado, setMantenimientoRealizado] = useState(true);
  const [loading, setLoading] = useState(false);
  const costoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setVehicleId(lastVehicleId ? String(lastVehicleId) : (vehicles[0] ? String(vehicles[0].id) : ''));
      setNombres(''); setApellidos(''); setCelular('');
      setKilometraje(''); setCosto(''); setDescripcion('');
      setTimeout(() => costoRef.current?.focus(), 350);
    }
  }, [isOpen]);

  const activeVehicles = vehicles.filter(v => v.activo);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId || !nombres) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 350));
    addMantenimiento({
      fechaRegistro: todayStr(),
      vehicleId: Number(vehicleId),
      documentoResponsable: 'DNI',
      numeroDocumento: '',
      nombres,
      apellidos,
      celular,
      domicilio: 'PROPIO',
      cochera: '',
      direccion: descripcion,
      referencia: '',
      documentoFirmado: false,
      fechaVencimientoContrato: '',
      mantenimientoRealizado,
      compraBateriaNueva: false,
      kilometraje: Number(kilometraje) || 0,
      costo: Number(Number(costo).toFixed(2)) || 0,
    });
    if (vehicleId) setLastVehicleId(Number(vehicleId));
    setLoading(false);
    close();
  };

  return (
    <DrawerBase
      isOpen={isOpen}
      onClose={close}
      title="Registrar Mantenimiento"
      subtitle="Servicio rápido"
      icon="🔧"
      accentColor="from-blue-500 to-indigo-600"
      footer={
        <div className="flex gap-3">
          <button onClick={close} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit as React.MouseEventHandler}
            disabled={!vehicleId || !nombres || loading}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-bold shadow-md disabled:opacity-50 transition-all"
          >
            {loading ? '...' : '✅ GUARDAR'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-blue-50 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-blue-700 font-medium">📅 Hoy</span>
          <span className="text-sm font-bold text-blue-800">{new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}</span>
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

        {/* Tipo */}
        <div>
          <label className="label">Tipo de Mantenimiento</label>
          <div className="flex gap-2">
            {[{ v: true, l: '🔧 Preventivo' }, { v: false, l: '⚠️ Correctivo' }].map(opt => (
              <button
                key={String(opt.v)}
                type="button"
                onClick={() => setMantenimientoRealizado(opt.v)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all
                  ${mantenimientoRealizado === opt.v
                    ? 'bg-blue-500 border-blue-500 text-white'
                    : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}
              >
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nombres</label>
            <input type="text" value={nombres} onChange={e => setNombres(e.target.value)} placeholder="Juan Carlos" className="input-field" required />
          </div>
          <div>
            <label className="label">Apellidos</label>
            <input type="text" value={apellidos} onChange={e => setApellidos(e.target.value)} placeholder="García" className="input-field" />
          </div>
        </div>

        <div>
          <label className="label">Celular</label>
          <input type="tel" value={celular} onChange={e => setCelular(e.target.value)} placeholder="987654321" className="input-field" />
        </div>

        <div>
          <label className="label">Descripción del servicio</label>
          <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Cambio de aceite, filtros..." className="input-field" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Kilometraje</label>
            <input type="number" min="0" value={kilometraje} onChange={e => setKilometraje(e.target.value)} placeholder="45200" className="input-field" />
          </div>
          <div>
            <label className="label">Costo (S/)</label>
            <input ref={costoRef} type="number" min="0" step="0.01" value={costo} onChange={e => setCosto(e.target.value)} placeholder="0.00" className="input-field font-bold text-lg" />
          </div>
        </div>
      </form>
    </DrawerBase>
  );
};

export default QuickMaintenanceDrawer;
