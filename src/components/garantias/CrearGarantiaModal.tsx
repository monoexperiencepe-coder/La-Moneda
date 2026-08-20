import React, { useMemo, useState } from 'react';
import Modal from '../Common/Modal';
import Select from '../Common/Select';
import Input from '../Common/Input';
import type { Conductor, Vehicle } from '../../data/types';
import type { GuaranteeVehicleType } from '../../config/guaranteeAmounts';
import type { DriverGuarantee } from '../../data/garantiasTypes';
import { GUARANTEE_VEHICLE_TYPE_LABELS, getDefaultRequiredAmount } from '../../config/guaranteeAmounts';
import { formatConductorDisplayLabel } from '../../utils/fleetPanel';
import { formatVehicleSelectLabel } from '../../utils/vehicleDisplayNumber';
import { inferGuaranteeVehicleType } from '../../utils/vehicleTipoGarantia';
import { assignExistingGuaranteeToVehicle, createDriverGuarantee } from '../../services/garantiasService';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  conductores: Conductor[];
  vehicles: Vehicle[];
  activeGuarantees: DriverGuarantee[];
  empresaId?: string | null;
  userId?: string | null;
  onCreated: () => void;
};

const CrearGarantiaModal: React.FC<Props> = ({
  isOpen,
  onClose,
  conductores,
  vehicles,
  activeGuarantees,
  empresaId,
  userId,
  onCreated,
}) => {
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [vehicleType, setVehicleType] = useState<GuaranteeVehicleType>('auto');
  const [requiredAmount, setRequiredAmount] = useState(String(getDefaultRequiredAmount('auto')));
  const [initialDeposit, setInitialDeposit] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const existingUnassignedGuarantee = useMemo(
    () => activeGuarantees.find((g) => g.driverId === driverId && g.currentVehicleId == null) ?? null,
    [activeGuarantees, driverId],
  );

  const conductorOpts = useMemo(
    () =>
      [...conductores]
        .filter((c) => c.estado === 'VIGENTE')
        .sort((a, b) => formatConductorDisplayLabel(a).localeCompare(formatConductorDisplayLabel(b), 'es'))
        .map((c) => ({ value: c.id, label: formatConductorDisplayLabel(c) })),
    [conductores],
  );

  const vehicleOpts = useMemo(
    () =>
      vehicles
        .filter((v) => v.activo)
        .map((v) => ({ value: String(v.id), label: formatVehicleSelectLabel(v) })),
    [vehicles],
  );

  const reset = () => {
    setDriverId('');
    setVehicleId('');
    setVehicleType('auto');
    setRequiredAmount(String(getDefaultRequiredAmount('auto')));
    setInitialDeposit('');
    setNotes('');
    setError('');
  };

  const onVehicleChange = (vid: string) => {
    setVehicleId(vid);
    if (!vid) return;
    const v = vehicles.find((x) => String(x.id) === vid);
    if (!v) return;
    const t = inferGuaranteeVehicleType(v);
    setVehicleType(t);
    setRequiredAmount(String(getDefaultRequiredAmount(t)));
  };

  const onTypeChange = (t: string) => {
    const vt = t as GuaranteeVehicleType;
    setVehicleType(vt);
    setRequiredAmount(String(getDefaultRequiredAmount(vt)));
  };

  const handleSubmit = async () => {
    setError('');
    if (!driverId) {
      setError('Selecciona un conductor.');
      return;
    }
    const req = Number(requiredAmount);
    if (!Number.isFinite(req) || req < 0) {
      setError('Monto requerido inválido.');
      return;
    }
    const dep = initialDeposit.trim() === '' ? 0 : Number(initialDeposit);
    if (!Number.isFinite(dep) || dep < 0) {
      setError('Monto entregado inicialmente inválido.');
      return;
    }
    setBusy(true);
    try {
      await createDriverGuarantee(
        {
          driverId,
          currentVehicleId: vehicleId ? Number(vehicleId) : null,
          vehicleType,
          requiredAmount: req,
          notes: notes.trim() || null,
          createdBy: userId ?? null,
          initialDeposit: dep,
        },
        empresaId,
      );
      reset();
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear garantía.');
    } finally {
      setBusy(false);
    }
  };

  const handleAssignExisting = async () => {
    setError('');
    if (!existingUnassignedGuarantee || !vehicleId) {
      setError('Selecciona un vehículo para asignar la garantía existente.');
      return;
    }
    setBusy(true);
    try {
      await assignExistingGuaranteeToVehicle(existingUnassignedGuarantee, Number(vehicleId), empresaId);
      reset();
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo asignar la garantía existente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!busy) {
          reset();
          onClose();
        }
      }}
      title="Registrar garantía"
      size="lg"
      closeLocked={busy}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              reset();
              onClose();
            }}
            className="px-4 py-2 rounded-xl text-sm border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || existingUnassignedGuarantee != null}
            onClick={() => void handleSubmit()}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Crear garantía'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {error ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        ) : (
          <p className="text-xs text-gray-500">
            Fase 1: selección manual de conductor y vehículo. No altera asignaciones reales de flota.
          </p>
        )}
        <Select
          label="Conductor *"
          options={conductorOpts}
          value={driverId}
          onChange={setDriverId}
          placeholder="Seleccionar…"
        />
        {existingUnassignedGuarantee ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
            <p className="text-sm text-amber-900">
              Este conductor ya tiene una garantía activa de{' '}
              <strong>S/{existingUnassignedGuarantee.currentBalance.toLocaleString('es-PE')}</strong> sin vehículo
              asignado. Puedes asignar esa garantía existente a este vehículo en lugar de crear una nueva.
            </p>
            <button
              type="button"
              disabled={busy || !vehicleId}
              onClick={() => void handleAssignExisting()}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {busy ? 'Asignando…' : 'Asignar garantía existente al vehículo'}
            </button>
          </div>
        ) : null}
        <Select
          label="Vehículo (opcional)"
          options={vehicleOpts}
          value={vehicleId}
          onChange={onVehicleChange}
          placeholder="Sin vehículo"
        />
        <Select
          label="Tipo de vehículo *"
          options={[
            { value: 'auto', label: GUARANTEE_VEHICLE_TYPE_LABELS.auto },
            { value: 'camioneta', label: GUARANTEE_VEHICLE_TYPE_LABELS.camioneta },
          ]}
          value={vehicleType}
          onChange={onTypeChange}
        />
        <Input
          label="Garantía requerida (S/)"
          type="number"
          min={0}
          step="0.01"
          value={requiredAmount}
          onChange={(e) => setRequiredAmount(e.target.value)}
        />
        <Input
          label="Monto entregado inicialmente (S/)"
          type="number"
          min={0}
          step="0.01"
          value={initialDeposit}
          onChange={(e) => setInitialDeposit(e.target.value)}
          helper="Dinero recibido al crear la garantía. Puede ser S/ 0.00."
        />
        <label className="block">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Notas</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
          />
        </label>
      </div>
    </Modal>
  );
};

export default CrearGarantiaModal;
