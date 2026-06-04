import React from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import type { Conductor, Pendiente, Vehicle } from '../../data/types';
import { formatDate, todayStr } from '../../utils/formatting';
import {
  isPendienteVencida,
  pendienteRegistroPath,
  pendienteRelacionLabel,
  pendienteTitulo,
  pendienteTipoEmoji,
} from '../../utils/pendienteModel';

const PRIORIDAD_BADGE: Record<string, string> = {
  critica: 'bg-red-100 text-red-800 border-red-200',
  alta: 'bg-orange-100 text-orange-900 border-orange-200',
  media: 'bg-amber-50 text-amber-900 border-amber-200',
  baja: 'bg-slate-100 text-slate-700 border-slate-200',
};

export interface PendienteCardProps {
  pendiente: Pendiente;
  vehicles: Vehicle[];
  conductores: Conductor[];
  getVehicleLabel: (id: number | string | null | undefined) => string;
  onNavigate: (path: string) => void;
  onCompletar?: (p: Pendiente) => void;
  onEditar?: (p: Pendiente) => void;
  readonly?: boolean;
  busy?: boolean;
}

const PendienteCard: React.FC<PendienteCardProps> = ({
  pendiente: p,
  vehicles,
  conductores,
  getVehicleLabel,
  onNavigate,
  onCompletar,
  onEditar,
  readonly = false,
  busy = false,
}) => {
  const today = todayStr();
  const vencida = isPendienteVencida(p, today);
  const fechaShow = p.fechaObjetivo ?? p.fecha;
  const path = pendienteRegistroPath(p);
  const relacion = pendienteRelacionLabel(p, { getVehicleLabel, vehicles, conductores });

  return (
    <article
      className={`rounded-xl border bg-white p-3.5 shadow-sm transition-colors ${
        p.prioridadV2 === 'critica' ? 'border-red-200' : 'border-gray-100'
      }`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <span className="text-2xl leading-none shrink-0" aria-hidden>
          {pendienteTipoEmoji(p.tipo)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-bold text-gray-900 truncate flex-1 min-w-[8rem]">
              {pendienteTitulo(p)}
            </h3>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                PRIORIDAD_BADGE[p.prioridadV2] ?? PRIORIDAD_BADGE.media
              }`}
            >
              {p.prioridadV2}
            </span>
          </div>
          {p.descripcion.trim() && pendienteTitulo(p) !== p.descripcion.trim() ? (
            <p className="mt-1 text-xs text-gray-600 line-clamp-2">{p.descripcion}</p>
          ) : null}
          <p className="mt-1.5 text-[11px] text-gray-500">
            {vencida ? (
              <span className="font-semibold text-red-600">Vencida · </span>
            ) : fechaShow === today ? (
              <span className="font-semibold text-violet-700">Vence hoy · </span>
            ) : null}
            {formatDate(fechaShow)}
            {p.responsable ? ` · ${p.responsable}` : ''}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-gray-700 truncate">{relacion}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!readonly && onCompletar ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onCompletar(p)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 sm:flex-none sm:min-w-[7rem]"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Completar
          </button>
        ) : null}
        {!readonly && onEditar ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onEditar(p)}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Editar
          </button>
        ) : null}
        {path ? (
          <button
            type="button"
            onClick={() => onNavigate(path)}
            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-100"
          >
            Ir al registro <ArrowRight size={12} />
          </button>
        ) : null}
      </div>
    </article>
  );
};

export default PendienteCard;
