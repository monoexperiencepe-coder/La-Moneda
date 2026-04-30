import React, { useState, useEffect, useRef } from 'react';
import DrawerBase from './DrawerBase';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import { todayStr, formatCurrency } from '../../utils/formatting';
import { CATEGORIAS_DESCUENTO, LABEL_CATEGORIA_DESCUENTO } from '../../data/descuentosCatalog';
import type { CategoriaDescuento } from '../../data/types';

const QuickDiscountDrawer: React.FC = () => {
  const { openDrawer, close, lastVehicleId, setLastVehicleId } = useDrawer();
  const { vehicles, descuentos, addDescuento } = useRegistrosContext();
  const isOpen = openDrawer === 'discount';

  const cat0 = CATEGORIAS_DESCUENTO[0] ?? 'OTROS';

  const [fechaMov, setFechaMov] = useState(todayStr());
  const [fechaRegistro, setFechaRegistro] = useState(todayStr());
  const [vehicleId, setVehicleId] = useState('');
  const [categoria, setCategoria] = useState<CategoriaDescuento>(cat0);
  const [monto, setMonto] = useState('');
  const [comentarios, setComentarios] = useState('');
  const [loading, setLoading] = useState(false);
  const montoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const c0 = CATEGORIAS_DESCUENTO[0] ?? 'OTROS';
      setFechaMov(todayStr());
      setFechaRegistro(todayStr());
      setVehicleId(lastVehicleId ? String(lastVehicleId) : (vehicles[0] ? String(vehicles[0].id) : ''));
      setCategoria(c0);
      setMonto('');
      setComentarios('');
      setTimeout(() => montoRef.current?.focus(), 350);
    }
  }, [isOpen, lastVehicleId, vehicles]);

  const activeVehicles = vehicles.filter(v => v.activo);
  const mismoDia = descuentos
    .filter(d => d.fecha === fechaMov)
    .reduce((s, d) => s + d.monto, 0);
  const preview = mismoDia + (monto ? -Math.abs(Number(monto) || 0) : 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = Number(monto);
    if (!monto || Number.isNaN(raw) || raw <= 0) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 350));
    addDescuento({
      fecha: fechaMov,
      fechaRegistro: fechaRegistro.trim() || todayStr(),
      vehicleId: vehicleId ? Number(vehicleId) : null,
      categoria,
      monto: -Math.abs(Number(raw.toFixed(2))),
      comentarios: comentarios.trim(),
    });
    if (vehicleId) setLastVehicleId(Number(vehicleId));
    setLoading(false);
    close();
  };

  return (
    <DrawerBase
      isOpen={isOpen}
      onClose={close}
      title="Registrar descuento"
      subtitle="Fecha movimiento, categoría e importe (rebaja)"
      icon="🏷️"
      accentColor="from-amber-500 to-yellow-600"
      footer={
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Rebajes en fecha movimiento</span>
            <span className="font-bold text-amber-700 text-lg">{formatCurrency(preview)}</span>
          </div>
          <p className="text-[10px] text-gray-400 text-center">
            Suma de montos (negativos) con fecha = {fechaMov}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={close}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="quick-discount-form"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 text-white text-sm font-bold shadow-soft disabled:opacity-50"
            >
              {loading ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      }
    >
      <form id="quick-discount-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Fecha movimiento</label>
            <input
              type="date"
              value={fechaMov}
              onChange={e => setFechaMov(e.target.value)}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="label">Fecha registro</label>
            <input
              type="date"
              value={fechaRegistro}
              onChange={e => setFechaRegistro(e.target.value)}
              className="input-field"
              required
            />
          </div>
        </div>

        <div>
          <label className="label">Vehículo (opcional)</label>
          <select
            value={vehicleId}
            onChange={e => setVehicleId(e.target.value)}
            className="input-field appearance-none text-sm"
          >
            <option value="">General / sin vehículo</option>
            {activeVehicles.map(v => (
              <option key={v.id} value={v.id}>
                #{v.id} — {v.marca} {v.modelo} ({v.placa})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Categoría</label>
          <select
            value={categoria}
            onChange={e => setCategoria(e.target.value as CategoriaDescuento)}
            className="input-field appearance-none text-sm"
          >
            {CATEGORIAS_DESCUENTO.map(c => (
              <option key={c} value={c}>{LABEL_CATEGORIA_DESCUENTO[c]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Importe de la rebaja (S/) — positivo</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-lg">S/</span>
            <input
              ref={montoRef}
              type="number"
              min="0"
              step="0.01"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="0.00"
              className="input-field pl-12 text-2xl font-bold text-gray-900 py-4"
            />
          </div>
          <p className="text-[11px] text-amber-800/90 mt-1.5">Se guarda como monto negativo para el margen (como menos ingreso o costo implícito).</p>
        </div>

        <div>
          <label className="label">Comentarios <span className="text-gray-400 font-normal">(opcional)</span></label>
          <input
            type="text"
            value={comentarios}
            onChange={e => setComentarios(e.target.value)}
            placeholder="Motivo breve, referencia…"
            className="input-field"
          />
        </div>
      </form>
    </DrawerBase>
  );
};

export default QuickDiscountDrawer;
