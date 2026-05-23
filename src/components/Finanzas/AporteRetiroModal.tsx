import React, { useCallback, useEffect, useState } from 'react';
import Modal from '../Common/Modal';
import type { AporteAccionista, Moneda } from '../../data/types';
import { insertAporteAccionista, APORTE_TIPO_RETIRO } from '../../services/aportesAccionistasService';
import { useAuth } from '../../context/AuthContext';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseMonto(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface AporteRetiroModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Recibe la fila del retiro creada para reflejar totales y listas al instante. */
  onSaved: (row: AporteAccionista) => void | Promise<void>;
  /** Nombres ya usados en aportes (para datalist). */
  sugerenciasAccionista?: string[];
}

const AporteRetiroModal: React.FC<AporteRetiroModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  sugerenciasAccionista = [],
}) => {
  const { profile } = useAuth();
  const tenantEmpresaId = profile?.empresa_id;
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [accionista, setAccionista] = useState('');
  const [vehiculoRef, setVehiculoRef] = useState('');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<Moneda>('USD');
  const [fechaRetiro, setFechaRetiro] = useState(todayIso());
  const [observaciones, setObservaciones] = useState('');

  const reset = useCallback(() => {
    setFormError(null);
    setAccionista('');
    setVehiculoRef('');
    setMonto('');
    setMoneda('USD');
    setFechaRetiro(todayIso());
    setObservaciones('');
  }, []);

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  const handleSave = async () => {
    setFormError(null);
    if (!accionista.trim()) {
      setFormError('Indica el accionista que retira capital.');
      return;
    }
    const m = parseMonto(monto);
    if (m == null) {
      setFormError('Indica un monto válido mayor que cero.');
      return;
    }
    if (!fechaRetiro.trim()) {
      setFormError('La fecha del retiro es obligatoria.');
      return;
    }

    setSaving(true);
    try {
      const { error, row } = await insertAporteAccionista(
        {
          accionista: accionista.trim(),
          vehiculoReferencia: vehiculoRef.trim() || null,
          monto: m,
          moneda,
          fechaAporte: fechaRetiro.trim().slice(0, 10),
          generaInteres: false,
          tipo: APORTE_TIPO_RETIRO,
          observaciones: observaciones.trim(),
        },
        tenantEmpresaId,
      );
      if (error) {
        setFormError(error);
        return;
      }
      if (!row) {
        setFormError('El retiro se guardó pero no se pudo leer la fila. Pulsa Actualizar.');
        return;
      }
      await Promise.resolve(onSaved(row));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const listId = 'aportes-retiro-accionistas-datalist';
  const labelClass = 'block text-[11px] font-semibold text-slate-600 mb-0.5';
  const inputClass =
    'w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-300';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Registrar retiro de aportes"
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
            className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-800 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Registrar retiro'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-slate-800">
        {formError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">{formError}</div>
        ) : null}
        <p className="text-xs text-slate-600 leading-snug">
          Registra la salida de capital de un accionista como movimiento aparte. El monto se guarda positivo y en totales se
          resta automáticamente. No borra los aportes históricos; si necesitas corregir un registro puntual, usa eliminar en la
          lista.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={labelClass}>Accionista</label>
            <input
              className={inputClass}
              list={sugerenciasAccionista.length > 0 ? listId : undefined}
              value={accionista}
              onChange={(e) => setAccionista(e.target.value)}
              placeholder="Nombre o razón social"
              required
            />
            {sugerenciasAccionista.length > 0 ? (
              <datalist id={listId}>
                {sugerenciasAccionista.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            ) : null}
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
            <label className={labelClass}>Monto retirado</label>
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
          <div className="sm:col-span-2">
            <label className={labelClass}>Fecha del retiro</label>
            <input
              className={inputClass}
              type="date"
              value={fechaRetiro}
              onChange={(e) => setFechaRetiro(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Motivo / acuerdo (recomendado)</label>
            <textarea
              className={`${inputClass} min-h-[72px]`}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej. acuerdo de socios, devolución parcial, etc."
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AporteRetiroModal;
