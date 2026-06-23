import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronLeft, Info } from 'lucide-react';
import Card from '../../components/Common/Card';
import Select from '../../components/Common/Select';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useAmountDisplay } from '../../hooks/useAmountDisplay';
import { useUtilidadRealCalculos } from '../../hooks/useUtilidadRealCalculos';
import { UTILIDAD_REAL_TOOLTIP } from '../../utils/utilidadReal';
import { formatVehicleLabelFull, formatVehicleIdFallback } from '../../utils/vehicleDisplayNumber';
import {
  UTILIDAD_OFICIAL_NOTA,
  UTILIDAD_SORT_OPTIONS,
  UTILIDAD_TABLA_PAGE_SIZE,
  availableMonthsFromMeses,
  availableYearsFromMeses,
  buildDistribucionGastosModulo,
  buildFilasVehiculoEnRango,
  buildInsightsVehiculos,
  buildMesesEvolucion,
  buildResumenEjecutivo,
  persistUtilidadModuloPrefs,
  readUtilidadModuloPrefs,
  resolvePeriodRange,
  sortFilasVehiculo,
  type UtilidadPeriodoModo,
  type UtilidadTablaSortKey,
  type UtilidadVistaModo,
} from '../../utils/utilidadModuloUi';

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function SortHeader({
  label,
  active,
  direction,
}: {
  label: string;
  active: boolean;
  direction: 'asc' | 'desc' | null;
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {label}
      {active && direction === 'desc' ? <ArrowDown size={12} className="opacity-70" /> : null}
      {active && direction === 'asc' ? <ArrowUp size={12} className="opacity-70" /> : null}
    </span>
  );
}

