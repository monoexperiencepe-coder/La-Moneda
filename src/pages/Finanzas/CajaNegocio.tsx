import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarRange, ChevronLeft, Download } from 'lucide-react';
import Card from '../../components/Common/Card';
import Input from '../../components/Common/Input';
import Select from '../../components/Common/Select';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatCurrency, formatDateLong, todayStr, toDateOnlyString } from '../../utils/formatting';
import type { CajaNegocioVehiculo } from '../../data/types';
import MonthlyBarChartCard from '../../components/Charts/MonthlyBarChartCard';
import { MESES } from '../../data/catalogs';
import { vehicleIdSortRank } from '../../utils/sortByVehicle';

function inRange(fecha: string, desde: string, hasta: string): boolean {
  const d = toDateOnlyString(fecha);
  if (!d) return false;
  return d >= desde && d <= hasta;
}

function inclusiveMonthSpan(desde: string, hasta: string): number {
  const d = toDateOnlyString(desde).trim() || '2000-01-01';
  const h = toDateOnlyString(hasta).trim() || d;
  const y1 = Number(d.slice(0, 4));
  const m1 = Number(d.slice(5, 7)) - 1;
  const y2 = Number(h.slice(0, 4));
  const m2 = Number(h.slice(5, 7)) - 1;
  if (!Number.isFinite(y1) || !Number.isFinite(m1) || !Number.isFinite(y2) || !Number.isFinite(m2)) return 1;
  const months = (y2 - y1) * 12 + (m2 - m1) + 1;
  return Number.isFinite(months) && months > 0 ? months : 1;
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 px-2 py-2 text-center sm:px-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px]">{label}</p>
      <p className="mt-1 truncate text-sm font-bold tabular-nums text-slate-900 sm:text-base">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[10px] font-medium capitalize text-slate-500">{hint}</p> : null}
    </div>
  );
}

