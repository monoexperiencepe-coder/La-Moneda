import { useAmountDisplay } from '../../../hooks/useAmountDisplay';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Ingreso, Vehicle } from '../../../data/types';
import { MESES } from '../../../data/catalogs';
import IngresosMesChart from '../../../components/Finanzas/IngresosMesChart';
;
import { ingresoMontoPEN } from '../../../utils/moneda';
import {
  ingresosExtraordinariosTotal,
  ingresosVehicularesTotal,
  isIngresoVehicular,
} from '../../../utils/ingresoAlcance';
import {
  filterIngresosPeriod,
  getReportesPeriodRange,
  ingresosPeriodTotal,
  type ReportesPeriodPreset,
} from '../../../utils/reportesAnalytics';
import ReportesPeriodFilter from '../components/ReportesPeriodFilter';
import { useDeferredRecalc } from '../../../hooks/useDeferredRecalc';
import { UpdatingChrome } from '../../../components/Loading';

interface IngresosReporteSectionProps {
  ingresos: Ingreso[];
  vehicles: Vehicle[];
  yearOptions: number[];
}

const IngresosReporteSection: React.FC<IngresosReporteSectionProps> = ({ ingresos, vehicles, yearOptions }) => {
  const { formatGlobalAmount, formatRecordAmount } = useAmountDisplay();
  const navigate = useNavigate();
  const [preset, setPreset] = useState<ReportesPeriodPreset>('anio_actual');
  const [customYear, setCustomYear] = useState(() => yearOptions[0] ?? new Date().getFullYear());
  const [chartYear, setChartYear] = useState('');

  const periodKey = useMemo(() => ({ preset, customYear }), [preset, customYear]);
  const { deferred: deferredPeriod, isRecalculating: periodRecalculating } = useDeferredRecalc(periodKey);
  const { deferred: deferredChartYear, isRecalculating: chartRecalculating } = useDeferredRecalc(chartYear);
  const isRecalculating = periodRecalculating || chartRecalculating;

  const range = useMemo(
    () => getReportesPeriodRange(deferredPeriod.preset, deferredPeriod.customYear),
    [deferredPeriod],
  );
  const ingresosPeriod = useMemo(
    () => filterIngresosPeriod(ingresos, range.desde, range.hasta),
    [ingresos, range.desde, range.hasta],
  );

  useEffect(() => {
    if (preset === 'personalizado') setChartYear(String(customYear));
    else if (preset === 'anio_actual') setChartYear(String(new Date().getFullYear()));
    else setChartYear('');
  }, [preset, customYear]);

  const chartYearNum = deferredChartYear ? Number(deferredChartYear) : NaN;

  const chartData = useMemo(() => {
    if (!Number.isFinite(chartYearNum)) return [];
    const prefix = `${chartYearNum}-`;
    return MESES.map((mes) => {
      const mm = String(mes.value).padStart(2, '0');
      const total = ingresos
        .filter((i) => i.fecha.startsWith(prefix) && i.fecha.slice(5, 7) === mm)
        .reduce((s, i) => s + ingresoMontoPEN(i), 0);
      return { mes: mes.label.slice(0, 3), total };
    });
  }, [ingresos, chartYearNum]);

  const totalPeriodo = useMemo(() => ingresosPeriodTotal(ingresosPeriod), [ingresosPeriod]);
  const totalVehicularPeriodo = useMemo(() => ingresosVehicularesTotal(ingresosPeriod), [ingresosPeriod]);
  const totalExtraordinarioPeriodo = useMemo(
    () => ingresosExtraordinariosTotal(ingresosPeriod),
    [ingresosPeriod],
  );
  const movimientosPeriodo = ingresosPeriod.length;

  const topVehiculos = useMemo(() => {
    const totals = new Map<number, number>();
    for (const i of ingresosPeriod) {
      if (!isIngresoVehicular(i) || i.vehicleId == null) continue;
      totals.set(i.vehicleId, (totals.get(i.vehicleId) ?? 0) + ingresoMontoPEN(i));
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([vid, monto]) => {
        const v = vehicles.find((veh) => veh.id === vid);
        return { vehicleId: vid, label: v ? `${v.placa} · ${v.marca}` : `#${vid}`, monto };
      });
  }, [ingresosPeriod, vehicles]);

  const trendYears = useMemo(() => yearOptions.slice(0, 6), [yearOptions]);

  return (
    <section className="space-y-4 content-enter">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Ingresos</h2>
        <p className="mt-1 text-sm text-slate-600">Ingresos confirmados y tendencia mensual.</p>
      </div>

      <ReportesPeriodFilter
        preset={preset}
        customYear={customYear}
        yearOptions={yearOptions}
        onPresetChange={setPreset}
        onCustomYearChange={setCustomYear}
      />

      <div className="filter-surface space-y-4">
        <UpdatingChrome active={isRecalculating} />
        <div className="grid gap-3 sm:grid-cols-2 stagger-children">
          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-4 backdrop-blur-sm transition-shadow duration-300 hover:shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Total en período</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-950">{formatGlobalAmount(totalPeriodo)}</p>
            <p className="mt-1 text-xs text-emerald-700/90">{range.label}</p>
            <p className="mt-2 text-[11px] text-emerald-800/80 leading-snug">
              Vehiculares {formatGlobalAmount(totalVehicularPeriodo)} · Extraordinarios{' '}
              {formatGlobalAmount(totalExtraordinarioPeriodo)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 backdrop-blur-sm transition-shadow duration-300 hover:shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Movimientos</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{movimientosPeriodo}</p>
            <p className="mt-1 text-xs text-slate-600">Registros en el período seleccionado</p>
          </div>
        </div>

        <div className="glass-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">Tendencia mensual</h3>
            <div className="flex flex-wrap gap-1">
              {trendYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setChartYear(String(y))}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] ${
                    chartYear === String(y)
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-100/90 text-slate-600 hover:bg-slate-200/90 backdrop-blur-sm'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 h-52">
            {chartData.length > 0 ? (
              <IngresosMesChart chartData={chartData} barFrom="#2DD4BF" barTo="#0F766E" />
            ) : (
              <p className="py-12 text-center text-sm text-slate-400">Elige un año para ver la tendencia.</p>
            )}
          </div>
        </div>

        <div className="glass-panel p-4">
          <h3 className="text-sm font-bold text-slate-900">Top vehículos por ingreso</h3>
          {topVehiculos.length === 0 && !isRecalculating ? (
            <p className="mt-3 text-sm text-slate-400">Sin ingresos en el período.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-50">
              {topVehiculos.map((x, idx) => (
                <li key={x.vehicleId}>
                  <button
                    type="button"
                    onClick={() => navigate(`/vehiculos/${x.vehicleId}`)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg py-2.5 text-sm transition-colors duration-300 hover:bg-slate-50/90 active:scale-[0.995]"
                  >
                    <span>
                      <span className="mr-2 font-bold text-teal-600">{idx + 1}.</span>
                      {x.label}
                    </span>
                    <span className="font-semibold tabular-nums">{formatGlobalAmount(x.monto)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};

export default IngresosReporteSection;
