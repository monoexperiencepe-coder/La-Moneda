import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import Modal from '../Common/Modal';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useAuth } from '../../context/AuthContext';
import {
  fetchInversionGeneralByVehicleId,
  upsertInversionGeneralVehiculoValor,
} from '../../services/inversionesGeneralesVehiculoService';
import type { Vehicle } from '../../data/types';

const OBS_SEP = ' · Obs: ';

function splitModeloObs(modelo: string): { base: string; obs: string } {
  const i = modelo.indexOf(OBS_SEP);
  if (i === -1) return { base: modelo, obs: '' };
  return { base: modelo.slice(0, i), obs: modelo.slice(i + OBS_SEP.length) };
}

function mergeModeloObs(base: string, obs: string): string {
  const b = base.trim();
  const o = obs.trim();
  if (!o) return b;
  return `${b}${OBS_SEP}${o}`.slice(0, 240);
}

type Props = {
  vehicle: Vehicle | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleted?: () => void;
  onSaved?: () => void;
};

const EditarVehiculoModal: React.FC<Props> = ({ vehicle, isOpen, onClose, onDeleted, onSaved }) => {
  const { updateVehicle, deleteVehicle } = useRegistrosContext();
  const { profile } = useAuth();
  const [modelo, setModelo] = useState('');
  const [color, setColor] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [valorCompraUsd, setValorCompraUsd] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!isOpen || !vehicle) return;
    const { base, obs } = splitModeloObs(vehicle.modelo ?? '');
    setModelo(base);
    setColor(vehicle.color ?? '');
    setObservaciones(obs);
    setValorCompraUsd('');
    setError('');
    setConfirmDelete(false);
    void fetchInversionGeneralByVehicleId(vehicle.id, profile?.empresa_id).then((inv) => {
      if (inv?.valorCompraUsd != null && Number.isFinite(inv.valorCompraUsd)) {
        setValorCompraUsd(String(inv.valorCompraUsd));
      } else if (inv?.montoTotal != null && inv.moneda === 'USD') {
        setValorCompraUsd(String(inv.montoTotal));
      }
    });
  }, [isOpen, vehicle, profile?.empresa_id]);

  const resetAndClose = useCallback(() => {
    setError('');
    setConfirmDelete(false);
    onClose();
  }, [onClose]);

  const handleSave = useCallback(async () => {
    if (!vehicle || busy) return;
    setError('');
    const modeloFinal = mergeModeloObs(modelo, observaciones);
    if (!modeloFinal.trim()) {
      setError('El modelo es obligatorio.');
      return;
    }
    setBusy(true);
    try {
      const updated = await updateVehicle(vehicle.id, {
        modelo: modeloFinal,
        color: color.trim() || undefined,
      });
      if (!updated) {
        setError('No se pudo guardar el vehículo.');
        return;
      }
      const rawValor = valorCompraUsd.trim();
      if (rawValor !== '') {
        const valor = Number(rawValor);
        if (Number.isFinite(valor) && valor > 0) {
          await upsertInversionGeneralVehiculoValor(updated, valor, profile?.empresa_id);
        }
      }
      onSaved?.();
      resetAndClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setBusy(false);
    }
  }, [busy, color, modelo, observaciones, onSaved, profile?.empresa_id, resetAndClose, updateVehicle, valorCompraUsd, vehicle]);

  const handleDelete = useCallback(async () => {
    if (!vehicle || busy) return;
    setError('');
    setBusy(true);
    try {
      await deleteVehicle(vehicle.id);
      resetAndClose();
      onDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el vehículo.');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }, [busy, deleteVehicle, onDeleted, resetAndClose, vehicle]);

  if (!vehicle) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
      title="Editar vehículo"
      size="lg"
      closeLocked={busy}
      footer={
        <div className="flex flex-wrap justify-between gap-2 w-full">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 size={16} />
            Eliminar vehículo
          </button>
          <div className="flex flex-wrap gap-2">
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
              onClick={() => void handleSave()}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Guardar cambios
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-sm">
          <p className="font-semibold text-gray-900">
            {vehicle.marca} · <span className="font-mono">{vehicle.placa}</span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">ID {vehicle.id}</p>
        </div>

        {error ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        ) : null}

        {confirmDelete ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-3">
            <p className="text-sm font-semibold text-red-900">
              ¿Eliminar {vehicle.placa}? Esta acción no se puede deshacer.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDelete()}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Sí, eliminar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block sm:col-span-2">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Modelo *</span>
            <input
              type="text"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Color</span>
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Valor de compra (USD)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={valorCompraUsd}
              onChange={(e) => setValorCompraUsd(e.target.value)}
              placeholder="Inversión inicial — inversiones generales"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Observaciones</span>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-y min-h-[72px]"
              placeholder="Notas internas sobre la unidad"
            />
          </label>
        </div>
      </div>
    </Modal>
  );
};

export default EditarVehiculoModal;
