import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, TrendingUp, TrendingDown } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { calculateKPIs, calculateVehicleRentability } from '../../utils/calculations';
import { ingresoMontoPEN } from '../../utils/moneda';
import { formatCurrency } from '../../utils/formatting';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line } from 'recharts';
import { MESES, CATEGORIAS_GASTO_LABELS } from '../../data/catalogs';
import { CategoriaGasto } from '../../data/types';
import { gastosOperativosSolamente } from '../../utils/cajaNegocio';

/* ── Custom Tooltip (dark) ───────────────────────────────────────────── */
const PremiumTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const labels: Record<string, string> = { ingresos: 'Ingresos', gastos: 'Gastos', utilidad: 'Utilidad' };
  return (
    <div className="bg-slate-900/95 backdrop-blur border border-slate-700/60 rounded-2xl p-3.5 shadow-2xl min-w-[180px]">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-5 py-1 border-b border-slate-800 last:border-0">
          <span className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            {labels[entry.dataKey] ?? entry.dataKey}
          </span>
          <span
            className="text-[11px] font-bold tabular-nums"
            style={{ color: entry.dataKey === 'utilidad' && entry.value < 0 ? '#F87171' : entry.color }}
          >
            {formatCurrency(Number(entry.value))}
          </span>
        </div>
      ))}
    </div>
  );
};

