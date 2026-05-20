import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Gasto, Vehicle } from '../../../data/types';
import { formatCurrency } from '../../../utils/formatting';
import { vehicleIdKey } from '../../../utils/vehicleId';
import { getOperativoSubtipoLabel, resolveOperativoSubtipoGastoCanon } from '../../../utils/operativoSubtipo';
import {
  filterGastosPeriod,
  getReportesPeriodRange,
  isOperativoGastoNormalized,
  normalizeTipoGasto,
  topEntries,
  TIPO_GASTO_LABELS,
  type ReportesPeriodPreset,
} from '../../../utils/reportesAnalytics';
import ReportesPeriodFilter from '../components/ReportesPeriodFilter';
import { useDeferredRecalc } from '../../../hooks/useDeferredRecalc';
import { UpdatingChrome } from '../../../components/Loading';

interface GastosOperativosSectionProps {
  gastos: Gasto[];
  vehicles: Vehicle[];
  yearOptions: number[];
}

const GastosOperativosSection: React.FC<GastosOperativosSectionProps> = ({ gastos, vehicles, yearOptions }) => {
  const navigate = useNavigate();
  const [preset, setPreset] = useState<ReportesPeriodPreset>('anio_actual');
  const [customYear, setCustomYear] = useState(() => yearOptions[0] ?? new Date().getFullYear());

  const filterKey = useMemo(() => ({ preset, customYear }), [preset, customYear]);
  const { deferred: deferredFilter, isRecalculating } = useDeferredRecalc(filterKey);

  const range = useMemo(
    () => getReportesPeriodRange(deferredFilter.preset, deferredFilter.customYear),
    [deferredFilter],
  );
  const gastosPeriod = useMemo(
    () => filterGastosPeriod(gastos, range.desde, range.hasta),
    [gastos, range.desde, range.hasta],
  );

  const operativos = useMemo(
    () =>
      gastosPeriod.filter((g) =>
        isOperativoGastoNormalized(normalizeTipoGasto(g.tipo_gasto, g.vehicleId != null)),
      ),
    [gastosPeriod],
  );

  const topSubtipos = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const g of operativos) {
      const canon = resolveOperativoSubtipoGastoCanon(g.subtipo_gasto ?? '') ?? 'otros_operativo';
      totals[canon] = (totals[canon] ?? 0) + g.monto;
    }
    return topEntries(totals, (k) => getOperativoSubtipoLabel(k), 5);
  }, [operativos]);

  const topCategorias = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const g of gastosPeriod) {
      const k = normalizeTipoGasto(g.tipo_gasto, g.vehicleId != null);
      totals[k] = (totals[k] ?? 0) + g.monto;
    }
    return topEntries(totals, (k) => TIPO_GASTO_LABELS[k] ?? k, 5);
  }, [gastosPeriod]);

  const topVehiculos = useMemo(() => {
    const totals = new Map<string, { monto: number; vehicleId: number }>();
    for (const g of operativos) {
      if (g.vehicleId == null) continue;
      const key = vehicleIdKey(g.vehicleId);
      if (!key) continue;
      const prev = totals.get(key) ?? { monto: 0, vehicleId: Number(g.vehicleId) };
      totals.set(key, { monto: prev.monto + g.monto, vehicleId: prev.vehicleId });
    }
    return [...totals.values()]
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 5)
      .map((x) => {
        const v = vehicles.find((veh) => veh.id === x.vehicleId);
        return {
          vehicleId: x.vehicleId,
          label: v ? `${v.placa} · ${v.marca}` : `#${x.vehicleId}`,
          monto: x.monto,
        };
      });
  }, [operativos, vehicles]);

  const totalOp = useMemo(() => operativos.reduce((s, g) => s + g.monto, 0), [operativos]);

  return (
    <section className="space-y-4 content-enter">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Gastos operativos</h2>
        <p className="mt-1 text-sm text-slate-600">
          Dónde se concentra el gasto operativo de flota en el período ({formatCurrency(totalOp)} total).
        </p>
      </div>

      <ReportesPeriodFilter
        preset={preset}
        customYear={customYear}
        yearOptions={yearOptions}
        onPresetChange={setPreset}
        onCustomYearChange={setCustomYear}
      />

      <div className="filter-surface">
        <UpdatingChrome active={isRecalculating} />
        <div className="grid gap-4 lg:grid-cols-3 stagger-children">
          <TopBlock
            title="Top subtipos operativos"
            items={topSubtipos.map((x) => ({ label: x.label, monto: x.monto }))}
            updating={isRecalculating}
          />
          <TopBlock
            title="Por categoría financiera"
            items={topCategorias.map((x) => ({ label: x.label, monto: x.monto }))}
            updating={isRecalculating}
          />
          <div className="glass-panel p-4">
            <h3 className="text-sm font-bold text-slate-900">Vehículos con más gasto operativo</h3>
            {topVehiculos.length === 0 && !isRecalculating ? (
              <p className="mt-3 text-sm text-slate-400">Sin gastos operativos en el período.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {topVehiculos.map((x, idx) => (
                  <li key={x.vehicleId}>
                    <button
                      type="button"
                      onClick={() => navigate(`/vehiculos/${x.vehicleId}`)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-sm transition-colors duration-300 hover:bg-slate-50/90 active:scale-[0.995]"
                    >
                      <span className="text-slate-800">
                        <span className="mr-2 font-bold text-rose-600">{idx + 1}.</span>
                        {x.label}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-slate-800">
                        {formatCurrency(x.monto)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

function TopBlock({
  title,
  items,
  updating,
}: {
  title: string;
  items: { label: string; monto: number }[];
  updating?: boolean;
}) {
  return (
    <div className="glass-panel p-4">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      {items.length === 0 && !updating ? (
        <p className="mt-3 text-sm text-slate-400">Sin datos.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((x, idx) => (
            <li key={x.label} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 text-slate-800">
                <span className="mr-2 font-bold text-violet-600">{idx + 1}.</span>
                {x.label}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(x.monto)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default GastosOperativosSection;
