import React, { useCallback, useEffect, useState } from 'react';
import Modal from '../Common/Modal';
import type { Moneda } from '../../data/types';
import { insertAporteAccionista } from '../../services/aportesAccionistasService';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseMonto(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface AporteRegistroModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const AporteRegistroModal: React.FC<AporteRegistroModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [accionista, setAccionista] = useState('');
  const [vehiculoRef, setVehiculoRef] = useState('');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [fechaAporte, setFechaAporte] = useState(todayIso());
  const [generaInteres, setGeneraInteres] = useState(false);
  const [tipo, setTipo] = useState('aporte_accionista');
  const [observaciones, setObservaciones] = useState('');

  const reset = useCallback(() => {
    setFormError(null);
    setAccionista('');
    setVehiculoRef('');
    setMonto('');
    setMoneda('USD');
    setFechaAporte(todayIso());
    setGeneraInteres(false);
    setTipo('aporte_accionista');
    setObservaciones('');
  }, []);

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  const handleSave = async () => {
    setFormError(null);
    if (!accionista.trim()) {
      setFormError('Indica el nombre del accionista.');
      return;
    }
    const m = parseMonto(monto);
    if (m == null) {
      setFormError('Indica un monto válido mayor que cero.');
      return;
    }
    if (!fechaAporte.trim()) {
      setFormError('La fecha del aporte es obligatoria.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await insertAporteAccionista({
        accionista: accionista.trim(),
        vehiculoReferencia: vehiculoRef.trim() || null,
        monto: m,
        moneda,
        fechaAporte: fechaAporte.trim().slice(0, 10),
        generaInteres,
        tipo: tipo.trim() || 'aporte_accionista',
        observaciones: observaciones.trim(),
      });
      if (error) {
        setFormError(error);
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const labelClass = 'block text-[11px] font-semibold text-slate-600 mb-0.5';
  const inputClass =
    'w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Registrar aporte"
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar aporte'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-slate-800">
        {formError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">{formError}</div>
        ) : null}
        <p className="text-xs text-slate-500 leading-snug">
          Capital aportado por accionista. Por defecto no genera interés; marca la casilla solo si aplica a tu modelo.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={labelClass}>Accionista</label>
            <input
              className={inputClass}
              value={accionista}
              onChange={(e) => setAccionista(e.target.value)}
              placeholder="Nombre o razón social"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Vehículo referencia (opcional)</label>
            <input
              className={inputClass}
              value={vehiculoRef}
              onChange={(e) => setVehiculoRef(e.target.value)}
              placeholder="Placa o alias"
            />
          </div>
          <div>
            <label className={labelClass}>Monto</label>
            <input
              className={inputClass}
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className={labelClass}>Moneda</label>
            <select
              className={inputClass}
              value={moneda}
              onChange={(e) => setMoneda(e.target.value as Moneda)}
            >
              <option value="USD">USD</option>
              <option value="PEN">PEN</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Fecha del aporte</label>
            <input
              className={inputClass}
              type="date"
              value={fechaAporte}
              onChange={(e) => setFechaAporte(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Tipo</label>
            <input
              className={inputClass}
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              placeholder="aporte_accionista"
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <input
              id="aportes-gen-interes"
              type="checkbox"
              checked={generaInteres}
              onChange={(e) => setGeneraInteres(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
            />
            <label htmlFor="aportes-gen-interes" className="text-xs text-slate-600">
              Genera interés (marca solo si corresponde)
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Observaciones</label>
            <textarea
              className={`${inputClass} min-h-[64px]`}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AporteRegistroModal;
