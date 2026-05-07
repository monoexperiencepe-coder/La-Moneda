import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import RegistrosTable from '../../components/Tables/RegistrosTable';
import Select from '../../components/Common/Select';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { formatCurrency, todayStr } from '../../utils/formatting';
import { ingresoMontoPEN } from '../../utils/moneda';
import { MESES } from '../../data/catalogs';

const Ingresos: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const cobroPendiente = searchParams.get('cobro') === 'pendiente';
  const { ingresos, vehicles, deleteIngreso } = useRegistrosContext();
  const { open } = useDrawer();

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

  const yearOptions = useMemo(
    () => availableYears.map((y) => ({ value: String(y), label: String(y) })),
    [availableYears],
  );

  const historyYearOptions = useMemo(
    () => [{ value: 'ALL', label: 'Todos' }, ...yearOptions],
    [yearOptions],
  );

  const ingresosHistorialFiltrados = useMemo(() => {
    if (historyYear === 'ALL') return ingresos;
    const prefix = `${historyYear}-`;
    return ingresos.filter((i) => i.fecha.startsWith(prefix));
  }, [ingresos, historyYear]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/finanzas')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ingresos</h1>
            <p className="text-sm text-gray-500">{ingresos.length} registros totales</p>
            {cobroPendiente && (
              <p className="mt-1 text-xs text-amber-800">
                Filtro: cobro pendiente.{' '}
                <button
                  type="button"
                  className="font-semibold text-primary-600 hover:underline"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.delete('cobro');
                    setSearchParams(next, { replace: true });
                  }}
                >
                  Quitar filtro
                </button>
              </p>
            )}
          </div>
        </div>
        <button onClick={() => open('income')}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-soft transition-all">
          + Registrar
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-4">
        <div className="mb-3 border-b border-gray-100 pb-3">
          <div className="flex items-center justify-center">
            <span className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-base font-extrabold text-slate-800 shadow-sm tracking-tight">
              <span>{chartYear ? `Total ${chartYear}` : 'Total año'}:</span>
              <span className="font-mono tabular-nums text-emerald-900 bg-emerald-100 border border-emerald-200 rounded-lg px-2 py-0.5 shadow-inner">
                {formatCurrency(animatedTotal)}
              </span>
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-gray-700">Ingresos por Mes</h3>
            <p className="text-xs text-gray-500 mt-1">Por año calendario.</p>
          </div>
          {yearOptions.length > 0 ? (
            <div className="w-full sm:w-40 shrink-0">
              <Select label="Año" options={yearOptions} value={chartYear} onChange={setChartYear} />
            </div>
          ) : (
            <p className="text-xs text-gray-400">Sin fechas para graficar</p>
          )}
        </div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 0, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `S/${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(v) => [formatCurrency(Number(v)), 'Ingresos']}
                contentStyle={{ borderRadius: '12px', border: '1px solid #F3F4F6', fontSize: '12px' }}
              />
              <Bar dataKey="total" fill="#10B981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
          <h2 className="text-base font-bold text-gray-800">Historial de Ingresos</h2>
          <div className="w-full sm:w-40">
            <Select
              label="Año historial"
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
