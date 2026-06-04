import { useAmountDisplay } from '../../../hooks/useAmountDisplay';
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Gasto, Ingreso, Vehicle } from '../../../data/types';
import type { CajaNegocioVehiculo } from '../../../data/types';
import {
  buildUtilidadHistoricaPorVehiculo,
  sumUtilidadHistoricaEnRango,
  sumUtilidadHistoricaTotal,
  UTILIDAD_HISTORICA_REFERENCIAL_LABEL,
  UTILIDAD_HISTORICA_TOOLTIP,
} from '../../../utils/utilidadOperativa';
import { calcularUtilidadRealEnRango, UTILIDAD_REAL_TOOLTIP } from '../../../utils/utilidadReal';
import {
  getReportesPeriodRange,
  type ReportesPeriodPreset,
} from '../../../utils/reportesAnalytics';
import ReportesPeriodFilter from '../components/ReportesPeriodFilter';
import { useDeferredRecalc } from '../../../hooks/useDeferredRecalc';
import { useUtilidadRealCalculos } from '../../../hooks/useUtilidadRealCalculos';

interface UtilidadAcumuladaSectionProps {
  vehicles: Vehicle[];
  ingresos: Ingreso[];
  gastos: Gasto[];
  cajaNegocioVehiculo: CajaNegocioVehiculo[];
  yearOptions: number[];
}

const UtilidadAcumuladaSection: React.FC<UtilidadAcumuladaSectionProps> = ({
  vehicles,
  ingresos,
  gastos,
  cajaNegocioVehiculo,
  yearOptions,
}) => {
  const { formatGlobalAmount } = useAmountDisplay();
  const {
    porVehiculo: porVehiculoReal,
    totalFlota: totalReal,
    gastosReadyForUtilidad,
    isLoadingGastosFull,
  } = useUtilidadRealCalculos({ pantalla: 'UtilidadAcumuladaSection' });
  const [preset, setPreset] = React.useState<ReportesPeriodPreset>('anio_actual');
  const [customYear, setCustomYear] = React.useState(() => yearOptions[0] ?? new Date().getFullYear());

  const filterKey = useMemo(() => ({ preset, customYear }), [preset, customYear]);
  const { deferred: deferredFilter } = useDeferredRecalc(filterKey);

  const range = useMemo(
    () => getReportesPeriodRange(deferredFilter.preset, deferredFilter.customYear),
    [deferredFilter],
  );

  const utilidadPeriodo = useMemo(() => {
    if (!gastosReadyForUtilidad) return { ingresos: 0, gastos: 0, utilidadReal: 0 };
    return calcularUtilidadRealEnRango(ingresos, gastos, range.desde, range.hasta);
  }, [gastosReadyForUtilidad, ingresos, gastos, range.desde, range.hasta]);

  const topVehiculos = useMemo(
    () => porVehiculoReal.filter((v) => v.utilidadReal !== 0).slice(0, 5),
    [porVehiculoReal],
  );

  const loadingLabel = isLoadingGastosFull ? 'Cargando gastos…' : '…';

  const totalHistoricoRef = useMemo(
    () => sumUtilidadHistoricaTotal(cajaNegocioVehiculo),
    [cajaNegocioVehiculo],
  );

  const historicoPeriodo = useMemo(
    () => sumUtilidadHistoricaEnRango(cajaNegocioVehiculo, range.desde, range.hasta),
    [cajaNegocioVehiculo, range.desde, range.hasta],
  );

  const porVehiculoHistorico = useMemo(
    () => buildUtilidadHistoricaPorVehiculo(cajaNegocioVehiculo),
    [cajaNegocioVehiculo],
  );

  const vehicleLabel = (id: number) => {
    const v = vehicles.find((x) => x.id === id);
    return v ? `${v.marca} ${v.modelo} · ${v.placa}` : `Unidad #${id}`;
  };

  return (
    <section className="space-y-4 content-enter">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Utilidad acumulada</h2>
        <p className="mt-1 text-sm text-slate-600">{UTILIDAD_REAL_TOOLTIP}</p>
      </div>

      <ReportesPeriodFilter
        preset={preset}
        customYear={customYear}
        yearOptions={yearOptions}
        onPresetChange={setPreset}
        onCustomYearChange={setCustomYear}
      />
      <p className="text-xs text-slate-500">{range.label}</p>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatBox
          label="Utilidad real (flota)"
          value={gastosReadyForUtilidad ? formatGlobalAmount(totalReal) : loadingLabel}
          highlight
          title={UTILIDAD_REAL_TOOLTIP}
        />
        <StatBox
          label="Utilidad en el período"
          value={gastosReadyForUtilidad ? formatGlobalAmount(utilidadPeriodo.utilidadReal) : loadingLabel}
          title={UTILIDAD_REAL_TOOLTIP}
        />
        <StatBox
          label="Ingresos − gastos (período)"
          value={
            gastosReadyForUtilidad
              ? `${formatGlobalAmount(utilidadPeriodo.ingresos)} − ${formatGlobalAmount(utilidadPeriodo.gastos)}`
              : loadingLabel
          }
        />
      </div>

      <p className="text-xs text-slate-500">
        Detalle completo en{' '}
        <Link to="/finanzas/utilidad-operativa" className="font-medium text-violet-700 underline">
          Utilidad por vehículo
        </Link>
        .
      </p>

      <div className="glass-panel overflow-hidden p-0">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">Top unidades (utilidad real)</h3>
        </div>
        {!gastosReadyForUtilidad ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">{loadingLabel}</p>
        ) : topVehiculos.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">Sin movimientos con vehículo.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {topVehiculos.map((row, idx) => (
              <li key={row.vehicleId} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-800">
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{vehicleLabel(row.vehicleId)}</span>
                <span className="text-sm font-bold tabular-nums text-emerald-700">{formatGlobalAmount(row.utilidadReal)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <section className="pt-4 border-t border-slate-200 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">{UTILIDAD_HISTORICA_REFERENCIAL_LABEL}</h3>
          <p className="mt-1 text-xs text-slate-600">{UTILIDAD_HISTORICA_TOOLTIP}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatBox label="Total importado Excel" value={formatGlobalAmount(totalHistoricoRef)} />
          <StatBox label="En el período filtrado" value={formatGlobalAmount(historicoPeriodo)} />
        </div>
        {porVehiculoHistorico.length > 0 ? (
          <div className="glass-panel overflow-hidden p-0 max-h-48 overflow-y-auto">
            <div className="border-b border-slate-100 px-4 py-2">
              <p className="text-xs font-semibold text-slate-600">Por vehículo (referencial)</p>
            </div>
            <ul className="divide-y divide-slate-50">
              {porVehiculoHistorico.slice(0, 15).map((row) => (
                <li key={row.vehicleId} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="text-slate-700">{vehicleLabel(row.vehicleId)}</span>
                  <span className="font-semibold tabular-nums text-slate-600">{formatGlobalAmount(row.monto)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </section>
  );
};

function StatBox({
  label,
  value,
  highlight,
  title,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  title?: string;
}) {
  return (
    <div
      title={title}
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