const ReportesHub: React.FC = () => {
  const navigate = useNavigate();
  const { ingresos, gastos, descuentos, vehicles } = useRegistrosContext();
  const gastosOp = useMemo(() => gastosOperativosSolamente(gastos), [gastos]);
  const kpis = useMemo(() => calculateKPIs(ingresos, gastos, descuentos), [ingresos, gastos, descuentos]);
  const rentability = useMemo(
    () => calculateVehicleRentability(vehicles, ingresos, gastos, descuentos),
    [vehicles, ingresos, gastos, descuentos],
  );

  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    const touch = (fecha: string) => {
      const y = Number(String(fecha).slice(0, 4));
      if (Number.isFinite(y) && y > 0) ys.add(y);
    };
    for (const i of ingresos) touch(i.fecha);
    for (const g of gastosOp) touch(g.fecha);
    for (const d of descuentos) touch(d.fecha);
    return [...ys].sort((a, b) => b - a);
  }, [ingresos, gastosOp, descuentos]);

  const yearOptions = useMemo(
    () => availableYears.map((y) => ({ value: String(y), label: String(y) })),
    [availableYears],
  );

  const [chartYear, setChartYear] = useState<string>('');

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

  const chartData = useMemo(() => {
    if (!Number.isFinite(chartYearNum)) {
      return MESES.map((mes) => ({
        mes: mes.label.slice(0, 3),
        ingresos: 0,
        gastos: 0,
        rebajes: 0,
        utilidad: 0,
        hayMovimiento: false,
      }));
    }
    const prefix = `${chartYearNum}-`;
    return MESES.map((mes) => {
      const mm = String(mes.value).padStart(2, '0');
      const ing = ingresos
        .filter((i) => i.fecha.startsWith(prefix) && i.fecha.slice(5, 7) === mm)
        .reduce((s, i) => s + ingresoMontoPEN(i), 0);
      const gas = gastosOp
        .filter((g) => g.fecha.startsWith(prefix) && g.fecha.slice(5, 7) === mm)
        .reduce((s, g) => s + g.monto, 0);
      const reb = descuentos
        .filter((d) => d.fecha.startsWith(prefix) && d.fecha.slice(5, 7) === mm)
        .reduce((s, d) => s + d.monto, 0);
      const utilidad = ing - gas + reb;
      return {
        mes: mes.label.slice(0, 3),
        ingresos: ing,
        gastos: gas,
        rebajes: reb,
        utilidad,
        hayMovimiento: ing !== 0 || gas !== 0 || reb !== 0,
      };
    });
  }, [ingresos, gastosOp, descuentos, chartYearNum]);

  const totalesAnioGrafico = useMemo(() => {
    return chartData.reduce(
      (acc, row) => ({
        ingresos: acc.ingresos + row.ingresos,
        gastos: acc.gastos + row.gastos,
        utilidad: acc.utilidad + row.utilidad,
      }),
      { ingresos: 0, gastos: 0, utilidad: 0 },
    );
  }, [chartData]);

  const gastosCat = useMemo(() => {
    const totals: Record<string, number> = {};
    gastosOp.forEach(g => { totals[g.categoria] = (totals[g.categoria] ?? 0) + g.monto; });
    return Object.entries(totals).map(([cat, total]) => ({
      cat: CATEGORIAS_GASTO_LABELS[cat as CategoriaGasto]?.replace('Gastos ', '') ?? cat,
      Total: total,
    }));
  }, [gastosOp]);

  const margenPct = kpis.totalIngresos > 0 ? (kpis.margenNeto / kpis.totalIngresos) * 100 : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📊 Reportes</h1>
          <p className="text-sm text-gray-500">Análisis financiero completo</p>
        </div>
      </div>

      {/* KPI strip – premium dark cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-500 p-5 shadow-lg shadow-emerald-500/20">
          <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/10" />
          <p className="text-[11px] font-semibold text-emerald-100 uppercase tracking-widest mb-2">Total ingresos</p>
          <p className="text-2xl font-bold text-white tabular-nums leading-none">{formatCurrency(kpis.totalIngresos)}</p>
          <p className="text-[11px] text-emerald-200 mt-2">{ingresos.length} registros</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-600 to-rose-500 p-5 shadow-lg shadow-rose-500/20">
          <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/10" />
          <p className="text-[11px] font-semibold text-rose-100 uppercase tracking-widest mb-2">Total gastos</p>
          <p className="text-2xl font-bold text-white tabular-nums leading-none">{formatCurrency(kpis.totalGastos)}</p>
          <p className="text-[11px] text-rose-200 mt-2">{gastosOp.length} registros</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-amber-400 p-5 shadow-lg shadow-amber-400/20">
          <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/10" />
          <p className="text-[11px] font-semibold text-amber-100 uppercase tracking-widest mb-2">Rebajes</p>
          <p className="text-2xl font-bold text-white tabular-nums leading-none">{formatCurrency(kpis.totalDescuentos)}</p>
          <p className="text-[11px] text-amber-100 mt-2">{descuentos.length} registros</p>
        </div>
        <div className={`relative overflow-hidden rounded-2xl p-5 shadow-lg ${kpis.margenNeto >= 0 ? 'bg-gradient-to-br from-violet-600 to-violet-500 shadow-violet-500/20' : 'bg-gradient-to-br from-slate-600 to-slate-500 shadow-slate-500/10'}`}>
          <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/10" />
          <p className="text-[11px] font-semibold text-white/70 uppercase tracking-widest mb-2">Utilidad neta</p>
          <p className="text-2xl font-bold text-white tabular-nums leading-none">{formatCurrency(kpis.margenNeto)}</p>
          <div className="flex items-center gap-1 mt-2">
            {kpis.margenNeto >= 0
              ? <TrendingUp size={13} className="text-violet-200" />
              : <TrendingDown size={13} className="text-slate-300" />}
            <p className="text-[11px] text-white/60">{margenPct.toFixed(1)}% margen</p>
          </div>
        </div>
      </div>

      {/* ── Gráfico premium – dark glass ───────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/40 shadow-2xl">
        {/* subtle grid texture overlay */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.08)_0%,_transparent_60%)]" />

        {/* Header */}
        <div className="relative px-6 pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Rendimiento mensual</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Por año calendario · Gastos operativos · Utilidad = ingresos − gastos + rebajes
              </p>
            </div>
            {/* Year pills */}
            <div className="flex gap-1.5 flex-wrap shrink-0">
              {yearOptions.length > 0 ? yearOptions.map((y) => (
                <button
                  key={y.value}
                  type="button"
                  onClick={() => setChartYear(y.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    chartYear === y.value
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/40'
                      : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/80 hover:text-white'
                  }`}
                >
                  {y.label}
                </button>
              )) : <p className="text-xs text-slate-500">Sin datos</p>}
            </div>
          </div>

          {/* KPI pills del año elegido */}
          {chartYear && (
            <div className="flex flex-wrap gap-2 mt-4">
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-[11px] text-emerald-300 font-medium">Ingresos</span>
                <span className="text-sm font-bold text-emerald-300 tabular-nums">{formatCurrency(totalesAnioGrafico.ingresos)}</span>
              </div>
              <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/25 rounded-xl px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                <span className="text-[11px] text-rose-300 font-medium">Gastos</span>
                <span className="text-sm font-bold text-rose-300 tabular-nums">{formatCurrency(totalesAnioGrafico.gastos)}</span>
              </div>
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${totalesAnioGrafico.utilidad >= 0 ? 'bg-violet-500/10 border border-violet-500/25' : 'bg-red-500/10 border border-red-500/25'}`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${totalesAnioGrafico.utilidad >= 0 ? 'bg-violet-400' : 'bg-red-400'}`} />
                <span className={`text-[11px] font-medium ${totalesAnioGrafico.utilidad >= 0 ? 'text-violet-300' : 'text-red-300'}`}>Utilidad</span>
                <span className={`text-sm font-bold tabular-nums ${totalesAnioGrafico.utilidad >= 0 ? 'text-violet-300' : 'text-red-300'}`}>{formatCurrency(totalesAnioGrafico.utilidad)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="relative h-[300px] sm:h-[320px] mt-4 px-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 4 }} barCategoryGap="16%">
              <defs>
                <linearGradient id="gradIng" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34D399" stopOpacity={1} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0.7} />
                </linearGradient>
                <linearGradient id="gradGas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FB7185" stopOpacity={1} />
                  <stop offset="100%" stopColor="#E11D48" stopOpacity={0.7} />
                </linearGradient>
                <filter id="glowLine" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <CartesianGrid strokeDasharray="2 6" stroke="#1E293B" vertical={false} />
              <XAxis
                dataKey="mes"
                tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `S/${(v / 1000).toFixed(0)}k`}
                width={44}
              />
              <Tooltip content={<PremiumTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)', radius: 6 }} />
              <Bar dataKey="ingresos" fill="url(#gradIng)" radius={[6, 6, 0, 0]} maxBarSize={26} />
              <Bar dataKey="gastos" fill="url(#gradGas)" radius={[6, 6, 0, 0]} maxBarSize={26} />
              <Line
                type="monotone"
                dataKey="utilidad"
                stroke="#A78BFA"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#A78BFA', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#A78BFA', stroke: '#1E1B4B', strokeWidth: 2 }}
                filter="url(#glowLine)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Leyenda inline */}
        <div className="flex flex-wrap items-center gap-4 px-6 pb-5 mt-1">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: 'linear-gradient(#34D399,#059669)' }} />
            Ingresos
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: 'linear-gradient(#FB7185,#E11D48)' }} />
            Gastos
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
            <span className="w-8 h-0.5 rounded-full bg-violet-400 shrink-0" />
            Utilidad
          </span>
        </div>

        {/* Month grid – dark cards */}
        <div className="border-t border-slate-700/50 px-6 py-5">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
            Detalle mensual {chartYear || '—'}
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-1.5">
            {chartData.map((row) => (
              <div
                key={row.mes}
                className="rounded-xl bg-slate-800/70 border border-slate-700/40 px-1.5 py-2 text-center hover:bg-slate-700/60 transition-colors"
              >
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">{row.mes}</div>
                <div className="space-y-0.5 tabular-nums">
                  <div className="text-[10px] font-semibold text-emerald-400">
                    {row.ingresos > 0 ? `${(row.ingresos / 1000).toFixed(1)}k` : <span className="text-slate-600">—</span>}
                  </div>
                  <div className="text-[10px] font-semibold text-rose-400">
                    {row.gastos > 0 ? `${(row.gastos / 1000).toFixed(1)}k` : <span className="text-slate-600">—</span>}
                  </div>
                  <div className={`text-[10px] font-bold border-t border-slate-700/50 pt-0.5 mt-0.5 ${!row.hayMovimiento ? 'text-slate-600' : row.utilidad >= 0 ? 'text-violet-400' : 'text-red-400'}`}>
                    {!row.hayMovimiento ? '—' : `${row.utilidad >= 0 ? '' : '-'}${(Math.abs(row.utilidad) / 1000).toFixed(1)}k`}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-600 mt-3">
            Verde = ingresos · Rojo = gastos · Violeta = utilidad · cifras en miles de soles
          </p>
        </div>
      </div>

      {/* Gastos por categoría */}
      {gastosCat.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">Gastos por Categoría</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gastosCat} layout="vertical" margin={{ top: 0, right: 20, left: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `S/${v.toLocaleString()}`} />
                <YAxis dataKey="cat" type="category" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} width={100} />
                <Tooltip formatter={(v) => [formatCurrency(Number(v)), 'Total']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #F3F4F6', fontSize: '12px' }} />
                <Bar dataKey="Total" fill="#8B5CF6" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Vehicle ranking table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Rentabilidad por Vehículo</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {rentability.map((r, i) => (
            <div key={r.vehicle.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => navigate(`/vehiculos/${r.vehicle.id}`)}>
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0
                ${i === 0 ? 'bg-yellow-400 text-white' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {i + 1}
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{r.vehicle.marca} {r.vehicle.modelo}</p>
                <p className="text-xs text-gray-400">{r.vehicle.placa}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${r.margen >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(r.margen)}</p>
                <p className="text-xs text-gray-400">
                  {r.totalIngresos > 0 ? ((r.margen / r.totalIngresos) * 100).toFixed(0) : 0}% rent.
                </p>
              </div>
            </div>
          ))}
          {rentability.length === 0 && (
            <p className="text-center py-8 text-sm text-gray-400">Sin datos disponibles</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportesHub;
