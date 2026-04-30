import React, { useState, useEffect } from 'react';
import Modal from '../Common/Modal';
import Button from '../Common/Button';

interface PeriodoPagoModalProps {
  isOpen: boolean;
  onClose: () => void;
  fechaDesde: string;
  fechaHasta: string;
  onGuardar: (desde: string, hasta: string) => void;
}

const PeriodoPagoModal: React.FC<PeriodoPagoModalProps> = ({
  isOpen,
  onClose,
  fechaDesde: initialDesde,
  fechaHasta: initialHasta,
  onGuardar,
}) => {
  const [desde, setDesde] = useState(initialDesde);
  const [hasta, setHasta] = useState(initialHasta);

  useEffect(() => {
    if (isOpen) {
      setDesde(initialDesde);
      setHasta(initialHasta);
    }
  }, [isOpen, initialDesde, initialHasta]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Período del pago"
      size="sm"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDesde('');
              setHasta('');
              onGuardar('', '');
              onClose();
            }}
          >
            Quitar período
          </Button>
          <Button
            type="button"
            onClick={() => {
              onGuardar(desde, hasta);
              onClose();
            }}
          >
            Guardar
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600 mb-4">
        Si el cobro cubre varios días (por ejemplo alquiler por semana), indica el rango. Opcional.
      </p>
      <div className="space-y-3">
        <div>
          <label className="label">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={e => setDesde(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
            className="input-field"
          />
        </div>
      </div>
    </Modal>
  );
};

export default PeriodoPagoModal;
