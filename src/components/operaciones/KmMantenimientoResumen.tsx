import React from 'react';
import type { KmDesdeUltimoMantenimientoResult } from '../../utils/kmMantenimientoControl';
import {
  formatKmFechaLine,
  kmMantenimientoStatusLabel,
  KM_ALERTA_VARIACION_DESDE_MANT,
} from '../../utils/kmMantenimientoControl';

type Props = {
  data: KmDesdeUltimoMantenimientoResult;
  compact?: boolean;
  className?: string;
};

const KmMantenimientoResumen: React.FC<Props> = ({ data, compact = false, className = '' }) => {
  const alerta = data.status === 'alerta';
  const border = alerta
    ? 'border-red-200 bg-red-50/80'
    : data.status === 'ok'
      ? 'border-emerald-100 bg-emerald-50/50'
      : 'border-slate-200 bg-slate-50/80';

  return (
    <section className={`rounded-xl border p-3 sm:p-4 ${border} ${className}`}>
      <section className={compact ? 'space-y-2 text-xs' : 'space-y-3 text-sm'}>
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Último mantenimiento</p>
          <p className="mt-0.5 font-medium text-slate-900 tabular-nums">
            {data.ultimoMantenimientoKm != null || data.ultimoMantenimientoFecha
              ? formatKmFechaLine(data.ultimoMantenimientoKm, data.ultimoMantenimientoFecha)
              : 'Sin mantenimiento registrado'}
          </p>
        </section>
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Último registro</p>
          <p className="mt-0.5 font-medium text-slate-900 tabular-nums">
            {data.ultimoRegistroKm != null || data.ultimoRegistroFecha
              ? formatKmFechaLine(data.ultimoRegistroKm, data.ultimoRegistroFecha)
              : 'Sin kilometraje actual registrado'}
          </p>
        </section>
        {data.diffKm != null ? (
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Variación</p>
            <p className={`mt-0.5 font-bold tabular-nums ${alerta ? 'text-red-800' : 'text-slate-900'}`}>
              {data.diffKm.toLocaleString('es-PE')} km desde último mantenimiento
            </p>
          </section>
        ) : null}
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Estado</p>
          <p
            className={`mt-0.5 font-semibold ${
              alerta ? 'text-red-800' : data.status === 'ok' ? 'text-emerald-800' : 'text-amber-900'
            }`}
          >
            {data.warningMessage ?? kmMantenimientoStatusLabel(data.status)}
          </p>
          {data.status === 'alerta' ? (
            <p className="mt-1 text-[10px] text-red-700/90">
              Umbral alerta: ≥ {KM_ALERTA_VARIACION_DESDE_MANT.toLocaleString('es-PE')} km
            </p>
          ) : null}
        </section>
      </section>
    </section>
  );
};

export default KmMantenimientoResumen;
