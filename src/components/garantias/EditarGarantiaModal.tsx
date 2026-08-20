import React, { useEffect, useState } from 'react';
import Modal from '../Common/Modal';
import Select from '../Common/Select';
import Input from '../Common/Input';
import type { Conductor, Vehicle } from '../../data/types';
import type { DriverGuarantee } from '../../data/garantiasTypes';
import type { GuaranteeVehicleType } from '../../config/guaranteeAmounts';
import { GUARANTEE_VEHICLE_TYPE_LABELS } from '../../config/guaranteeAmounts';
import { formatConductorDisplayLabel } from '../../utils/fleetPanel';
import { formatVehicleSelectLabel } from '../../utils/vehicleDisplayNumber';
import { updateGuaranteeInfo, updateGuaranteeVehicleType } from '../../services/garantiasService';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  guarantee: DriverGuarantee;
  conductores: Conductor[];
  vehicles: Vehicle[];
  empresaId?: string | null;
  /** userId para el movimiento de auditoría de required_amount_change. */
  userId?: string | null;
  onSaved: () => void;
};

const EditarGarantiaModal: React.FC<Props> = ({
  isOpen,
  onClose,
  guarantee,
  conductores,
  vehicles,
  empresaId,
  userId,
  onSaved,
}) => {
  const [driverId, setDriverId] = useState(guarantee.driverId);
  const [vehicleId, setVehicleId] = useState(
    guarantee.currentVehicleId != null ? String(guarantee.currentVehicleId) : '',
  );
  const [vehicleType, setVehicleType] = useState<GuaranteeVehicleType>(guarantee.vehicleType);
  const [requiredAmount, setRequiredAmount] = useState(String(guarantee.requiredAmount));
  const [notes, setNotes] = useState(guarantee.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Reinicializar cuando cambia la garantía o se abre el modal
  useEffect(() => {
    if (isOpen) {
      setDriverId(guarantee.driverId);
      setVehicleId(guarantee.currentVehicleId != null ? String(guarantee.currentVehicleId) : '');
      setVehicleType(guarantee.vehicleType);
      setRequiredAmount(String(guarantee.requiredAmount));
      setNotes(guarantee.notes ?? '');
      setError('');
    }
  }, [isOpen, guarantee]);

  const activeConductores = conductores.filter((c) => c.estado === 'VIGENTE');
  const activeVehicles = vehicles.filter((v) => v.activo);

  const parsedRequiredAmount = Number(requiredAmount);
  const requiredAmountValid =
    Number.isFinite(parsedRequiredAmount) && parsedRequiredAmount > 0;

  const currentVehicleIdParsed = vehicleId ? Number(vehicleId) : null;

  const reqOrTypeChanged =
    (requiredAmountValid && parsedRequiredAmount !== guarantee.requiredAmount) ||
    vehicleType !== guarantee.vehicleType;

  const nonFinancialChanged =
    driverId !== guarantee.driverId ||
    currentVehicleIdParsed !== guarantee.currentVehicleId ||
    vehicleType !== guarantee.vehicleType ||
    notes.trim() !== (guarantee.notes ?? '');

  const hasChanges = reqOrTypeChanged || nonFinancialChanged;

  const handleSubmit = async () => {
    setError('');
    if (!driverId.trim()) {
      setError('El conductor es obligatorio.');
      return;
    }
    if (!requiredAmountValid) {
      setError('El monto requerido debe ser un número positivo.');
      return;
    }
    setBusy(true);
    try {
      // ── Paso 1: actualizar required_amount / vehicle_type (con auditoría) ──
      // Solo si cambió el monto requerido o el tipo de vehículo.
      if (reqOrTypeChanged) {
        await updateGuaranteeVehicleType(
          guarantee.id,
          {
            vehicleType,
            vehicleId: currentVehicleIdParsed,
            requiredAmount: parsedRequiredAmount,
            createdBy: userId ?? null,
            observation:
              parsedRequiredAmount !== guarantee.requiredAmount
                ? `Corrección manual de monto requerido: S/ ${guarantee.requiredAmount} → S/ ${parsedRequiredAmount}`
                : undefined,
          },
          empresaId,
        );
      }

      // ── Paso 2: actualizar campos no financieros (conductor, notas, etc.) ──
      // Solo si alguno cambió. Puede correr tras paso 1 sin conflicto.
      if (nonFinancialChanged) {
        await updateGuaranteeInfo(
          guarantee.id,
          {
            driverId,
            currentVehicleId: currentVehicleIdParsed,
            vehicleType,
            notes: notes.trim() || null,
          },
          empresaId,
        );
      }

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
          <Input
            label="Monto de garantía requerido (S/)"
            type="number"
            min={0.01}
            step="0.01"
            value={requiredAmount}
            onChange={(e) => setRequiredAmount(e.target.value)}
          />
          {parsedRequiredAmount !== guarantee.requiredAmount && requiredAmountValid ? (
            <p className="mt-1 text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
              Se creará un movimiento de auditoría "Cambio de monto requerido". No modifica saldos ya entregados.
            </p>
          ) : null}
        </div>

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
          El saldo disponible, el total entregado y el total descontado se calculan automáticamente desde el
          historial de movimientos. Si un movimiento fue incorrecto, usa "Revertir" en la ficha de detalle.
        </p>
      </div>
    </Modal>
  );
};

export default EditarGarantiaModal;
