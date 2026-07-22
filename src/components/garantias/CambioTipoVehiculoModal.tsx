import React, { useState } from 'react';
import Modal from '../Common/Modal';
import Select from '../Common/Select';
import type { Vehicle } from '../../data/types';
import type { DriverGuarantee } from '../../data/garantiasTypes';
import type { GuaranteeVehicleType } from '../../config/guaranteeAmounts';
import { GUARANTEE_VEHICLE_TYPE_LABELS, getDefaultRequiredAmount } from '../../config/guaranteeAmounts';
import { formatVehicleSelectLabel } from '../../utils/vehicleDisplayNumber';
import { simulateVehicleTypeChange } from '../../utils/garantiasCalc';
import { updateGuaranteeVehicleType } from '../../services/garantiasService';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  guarantee: DriverGuarantee;
  currentBalance: number;
  vehicles: Vehicle[];
  empresaId?: string | null;
  userId?: string | null;
  onSaved: () => void;
};

const CambioTipoVehiculoModal: React.FC<Props> = ({
  isOpen,
  onClose,
  guarantee,
  currentBalance,
  vehicles,
  empresaId,
  userId,
  onSaved,
}) => {
  const [vehicleType, setVehicleType] = useState<GuaranteeVehicleType>(guarantee.vehicleType);
  const [vehicleId, setVehicleId] = useState(
    guarantee.currentVehicleId != null ? String(guarantee.currentVehicleId) : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const nextRequired = getDefaultRequiredAmount(vehicleType);
  const sim = simulateVehicleTypeChange(guarantee.requiredAmount, nextRequired, currentBalance);

  const handleSubmit = async () => {
    setError('');
    setBusy(true);
    try {
      await updateGuaranteeVehicleType(
        guarantee.id,
        {
          vehicleType,
          vehicleId: vehicleId ? Number(vehicleId) : null,
          requiredAmount: nextRequired,
          createdBy: userId ?? null,
        },
        empresaId,
      );
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !busy && onClose()}
      title="Simular cambio de vehículo"
      size="md"
      closeLocked={busy}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="px-4 py-2 rounded-xl text-sm border">
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || vehicleType === guarantee.vehicleType}
            onClick={() => void handleSubmit()}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white disabled:opacity-50"
          >
            Aplicar cambio
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {error ? <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p> : null}
        <p className="text-xs text-gray-500">
          Prueba Fase 1: no modifica la asignación real en Conductores. Solo actualiza la garantía.
        </p>
        <Select
          label="Nuevo tipo"
          options={[
            { value: 'auto', label: GUARANTEE_VEHICLE_TYPE_LABELS.auto },
            { value: 'camioneta', label: GUARANTEE_VEHICLE_TYPE_LABELS.camioneta },
          ]}
          value={vehicleType}
          onChange={(v) => setVehicleType(v as GuaranteeVehicleType)}
        />
        <Select
          label="Vehículo (opcional)"
          options={vehicles.filter((v) => v.activo).map((v) => ({
            value: String(v.id),
            label: formatVehicleSelectLabel(v),
          }))}
          value={vehicleId}
          onChange={setVehicleId}
          placeholder="Sin cambio de vehículo"
        />
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm space-y-1">
          <p>
            Requerido: <strong>S/ {guarantee.requiredAmount.toFixed(2)}</strong> →{' '}
            <strong>S/ {nextRequired.toFixed(2)}</strong>
          </p>
          <p>
            Saldo actual: <strong>S/ {currentBalance.toFixed(2)}</strong>
          </p>
          {sim.pendingAmount > 0 ? (
            <p className="text-amber-800">Pendiente por completar: S/ {sim.pendingAmount.toFixed(2)}</p>
          ) : null}
          {sim.excessRetained > 0 ? (
            <p className="text-emerald-800">
              Excedente retenido (no se devuelve automático): S/ {sim.excessRetained.toFixed(2)}
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
};

export default CambioTipoVehiculoModal;
