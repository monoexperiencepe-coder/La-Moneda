import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import Modal from '../Common/Modal';
import Button from '../Common/Button';
import { formatCurrency } from '../../utils/formatting';
import type { IaLoteResumenConfirmacion } from '../../utils/iaClasificacionLote';
import { IA_LOTE_CONFIANZA_RECOMENDADA } from '../../utils/iaClasificacionLote';

type Props = {
  isOpen: boolean;
  resumen: IaLoteResumenConfirmacion | null;
  applying: boolean;
  progress: { current: number; total: number } | null;
  tieneRiesgo: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

const IAClasificacionLoteModal: React.FC<Props> = ({
  isOpen,
  resumen,
  applying,
  progress,
  tieneRiesgo,
  onClose,
  onConfirm,
}) => {
  const [confirmText, setConfirmText] = useState(false);
  const [confirmRiesgo, setConfirmRiesgo] = useState(false);

  const handleClose = () => {
    if (applying) return;
    setConfirmText(false);
    setConfirmRiesgo(false);
    onClose();
  };

  const puedeConfirmar =
    confirmText && (!tieneRiesgo || confirmRiesgo) && !applying && (resumen?.total ?? 0) > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Aplicar seleccionados (lote supervisado)"
      size="lg"
      closeLocked={applying}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" disabled={applying} onClick={handleClose}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" disabled={!puedeConfirmar} onClick={onConfirm}>
            {applying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Aplicando…
              </>
            ) : (
              'Confirmar y aplicar lote'
            )}
          </Button>
        </div>
      }
    >
      {resumen && (
        <div className="space-y-4 text-sm text-slate-700">
          {applying && progress ? (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-3">
              <p className="font-medium text-indigo-900">
                Aplicando {progress.current}/{progress.total}…
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all"
                  style={{ width: `${(progress.current / Math.max(1, progress.total)) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-indigo-800/90">
                Cada gasto se aplica con la misma ruta segura (moveGasto / RPC). Si uno falla, el lote continúa.
              </p>
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <p>
              <strong>Total seleccionados:</strong> {resumen.total}
            </p>
            <p>
              <strong>Monto total:</strong> {formatCurrency(resumen.montoTotal)}
            </p>
            <p>
              <strong>Alta confianza (≥{Math.round(IA_LOTE_CONFIANZA_RECOMENDADA * 100)}%):</strong>{' '}
              {resumen.altaConfianza}
            </p>
            <p>
              <strong>Con posible riesgo:</strong> {resumen.conRiesgo}
            </p>
            <p>
              <strong>Baja/media confianza:</strong> {resumen.bajaMediaConfianza}
            </p>
            <p>
              <strong>Memoria humana:</strong> {resumen.memoriaHumana} · <strong>Heurística:</strong>{' '}
              {resumen.heuristica} · <strong>Mixto:</strong> {resumen.mixto}
            </p>
          </div>

          {tieneRiesgo && !applying && (
            <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
              <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
              <div className="text-xs">
                <p className="font-semibold">Advertencia: hay sugerencias con riesgo</p>
                <p className="mt-1">
                  Incluyen baja confianza, solo heurística o marcadas para revisión humana. Revisa antes de
                  confirmar.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-slate-600">Categorías destino</p>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs">
                {resumen.porCategoria.map((c) => (
                  <li key={c.key}>
                    {c.label} <span className="text-slate-400">({c.count})</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600">Subtipos destino</p>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs">
                {resumen.porSubtipo.slice(0, 12).map((s) => (
                  <li key={s.key} className="truncate" title={s.label}>
                    {s.label} <span className="text-slate-400">({s.count})</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {!applying && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={confirmText}
                  onChange={(e) => setConfirmText(e.target.checked)}
                />
                <span>
                  El usuario confirma que revisó las sugerencias y autoriza aplicar estas clasificaciones.
                </span>
              </label>
              {tieneRiesgo && (
                <label className="flex cursor-pointer items-start gap-2 text-amber-900">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={confirmRiesgo}
                    onChange={(e) => setConfirmRiesgo(e.target.checked)}
                  />
                  <span>
                    Entiendo que hay {resumen.conRiesgo} registro(s) con riesgo y deseo aplicarlos igualmente.
                  </span>
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default IAClasificacionLoteModal;
