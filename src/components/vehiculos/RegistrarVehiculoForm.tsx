import React, { useCallback, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import Modal from '../Common/Modal';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useAuth } from '../../context/AuthContext';
import { upsertInversionGeneralVehiculoValor } from '../../services/inversionesGeneralesVehiculoService';
import { formatConductorDisplayLabel } from '../../utils/fleetPanel';
import { normalizePlaca, placasMatch } from '../../utils/normalizePlaca';
import type { InsertVehiculoInput } from '../../services/vehiculosService';

type EstadoForm = 'activo' | 'inactivo';

function emptyForm() {
  return {
    placa: '',
    marca: '',
    modelo: '',
    anio: '',
    color: '',
    estado: 'activo' as EstadoForm,
    conductorId: '',
    valorCompraUsd: '',
  };
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

const RegistrarVehiculoForm: React.FC<Props> = ({ isOpen, onClose, onSaved }) => {
  const { vehicles, conductores, addVehicle } = useRegistrosContext();
  const { profile } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const conductoresDisponibles = useMemo(
    () =>
      conductores
        .filter((c) => c.estado === 'VIGENTE' && (c.vehicleId == null || c.vehicleId === undefined))
        .sort((a, b) => formatConductorDisplayLabel(a).localeCompare(formatConductorDisplayLabel(b), 'es')),
    [conductores],
  );

  const resetAndClose = useCallback(() => {
    setForm(emptyForm());
    setError('');
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (busy) return;
    setError('');

    const placa = normalizePlaca(form.placa);
    const marca = form.marca.trim();
    const modelo = form.modelo.trim();
    if (!placa || !marca || !modelo) {
      setError('Completa placa, marca y modelo.');
      return;
    }

    if (vehicles.some((v) => placasMatch(v.placa ?? '', placa))) {
      setError(`Ya existe un vehículo con la placa ${placa}.`);
      return;
    }

    let anio: number | undefined;
    if (form.anio.trim() !== '') {
      const n = Number(form.anio.trim());
      if (!Number.isFinite(n) || n < 1900 || n > 2100) {
        setError('Año inválido.');
        return;
      }
      anio = Math.trunc(n);
    }

    const row: InsertVehiculoInput = {
      placa,
      marca,
      modelo,
      anio,
      color: form.color.trim() || undefined,
      activo: form.estado === 'activo',
    };

    setBusy(true);
    try {
      const result = await addVehicle(row, {
        conductorId: form.conductorId.trim() === '' ? null : form.conductorId.trim(),
      });
      if (!result) return;
      const rawValor = form.valorCompraUsd.trim();
      if (rawValor !== '') {
        const valor = Number(rawValor);
        if (Number.isFinite(valor) && valor > 0) {
          await upsertInversionGeneralVehiculoValor(result, valor, profile?.empresa_id);
        }
      }
      onSaved?.();
      resetAndClose();
    } finally {
      setBusy(false);
    }
  }, [addVehicle, busy, form, onSaved, profile?.empresa_id, resetAndClose, vehicles]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
      title="Registrar vehículo"
      size="lg"
      closeLocked={busy}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={resetAndClose}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Guardar vehículo
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block sm:col-span-2">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Placa *</span>
            <input
              type="text"
              value={form.placa}
              onChange={(e) => setForm((p) => ({ ...p, placa: e.target.value.toUpperCase() }))}
              placeholder="Ej. ABC-123"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm uppercase focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Marca *</span>
            <input
              type="text"
              value={form.marca}
              onChange={(e) => setForm((p) => ({ ...p, marca: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Modelo *</span>
            <input
              type="text"
              value={form.modelo}
              onChange={(e) => setForm((p) => ({ ...p, modelo: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Año</span>
            <input
              type="number"
              min={1900}
              max={2100}
              value={form.anio}
              onChange={(e) => setForm((p) => ({ ...p, anio: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Color</span>
            <input
              type="text"
              value={form.color}
              onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Estado</span>
            <select
              value={form.estado}
              onChange={(e) => setForm((p) => ({ ...p, estado: e.target.value as EstadoForm }))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Valor de compra (USD)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.valorCompraUsd}
              onChange={(e) => setForm((p) => ({ ...p, valorCompraUsd: e.target.value }))}
              placeholder="Opcional — inversiones generales"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              Conductor asignado (opcional)
            </span>
            <select
              value={form.conductorId}
              onChange={(e) => setForm((p) => ({ ...p, conductorId: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            >
              <option value="">Sin conductor</option>
              {conductoresDisponibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatConductorDisplayLabel(c)}
                </option>
              ))}
            </select>
            {conductoresDisponibles.length === 0 ? (
              <p className="mt-1 text-xs text-gray-500">No hay conductores vigentes sin vehículo asignado.</p>
            ) : null}
          </label>
        </div>
      </div>
    </Modal>
  );
};

export default RegistrarVehiculoForm;
