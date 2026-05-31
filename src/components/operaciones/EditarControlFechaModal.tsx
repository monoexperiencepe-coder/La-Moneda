import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import Modal from '../Common/Modal';
import Input from '../Common/Input';
import Select from '../Common/Select';
import { TIPOS_CONTROL_FECHA_OPTIONS } from '../../data/controlFechaCatalog';
import { useRegistrosContext } from '../../context/RegistrosContext';
import type { ControlFecha, TipoControlFecha } from '../../data/types';

type Props = {
  record: ControlFecha | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (updated: ControlFecha) => void;
};

const EditarControlFechaModal: React.FC<Props> = ({ record, isOpen, onClose, onSaved }) => {
  const { updateControlFecha } = useRegistrosContext();
  const [tipo, setTipo] = useState<TipoControlFecha>('OTRO_VENCIMIENTO');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [comentarios, setComentarios] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen || !record) return;
    setTipo(record.tipo);
    setFechaVencimiento(record.fechaVencimiento);
    setComentarios(record.comentarios ?? '');
    setError('');
  }, [isOpen, record]);

  const resetAndClose = useCallback(() => {
    setError('');
    onClose();
  }, [onClose]);

  const handleSave = useCallback(async () => {
    if (!record || busy) return;
    setError('');
    if (!fechaVencimiento.trim()) {
      setError('La fecha de vencimiento es obligatoria.');
      return;
    }
    setBusy(true);
    try {
      const updated = await updateControlFecha(record.id, {
        tipo,
        fechaVencimiento: fechaVencimiento.trim(),
        comentarios: comentarios.trim(),
      });
      if (!updated) {
        setError('No se pudo guardar el documento.');
        return;
      }
      onSaved?.(updated);
      resetAndClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setBusy(false);
    }
  }, [busy, comentarios, fechaVencimiento, onSaved, record, resetAndClose, tipo, updateControlFecha]);

  if (!record) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
      title="Editar documento"
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
            onClick={() => void handleSave()}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar cambios
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Tipo (título)"
            options={TIPOS_CONTROL_FECHA_OPTIONS}
            value={tipo}
            onChange={(v) => setTipo(v as TipoControlFecha)}
          />
          <Input
            label="Fecha de vencimiento (estado)"
            type="date"
            value={fechaVencimiento}
            onChange={(e) => setFechaVencimiento(e.target.value)}
          />
          <div className="sm:col-span-2">
            <Input
              label="Descripción / comentarios"
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default EditarControlFechaModal;
