import React, { useState } from 'react';
import Modal from '../Common/Modal';
import Input from '../Common/Input';
import type { DriverGuarantee } from '../../data/garantiasTypes';
import { closeDriverGuarantee } from '../../services/garantiasService';
import { useAmountDisplay } from '../../hooks/useAmountDisplay';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  guarantee: DriverGuarantee;
  currentBalance: number;
  empresaId?: string | null;
  onClosed: () => void;
};

const CerrarGarantiaModal: React.FC<Props> = ({
  isOpen,
  onClose,
  guarantee,
  currentBalance,
  empresaId,
  onClosed,
}) => {
  const { formatGlobalAmount } = useAmountDisplay();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (!isOpen) return;
    setReason('');
    setError('');
  }, [isOpen]);

  const hasSaldo = currentBalance > 0.001;

  const handleClose = async () => {
    setError('');
    setBusy(true);
    try {
      await closeDriverGuarantee(guarantee.id, reason.trim() || null, empresaId);
      onClosed();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cerrar la garantía.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !busy && onClose()}
      title="Cerrar garantía"
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
            onClick={() => void handleClose()}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white disabled:opacity-50 hover:bg-red-700"
          >
            {busy ? 'Cerrando…' : 'Confirmar cierre'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        ) : null}

        <div className="text-sm text-gray-700 space-y-2">
          <p>
            Esta acción marca la garantía como <strong>cerrada</strong> y la retira de la vista de actuales.
            El historial de movimientos se conserva completo.
          </p>
          <p>
            El único índice único que se libera es el del conductor: podrá crearse una nueva garantía para el mismo
            conductor en el futuro.
          </p>
        </div>

        {hasSaldo ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 space-y-1">
            <p className="text-sm font-semibold text-amber-900">
              ⚠ Hay saldo positivo: {formatGlobalAmount(currentBalance)}
            </p>
            <p className="text-xs text-amber-800">
              Este dinero <strong>no se devuelve automáticamente</strong> al cerrar. Si corresponde devolverlo,
              registra primero un movimiento "Devolver y cerrar garantía" (que cierra con devolución total) o un
              descuento que consuma el saldo antes de cerrar.
            </p>
            <p className="text-xs text-amber-800">
              Si el cierre es correcto y el saldo quedará en cero por otras razones, continúa. El historial queda
              intacto y auditado.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-600">
              Saldo disponible: <strong className="tabular-nums">{formatGlobalAmount(currentBalance)}</strong> — sin saldo residual.
            </p>
          </div>
        )}

        <Input
          label="Motivo del cierre (opcional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej. Conductor retirado, fin de contrato…"
        />
      </div>
    </Modal>
  );
};

export default CerrarGarantiaModal;
