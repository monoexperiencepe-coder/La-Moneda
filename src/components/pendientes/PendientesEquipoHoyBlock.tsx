import React, { useMemo } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { Conductor, Pendiente, Vehicle } from '../../data/types';
import {
  filterPendientesEquipoHoy,
  pendienteTitulo,
  pendienteTipoEmoji,
} from '../../utils/pendienteModel';

const PREVIEW_MAX = 3;
const PREVIEW_MAX_HOME = 2;

export interface PendientesEquipoHoyBlockProps {
  pendientes: Pendiente[];
  vehicles: Vehicle[];
  conductores: Conductor[];
  getVehicleLabel: (id: number | string | null | undefined) => string;
  onVer: () => void;
  /** Tarjeta Home independiente vs bloque compacto (vista alertas). */
  variant?: 'card' | 'embedded';
  compact?: boolean;
  className?: string;
}

const PendientesEquipoHoyBlock: React.FC<PendientesEquipoHoyBlockProps> = ({
  pendientes,
  onVer,
  variant = 'card',
  compact = false,
  className = '',
}) => {
  const lista = useMemo(() => filterPendientesEquipoHoy(pendientes), [pendientes]);
  const total = lista.length;
  const previewMax =
    variant === 'card' && !compact ? PREVIEW_MAX_HOME : compact ? PREVIEW_MAX : PREVIEW_MAX;
  const preview = lista.slice(0, previewMax);
  const mas = total - preview.length;

  if (variant === 'embedded') {
    return (
      <div
        className={`border-t border-slate-900/[0.06] bg-transparent ${className}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="region"
        aria-label="Pendientes del equipo"
      >
        <div className="pt-5 mt-3 space-y-2">
          <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
            <span aria-hidden>🔥</span>
            Pendientes del equipo
          </p>
          {total === 0 ? (
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                <Check size={16} className="text-emerald-500 shrink-0" strokeWidth={2.5} />
                Todo al día
              </p>
              <p className="text-[11px] text-slate-500 pl-[22px]">No hay tareas manuales activas.</p>
            </div>
          ) : (
            <div className="space-y-1.5 min-w-0">
              <span className="inline-flex rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 tabular-nums">
                {total} tarea{total !== 1 ? 's' : ''}
              </span>
              <ul className="space-y-1">
                {preview.map((p) => (
                  <li key={p.id} className="flex items-center gap-1.5 text-[11px] text-slate-600 min-w-0">
                    <span className="shrink-0" aria-hidden>
                      {pendienteTipoEmoji(p.tipo)}
                    </span>
                    <span className="truncate">{pendienteTitulo(p)}</span>
                  </li>
                ))}
                {mas > 0 ? (
                  <li className="text-[10px] font-semibold text-slate-500 pl-5">+{mas} más</li>
                ) : null}
              </ul>
            </div>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onVer();
            }}
            className="w-full flex items-center justify-center gap-1.5 min-h-9 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 active:bg-slate-100"
          >
            Ver pendientes <ArrowRight size={12} />
          </button>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <section
        className={`rounded-2xl border border-violet-200/90 bg-gradient-to-br from-violet-50/90 to-white shadow-soft overflow-hidden ${className}`}
      >
        <div className="h-[3px] bg-violet-500" />
        <div className="p-3">
          <div className="flex items-start justify-between gap-2 shrink-0">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700/80">
                Pendientes del equipo
              </p>
              <p className="mt-0.5 text-sm font-black text-violet-950 flex items-center gap-1.5">
                <span aria-hidden>🔥</span>
                {total} tarea{total !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onVer}
              className="shrink-0 flex items-center gap-1 rounded-xl bg-violet-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-violet-800 transition-colors min-h-9"
            >
              Ver pendientes <ArrowRight size={11} />
            </button>
          </div>
          {total === 0 ? (
            <p className="mt-2 text-xs font-medium text-emerald-700">Sin pendientes activas para hoy.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 min-h-0 overflow-y-auto overscroll-contain">
              {preview.map((p) => (
                <li key={p.id} className="flex items-start gap-2 text-xs text-violet-950/90 min-w-0">
                  <span className="shrink-0" aria-hidden>
                    {pendienteTipoEmoji(p.tipo)}
                  </span>
                  <span className="truncate">{pendienteTitulo(p)}</span>
                </li>
              ))}
              {mas > 0 ? (
                <li className="text-[11px] font-semibold text-violet-600 pl-6">+{mas} más</li>
              ) : null}
            </ul>
          )}
        </div>
      </section>
    );
  }

  return (
    <div
      className={`w-full min-h-[110px] rounded-[24px] border bg-white shadow-soft overflow-hidden
        transition-shadow hover:shadow-[0_4px_20px_rgba(124,58,237,0.08)] ${className}`}
      style={{ borderColor: 'rgba(124,58,237,0.14)' }}
    >
      <div className="h-[3px] bg-violet-400/70" aria-hidden />
      <button
        type="button"
        onClick={onVer}
        className="w-full min-h-[107px] p-6 text-left transition-colors active:bg-violet-50/30"
        aria-label={
          total === 0
            ? 'Pendientes del equipo: todo al día'
            : `Pendientes del equipo: ${total} tareas activas`
        }
      >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <span aria-hidden>🔥</span>
            Pendientes del equipo
          </p>

          {total === 0 ? (
            <div className="mt-2 space-y-0.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                <Check size={16} className="text-emerald-500 shrink-0" strokeWidth={2.5} />
                Todo al día
              </p>
              <p className="text-[11px] text-slate-500 leading-snug">
                No hay tareas manuales activas
              </p>
            </div>
          ) : (
            <div className="mt-2 space-y-1.5 min-w-0">
              <p className="text-[11px] text-slate-600 leading-snug">
                {total} tarea{total !== 1 ? 's' : ''} activa{total !== 1 ? 's' : ''}
              </p>
              <ul className="space-y-1">
                {preview.map((p) => (
                  <li key={p.id} className="flex items-center gap-1.5 text-[11px] text-slate-600 min-w-0">
                    <span className="shrink-0" aria-hidden>
                      {pendienteTipoEmoji(p.tipo)}
                    </span>
                    <span className="truncate">{pendienteTitulo(p)}</span>
                  </li>
                ))}
                {mas > 0 ? (
                  <li className="text-[10px] font-semibold text-slate-500 pl-5">+{mas} más</li>
                ) : null}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {total > 0 ? (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 tabular-nums">
              {total} tarea{total !== 1 ? 's' : ''}
            </span>
          ) : null}
          <ArrowRight size={14} className="text-violet-400" />
        </div>
      </div>
      </button>
    </div>
  );
};

export default PendientesEquipoHoyBlock;
