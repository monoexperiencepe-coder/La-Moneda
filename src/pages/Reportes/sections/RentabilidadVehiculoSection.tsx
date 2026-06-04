import { useAmountDisplay } from '../../../hooks/useAmountDisplay';
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Descuento, Gasto, Ingreso, Vehicle } from '../../../data/types';
import { calculateVehicleRentability } from '../../../utils/calculations';
;
import {
  filterGastosPeriod,
  filterIngresosPeriod,
  getReportesPeriodRange,
  type ReportesPeriodPreset,
} from '../../../utils/reportesAnalytics';
import { UTILIDAD_REAL_TOOLTIP } from '../../../utils/utilidadReal';
import ReportesPeriodFilter from '../components/ReportesPeriodFilter';
import { useDeferredRecalc } from '../../../hooks/useDeferredRecalc';
import { useEnsureGastosFullForUtilidad } from '../../../hooks/useEnsureGastosFullForUtilidad';

interface RentabilidadVehiculoSectionProps {
  vehicles: Vehicle[];
  ingresos: Ingreso[];
  gastos: Gasto[];
  descuentos: Descuento[];
  yearOptions: number[];
}

const RentabilidadVehiculoSection: React.FC<RentabilidadVehiculoSectionProps> = ({
  vehicles,
  ingresos,
  gastos,
  descuentos,
  yearOptions,
}) => {
  const { formatGlobalAmount, formatRecordAmount } = useAmountDisplay();
  const navigate = useNavigate();
  const { isLoadingGastosFull, gastosReadyForUtilidad } = useEnsureGastosFullForUtilidad();
  const [preset, setPreset] = useState<ReportesPeriodPreset>('anio_actual');
  const [customYear, setCustomYear] = useState(() => yearOptions[0] ?? new Date().getFullYear());

  const filterKey = useMemo(() => ({ preset, customYear }), [preset, customYear]);
  const { deferred: deferredFilter } = useDeferredRecalc(filterKey);

  const range = useMemo(
    () => getReportesPeriodRange(deferredFilter.preset, deferredFilter.customYear),
    [deferredFilter],
  );

  const rentability = useMemo(() => {
    if (!gastosReadyForUtilidad) return [];
    const i = filterIngresosPeriod(ingresos, range.desde, range.hasta);
    const g = filterGastosPeriod(gastos, range.desde, range.hasta);
    const d =
      range.desde && range.hasta
        ? descuentos.filter((x) => x.fecha >= range.desde! && x.fecha <= range.hasta!)
        : descuentos;
    return calculateVehicleRentability(vehicles, i, g, d);
  }, [gastosReadyForUtilidad, vehicles, ingresos, gastos, descuentos, range]);

  const topRentables = useMemo(() => rentability.filter((r) => r.margen > 0).slice(0, 5), [rentability]);
  const topCostosos = useMemo(
    () => [...rentability].sort((a, b) => a.margen - b.margen).slice(0, 5),
    [rentability],
  );

  const margenPct = (r: (typeof rentability)[0]) =>
    r.totalIngresos > 0 ? Math.round((r.margen / r.totalIngresos) * 100) : 0;

  return (
    <section className="space-y-4 content-enter">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Rentabilidad por vehículo</h2>
        <p className="mt-1 text-sm text-slate-600">
          Utilidad real por unidad en el período elegido: ingresos registrados − gastos registrados (todos con
          vehicle_id). {UTILIDAD_REAL_TOOLTIP}
        </p>
      </div>

      <ReportesPeriodFilter
        preset={preset}
        customYear={customYear}
        yearOptions={yearOptions}
        onPresetChange={setPreset}
        onCustomYearChange={setCustomYear}
      />
      <p className="text-xs text-slate-500">{range.label}</p>

      {!gastosReadyForUtilidad ? (
        <p className="text-sm text-slate-500">
          {isLoadingGastosFull ? 'Cargando gastos completos para utilidad real…' : 'Preparando datos…'}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <RankingList
          title="Top utilidad real"
          empty="Sin utilidad positiva en este período."
          items={topRentables}
          margenPct={margenPct}
          tone="good"
          onRow={(id) => navigate(`/vehiculos/${id}`)}
        />
        <RankingList
          title="Mayor presión de costos"
          empty="Sin datos en el período."
          items={topCostosos}
          margenPct={margenPct}
          tone="warn"
          onRow={(id) => navigate(`/vehiculos/${id}`)}
        />
      </div>
    </section>
  );
};

function RankingList({
  title,
  empty,
  items,
  margenPct,
  tone,
  onRow,
}: {
  title: string;
  empty: string;
  items: ReturnType<typeof calculateVehicleRentability>;
  margenPct: (r: ReturnType<typeof calculateVehicleRentability>[0]) => number;
  tone: 'good' | 'warn';
  onRow: (id: number) => void;
}) {
  const { formatGlobalAmount } = useAmountDisplay();
  return (
    <div className="glass-panel overflow-hidden p-0">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {items.map((r, idx) => (
            <li key={r.vehicle.id}>
              <button
                type="button"
                onClick={() => onRow(r.vehicle.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50/90"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    idx === 0 ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">
                    {r.vehicle.marca} {r.vehicle.modelo}
                  </span>
                  <span className="text-xs text-slate-400">{r.vehicle.placa}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className={`block text-sm font-bold tabular-nums ${
                      tone === 'good' ? 'text-emerald-600' : r.margen >= 0 ? 'text-slate-700' : 'text-rose-600'
                    }`}
                  >
                    {formatGlobalAmount(r.margen)}
                  </span>
                  <span className="text-xs text-slate-400">Utilidad {margenPct(r)}%</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default RentabilidadVehiculoSection;
