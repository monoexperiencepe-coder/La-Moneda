import React, { useMemo } from 'react';
import type { Moneda, PrestamoFinanciero, PrestamoFinancieroTramo } from '../../data/types';
import { formatCurrency, formatDate, formatUSD } from '../../utils/formatting';
import {
  buildTimelineFromDetalle,
  movimientoBadgeLabel,
  type PrestamoMovimientoTipo,
  type PrestamoTimelineEntry,
} from '../../utils/prestamoMovimientos';

function montoFmt(amount: number, moneda: Moneda): string {
  return moneda === 'USD' ? formatUSD(amount) : formatCurrency(amount, 'S/');
}

function badgeClass(tipo: PrestamoMovimientoTipo): string {
  switch (tipo) {
    case 'retiro_capital':
      return 'bg-red-50 text-red-800 ring-red-200/80';
    case 'aumento_capital':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200/80';
    case 'renegociacion':
      return 'bg-violet-50 text-violet-800 ring-violet-200/80';
    case 'creacion':
      return 'bg-indigo-50 text-indigo-800 ring-indigo-200/80';
    case 'edicion':
      return 'bg-sky-50 text-sky-800 ring-sky-200/80';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-200/80';
  }
}

function deltaLabel(entry: PrestamoTimelineEntry): string | null {
  if (entry.deltaCapital == null || entry.deltaCapital === 0) return null;
  if (entry.deltaCapital > 0) {
    return `+${montoFmt(entry.deltaCapital, entry.monedaCapital)}`;
  }
  return `−${montoFmt(Math.abs(entry.deltaCapital), entry.monedaCapital)}`;
}

export interface PrestamoHistorialTimelineProps {
  prestamo: PrestamoFinanciero;
  tramos: PrestamoFinancieroTramo[];
  compact?: boolean;
}

const PrestamoHistorialTimeline: React.FC<PrestamoHistorialTimelineProps> = ({
  prestamo,
  tramos,
  compact = false,
}) => {
  const entries = useMemo(() => buildTimelineFromDetalle(prestamo, tramos), [prestamo, tramos]);

  if (entries.length === 0) {
    return <p className="text-[10px] text-slate-500">Sin movimientos registrados.</p>;
  }

  return (
    <div className={compact ? 'relative' : 'relative rounded-lg border border-slate-200/80 bg-white px-2.5 py-2'}>
      <div
        className="absolute left-[3px] top-2 bottom-2 w-px bg-gradient-to-b from-indigo-200 via-slate-200 to-transparent"
        aria-hidden
      />
      <ul className="space-y-0">
        {entries.map((entry) => {
          const delta = deltaLabel(entry);
          return (
            <li key={entry.id} className="relative pb-3 last:pb-0">
              <span
                className="absolute left-0 top-1.5 flex h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-white shadow-sm"
                aria-hidden
              />
              <div className="pl-4">
                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                  <time className="text-[10px] font-semibold text-slate-600 tabular-nums">
                    {formatDate(entry.fecha)}
                  </time>
                  <span
                    className={`inline-flex items-center rounded-md px-1.5 py-px text-[9px] font-bold ring-1 ${badgeClass(entry.tipo)}`}
                  >
                    {movimientoBadgeLabel(entry.tipo)}
                  </span>
                </div>
                <p className="text-[11px] font-medium text-slate-800 leading-snug">{entry.titulo}</p>
                {entry.capitalNuevo != null ? (
                  <p className="text-[10px] text-slate-600 mt-0.5 tabular-nums">
                    Capital: {montoFmt(entry.capitalNuevo, entry.monedaCapital)}
                    {delta ? <span className="ml-1 font-semibold text-slate-800">({delta})</span> : null}
                  </p>
                ) : null}
                {entry.interesAnterior != null &&
                entry.interesNuevo != null &&
                Math.abs(entry.interesAnterior - entry.interesNuevo) > 0.005 ? (
                  <p className="text-[10px] text-slate-600 tabular-nums">
                    Cuota: {montoFmt(entry.interesAnterior, entry.monedaPago)} →{' '}
                    {montoFmt(entry.interesNuevo, entry.monedaPago)}
                  </p>
                ) : entry.interesNuevo != null ? (
                  <p className="text-[10px] text-slate-600 tabular-nums">
                    Cuota mensual: {montoFmt(entry.interesNuevo, entry.monedaPago)}
                  </p>
                ) : null}
                {entry.comentario ? (
                  <p className="text-[9px] text-slate-500 mt-0.5 leading-snug whitespace-pre-wrap">
                    {entry.comentario}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default PrestamoHistorialTimeline;
