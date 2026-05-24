import React, { useMemo, useState } from 'react';
import Modal from '../Common/Modal';
import type { Moneda, PrestamoFinancieroDetalle } from '../../data/types';
import { aplicarMovimientoCapitalPrestamo } from '../../services/prestamosFinancierosService';
import { useAuth } from '../../context/AuthContext';
import { recalcularCuotaMensualPrestamo } from '../../utils/prestamoMovimientos';
import { formatCurrency, formatUSD } from '../../utils/formatting';

function montoFmt(amount: number, moneda: Moneda): string {
  return moneda === 'USD' ? formatUSD(amount) : formatCurrency(amount, 'S/');
}

function parseNum(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export type PrestamoCapitalModalMode = 'retiro_capital' | 'aumento_capital';

export interface PrestamoCapitalModalProps {
  isOpen: boolean;
  mode: PrestamoCapitalModalMode;
  detalle: PrestamoFinancieroDetalle | null;
  onClose: () => void;
  onApplied: (result: {
    before: PrestamoFinancieroDetalle;
    after: PrestamoFinancieroDetalle;
    newTramoId: number | null;
  }) => void | Promise<void>;
}

const PrestamoCapitalModal: React.FC<PrestamoCapitalModalProps> = ({
  isOpen,
  mode,
  detalle,
  onClose,
  onApplied,
}) => {
  const { profile } = useAuth();
  const tenantEmpresaId = profile?.empresa_id;
  const p = detalle?.prestamo;
  const tramos = detalle?.tramos ?? [];

  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(todayIso());
  const [comentario, setComentario] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const montoNum = parseNum(monto) ?? 0;
  const capActual = p?.capitalActualEstimado ?? 0;
  const esRetiro = mode === 'retiro_capital';
  const nuevoCapital = useMemo(() => {
    if (!p) return 0;
    const delta = esRetiro ? -montoNum : montoNum;
    return Math.round((capActual + delta) * 100) / 100;
  }, [p, capActual, esRetiro, montoNum]);

  const nuevaCuota = useMemo(() => {
    if (!p) return 0;
    return recalcularCuotaMensualPrestamo(p, Math.max(0, nuevoCapital));
  }, [p, nuevoCapital]);

  const titulo = esRetiro ? 'Retirar capital' : 'Aumentar capital';
  const inputClass =
    'w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300';

  const handleSave = async () => {
    if (!p || !detalle) return;
    const m = parseNum(monto);
    if (m == null || m <= 0) {
      setFormError('Indica un monto mayor que cero.');
      return;
    }
    if (esRetiro && m > capActual + 0.005) {
      setFormError('El retiro no puede superar el capital actual.');
      return;
    }
    if (!fecha.trim()) {
      setFormError('Indica la fecha del movimiento.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const before = detalle;
      const { error, newTramoId, detalle: after } = await aplicarMovimientoCapitalPrestamo(
        {
          prestamo: p,
          tramos,
          tipo: mode,
          monto: m,
          fecha: fecha.trim().slice(0, 10),
          comentario: comentario.trim(),
        },
        tenantEmpresaId,
      );
      if (error) {
        setFormError(error);
        return;
      }
      if (!after) {
        setFormError('Movimiento guardado pero no se pudo refrescar el detalle.');
        return;
      }
      await Promise.resolve(
        onApplied({
          before,
          after,
          newTramoId,
        }),
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !p || !detalle) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={titulo}
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
            {saving ? 'Guardando…' : 'Confirmar movimiento'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-slate-800">
        {formError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">{formError}</div>
        ) : null}

        <p className="text-xs text-slate-500">
          {p.prestamista || p.titulo || `Préstamo #${p.id}`} · capital actual{' '}
          {montoFmt(capActual, p.monedaCapital)}
        </p>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Monto</label>
          <input
            type="text"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className={inputClass}
            placeholder={esRetiro ? 'Ej. 5000' : 'Ej. 2000'}
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Motivo / comentario</label>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={2}
            className={inputClass}
            placeholder={esRetiro ? 'Ej. desembolso parcial al cliente' : 'Ej. refinanciamiento'}
          />
        </div>

        <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 space-y-1 text-xs">
          <p className="font-semibold text-indigo-950">Vista previa</p>
          <p className="text-slate-700 tabular-nums">
            Capital actual: <span className="font-medium">{montoFmt(capActual, p.monedaCapital)}</span>
          </p>
          {montoNum > 0 ? (
            <p className="text-slate-700 tabular-nums">
              {esRetiro ? 'Retiro' : 'Aumento'}:{' '}
              <span className="font-medium">
                {esRetiro ? '−' : '+'}
                {montoFmt(montoNum, p.monedaCapital)}
              </span>
            </p>
          ) : null}
          <p className="text-slate-700 tabular-nums">
            Nuevo capital: <span className="font-semibold text-indigo-900">{montoFmt(nuevoCapital, p.monedaCapital)}</span>
          </p>
          <p className="text-slate-700 tabular-nums">
            Nueva cuota mensual:{' '}
            <span className="font-semibold text-indigo-900">{montoFmt(nuevaCuota, p.monedaPago)}</span>
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default PrestamoCapitalModal;
