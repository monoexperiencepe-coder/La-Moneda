import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import RegistrosTable from '../../components/Tables/RegistrosTable';
import Select from '../../components/Common/Select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency, todayStr } from '../../utils/formatting';
import { ingresoMontoPEN } from '../../utils/moneda';
import { MESES } from '../../data/catalogs';

const Ingresos: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const cobroPendiente = searchParams.get('cobro') === 'pendiente';
  const { ingresos, vehicles, deleteIngreso } = useRegistrosContext();
  const { open } = useDrawer();

  const todayTotal = ingresos.filter(i => i.fecha === todayStr()).reduce((s, i) => s + ingresoMontoPEN(i), 0);

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

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
          <p className="text-xs text-emerald-600 font-medium mb-1">Total HOY</p>
          <p className="text-2xl font-bold text-emerald-700">{formatCurrency(todayTotal)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-soft">
          <p className="text-xs text-gray-500 font-medium mb-1">
            {chartYear ? `Total ${chartYear}` : 'Total año'}
          </p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalAnioGrafico)}</p>
          <p className="text-[11px] text-gray-400 mt-1">Mismo año que el gráfico inferior</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-700">Ingresos por Mes</h3>
            <p className="text-xs text-gray-500 mt-1">
              Por año calendario (antes se sumaban todos los años en cada mes).
            </p>
          </div>
          {yearOptions.length > 0 ? (
            <div className="w-full sm:w-40 shrink-0">
              <Select
                label="Año"
                options={yearOptions}
                value={chartYear}
                onChange={setChartYear}
              />
            </div>
          ) : (
            <p className="text-xs text-gray-400">Sin fechas para graficar</p>
          )}
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 0, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `S/${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => [formatCurrency(Number(v)), 'Ingresos']}
                contentStyle={{ borderRadius: '12px', border: '1px solid #F3F4F6', fontSize: '12px' }} />
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