const CajaNegocio: React.FC = () => {
  const navigate = useNavigate();
  const { cajaNegocioVehiculo, vehicles } = useRegistrosContext();

  const t = todayStr();
  const [desde, setDesde] = useState(() => t.slice(0, 7) + '-01');
  const [hasta, setHasta] = useState(t);
  const [filterVehicleId, setFilterVehicleId] = useState('');
  const [filterYear, setFilterYear] = useState<string>('ALL');
  const [chartYear, setChartYear] = useState<string>('');

  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const row of cajaNegocioVehiculo) {
      const y = Number(toDateOnlyString(row.fecha).slice(0, 4));
      if (Number.isFinite(y) && y > 0) ys.add(y);
    }
    return [...ys].sort((a, b) => b - a);
  }, [cajaNegocioVehiculo]);

  const yearOptions = useMemo(
    () => [{ value: 'ALL', label: 'Todos los años' }, ...availableYears.map((y) => ({ value: String(y), label: String(y) }))],
    [availableYears],
  );

  const chartYearOptions = useMemo(
    () => availableYears.map((y) => ({ value: String(y), label: String(y) })),
    [availableYears],
  );

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

  const chartYearNum = chartYear ? Number(chartYear) : NaN;

  const movimientosAnioGrafico = useMemo(() => {
    if (!Number.isFinite(chartYearNum)) return [];
    const prefix = `${chartYearNum}-`;
    const vid = filterVehicleId ? Number(filterVehicleId) : null;
    return cajaNegocioVehiculo.filter((row) => {
      const d = toDateOnlyString(row.fecha);
      if (!d.startsWith(prefix)) return false;
      if (vid != null && Number.isFinite(vid) && row.vehicleId !== vid) return false;
      return true;
    });
  }, [cajaNegocioVehiculo, chartYearNum, filterVehicleId]);

  const chartData = useMemo(() => {
    return MESES.map((mes) => {
      const month = String(mes.value).padStart(2, '0');
      const total = movimientosAnioGrafico
        .filter((row) => toDateOnlyString(row.fecha).slice(5, 7) === month)
        .reduce((s, row) => s + row.monto, 0);
      return { mes: mes.label.slice(0, 3), total };
    });
  }, [movimientosAnioGrafico]);

  useEffect(() => {
    if (availableYears.length === 0) {
      setFilterYear('ALL');
      return;
    }
    setFilterYear((prev) => {
      if (prev === 'ALL') return prev;
      const n = Number(prev);
      if (Number.isFinite(n) && availableYears.includes(n)) return prev;
      return 'ALL';
    });
  }, [availableYears]);

  const vehicleOptions = useMemo(
    () => [
      { value: '', label: 'Toda la flota' },
      ...[...vehicles].sort((a, b) => a.id - b.id).map((v) => ({
        value: String(v.id),
        label: `${v.placa} · ${v.marca} ${v.modelo}`,
      })),
    ],
    [vehicles],
  );

  const filtrados = useMemo(() => {
    let d = desde.trim();
    let h = hasta.trim();
    if (!d) d = '2000-01-01';
    if (!h) h = todayStr();
    if (d > h) [d, h] = [h, d];
    const vid = filterVehicleId ? Number(filterVehicleId) : null;
    const yearPrefix = filterYear !== 'ALL' ? `${filterYear}-` : null;
    const rows = cajaNegocioVehiculo.filter((row) => {
      if (yearPrefix && !toDateOnlyString(row.fecha).startsWith(yearPrefix)) return false;
      if (!inRange(row.fecha, d, h)) return false;
      if (vid != null && Number.isFinite(vid) && row.vehicleId !== vid) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      const vr = vehicleIdSortRank(a.vehicleId) - vehicleIdSortRank(b.vehicleId);
      if (vr !== 0) return vr;
      const fd = b.fecha.localeCompare(a.fecha);
      if (fd !== 0) return fd;
      return b.id - a.id;
    });
  }, [cajaNegocioVehiculo, desde, hasta, filterVehicleId, filterYear]);

  const totalFiltrado = useMemo(() => filtrados.reduce((s, x) => s + x.monto, 0), [filtrados]);
  const totalGlobal = useMemo(() => cajaNegocioVehiculo.reduce((s, x) => s + x.monto, 0), [cajaNegocioVehiculo]);

  const filteredPeriodInsights = useMemo(() => {
    let d = desde.trim();
    let h = hasta.trim();
    if (!d) d = '2000-01-01';
    if (!h) h = todayStr();
    if (d > h) [d, h] = [h, d];
    const monthsSpan = inclusiveMonthSpan(d, h);
    const avgMonthly = totalFiltrado / monthsSpan;
    const byMonth = new Map<string, number>();
    for (const row of filtrados) {
      const fd = toDateOnlyString(row.fecha);
      const key = fd.slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + row.monto);
    }
    let peakKey = '';
    let peakTotal = 0;
    for (const [k, v] of byMonth) {
      if (v > peakTotal) {
        peakTotal = v;
        peakKey = k;
      }
    }
    let peakLabel = '—';
    if (peakKey && peakTotal > 0) {
      const mm = peakKey.slice(5, 7);
      const y = peakKey.slice(0, 4);
      const mesNombre = MESES.find((m) => String(m.value).padStart(2, '0') === mm)?.label;
      peakLabel = mesNombre ? `${mesNombre.slice(0, 3)} ${y}` : peakKey;
    }
    const today = todayStr();
    const todayInPeriod = filtrados
      .filter((r) => toDateOnlyString(r.fecha) === today)
      .reduce((s, r) => s + r.monto, 0);
    return { monthsSpan, avgMonthly, peakLabel, peakTotal, todayInPeriod };
  }, [filtrados, desde, hasta, totalFiltrado]);

  const rangoHistorialCompleto = useMemo(() => {
    const hoy = todayStr();
    if (!cajaNegocioVehiculo.length) return { desde: '2000-01-01', hasta: hoy };
    let min = '';
    let max = '';
    for (const row of cajaNegocioVehiculo) {
      const d = toDateOnlyString(row.fecha);
      if (!d) continue;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    }
    return { desde: min || '2000-01-01', hasta: max || hoy };
  }, [cajaNegocioVehiculo]);

  const verTodoElHistorial = useCallback(() => {
    setDesde(rangoHistorialCompleto.desde);
    setHasta(rangoHistorialCompleto.hasta);
    setFilterYear('ALL');
    setFilterVehicleId('');
  }, [rangoHistorialCompleto]);

  const mostrandoHistorialCompleto =
    cajaNegocioVehiculo.length > 0 &&
    filterYear === 'ALL' &&
    filterVehicleId === '' &&
    desde === rangoHistorialCompleto.desde &&
    hasta === rangoHistorialCompleto.hasta;

  const listadoCoincideAnioGrafico =
    Boolean(chartYear) &&
    filterYear === chartYear &&
    desde === `${chartYear}-01-01` &&
    hasta === `${chartYear}-12-31`;

  const syncListadoConAnioGrafico = useCallback(() => {
    if (!chartYear || !availableYears.includes(Number(chartYear))) return;
    setFilterYear(chartYear);
    setDesde(`${chartYear}-01-01`);
    setHasta(`${chartYear}-12-31`);
  }, [chartYear, availableYears]);

  const periodoEtiqueta = useMemo(() => {
    let d = desde.trim();
    let h = hasta.trim();
    if (!d) d = '2000-01-01';
    if (!h) h = todayStr();
    if (d > h) [d, h] = [h, d];
    return `${formatDateLong(d)} → ${formatDateLong(h)}`;
  }, [desde, hasta]);

  const vehiculoEtiqueta = filterVehicleId
    ? vehicles.find((v) => String(v.id) === filterVehicleId)?.placa ?? `#${filterVehicleId}`
    : 'Toda la flota';

  const labelVehiculo = (vehicleId: number) => {
    const v = vehicles.find((x) => x.id === vehicleId);
    return v ? `${v.placa} · ${v.marca} ${v.modelo}` : `#${vehicleId}`;
  };

  const exportCsv = useCallback(() => {
    const header = ['id', 'vehicle_id', 'fecha', 'concepto', 'monto', 'origen_gasto_id', 'comentarios'];
    const lines = [header.join(';')];
    for (const x of filtrados) {
      lines.push(
        [
          x.id,
          x.vehicleId,
          x.fecha,
          `"${String(x.concepto).replace(/"/g, '""')}"`,
          x.monto.toFixed(2),
          x.origenGastoId ?? '',
          `"${String(x.comentarios).replace(/"/g, '""')}"`,
        ].join(';'),
      );
    }
    const bom = '\ufeff';
    const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const yPart = filterYear !== 'ALL' ? `${filterYear}_` : '';
    a.download = `caja_negocio_${yPart}${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [filtrados, desde, hasta, filterYear]);

  const emptyHint = (
    <details className="mt-4 max-w-lg rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-600">
      <summary className="cursor-pointer font-medium text-slate-700">Soy administrador (migración / datos)</summary>
      <p className="mt-2 leading-relaxed">
        Si el origen es importación desde gastos: migración SQL y script{' '}
        <code className="rounded bg-white px-1 py-0.5 text-[10px] ring-1 ring-slate-200">mover_caja_negocio_desde_gastos.mjs</code>.
      </p>
    </details>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-fade-in pb-8">
      {/* Cabecera mínima */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => navigate('/finanzas')}
            className="mt-0.5 shrink-0 rounded-xl p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Volver"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Utilidad histórica por vehículo
            </h1>
          </div>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 sm:text-sm"
        >
          <Download size={16} className="text-slate-600" />
          <span className="hidden sm:inline">CSV</span>
        </button>
      </div>

      {/* 1 — Lo único que debe leer primero: total del período */}
      <section className="rounded-2xl border border-teal-200/70 bg-gradient-to-b from-teal-50/90 to-white p-5 shadow-sm sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-900/80">En el período que eliges abajo</p>
        <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-teal-950 sm:text-4xl">
          {formatCurrency(totalFiltrado)}
        </p>
        <p className="mt-3 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">{filtrados.length}</span> movimiento{filtrados.length === 1 ? '' : 's'}
          <span className="mx-2 text-slate-300">·</span>
          {periodoEtiqueta}
          <span className="mx-2 text-slate-300">·</span>
          <span className="font-medium text-slate-800">{vehiculoEtiqueta}</span>
        </p>

        <div className="mt-6 grid grid-cols-3 rounded-xl border border-teal-100/80 bg-white/80 divide-x divide-teal-100">
          <MiniStat label="Hoy (en ese período)" value={formatCurrency(filteredPeriodInsights.todayInPeriod)} />
          <MiniStat
            label="Mejor mes"
            value={filteredPeriodInsights.peakTotal > 0 ? formatCurrency(filteredPeriodInsights.peakTotal) : '—'}
            hint={filteredPeriodInsights.peakTotal > 0 ? filteredPeriodInsights.peakLabel : undefined}
          />
          <MiniStat label="Promedio / mes" value={formatCurrency(filteredPeriodInsights.avgMonthly)} />
        </div>
        <p className="mt-2 text-center text-[10px] text-slate-500">
          Promedio = total ÷ {filteredPeriodInsights.monthsSpan} mes{filteredPeriodInsights.monthsSpan === 1 ? '' : 'es'} entre las
          fechas elegidas.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-teal-100/80 pt-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Todo lo cargado en el sistema</p>
            <p className="text-lg font-bold tabular-nums text-slate-800">{formatCurrency(totalGlobal)}</p>
          </div>
        </div>
      </section>

      {/* 2 — Período: siempre visible, sin acordeón */}
      <section>
        <h2 className="mb-3 text-sm font-bold text-slate-800">¿Qué movimientos quieres ver?</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Año (atajo)"
              options={yearOptions}
              value={filterYear}
              onChange={(v) => {
                setFilterYear(v);
                if (v !== 'ALL') {
                  setDesde(`${v}-01-01`);
                  setHasta(`${v}-12-31`);
                }
              }}
            />
            <Input label="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            <Input label="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            <Select label="Vehículo" options={vehicleOptions} value={filterVehicleId} onChange={setFilterVehicleId} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={verTodoElHistorial}
              disabled={cajaNegocioVehiculo.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 disabled:opacity-40"
            >
              <CalendarRange size={16} />
              Ver todo
            </button>
          </div>
          {mostrandoHistorialCompleto && (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Estás viendo los <strong>{cajaNegocioVehiculo.length}</strong> registros cargados. Acota por año o vehículo si
              necesitas menos filas.
            </p>
          )}
        </div>
      </section>

      {/* 3 — Gráfico: solo tendencia */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-800">Cómo se reparte en el año</h2>
        <p className="mb-3 text-xs text-slate-500">
          Barras = suma por mes. El vehículo del recuadro anterior también filtra este gráfico.
        </p>
        <MonthlyBarChartCard
          title="Por mes"
          subtitle="Elige el año del gráfico. La tabla puede usar otro rango de fechas."
          chartYear={chartYear}
          onChartYearChange={setChartYear}
          yearOptions={chartYearOptions}
          chartData={chartData}
          tooltipSeriesName="Utilidad histórica"
          variant="teal"
          yearSelectLabel="Año del gráfico"
          showMonthTotalsGrid={false}
        />
        {!listadoCoincideAnioGrafico && chartYear && availableYears.includes(Number(chartYear)) ? (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={syncListadoConAnioGrafico}
              className="text-sm font-semibold text-teal-800 underline decoration-teal-300 underline-offset-2 hover:text-teal-950"
            >
              Igualar la tabla al año {chartYear} (1 enero – 31 diciembre)
            </button>
          </div>
        ) : null}
      </section>

      {/* 4 — Lista */}
      <section>
        <h2 className="mb-3 text-sm font-bold text-slate-800">Detalle</h2>
        <Card title="" padding={false}>
          <div className="block px-3 py-3 md:hidden">
            {filtrados.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-slate-700">No hay movimientos con estos filtros.</p>
                <p className="mt-2 text-xs text-slate-500">Amplía fechas o pulsa «Ver todo».</p>
                {emptyHint}
              </div>
            ) : (
              <div className="space-y-2.5">
                {filtrados.map((row: CajaNegocioVehiculo) => (
                  <div key={row.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-500">{labelVehiculo(row.vehicleId)}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">{formatDateLong(toDateOnlyString(row.fecha))}</p>
                      </div>
                      <p className="shrink-0 text-sm font-bold tabular-nums text-teal-900">{formatCurrency(row.monto)}</p>
                    </div>
                    <p className="mt-2 text-sm text-slate-900">{row.concepto}</p>
                    {row.comentarios ? <p className="mt-1 text-xs text-slate-500">{row.comentarios}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Vehículo</th>
                  <th className="px-4 py-3">Concepto</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="hidden max-w-[200px] px-4 py-3 lg:table-cell">Nota</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center">
                      <p className="text-sm text-slate-700">No hay movimientos con estos filtros.</p>
                      <p className="mt-2 text-xs text-slate-500">Amplía fechas o pulsa «Ver todo».</p>
                      {emptyHint}
                    </td>
                  </tr>
                ) : (
                  filtrados.map((row: CajaNegocioVehiculo) => (
                    <tr key={row.id} className="border-b border-slate-50 hover:bg-teal-50/30">
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                        {formatDateLong(toDateOnlyString(row.fecha))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">{labelVehiculo(row.vehicleId)}</td>
                      <td className="max-w-md px-4 py-2.5 text-slate-900">
                        <span className="line-clamp-2" title={row.concepto}>
                          {row.concepto}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-teal-900">
                        {formatCurrency(row.monto)}
                      </td>
                      <td className="hidden max-w-[200px] px-4 py-2.5 text-xs text-slate-500 lg:table-cell">
                        <span className="line-clamp-2" title={row.comentarios || undefined}>
                          {row.comentarios || '—'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <footer className="border-t border-slate-200 pt-6 text-center text-sm text-slate-600">
        <span className="font-medium text-slate-700">¿Margen o reportes mensuales?</span>{' '}
        <Link className="font-semibold text-teal-800 underline underline-offset-2 hover:text-teal-950" to="/finanzas/reportes">
          Reportes
        </Link>
        {' · '}
        <Link className="font-semibold text-teal-800 underline underline-offset-2 hover:text-teal-950" to="/vehiculos">
          Unidades
        </Link>
      </footer>
    </div>
  );
};

export default CajaNegocio;
