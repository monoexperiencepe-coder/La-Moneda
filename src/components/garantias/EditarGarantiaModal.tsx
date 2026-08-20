import React, { useEffect, useState } from 'react';
import Modal from '../Common/Modal';
import Select from '../Common/Select';
import type { Conductor, Vehicle } from '../../data/types';
import type { DriverGuarantee } from '../../data/garantiasTypes';
import type { GuaranteeVehicleType } from '../../config/guaranteeAmounts';
import { GUARANTEE_VEHICLE_TYPE_LABELS } from '../../config/guaranteeAmounts';
import { formatConductorDisplayLabel } from '../../utils/fleetPanel';
import { formatVehicleSelectLabel } from '../../utils/vehicleDisplayNumber';
import { updateGuaranteeInfo } from '../../services/garantiasService';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  guarantee: DriverGuarantee;
  conductores: Conductor[];
  vehicles: Vehicle[];
  empresaId?: string | null;
  onSaved: () => void;
};

const EditarGarantiaModal: React.FC<Props> = ({
  isOpen,
  onClose,
  guarantee,
  conductores,
  vehicles,
  empresaId,
  onSaved,
}) => {
  const [driverId, setDriverId] = useState(guarantee.driverId);
  const [vehicleId, setVehicleId] = useState(
    guarantee.currentVehicleId != null ? String(guarantee.currentVehicleId) : '',
  );
  const [vehicleType, setVehicleType] = useState<GuaranteeVehicleType>(guarantee.vehicleType);
  const [notes, setNotes] = useState(guarantee.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Reinicializar cuando cambia la garantía o se abre el modal
  useEffect(() => {
    if (isOpen) {
      setDriverId(guarantee.driverId);
      setVehicleId(guarantee.currentVehicleId != null ? String(guarantee.currentVehicleId) : '');
      setVehicleType(guarantee.vehicleType);
      setNotes(guarantee.notes ?? '');
      setError('');
    }
  }, [isOpen, guarantee]);

  const activeConductores = conductores.filter((c) => c.estado === 'VIGENTE');
  const activeVehicles = vehicles.filter((v) => v.activo);

  const hasChanges =
    driverId !== guarantee.driverId ||
    (vehicleId ? Number(vehicleId) : null) !== guarantee.currentVehicleId ||
    vehicleType !== guarantee.vehicleType ||
    notes.trim() !== (guarantee.notes ?? '');

  const handleSubmit = async () => {
    setError('');
    setBusy(true);
    try {
      await updateGuaranteeInfo(
        guarantee.id,
        {
          driverId,
          currentVehicleId: vehicleId ? Number(vehicleId) : null,
          vehicleType,
          notes: notes.trim() || null,
        },
        empresaId,
      );
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar la garantía.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !busy && onClose()}
      title="Editar información de garantía"
      size="md"
      closeLocked={busy}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm border"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || !hasChanges || !driverId}
            onClick={() => void handleSubmit()}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        ) : null}

        <Select
          label="Conductor"
          options={activeConductores.map((c) => ({
            value: c.id,
            label: formatConductorDisplayLabel(c),
          }))}
          value={driverId}
          onChange={setDriverId}
          placeholder="Seleccionar conductor…"
        />

        <Select
          label="Tipo de vehículo"
          options={[
            { value: 'auto', label: GUARANTEE_VEHICLE_TYPE_LABELS.auto },
            { value: 'camioneta', label: GUARANTEE_VEHICLE_TYPE_LABELS.camioneta },
          ]}
          value={vehicleType}
          onChange={(v) => setVehicleType(v as GuaranteeVehicleType)}
        />

        <Select
          label="Vehículo asignado (opcional)"
          options={activeVehicles.map((v) => ({
            value: String(v.id),
            label: formatVehicleSelectLabel(v),
          }))}
          value={vehicleId}
          onChange={setVehicleId}
          placeholder="Sin vehículo asignado"
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 disabled:opacity-50"
            placeholder="Observaciones sobre esta garantía…"
          />
        </div>

        <p className="text-[11px] text-gray-400">
          No se modifican montos, saldos ni historial de movimientos.
        </p>
      </div>
    </Modal>
  );
};

export default EditarGarantiaModal;
