import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import RegistrosTable from '../../components/Tables/RegistrosTable';
import Modal from '../../components/Common/Modal';
import { ColumnCountHintTh } from '../../components/Common/ColumnCountHintTh';
import IncomeForm from '../../components/Forms/IncomeForm';
import type { Ingreso } from '../../data/types';
import Select from '../../components/Common/Select';
import { formatCurrency, todayStr } from '../../utils/formatting';
import { ingresoMontoPEN } from '../../utils/moneda';
import { MESES } from '../../data/catalogs';

const IngresosMesChart = lazy(() => import('../../components/Finanzas/IngresosMesChart'));

const Ingresos: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const cobroPendiente = searchParams.get('cobro') === 'pendiente';
  const { ingresos, vehicles, deleteIngreso, addIngreso } = useRegistrosContext();

  const [rankingDim, setRankingDim] = useState<'vehicle' | 'tipo'>('vehicle');
  const [registrarOpen, setRegistrarOpen] = useState(false);
  const [prefillVehicleId, setPrefillVehicleId] = useState<number | null>(null);
  const [formInstanceKey, setFormInstanceKey] = useState(0);

  useEffect(() => {
    if (searchParams.get('registrar') !== '1') return;
    const raw = searchParams.get('vehicleId');
    const vid = raw ? Number(raw) : NaN;
    setPrefillVehicleId(Number.isFinite(vid) && vid > 0 ? vid : null);
    setFormInstanceKey((k) => k + 1);
    setRegistrarOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('registrar');
    next.delete('vehicleId');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openRegistrarModal = () => {
    setPrefillVehicleId(null);
    setFormInstanceKey((k) => k + 1);
    setRegistrarOpen(true);
  };

  const closeRegistrarModal = () => {
    setRegistrarOpen(false);
    setPrefillVehicleId(null);
  };

  const handleRegistrarIngreso = async (data: Omit<Ingreso, 'id' | 'createdAt'>) => {
    const created = await addIngreso(data);
    if (created) closeRegistrarModal();
  };

  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const i of ingresos) {
      const y = Number(i.fecha.slice(0, 4));
      if (Number.isFinite(y) && y > 0) ys.add(y);
    }
    return [...ys].sort((a, b) => b - a);
  }, [ingresos]);

  const [chartYear, setChartYear] = useState<string>('');
  const [chartMonth, setChartMonth] = useState<string>('ALL');
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
    setChartMonth('ALL');
  }, [chartYear]);

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

  const chartMonthLabel = useMemo(() => {
    if (chartMonth === 'ALL') return '';
    return MESES.find((m) => String(m.value).padStart(2, '0') === chartMonth)?.label ?? '';
  }, [chartMonth]);

  const ingresosDelAnioGrafico = useMemo(() => {
    if (!Number.isFinite(chartYearNum)) return [];
    const prefix = `${chartYearNum}-`;
    return ingresos.filter((i) => i.fecha.startsWith(prefix));
  }, [ingresos, chartYearNum]);

  const ingresosVistaGrafico = useMemo(() => {
    if (chartMonth === 'ALL') return ingresosDelAnioGrafico;
    return ingresosDelAnioGrafico.filter((i) => i.fecha.slice(5, 7) === chartMonth);
  }, [ingresosDelAnioGrafico, chartMonth]);

  const totalAnioGrafico = ingresosDelAnioGrafico.reduce((s, i) => s + ingresoMontoPEN(i), 0);
  const totalVistaGrafico = ingresosVistaGrafico.reduce((s, i) => s + ingresoMontoPEN(i), 0);

  useEffect(() => {
    const from = prevTotalRef.current;
    const to = totalVistaGrafico;
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
  }, [totalVistaGrafico]);

  const chartData = useMemo(() => {
    if (chartMonth === 'ALL') {
      return MESES.map((mes) => {
        const month = String(mes.value).padStart(2, '0');
        const total = ingresosDelAnioGrafico
          .filter((i) => i.fecha.slice(5, 7) === month)
          .reduce((s, i) => s + ingresoMontoPEN(i), 0);
        return { mes: mes.label.slice(0, 3), total };
      });
    }
    if (!Number.isFinite(chartYearNum) || chartMonth.length !== 2) return [];
    const mNum = Number(chartMonth);
    if (!Number.isFinite(mNum) || mNum < 1 || mNum > 12) return [];
    const dMax = new Date(chartYearNum, mNum, 0).getDate();
    const mm = chartMonth.padStart(2, '0');
    return Array.from({ length: dMax }, (_, idx) => {
      const d = idx + 1;
      const dd = String(d).padStart(2, '0');
      const iso = `${chartYearNum}-${mm}-${dd}`;
      const total = ingresosDelAnioGrafico
        .filter((i) => i.fecha === iso)
        .reduce((s, i) => s + ingresoMontoPEN(i), 0);
      return { mes: String(d), total };
    });
  }, [chartMonth, chartYearNum, ingresosDelAnioGrafico]);

  const chartMonthAgg = useMemo(() => {
    if (chartMonth === 'ALL') return null;
    const rows = ingresosVistaGrafico;
    const count = rows.length;
    const total = rows.reduce((s, i) => s + ingresoMontoPEN(i), 0);
    const avgPerMov = count > 0 ? total / count : 0;
    return { count, total, avgPerMov };
  }, [chartMonth, ingresosVistaGrafico]);

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

  const monthFilterOptions = useMemo(
    () => [
      { value: 'ALL', label: 'Todo el año' },
      ...MESES.map((m) => ({
        value: String(m.value).padStart(2, '0'),
        label: m.label,
      })),
    ],
    [],
  );

  const vistaRankingLabel =
    chartMonth === 'ALL' ? chartYear || '—' : `${chartMonthLabel} ${chartYear || ''}`.trim();

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
    for (const i of ingresosVistaGrafico) {
      const raw = i.vehicleId;
      if (raw == null || !Number.isFinite(Number(raw))) continue;
      const id = Number(raw);
      const cur = map.get(id) ?? { total: 0, count: 0 };
      cur.total += ingresoMontoPEN(i);
      cur.count += 1;
      map.set(id, cur);
    }

    const seen = new Set<number>();
    const rows: Array<{ vehicleId: number; total: number; count: number }> = [];
    const byFleetOrder = [...vehicles].sort((a, b) => a.id - b.id);
    for (const v of byFleetOrder) {
      seen.add(v.id);
      const agg = map.get(v.id) ?? { total: 0, count: 0 };
      rows.push({ vehicleId: v.id, ...agg });
    }
    const orphanIds = [...map.keys()].filter((id) => !seen.has(id)).sort((a, b) => a - b);
    for (const id of orphanIds) {
      const agg = map.get(id)!;
      rows.push({ vehicleId: id, ...agg });
    }
    return rows;
  }, [ingresosVistaGrafico, vehicles]);

  const tipoRankingRows = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const i of ingresosVistaGrafico) {
      const key = i.tipo?.trim() ? i.tipo.trim() : '(Sin tipo)';
      const cur = map.get(key) ?? { total: 0, count: 0 };
      cur.total += ingresoMontoPEN(i);
      cur.count += 1;
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([nombre, agg]) => ({ nombre, ...agg }))
      .sort((a, b) => b.total - a.total);
  }, [ingresosVistaGrafico]);

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
            onClick={openRegistrarModal}
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

            <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
              <div className="rounded-xl border border-slate-100/95 bg-gradient-to-br from-white to-slate-50/80 p-3.5 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {chartMonth === 'ALL' ? `Total ${chartYear || 'año'}` : `Total ${chartMonthLabel || 'mes'}`}
                </p>
                <p className="mt-1.5 text-xl font-bold tabular-nums tracking-tight text-emerald-900 sm:text-2xl">
                  {formatCurrency(animatedTotal)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100/95 bg-gradient-to-br from-white to-slate-50/80 p-3.5 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-4">
                {chartMonth === 'ALL' ? (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Promedio mensual</p>
                    <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                      {formatCurrency(chartYearInsights.avgMonthly)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">Sobre 12 meses</p>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Movimientos</p>
                    <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                      {chartMonthAgg?.count ?? 0}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">En el mes filtrado</p>
                  </>
                )}
              </div>
              <div className="rounded-xl border border-slate-100/95 bg-gradient-to-br from-white to-slate-50/80 p-3.5 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-4">
                {chartMonth === 'ALL' ? (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mes más alto</p>
                    <p className="mt-1.5 text-sm font-bold capitalize leading-snug text-slate-900 sm:text-base">
                      {chartYearInsights.peakLabel}
                    </p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-slate-700 sm:text-lg">
                      {formatCurrency(chartYearInsights.peakTotal)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Promedio / movimiento
                    </p>
                    <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                      {formatCurrency(chartMonthAgg?.avgPerMov ?? 0)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">En el mes filtrado</p>
                  </>
                )}
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
              <div className="mt-4 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2 [&_.label]:mb-1 [&_.label]:text-xs [&_.label]:font-semibold [&_.label]:text-slate-600">
                <Select label="Año del gráfico y ranking" options={yearOptions} value={chartYear} onChange={setChartYear} />
                <Select
                  label="Mes (gráfico y ranking)"
                  options={monthFilterOptions}
                  value={chartMonth}
                  onChange={setChartMonth}
                />
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-400">Sin fechas para graficar.</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
            <div className="min-w-0 lg:col-span-5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {chartMonth === 'ALL' ? 'Tendencia mensual' : 'Tendencia por día'}
                </h2>
                <span className="text-xs font-medium tabular-nums text-slate-400">
                  {chartMonth === 'ALL' ? chartYear : `${chartMonthLabel} ${chartYear}`}
                </span>
              </div>
              <div className="h-[11rem] rounded-xl border border-slate-100 bg-gradient-to-b from-emerald-50/40 to-white px-1 pt-1 shadow-inner shadow-slate-900/[0.04] sm:h-44 lg:h-[14rem]">
                <Suspense fallback={<div className="h-full w-full animate-pulse rounded-lg bg-emerald-50/80" />}>
                  <IngresosMesChart
                    chartData={chartData}
                    bucket={chartMonth === 'ALL' ? 'month' : 'day'}
                  />
                </Suspense>
              </div>
            </div>

            <div className="flex min-w-0 flex-col border-t border-slate-100 pt-5 lg:col-span-7 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Ranking · {vistaRankingLabel}
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
                  Sin ingresos en {vistaRankingLabel} para este ranking.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-sm shadow-slate-900/[0.03]">
                  <div className="max-h-[min(280px,44vh)] overflow-y-auto lg:max-h-[min(300px,40vh)]">
                    <table className="min-w-full text-left text-[13px]">
                      <thead className="sticky top-0 z-[1] bg-slate-50/95 shadow-[0_1px_0_0_rgb(226_232_240)] backdrop-blur-sm">
                        <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {rankingDim === 'vehicle' ? (
                            <th className="w-12 py-2.5 pl-3 pr-1 font-semibold tabular-nums">ID</th>
                          ) : null}
                          <th className={`py-2.5 pr-2 font-semibold ${rankingDim === 'vehicle' ? 'pl-0' : 'pl-3'}`}>
                            {rankingDim === 'vehicle' ? 'Unidad' : 'Tipo de ingreso'}
                          </th>
                          <ColumnCountHintTh
                            hint="Cantidad de registros de ingreso en el período filtrado (año y, si aplica, mes del gráfico)."
                          />
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
                                <td className="py-2.5 pl-3 pr-1 font-mono text-xs font-bold tabular-nums text-slate-500">
                                  #{row.vehicleId}
                                </td>
                                <td className="py-2.5 pl-0 pr-2 font-medium leading-snug text-slate-900">
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
                          {rankingDim === 'vehicle' ? (
                            <td className="py-2.5 pl-3 pr-1" aria-hidden />
                          ) : null}
                          <td
                            className={`py-2.5 pr-2 text-sm font-bold text-slate-900 ${rankingDim === 'vehicle' ? 'pl-0' : 'pl-3'}`}
                          >
                            Total
                          </td>
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
              El año aquí solo afecta la tabla; el gráfico y el ranking usan «Año del gráfico y ranking» y «Mes (gráfico y ranking)».
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

      <Modal
        isOpen={registrarOpen}
        onClose={closeRegistrarModal}
        title="Registrar ingreso"
        size="xl"
      >
        <IncomeForm
          key={formInstanceKey}
          vehicles={vehicles}
          ingresos={ingresos}
          onSubmit={handleRegistrarIngreso}
          noCard
          prefillVehicleId={prefillVehicleId}
        />
      </Modal>
    </div>
  );
};

export default Ingresos;
