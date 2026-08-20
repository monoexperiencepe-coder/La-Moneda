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
import { closeDriverGuarantee, createDriverGuarantee } from '../../services/garantiasService';
import { useAmountDisplay } from '../../hooks/useAmountDisplay';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  guarantee: DriverGuarantee;
  currentBalance: number;
  empresaId?: string | null;
  userId?: string | null;
  conductores: Conductor[];
  vehicles: Vehicle[];
  onChanged: () => void;
};

const CambiarConductorModal: React.FC<Props> = ({
  isOpen,
  onClose,
  guarantee,
  currentBalance,
  empresaId,
  userId,
  conductores,
  vehicles,
  onChanged,
}) => {
  const { formatGlobalAmount } = useAmountDisplay();
  const [newDriverId, setNewDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState(
    guarantee.currentVehicleId != null ? String(guarantee.currentVehicleId) : '',
  );
  const [vehicleType, setVehicleType] = useState<GuaranteeVehicleType>(guarantee.vehicleType);
  const [requiredAmount, setRequiredAmount] = useState(String(guarantee.requiredAmount));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setNewDriverId('');
    setVehicleId(guarantee.currentVehicleId != null ? String(guarantee.currentVehicleId) : '');
    setVehicleType(guarantee.vehicleType);
    setRequiredAmount(String(guarantee.requiredAmount));
    setReason('');
    setError('');
  }, [isOpen, guarantee]);

  const hasSaldo = currentBalance > 0.001;
  const parsedRequiredAmount = Number(requiredAmount);
  const requiredAmountValid = Number.isFinite(parsedRequiredAmount) && parsedRequiredAmount > 0;
  const currentVehicleIdParsed = vehicleId ? Number(vehicleId) : null;

  const conductoresOtros = conductores.filter(
    (c) => c.estado === 'VIGENTE' && c.id !== guarantee.driverId,
  );
  const activeVehicles = vehicles.filter((v) => v.activo);

  const canSubmit = newDriverId.trim() !== '' && requiredAmountValid && !busy;

  const handleConfirm = async () => {
    setError('');
    if (!newDriverId.trim()) {
      setError('Selecciona el conductor destino.');
      return;
    }
    if (!requiredAmountValid) {
      setError('El monto requerido debe ser un número positivo.');
      return;
    }
    setBusy(true);
    try {
      // Paso 1: cerrar garantía actual
      await closeDriverGuarantee(
        guarantee.id,
        reason.trim() || 'Cambio de conductor',
        empresaId,
      );
      // Paso 2: crear nueva garantía para el conductor destino
      await createDriverGuarantee(
        {
          driverId: newDriverId,
          currentVehicleId: currentVehicleIdParsed,
          vehicleType,
          requiredAmount: parsedRequiredAmount,
          createdBy: userId ?? null,
        },
        empresaId,
      );
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar el cambio de conductor.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !busy && onClose()}
      title="Cambiar conductor"
      size="md"
      closeLocked={busy}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm border border-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handleConfirm()}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white disabled:opacity-50"
          >
            {busy ? 'Procesando…' : 'Confirmar cambio'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        ) : null}

        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 space-y-1">
          <p className="text-sm font-semibold text-blue-900">¿Cómo funciona el cambio?</p>
          <p className="text-xs text-blue-800">
            1. La garantía actual queda <strong>cerrada</strong> y pasa al historial (todos los movimientos se conservan).
          </p>
          <p className="text-xs text-blue-800">
            2. Se crea una <strong>nueva garantía</strong> para el conductor destino, comenzando desde cero.
          </p>
          <p className="text-xs text-blue-800">
            El saldo actual <strong>no se transfiere automáticamente</strong>. Si corresponde devolverlo al conductor actual, usa primero "Devolver y cerrar garantía".
          </p>
        </div>

        {hasSaldo ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-800">
              ⚠ Saldo actual: <strong className="tabular-nums">{formatGlobalAmount(currentBalance)}</strong>.
              Este monto <strong>no se transfiere</strong> a la nueva garantía.
            </p>
          </div>
        ) : null}

        <Select
          label="Conductor destino (nuevo)"
          options={conductoresOtros.map((c) => ({
            value: c.id,
            label: formatConductorDisplayLabel(c),
          }))}
          value={newDriverId}
          onChange={setNewDriverId}
          placeholder="Seleccionar conductor…"
        />

        <Select
          label="Tipo de vehículo para nueva garantía"
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

        <Input
          label="Monto requerido para nueva garantía (S/)"
          type="number"
          min={0.01}
          step="0.01"
          value={requiredAmount}
          onChange={(e) => setRequiredAmount(e.target.value)}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Motivo del cambio (opcional)
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 disabled:opacity-50"
            placeholder="Ej. Retiro, reasignación de unidad…"
          />
        </div>
      </div>
    </Modal>
  );
};

export default CambiarConductorModal;
