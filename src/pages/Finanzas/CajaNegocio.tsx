import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarRange, ChevronDown, ChevronLeft, Download, ListFilter } from 'lucide-react';
import Card from '../../components/Common/Card';
import Input from '../../components/Common/Input';
import Select from '../../components/Common/Select';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatCurrency, formatDate, todayStr, toDateOnlyString } from '../../utils/formatting';
import type { CajaNegocioVehiculo } from '../../data/types';
import MonthlyBarChartCard from '../../components/Charts/MonthlyBarChartCard';
import { MESES } from '../../data/catalogs';
import { vehicleIdSortRank } from '../../utils/sortByVehicle';

function inRange(fecha: string, desde: string, hasta: string): boolean {
  const d = toDateOnlyString(fecha);
  if (!d) return false;
  return d >= desde && d <= hasta;
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
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

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
      { value: '', label: 'Todos los vehículos' },
      ...[...vehicles].sort((a, b) => a.id - b.id).map((v) => ({
        value: String(v.id),
        label: `#${v.id} ${v.marca} ${v.modelo} (${v.placa})`,
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

  const labelVehiculo = (vehicleId: number) => {
    const v = vehicles.find((x) => x.id === vehicleId);
    return v ? `#${v.id} ${v.placa}` : `#${vehicleId}`;
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/finanzas')}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 shrink-0"
            aria-label="Volver"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🏪 Caja negocio</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Utilidad / caja registrada por vehículo. No es gasto operativo ni ingreso de arriendo; no entra en la pantalla{' '}
              <strong>Gastos</strong>.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold shadow-sm"
        >
          <Download size={16} />
          Exportar CSV
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-teal-200 bg-teal-50/80 p-4">
          <p className="text-xs text-teal-900 font-medium mb-1">Total (filtros activos)</p>
          <p className="text-2xl font-bold text-teal-950 tabular-nums">{formatCurrency(totalFiltrado)}</p>
          <p className="text-[11px] text-teal-800 mt-1">{filtrados.length} movimiento{filtrados.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-soft">
          <p className="text-xs text-gray-500 font-medium mb-1">Total cargado (empresa)</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatCurrency(totalGlobal)}</p>
          <p className="text-[11px] text-gray-500 mt-1">{cajaNegocioVehiculo.length} registro{cajaNegocioVehiculo.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <MonthlyBarChartCard
        title="Rendimiento mensual"
        subtitle="Totales por mes del año calendario elegido."
        footerHint='Si eliges un vehículo en filtros, el gráfico muestra solo ese vehículo; «Todos los vehículos» suma la flota.'
        chartYear={chartYear}
        onChartYearChange={setChartYear}
        yearOptions={chartYearOptions}
        chartData={chartData}
        tooltipSeriesName="Caja negocio"
        variant="teal"
      />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltrosAbiertos((v) => !v)}
            aria-expanded={filtrosAbiertos}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 transition-colors"
          >
            <ListFilter size={18} className="text-teal-700 shrink-0" aria-hidden />
            Filtros
            <ChevronDown
              size={16}
              className={`text-gray-500 shrink-0 transition-transform duration-200 ${filtrosAbiertos ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={verTodoElHistorial}
            disabled={cajaNegocioVehiculo.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-gradient-to-b from-teal-50 to-teal-100/90 px-4 py-2.5 text-sm font-semibold text-teal-950 shadow-sm hover:border-teal-300 hover:from-teal-100 hover:to-teal-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 transition-colors"
            title={cajaNegocioVehiculo.length === 0 ? 'Sin datos' : 'Ver todos los movimientos cargados (sin acotar año ni vehículo)'}
          >
            <CalendarRange size={17} className="shrink-0 opacity-90" strokeWidth={2} aria-hidden />
            Todo el historial
          </button>
        </div>
        {!filtrosAbiertos && (
          <p className="text-xs text-gray-500 pl-0.5">
            Año:{' '}
            <span className="font-medium text-gray-700">{filterYear === 'ALL' ? 'Todos los años' : filterYear}</span>
            {' · '}
            Rango: <span className="font-medium text-gray-700">{desde}</span> → <span className="font-medium text-gray-700">{hasta}</span>
            {' · '}
            Vehículo:{' '}
            <span className="font-medium text-gray-700">
              {filterVehicleId
                ? vehicles.find((v) => String(v.id) === filterVehicleId)?.placa ?? `#${filterVehicleId}`
                : 'Todos'}
            </span>
            {' · '}
            <button
              type="button"
              onClick={() => setFiltrosAbiertos(true)}
              className="text-teal-700 hover:text-teal-900 underline underline-offset-2 font-medium"
            >
              Cambiar filtros
            </button>
          </p>
        )}
      </div>

      {filtrosAbiertos && (
        <Card
          title="Filtros"
          subtitle="El año restringe por calendario y, si eliges un año distinto de «Todos», se ajustan Desde/Hasta a todo ese año. Vehículo y fechas siguen aplicando encima."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Select
              label="Año"
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
          {mostrandoHistorialCompleto && (
            <p className="mt-3 text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
              Mostrando todos los movimientos cargados ({cajaNegocioVehiculo.length} registros). Usa año, fechas o vehículo para
              acotar.
            </p>
          )}
        </Card>
      )}

      <Card
        title="Movimientos"
        padding={false}
        action={
          <button
            type="button"
            onClick={verTodoElHistorial}
            disabled={cajaNegocioVehiculo.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-gradient-to-b from-teal-50 to-teal-100/90 px-3 py-2 text-xs font-semibold text-teal-950 shadow-sm hover:border-teal-300 hover:from-teal-100 hover:to-teal-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 transition-colors sm:text-sm sm:px-4 sm:py-2.5"
            title={cajaNegocioVehiculo.length === 0 ? 'Sin datos' : 'Todos los movimientos cargados'}
          >
            <CalendarRange size={16} className="shrink-0 opacity-90" strokeWidth={2} aria-hidden />
            Todo el historial
          </button>
        }
      >
        {/* Mobile cards */}
        <div className="block md:hidden px-3 py-3 space-y-2.5">
          {filtrados.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">
              No hay registros. Ejecuta la migración SQL y el script{' '}
              <code className="text-[11px] bg-gray-100 px-1 rounded">mover_caja_negocio_desde_gastos.mjs</code> si vienen de gastos
              importados.
            </div>
          ) : (
            filtrados.map((row: CajaNegocioVehiculo) => (
              <div key={row.id} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-400 font-medium">{formatDate(row.fecha)}</p>
                    <p className="text-xs text-gray-600 mt-0.5 font-medium truncate">{labelVehiculo(row.vehicleId)}</p>
                  </div>
                  <p className="text-sm font-bold text-teal-900 tabular-nums shrink-0">{formatCurrency(row.monto)}</p>
                </div>
                <p className="mt-2 text-sm text-gray-900 line-clamp-2" title={row.concepto}>
                  {row.concepto}
                </p>
                <p className="mt-1 text-[11px] text-gray-500 line-clamp-2" title={row.comentarios || undefined}>
                  {row.comentarios || '—'}
                </p>
                {row.origenGastoId != null && (
                  <p className="mt-1 text-[10px] text-gray-400">Origen gasto id: {row.origenGastoId}</p>
                )}
              </div>
            ))
          )}
        </div>

        <div className="hidden md:block overflow-x-auto rounded-b-2xl">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-100 bg-gray-50/90">
                <th className="py-3 px-4 font-semibold">Fecha</th>
                <th className="py-3 px-4 font-semibold">Vehículo</th>
                <th className="py-3 px-4 font-semibold">Concepto</th>
                <th className="py-3 px-4 font-semibold text-right">Monto</th>
                <th className="py-3 px-4 font-semibold">Notas</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400">
                    No hay registros. Ejecuta la migración SQL y el script{' '}
                    <code className="text-[11px] bg-gray-100 px-1 rounded">mover_caja_negocio_desde_gastos.mjs</code> si vienen
                    de gastos importados.
                  </td>
                </tr>
              ) : (
                filtrados.map((row: CajaNegocioVehiculo) => (
                  <tr key={row.id} className="border-b border-gray-50 hover:bg-teal-50/40">
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">{formatDate(row.fecha)}</td>
                    <td className="py-2.5 px-4 text-gray-800 font-medium whitespace-nowrap">{labelVehiculo(row.vehicleId)}</td>
                    <td className="py-2.5 px-4 text-gray-900 max-w-md">
                      <span className="line-clamp-2" title={row.concepto}>
                        {row.concepto}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-semibold text-teal-900">{formatCurrency(row.monto)}</td>
                    <td className="py-2.5 px-4 text-gray-500 text-xs max-w-sm">
                      <span className="line-clamp-2" title={row.comentarios}>
                        {row.comentarios || '—'}
                        {row.origenGastoId != null && (
                          <span className="block text-[10px] text-gray-400 mt-0.5">Origen gasto id: {row.origenGastoId}</span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default CajaNegocio;
