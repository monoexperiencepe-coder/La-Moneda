import React, { useMemo, useState } from 'react';
import Modal from '../Common/Modal';
import Select from '../Common/Select';
import Input from '../Common/Input';
import type { Vehicle } from '../../data/types';
import type { DriverGuarantee, GuaranteeMovementType } from '../../data/garantiasTypes';
import { GUARANTEE_MOVEMENT_LABELS } from '../../data/garantiasTypes';
import { formatVehicleSelectLabel } from '../../utils/vehicleDisplayNumber';
import { canRegisterMovementType } from '../../utils/garantiasPermissions';
import type { PermissionUser } from '../../utils/permissions';
import { addGuaranteeMovement } from '../../services/garantiasService';
import { todayStr } from '../../utils/formatting';

const DEPOSIT_TYPES: GuaranteeMovementType[] = ['initial_deposit', 'deposit', 'replenishment'];
const DEDUCTION_TYPES: GuaranteeMovementType[] = [
  'fine_deduction',
  'damage_deduction',
  'repair_deduction',
  'other_deduction',
];
const ADJUST_TYPES: GuaranteeMovementType[] = ['adjustment_credit', 'adjustment_debit'];
const REFUND_TYPES: GuaranteeMovementType[] = ['final_refund'];

type Mode = 'deposit' | 'deduction' | 'adjustment' | 'refund';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  mode: Mode;
  guarantee: DriverGuarantee;
  vehicles: Vehicle[];
  user: PermissionUser | null;
  empresaId?: string | null;
  onSaved: () => void;
};

function typesForMode(mode: Mode): GuaranteeMovementType[] {
  if (mode === 'deposit') return DEPOSIT_TYPES;
  if (mode === 'deduction') return DEDUCTION_TYPES;
  if (mode === 'adjustment') return ADJUST_TYPES;
  return REFUND_TYPES;
}

function titleForMode(mode: Mode): string {
  if (mode === 'deposit') return 'Registrar abono / entrega';
  if (mode === 'deduction') return 'Registrar descuento';
  if (mode === 'adjustment') return 'Registrar ajuste';
  return 'Registrar devolución final';
}

const RegistrarMovimientoModal: React.FC<Props> = ({
  isOpen,
  onClose,
  mode,
  guarantee,
  vehicles,
  user,
  empresaId,
  onSaved,
}) => {
  const allowedTypes = useMemo(
    () => typesForMode(mode).filter((t) => canRegisterMovementType(user, t)),
    [mode, user],
  );
  const [movementType, setMovementType] = useState<GuaranteeMovementType>(allowedTypes[0] ?? 'deposit');
  const [amount, setAmount] = useState('');
  const [vehicleId, setVehicleId] = useState(
    guarantee.currentVehicleId != null ? String(guarantee.currentVehicleId) : '',
  );
  const [observation, setObservation] = useState('');
  const [reason, setReason] = useState('');
  const [movementDate, setMovementDate] = useState(todayStr());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (!isOpen) return;
    setMovementType(allowedTypes[0] ?? 'deposit');
    setAmount('');
    setObservation('');
    setReason('');
    setError('');
    setMovementDate(todayStr());
    setVehicleId(guarantee.currentVehicleId != null ? String(guarantee.currentVehicleId) : '');
  }, [isOpen, allowedTypes, guarantee.currentVehicleId]);

  const vehicleOpts = useMemo(
    () =>
      vehicles
        .filter((v) => v.activo)
        .map((v) => ({ value: String(v.id), label: formatVehicleSelectLabel(v) })),
    [vehicles],
  );

  const handleSubmit = async () => {
    setError('');
    if (!canRegisterMovementType(user, movementType)) {
      setError('No tienes permiso para este tipo de movimiento.');
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Ingresa un monto positivo.');
      return;
    }
    setBusy(true);
    try {
      await addGuaranteeMovement(
        {
          guaranteeId: guarantee.id,
          movementType,
          amount: amt,
          vehicleId: vehicleId ? Number(vehicleId) : null,
          observation: observation.trim() || null,
          reason: reason.trim() || null,
          createdBy: user?.id ?? null,
          movementDate,
        },
        empresaId,
      );
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar movimiento.');
    } finally {
      setBusy(false);
    }
  };

  if (allowedTypes.length === 0) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={titleForMode(mode)} size="md">
        <p className="text-sm text-red-600">No tienes permiso para esta acción.</p>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !busy && onClose()}
      title={titleForMode(mode)}
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
            disabled={busy}
            onClick={() => void handleSubmit()}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {error ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        ) : null}
        {mode === 'refund' ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            La devolución final cierra la garantía. No se puede duplicar. Correcciones posteriores solo con ajuste
            (si la garantía aún lo permite) o proceso.
          </p>
        ) : null}
        <Select
          label="Tipo de movimiento"
          options={allowedTypes.map((t) => ({ value: t, label: GUARANTEE_MOVEMENT_LABELS[t] }))}
          value={movementType}
          onChange={(v) => setMovementType(v as GuaranteeMovementType)}
        />
        <Input
          label="Monto (S/)"
          type="number"
          min={0.01}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <Input
          label="Fecha del movimiento"
          type="date"
          value={movementDate}
          onChange={(e) => setMovementDate(e.target.value)}
        />
        <Select
          label="Vehículo relacionado"
          options={vehicleOpts}
          value={vehicleId}
          onChange={setVehicleId}
          placeholder="Sin vehículo"
        />
        <Input label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
        <label className="block">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Observación</span>
          <textarea
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            rows={2}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
          />
        </label>
      </div>
    </Modal>
  );
};

export default RegistrarMovimientoModal;