const UtilidadOperativa: React.FC = () => {
  const { formatGlobalAmount } = useAmountDisplay();
  const navigate = useNavigate();
  const { vehicles, ingresos, gastos, gastosFinancialSummary } = useRegistrosContext();
  const [prefs, setPrefs] = useState(readUtilidadModuloPrefs);

  const {
    porVehiculo,
    porMes,
    gastosReadyForUtilidad,
    isLoadingGastosFull,
    gastosEnMemoria,
    gastosLoadScope,
  } = useUtilidadRealCalculos({
    pantalla: 'UtilidadOperativa.buildUtilidadRealPorVehiculo',
    auditSampleVehicleIds: [1],
  });

  const periodo = prefs.periodo;
  const periodValue = prefs.periodValue;
  const vista = prefs.vista;
  const sortKey = prefs.sort;
  const page = prefs.page;

  const setPeriodo = useCallback((p: UtilidadPeriodoModo) => {
    const defYm = new Date().toISOString().slice(0, 7);
    const defY = defYm.slice(0, 4);
    const nextValue = p === 'anio' ? defY : p === 'mes' ? defYm : prefs.periodValue;
    persistUtilidadModuloPrefs({ periodo: p, periodValue: nextValue, page: 1 });
    setPrefs((prev) => ({ ...prev, periodo: p, periodValue: nextValue, page: 1 }));
  }, [prefs.periodValue]);

  const setPeriodValue = useCallback((v: string) => {
    persistUtilidadModuloPrefs({ periodValue: v, page: 1 });
    setPrefs((prev) => ({ ...prev, periodValue: v, page: 1 }));
  }, []);

  const setVista = useCallback((v: UtilidadVistaModo) => {
    persistUtilidadModuloPrefs({ vista: v });
    setPrefs((prev) => ({ ...prev, vista: v }));
  }, []);

  const setSort = useCallback((s: UtilidadTablaSortKey) => {
    persistUtilidadModuloPrefs({ sort: s, page: 1 });
    setPrefs((prev) => ({ ...prev, sort: s, page: 1 }));
  }, []);

  const setPage = useCallback((p: number) => {
    persistUtilidadModuloPrefs({ page: p });
    setPrefs((prev) => ({ ...prev, page: p }));
  }, []);

  const range = useMemo(
    () => resolvePeriodRange(periodo, periodValue),
    [periodo, periodValue],
  );
  const historico = periodo === 'historico';

  const resumen = useMemo(() => {
    if (!gastosReadyForUtilidad) return null;
    return buildResumenEjecutivo({
      vehicles,
      ingresos,
      gastos,
      desde: range.desde,
      hasta: range.hasta,
      historico,
      gastosFinancialSummary,
    });
  }, [
    gastosReadyForUtilidad,
    vehicles,
    ingresos,
    gastos,
    range.desde,
    range.hasta,
    historico,
    gastosFinancialSummary,
  ]);

  const mesesEvolucion = useMemo(() => {
    if (!gastosReadyForUtilidad) return [];
    return buildMesesEvolucion(porMes, periodo, periodValue);
  }, [gastosReadyForUtilidad, porMes, periodo, periodValue]);

  const distribucion = useMemo(() => {
    if (!gastosReadyForUtilidad) return [];
    return buildDistribucionGastosModulo(
      gastos,
      range.desde,
      range.hasta,
      historico,
      gastosFinancialSummary,
    );
  }, [gastosReadyForUtilidad, gastos, range.desde, range.hasta, historico, gastosFinancialSummary]);

  const filasBase = useMemo(() => {
    if (!gastosReadyForUtilidad) return [];
    return buildFilasVehiculoEnRango(
      vehicles,
      ingresos,
      gastos,
      range.desde,
      range.hasta,
      historico,
      porVehiculo,
    );
  }, [
    gastosReadyForUtilidad,
    vehicles,
    ingresos,
    gastos,
    range.desde,
    range.hasta,
    historico,
    porVehiculo,
  ]);

  const filasSorted = useMemo(() => sortFilasVehiculo(filasBase, sortKey), [filasBase, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filasSorted.length / UTILIDAD_TABLA_PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages, setPage]);

  const filasPage = useMemo(() => {
    const start = (pageSafe - 1) * UTILIDAD_TABLA_PAGE_SIZE;
    return filasSorted.slice(start, start + UTILIDAD_TABLA_PAGE_SIZE);
  }, [filasSorted, pageSafe]);

  const insights = useMemo(
    () => buildInsightsVehiculos(filasBase, formatGlobalAmount),
    [filasBase, formatGlobalAmount],
  );

  const yearOptions = useMemo(
    () => availableYearsFromMeses(porMes).map((y) => ({ value: String(y), label: String(y) })),
    [porMes],
  );
  const monthOptions = useMemo(() => availableMonthsFromMeses(porMes), [porMes]);

  const loadingBanner = isLoadingGastosFull || !gastosReadyForUtilidad;
  const sortDir: 'asc' | 'desc' | null = sortKey.endsWith('_asc')
    ? 'asc'
    : sortKey.endsWith('_desc')
      ? 'desc'
      : null;

  const vehicleLabel = (id: number, placa?: string) => {
    const v = vehicles.find((x) => x.id === id);
    if (v) return formatVehicleLabelFull(v);
    return placa ? formatVehicleIdFallback(id) + ` ${placa}` : formatVehicleIdFallback(id);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-10 animate-fade-in">
      <header className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate('/finanzas')}
          className="mt-0.5 shrink-0 rounded-xl p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Volver a Finanzas"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600/90">Finanzas</p>
          <h1 className="text-2xl font-bold text-slate-900">Utilidad</h1>
          <p className="mt-1 text-sm text-slate-600">{UTILIDAD_REAL_TOOLTIP}</p>
        </div>
      </header>

      <div className="rounded-xl border border-violet-200/80 bg-violet-50/50 px-4 py-3 text-sm text-violet-950">
        <p className="font-medium">{UTILIDAD_OFICIAL_NOTA}</p>
        <p className="mt-1 text-xs text-violet-900/80">
          Los datos importados desde Excel permanecen en{' '}
          <Link to="/finanzas/caja-negocio" className="font-semibold underline">
            Caja negocio
          </Link>{' '}
          solo como referencia; podrán eliminarse en una fase posterior.
        </p>
      </div>

      {loadingBanner ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
          {isLoadingGastosFull
            ? `Cargando histórico completo de gastos (${gastosEnMemoria} en memoria, scope=${gastosLoadScope})…`
            : 'Preparando histórico completo de gastos…'}
        </p>
      ) : (
        <p className="rounded-lg border border-emerald-200/80 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-900">
          Gastos completos en memoria ({gastosEnMemoria} registros). Período: {range.label}.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-slate-500">Período</span>
          {(['mes', 'anio', 'historico'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodo(p)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                periodo === p
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {p === 'mes' ? 'Mes' : p === 'anio' ? 'Año' : 'Histórico'}
            </button>
          ))}
        </div>
        {periodo === 'mes' ? (
          <div className="min-w-[160px]">
            <Select
              label="Mes"
              value={periodValue}
              onChange={setPeriodValue}
              options={
                monthOptions.length > 0
                  ? monthOptions
                  : [{ value: periodValue, label: periodValue }]
              }
            />
          </div>
        ) : null}
        {periodo === 'anio' ? (
          <div className="min-w-[120px]">
            <Select
              label="Año"
              value={periodValue}
              onChange={setPeriodValue}
              options={yearOptions}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 ml-auto">
          <span className="w-full text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:w-auto sm:mr-2 sm:mt-6">
            Vista
          </span>
          {(['operativa', 'global'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVista(v)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                vista === v
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {v === 'operativa' ? 'Operativa' : 'Global'}
            </button>
          ))}
        </div>
      </div>

      {resumen ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div
            className={`rounded-2xl border p-4 shadow-sm transition ${
              vista === 'operativa' ? 'border-emerald-300 ring-2 ring-emerald-200/60' : 'border-emerald-200'
            } bg-emerald-50/60`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">Utilidad operativa</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-950">
              {loadingBanner ? '…' : formatGlobalAmount(resumen.operativa.utilidad)}
            </p>
            <dl className="mt-3 space-y-1 text-xs text-emerald-900/90">
              <div className="flex justify-between gap-2">
                <dt>Ingresos</dt>
                <dd className="tabular-nums font-medium">{formatGlobalAmount(resumen.operativa.ingresos)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Gastos</dt>
                <dd className="tabular-nums font-medium">{formatGlobalAmount(resumen.operativa.gastos)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Margen</dt>
                <dd className="tabular-nums font-semibold">{fmtPct(resumen.operativa.margenPct)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-[10px] text-emerald-800/70">Σ ingresos vehículo − Σ gastos operativos vehículo</p>
          </div>

          <div
            className={`rounded-2xl border p-4 shadow-sm transition ${
              vista === 'global' ? 'border-blue-300 ring-2 ring-blue-200/60' : 'border-blue-200'
            } bg-blue-50/60`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-blue-800">Utilidad global</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-blue-950">
              {loadingBanner ? '…' : formatGlobalAmount(resumen.global.utilidad)}
            </p>
            <dl className="mt-3 space-y-1 text-xs text-blue-900/90">
              <div className="flex justify-between gap-2">
                <dt>Ingresos</dt>
                <dd className="tabular-nums font-medium">{formatGlobalAmount(resumen.global.ingresos)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Gastos totales</dt>
                <dd className="tabular-nums font-medium">{formatGlobalAmount(resumen.global.gastos)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Margen global</dt>
                <dd className="tabular-nums font-semibold">{fmtPct(resumen.global.margenPct)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-[10px] text-blue-800/70">Ingresos − todos los gastos del negocio</p>
          </div>

          <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-orange-800">Impacto no operativo</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-orange-950">
              {loadingBanner ? '…' : formatGlobalAmount(resumen.impactoNoOperativo)}
            </p>
            <p className="mt-3 text-xs text-orange-900/90">
              Diferencia entre utilidad operativa y global: lo que sale del margen por gastos no operativos del
              negocio.
            </p>
            <p className="mt-2 text-[10px] text-orange-800/70">Operativa − global</p>
          </div>
        </div>
      ) : null}

      <Card
        title="Evolución de utilidad"
        subtitle={`${range.label} · comparación vs mes anterior`}
        compact
      >
        {loadingBanner ? (
          <p className="text-sm text-slate-500">Cargando datos…</p>
        ) : mesesEvolucion.length === 0 ? (
          <p className="text-sm text-slate-500">Sin movimientos en el período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Mes</th>
                  <th className="py-2 text-right">Ingresos</th>
                  <th className="py-2 text-right">Gastos</th>
                  <th className="py-2 text-right">Utilidad</th>
                  <th className="py-2 text-right">Margen %</th>
                  <th className="py-2 text-right">Variación %</th>
                </tr>
              </thead>
              <tbody>
                {[...mesesEvolucion].reverse().map((m) => (
                  <tr key={m.mes} className="border-b border-slate-50">
                    <td className="py-2 pr-3 font-medium text-slate-800">{m.mesLabel}</td>
                    <td className="py-2 text-right tabular-nums text-emerald-800">{formatGlobalAmount(m.ingresos)}</td>
                    <td className="py-2 text-right tabular-nums text-red-700">{formatGlobalAmount(m.gastos)}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatGlobalAmount(m.utilidadReal)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{fmtPct(m.margenPct)}</td>
                    <td
                      className={`py-2 text-right tabular-nums font-medium ${
                        m.variacionPct != null && m.variacionPct >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {fmtPct(m.variacionPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {insights.length > 0 ? (
        <section>
          <h2 className="text-lg font-bold text-slate-800">Insights</h2>
          <p className="text-sm text-slate-600 mb-3">Destacados del período · clic para abrir vehículo</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {insights.map((ins) => (
              <button
                key={ins.id}
                type="button"
                onClick={() => navigate(`/vehiculos/${ins.vehicleId}`)}
                className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-violet-300 hover:shadow-md"
              >
                <p className="text-lg" aria-hidden>
                  {ins.emoji}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{ins.title}</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{ins.value}</p>
                <p className="text-sm text-violet-800">{vehicleLabel(ins.vehicleId, ins.placa)}</p>
                {ins.sub ? <p className="mt-1 text-xs text-slate-500">{ins.sub}</p> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <Card title="Distribución de gastos" subtitle={range.label} compact>
        {loadingBanner ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : distribucion.length === 0 ? (
          <p className="text-sm text-slate-500">Sin gastos en el período.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              {distribucion.map((d) => (
                <div key={d.key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-slate-800">{d.label}</span>
                    <span className="tabular-nums text-slate-600">
                      {formatGlobalAmount(d.monto)} · {d.pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500/80"
                      style={{ width: `${Math.min(100, d.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 flex items-start gap-1">
              <Info size={14} className="shrink-0 mt-0.5" />
              Total gastos del período:{' '}
              {formatGlobalAmount(distribucion.reduce((s, d) => s + d.monto, 0))}
            </p>
          </div>
        )}
      </Card>

      <Card title="Utilidad por vehículo" subtitle={range.label} compact>
        <div className="mb-3 flex flex-wrap gap-3 items-end">
          <div className="min-w-[200px] flex-1">
            <Select
              label="Ordenar por"
              value={sortKey}
              onChange={(v) => setSort(v as UtilidadTablaSortKey)}
              options={UTILIDAD_SORT_OPTIONS}
            />
          </div>
          <p className="text-xs text-slate-500 pb-1">
            {filasSorted.length} vehículos · página {pageSafe} de {totalPages}
          </p>
        </div>
        {loadingBanner ? (
          <p className="text-sm text-slate-500 py-6 text-center">Cargando histórico de gastos…</p>
        ) : filasPage.length === 0 ? (
          <p className="text-sm text-slate-500">Sin vehículos activos con movimientos.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-2 w-10">#</th>
                    <th className="py-2 pr-3">
                      <SortHeader label="Vehículo" active={sortKey === 'placa_asc'} direction={sortDir} />
                    </th>
                    <th className="py-2 text-right">
                      <SortHeader label="Ingresos" active={sortKey === 'ingreso_desc'} direction={sortDir} />
                    </th>
                    <th className="py-2 text-right">
                      <SortHeader label="Gastos" active={sortKey === 'gasto_desc'} direction={sortDir} />
                    </th>
                    <th className="py-2 text-right">
                      <SortHeader
                        label="Utilidad"
                        active={sortKey === 'utilidad_desc' || sortKey === 'utilidad_asc'}
                        direction={sortDir}
                      />
                    </th>
                    <th className="py-2 text-right">
                      <SortHeader
                        label="Margen %"
                        active={sortKey === 'margen_desc' || sortKey === 'margen_asc'}
                        direction={sortDir}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filasPage.map((row, idx) => (
                    <tr key={row.vehicleId} className="border-b border-slate-50">
                      <td className="py-2 text-slate-400 tabular-nums">
                        {(pageSafe - 1) * UTILIDAD_TABLA_PAGE_SIZE + idx + 1}
                      </td>
                      <td className="py-2 pr-3">
                        <Link
                          to={`/vehiculos/${row.vehicleId}`}
                          className="font-medium text-violet-800 hover:underline"
                        >
                          {vehicleLabel(row.vehicleId, row.placa)}
                        </Link>
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatGlobalAmount(row.ingresosTotal)}</td>
                      <td className="py-2 text-right tabular-nums">{formatGlobalAmount(row.gastosTotal)}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">
                        {formatGlobalAmount(row.utilidadReal)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-600">{fmtPct(row.margenPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 ? (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={pageSafe <= 1}
                  onClick={() => setPage(pageSafe - 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-sm disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="text-sm text-slate-600 tabular-nums">
                  {pageSafe} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={pageSafe >= totalPages}
                  onClick={() => setPage(pageSafe + 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-sm disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
};

export default UtilidadOperativa;
