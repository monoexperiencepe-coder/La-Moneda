import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import RegistrosTable from '../../components/Tables/RegistrosTable';
import Select from '../../components/Common/Select';
import { formatCurrency, todayStr } from '../../utils/formatting';
import { ingresoMontoPEN } from '../../utils/moneda';
import { MESES } from '../../data/catalogs';

const IngresosMesChart = lazy(() => import('../../components/Finanzas/IngresosMesChart'));

const Ingresos: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const cobroPendiente = searchParams.get('cobro') === 'pendiente';
  const { ingresos, vehicles, deleteIngreso } = useRegistrosContext();
  const { open } = useDrawer();

  const [rankingDim, setRankingDim] = useState<'vehicle' | 'tipo'>('vehicle');

  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const i of ingresos) {
      const y = Number(i.fecha.slice(0, 4));
      if (Number.isFinite(y) && y > 0) ys.add(y);
    }
    return [...ys].sort((a, b) => b - a);
  }, [ingresos]);

  const [chartYear, setChartYear] = useState<string>('');
  const [historyYear, setHistoryYear] = useState<string>('ALL');
  const [animatedTotal, setAnimatedTotal] = useState(0);
  const prevTotalRef = useRef(0);

  useEffect(() => {
    if (availableYears.length === 0) {
      setChartYear('');
      return;
    }
    setChartYear((prev) => {
      const n = prev ? Number(prev) : NaN;
      if (prev && Number.isFinite(n) && availableYears.includes(n)) return prev;
      return String(availableYears[0]);
    });
  }, [availableYears]);

  useEffect(() => {
    if (availableYears.length === 0) {
      setHistoryYear('ALL');
      return;
    }
    setHistoryYear((prev) => {
      if (prev === 'ALL') return prev;
      const n = Number(prev);
      if (Number.isFinite(n) && availableYears.includes(n)) return prev;
      return 'ALL';
    });
  }, [availableYears]);

  const chartYearNum = chartYear ? Number(chartYear) : NaN;

  const ingresosDelAnioGrafico = useMemo(() => {
    if (!Number.isFinite(chartYearNum)) return [];
    const prefix = `${chartYearNum}-`;
    return ingresos.filter((i) => i.fecha.startsWith(prefix));
  }, [ingresos, chartYearNum]);

  const totalAnioGrafico = ingresosDelAnioGrafico.reduce((s, i) => s + ingresoMontoPEN(i), 0);

  useEffect(() => {
    const from = prevTotalRef.current;
    const to = totalAnioGrafico;
    if (Math.abs(to - from) < 0.01) {
      setAnimatedTotal(to);
      return;
    }
    const duration = 420;
    const start = performance.now();
    let rafId = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimatedTotal(from + (to - from) * eased);
      if (p < 1) rafId = requestAnimationFrame(tick);
      else prevTotalRef.current = to;
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [totalAnioGrafico]);

  const chartData = useMemo(() => {
    return MESES.map((mes) => {
      const month = String(mes.value).padStart(2, '0');
      const total = ingresosDelAnioGrafico
        .filter((i) => i.fecha.slice(5, 7) === month)
        .reduce((s, i) => s + ingresoMontoPEN(i), 0);
      return { mes: mes.label.slice(0, 3), total };
    });
  }, [ingresosDelAnioGrafico]);

  const chartYearInsights = useMemo(() => {
    if (!Number.isFinite(chartYearNum)) {
      return { avgMonthly: 0, peakLabel: '—', peakTotal: 0 };
    }
    const avgMonthly = totalAnioGrafico / 12;
    let peakTotal = 0;
    let peakLabel = '—';
    for (const mes of MESES) {
      const mm = String(mes.value).padStart(2, '0');
      const monthTotal = ingresosDelAnioGrafico
        .filter((i) => i.fecha.slice(5, 7) === mm)
        .reduce((s, i) => s + ingresoMontoPEN(i), 0);
      if (monthTotal > peakTotal) {
        peakTotal = monthTotal;
        peakLabel = mes.label;
      }
    }
    if (peakTotal <= 0) peakLabel = '—';
    return { avgMonthly, peakLabel, peakTotal };
  }, [chartYearNum, totalAnioGrafico, ingresosDelAnioGrafico]);

  const todayTotal = useMemo(
    () => ingresos.filter((i) => i.fecha === todayStr()).reduce((s, i) => s + ingresoMontoPEN(i), 0),
    [ingresos],
  );

  const pendientesStats = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const i of ingresos) {
      if ((i.estadoPago ?? '').toUpperCase() !== 'PENDIENTE') continue;
      count += 1;
      total += ingresoMontoPEN(i);
    }
    return { count, total };
  }, [ingresos]);

  const yearOptions = useMemo(
    () => availableYears.map((y) => ({ value: String(y), label: String(y) })),
    [availableYears],
  );

  const historyYearOptions = useMemo(
    () => [{ value: 'ALL', label: 'Todos los años' }, ...yearOptions],
    [yearOptions],
  );

  const ingresosHistorialFiltrados = useMemo(() => {
    if (historyYear === 'ALL') return ingresos;
    const prefix = `${historyYear}-`;
    return ingresos.filter((i) => i.fecha.startsWith(prefix));
  }, [ingresos, historyYear]);

  const getVehicleLabel = useCallback(
    (vehicleId: number) => {
      const v = vehicles.find((x) => x.id === vehicleId);
      return v ? `${v.marca} ${v.modelo} (${v.placa})` : `#${vehicleId}`;
    },
    [vehicles],
  );

  const vehicleRankingRows = useMemo(() => {
    const map = new Map<number, { total: number; count: number }>();
    for (const i of ingresosDelAnioGrafico) {
      const id = i.vehicleId;
      const cur = map.get(id) ?? { total: 0, count: 0 };
      cur.total += ingresoMontoPEN(i);
      cur.count += 1;
      map.set(id, cur);
    }
    return [...map.entries()]
      .map(([vehicleId, agg]) => ({ vehicleId, ...agg }))
      .sort((a, b) => b.total - a.total);
  }, [ingresosDelAnioGrafico]);

  const tipoRankingRows = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const i of ingresosDelAnioGrafico) {
      const key = i.tipo?.trim() ? i.tipo.trim() : '(Sin tipo)';
      const cur = map.get(key) ?? { total: 0, count: 0 };
      cur.total += ingresoMontoPEN(i);
      cur.count += 1;
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([nombre, agg]) => ({ nombre, ...agg }))
      .sort((a, b) => b.total - a.total);
  }, [ingresosDelAnioGrafico]);

  const setCobroPendienteFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.set('cobro', 'pendiente');
    setSearchParams(next, { replace: true });
  };

  const clearCobroFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('cobro');
    setSearchParams(next, { replace: true });
  };

  const rankingRows = rankingDim === 'vehicle' ? vehicleRankingRows : tipoRankingRows;
  const rankingGrand = useMemo(() => {
    if (rankingDim === 'vehicle') {
      return vehicleRankingRows.reduce(
        (acc, r) => ({ count: acc.count + r.count, total: acc.total + r.total }),
        { count: 0, total: 0 },
      );
    }
    return tipoRankingRows.reduce(
      (acc, r) => ({ count: acc.count + r.count, total: acc.total + r.total }),
      { count: 0, total: 0 },
    );
  }, [rankingDim, vehicleRankingRows, tipoRankingRows]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate('/finanzas')}
            className="mt-0.5 shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Finanzas</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">💵 Ingresos</h1>
            <p className="mt-0.5 text-sm text-slate-600">
              {ingresos.length} movimientos registrados
            </p>
            {cobroPendiente ? (
              <p className="mt-2 text-xs text-amber-900">
                Mostrando solo cobros con estado{' '}
                <span className="font-semibold">Pendiente</span> en la tabla inferior.{' '}
                <button
                  type="button"
                  className="font-semibold text-emerald-700 underline decoration-emerald-700/30 hover:text-emerald-800"
                  onClick={clearCobroFilter}
                >
                  Ver todos los estados
                </button>
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {!cobroPendiente && pendientesStats.count > 0 ? (
            <button
              type="button"
              onClick={setCobroPendienteFilter}
              className="rounded-xl border border-amber-200/90 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 shadow-sm transition hover:bg-amber-100"
            >
              Ver {pendientesStats.count} cobro{pendientesStats.count === 1 ? '' : 's'} pendiente{pendientesStats.count === 1 ? '' : 's'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => open('income')}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-900/15 transition hover:bg-emerald-700"
          >
            + Registrar ingreso
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_28px_56px_-28px_rgba(15,23,42,0.18)]">
        <div
          className="h-1 w-full bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-800"
          aria-hidden
        />
        <div className="pointer-events-none absolute -right-24 -top-28 h-60 w-60 rounded-full bg-gradient-to-br from-emerald-100/50 to-transparent blur-3xl" aria-hidden />

        <div className="relative p-4 sm:p-6">
          <div className="mb-5 border-b border-slate-100 pb-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Resumen ejecutivo</p>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
              Los montos del bloque superior corresponden al{' '}
              <span className="font-semibold text-slate-800">año del gráfico</span>. Más abajo puedes{' '}
              <span className="font-semibold text-slate-800">filtrar el historial</span> por otro año sin cambiar la tendencia.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
              <div className="rounded-xl border border-slate-100/95 bg-gradient-to-br from-white to-slate-50/80 p-3.5 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Total {chartYear || 'año'}
                </p>
                <p className="mt-1.5 text-xl font-bold tabular-nums tracking-tight text-emerald-900 sm:text-2xl">
                  {formatCurrency(animatedTotal)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100/95 bg-gradient-to-br from-white to-slate-50/80 p-3.5 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Promedio mensual</p>
                <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                  {formatCurrency(chartYearInsights.avgMonthly)}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">Sobre 12 meses</p>
              </div>
              <div className="rounded-xl border border-slate-100/95 bg-gradient-to-br from-white to-slate-50/80 p-3.5 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mes más alto</p>
                <p className="mt-1.5 text-sm font-bold capitalize leading-snug text-slate-900 sm:text-base">
                  {chartYearInsights.peakLabel}
                </p>
                <p className="mt-1 text-base font-semibold tabular-nums text-slate-700 sm:text-lg">
                  {formatCurrency(chartYearInsights.peakTotal)}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-100/90 bg-gradient-to-br from-emerald-50/90 to-white p-3.5 shadow-sm ring-1 ring-emerald-900/[0.05] sm:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">Ingreso hoy</p>
                <p className="mt-1.5 text-lg font-bold tabular-nums text-emerald-900 sm:text-xl">
                  {formatCurrency(todayTotal)}
                </p>
              </div>
              <div
                className={`rounded-xl border p-3.5 shadow-sm sm:p-4 ${
                  pendientesStats.count > 0
                    ? 'border-amber-200/90 bg-gradient-to-br from-amber-50/95 to-white ring-1 ring-amber-900/[0.06]'
                    : 'border-slate-100/95 bg-gradient-to-br from-white to-slate-50/80 ring-1 ring-slate-900/[0.03]'
                }`}
              >
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wide ${
                    pendientesStats.count > 0 ? 'text-amber-800/95' : 'text-slate-500'
                  }`}
                >
                  Cobros pendientes
                </p>
                <p
                  className={`mt-1.5 text-lg font-bold tabular-nums sm:text-xl ${
                    pendientesStats.count > 0 ? 'text-amber-950' : 'text-slate-700'
                  }`}
                >
                  {formatCurrency(pendientesStats.total)}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {pendientesStats.count} registro{pendientesStats.count === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            {yearOptions.length > 0 ? (
              <div className="mt-4 max-w-xs [&_.label]:mb-1 [&_.label]:text-xs [&_.label]:font-semibold [&_.label]:text-slate-600">
                <Select label="Año del gráfico y ranking" options={yearOptions} value={chartYear} onChange={setChartYear} />
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-400">Sin fechas para graficar.</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
            <div className="min-w-0 lg:col-span-5">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Tendencia mensual</h2>
                <span className="text-xs font-medium tabular-nums text-slate-400">{chartYear}</span>
              </div>
              <div className="h-[11rem] rounded-xl border border-slate-100 bg-gradient-to-b from-emerald-50/40 to-white px-1 pt-1 shadow-inner shadow-slate-900/[0.04] sm:h-44 lg:h-[14rem]">
                <Suspense fallback={<div className="h-full w-full animate-pulse rounded-lg bg-emerald-50/80" />}>
                  <IngresosMesChart chartData={chartData} />
                </Suspense>
              </div>
            </div>

            <div className="flex min-w-0 flex-col border-t border-slate-100 pt-5 lg:col-span-7 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Ranking · {chartYear}
                </h2>
                <div className="inline-flex rounded-xl border border-slate-200/90 bg-slate-50/80 p-0.5 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setRankingDim('vehicle')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      rankingDim === 'vehicle'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Por vehículo
                  </button>
                  <button
                    type="button"
                    onClick={() => setRankingDim('tipo')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      rankingDim === 'tipo'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Por tipo
                  </button>
                </div>
              </div>

              {rankingRows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 py-8 text-center text-sm text-slate-500">
                  Sin ingresos en {chartYear} para este ranking.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-sm shadow-slate-900/[0.03]">
                  <div className="max-h-[min(280px,44vh)] overflow-y-auto lg:max-h-[min(300px,40vh)]">
                    <table className="min-w-full text-left text-[13px]">
                      <thead className="sticky top-0 z-[1] bg-slate-50/95 shadow-[0_1px_0_0_rgb(226_232_240)] backdrop-blur-sm">
                        <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          <th className="py-2.5 pl-3 pr-2 font-semibold">
                            {rankingDim === 'vehicle' ? 'Unidad' : 'Tipo de ingreso'}
                          </th>
                          <th className="w-14 py-2.5 pr-2 text-right font-semibold tabular-nums">Nº</th>
                          <th className="py-2.5 pr-3 text-right font-semibold tabular-nums">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rankingDim === 'vehicle'
                          ? vehicleRankingRows.map((row) => (
                              <tr
                                key={row.vehicleId}
                                className="border-b border-slate-50 transition-colors hover:bg-emerald-50/50"
                              >
                                <td className="py-2.5 pl-3 pr-2 font-medium leading-snug text-slate-900">
                                  {getVehicleLabel(row.vehicleId)}
                                </td>
                                <td className="py-2.5 pr-2 text-right tabular-nums text-slate-600">{row.count}</td>
                                <td className="py-2.5 pr-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                                  {formatCurrency(row.total)}
                                </td>
                              </tr>
                            ))
                          : tipoRankingRows.map((row) => (
                              <tr
                                key={row.nombre}
                                className="border-b border-slate-50 transition-colors hover:bg-emerald-50/50"
                              >
                                <td className="py-2.5 pl-3 pr-2 font-medium leading-snug text-slate-900">{row.nombre}</td>
                                <td className="py-2.5 pr-2 text-right tabular-nums text-slate-600">{row.count}</td>
                                <td className="py-2.5 pr-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                                  {formatCurrency(row.total)}
                                </td>
                              </tr>
                            ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 border-t border-slate-200 bg-slate-100/95 backdrop-blur-sm">
                        <tr>
                          <td className="py-2.5 pl-3 pr-2 text-sm font-bold text-slate-900">Total</td>
                          <td className="py-2.5 pr-2 text-right text-sm font-bold tabular-nums text-slate-800">
                            {rankingGrand.count}
                          </td>
                          <td className="py-2.5 pr-3 text-right text-sm font-bold tabular-nums text-emerald-900">
                            {formatCurrency(rankingGrand.total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200/80 pt-8">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Movimientos</p>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Historial de ingresos</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
              El año aquí solo afecta la tabla; el gráfico y el ranking siguen usando el selector «Año del gráfico y ranking».
            </p>
          </div>
          <div className="w-full sm:w-48 [&_.label]:mb-1 [&_.label]:text-xs [&_.label]:font-semibold [&_.label]:text-slate-600">
            <Select
              label="Filtrar historial por año"
              options={historyYearOptions}
              value={historyYear}
              onChange={setHistoryYear}
            />
          </div>
        </div>
        <RegistrosTable
          mode="ingresos"
          ingresos={ingresosHistorialFiltrados}
          vehicles={vehicles}
          onDeleteIngreso={deleteIngreso}
          initialEstadoPago={cobroPendiente ? 'PENDIENTE' : ''}
        />
      </div>
    </div>
  );
};

export default Ingresos;
