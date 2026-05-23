import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Vehicle } from '../../../data/types';
import type { CajaNegocioVehiculo } from '../../../data/types';
import { formatCurrency } from '../../../utils/formatting';
import {
  buildUtilidadHistoricaPorVehiculo,
  sumUtilidadHistoricaEnRango,
  sumUtilidadHistoricaTotal,
  UTILIDAD_HISTORICA_PENDIENTE_NOTA,
} from '../../../utils/utilidadOperativa';
import {
  getReportesPeriodRange,
  type ReportesPeriodPreset,
} from '../../../utils/reportesAnalytics';
import ReportesPeriodFilter from '../components/ReportesPeriodFilter';
import { useDeferredRecalc } from '../../../hooks/useDeferredRecalc';

interface UtilidadAcumuladaSectionProps {
  vehicles: Vehicle[];
  cajaNegocioVehiculo: CajaNegocioVehiculo[];
  yearOptions: number[];
}

/** Modo histórico solamente — cálculo automático desactivado temporalmente. */
const UtilidadAcumuladaSection: React.FC<UtilidadAcumuladaSectionProps> = ({
  vehicles,
  cajaNegocioVehiculo,
  yearOptions,
}) => {
  const [preset, setPreset] = React.useState<ReportesPeriodPreset>('anio_actual');
  const [customYear, setCustomYear] = React.useState(() => yearOptions[0] ?? new Date().getFullYear());

  const filterKey = useMemo(() => ({ preset, customYear }), [preset, customYear]);
  const { deferred: deferredFilter } = useDeferredRecalc(filterKey);

  const range = useMemo(
    () => getReportesPeriodRange(deferredFilter.preset, deferredFilter.customYear),
    [deferredFilter],
  );

  const totalHistorico = useMemo(
    () => sumUtilidadHistoricaTotal(cajaNegocioVehiculo),
    [cajaNegocioVehiculo],
  );

  const utilidadPeriodo = useMemo(
    () => sumUtilidadHistoricaEnRango(cajaNegocioVehiculo, range.desde, range.hasta),
    [cajaNegocioVehiculo, range.desde, range.hasta],
  );

  const porVehiculo = useMemo(
    () => buildUtilidadHistoricaPorVehiculo(cajaNegocioVehiculo),
    [cajaNegocioVehiculo],
  );

  const topVehiculos = useMemo(
    () => porVehiculo.filter((v) => v.monto > 0).slice(0, 5),
    [porVehiculo],
  );

  const vehicleLabel = (id: number) => {
    const v = vehicles.find((x) => x.id === id);
    return v ? `${v.marca} ${v.modelo} · ${v.placa}` : `Unidad #${id}`;
  };

  return (
    <section className="space-y-4 content-enter">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Utilidad histórica</h2>
        <p className="mt-1 text-sm text-slate-600">
          Dato importado desde Excel (caja negocio por vehículo). No incluye cálculo automático desde registros nuevos.
        </p>
      </div>

      <p className="rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-xs text-amber-950">
        {UTILIDAD_HISTORICA_PENDIENTE_NOTA}
      </p>

      <ReportesPeriodFilter
        preset={preset}
        customYear={customYear}
        yearOptions={yearOptions}
        onPresetChange={setPreset}
        onCustomYearChange={setCustomYear}
      />
      <p className="text-xs text-slate-500">{range.label}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatBox label="Total histórico importado" value={formatCurrency(totalHistorico)} highlight />
        <StatBox label="En el período filtrado" value={formatCurrency(utilidadPeriodo)} />
      </div>

      <p className="text-xs text-slate-500">
        Detalle completo en{' '}
        <Link to="/finanzas/utilidad-operativa" className="font-medium text-violet-700 underline">
          Utilidad histórica
        </Link>
        .
      </p>

      <div className="glass-panel overflow-hidden p-0">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">Top unidades (histórico importado)</h3>
        </div>
        {topVehiculos.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">Sin utilidad histórica importada.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {topVehiculos.map((row, idx) => (
              <li key={row.vehicleId} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-800">
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{vehicleLabel(row.vehicleId)}</span>
                <span className="text-sm font-bold tabular-nums text-emerald-700">{formatCurrency(row.monto)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-3 ${highlight ? 'border-violet-200 bg-violet-50/60' : 'border-slate-200 bg-white'}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${highlight ? 'text-violet-900' : 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  );
}

export default UtilidadAcumuladaSection;
