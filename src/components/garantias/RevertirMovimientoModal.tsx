import React, { useState } from 'react';
import Modal from '../Common/Modal';
import type { DriverGuarantee, GuaranteeMovement } from '../../data/garantiasTypes';
import { GUARANTEE_MOVEMENT_LABELS } from '../../data/garantiasTypes';
import { revertGuaranteeMovement } from '../../services/garantiasService';
import { validateRevertMovement } from '../../utils/garantiasCalc';
import type { PermissionUser } from '../../utils/permissions';
import { getUserRole } from '../../utils/permissions';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  movement: GuaranteeMovement;
  guarantee: DriverGuarantee;
  movements: GuaranteeMovement[];
  user: PermissionUser | null;
  userId?: string | null;
  empresaId?: string | null;
  onSaved: () => void;
};

const RevertirMovimientoModal: React.FC<Props> = ({
  isOpen,
  onClose,
  movement,
  guarantee,
  movements,
  user,
  userId,
  empresaId,
  onSaved,
}) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = user ? getUserRole(user) === 'admin' : false;
  const validation = validateRevertMovement({
    movement,
    movements,
    guarantee,
    userId,
    isAdmin,
  });

  const handleSubmit = async () => {
    setError('');
    if (validation) {
      setError(validation.message);
      return;
    }
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('El motivo de la reversión es obligatorio.');
      return;
    }
    setBusy(true);
    try {
      await revertGuaranteeMovement(movement.id, trimmed, empresaId);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al revertir movimiento.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !busy && onClose()}
      title="Revertir movimiento"
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
            disabled={busy || !!validation}
            onClick={() => void handleSubmit()}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-600 text-white disabled:opacity-50"
          >
            {busy ? 'Revirtiendo…' : 'Confirmar reversión'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {validation ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {validation.message}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        ) : null}
        <p className="text-sm text-gray-600">
          Se creará un movimiento compensatorio opuesto. El historial original permanece intacto.
        </p>
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
          <p>
            <span className="text-gray-500">Tipo:</span>{' '}
            <strong>{GUARANTEE_MOVEMENT_LABELS[movement.movementType]}</strong>
          </p>
          <p>
            <span className="text-gray-500">Monto:</span>{' '}
            <strong>S/ {movement.amount.toFixed(2)}</strong> ({movement.direction === 'credit' ? '+' : '−'})
          </p>
        </div>
        <label className="block">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
            Motivo de la reversión *
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            required
            className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
            placeholder="Explique por qué se revierte este movimiento…"
          />
        </label>
      </div>
    </Modal>
  );
};

export default RevertirMovimientoModal;
