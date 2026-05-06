import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import RegistrosTable from '../../components/Tables/RegistrosTable';
import Select from '../../components/Common/Select';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { formatCurrency, todayStr } from '../../utils/formatting';
import { CATEGORIAS_GASTO_LABELS, CATEGORIA_COLORS, MESES } from '../../data/catalogs';
import { CategoriaGasto } from '../../data/types';
import { gastosOperativosSolamente } from '../../utils/cajaNegocio';

const Gastos: React.FC = () => {
  const navigate = useNavigate();
  const { gastos, vehicles, deleteGasto } = useRegistrosContext();
  const { open } = useDrawer();

  const gastosOperativos = useMemo(() => gastosOperativosSolamente(gastos), [gastos]);

  const todayTotal = gastosOperativos.filter(g => g.fecha === todayStr()).reduce((s, g) => s + g.monto, 0);

  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const g of gastosOperativos) {
      const y = Number(g.fecha.slice(0, 4));
      if (Number.isFinite(y) && y > 0) ys.add(y);
    }
    return [...ys].sort((a, b) => b - a);
  }, [gastosOperativos]);

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

  const gastosDelAnioGrafico = useMemo(() => {
    if (!Number.isFinite(chartYearNum)) return [];
    const prefix = `${chartYearNum}-`;
    return gastosOperativos.filter((g) => g.fecha.startsWith(prefix));
  }, [gastosOperativos, chartYearNum]);

  const totalAnioGrafico = gastosDelAnioGrafico.reduce((s, g) => s + g.monto, 0);

  const chartData = useMemo(() => {
    return MESES.map((mes) => {
      const month = String(mes.value).padStart(2, '0');
      const total = gastosDelAnioGrafico
        .filter((g) => g.fecha.slice(5, 7) === month)
        .reduce((s, g) => s + g.monto, 0);
      return { mes: mes.label.slice(0, 3), total };
    });
  }, [gastosDelAnioGrafico]);

  const yearOptions = useMemo(
    () => availableYears.map((y) => ({ value: String(y), label: String(y) })),
    [availableYears],
  );

  const historyYearOptions = useMemo(
    () => [{ value: 'ALL', label: 'Todos' }, ...yearOptions],
    [yearOptions],
  );

  const gastosHistorialFiltrados = useMemo(() => {
    if (historyYear === 'ALL') return gastosOperativos;
    const prefix = `${historyYear}-`;
    return gastosOperativos.filter((g) => g.fecha.startsWith(prefix));
  }, [gastosOperativos, historyYear]);

  const pieData = useMemo(() => {
    const totals: Record<string, number> = {};
    gastosDelAnioGrafico.forEach((g) => {
      totals[g.categoria] = (totals[g.categoria] ?? 0) + g.monto;
    });
    return Object.entries(totals).map(([cat, value]) => ({
      name: CATEGORIAS_GASTO_LABELS[cat as CategoriaGasto] ?? cat,
      value,
      color: CATEGORIA_COLORS[cat as CategoriaGasto] ?? '#6B7280',
    }));
  }, [gastosDelAnioGrafico]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/finanzas')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">💸 Gastos</h1>
            <p className="text-sm text-gray-500">{gastosOperativos.length} gastos operativos</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              «Caja negocio» va en Finanzas → Caja negocio (no se lista aquí).
            </p>
          </div>
        </div>
        <button onClick={() => open('expense')}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold shadow-soft transition-all">
          + Registrar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
          <p className="text-xs text-red-600 font-medium mb-1">Total HOY</p>
          <p className="text-2xl font-bold text-red-700">{formatCurrency(todayTotal)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-soft">
          <p className="text-xs text-gray-500 font-medium mb-1">
            {chartYear ? `Total ${chartYear}` : 'Total año'}
          </p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalAnioGrafico)}</p>
          <p className="text-[11px] text-gray-400 mt-1">Mismo año que el gráfico inferior</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-700">Gastos por Mes</h3>
            <p className="text-xs text-gray-500 mt-1">
              Por año calendario (suma de montos por mes en ese año).
            </p>
          </div>
          {yearOptions.length > 0 ? (
            <div className="w-full sm:w-40 shrink-0">
              <Select label="Año" options={yearOptions} value={chartYear} onChange={setChartYear} />
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
              <YAxis
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `S/${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(v) => [formatCurrency(Number(v)), 'Gastos']}
                contentStyle={{ borderRadius: '12px', border: '1px solid #F3F4F6', fontSize: '12px' }}
              />
              <Bar dataKey="total" fill="#EF4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {pieData.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-1">Distribución por Categoría</h3>
          <p className="text-xs text-gray-500 mb-4">Solo gastos del año seleccionado arriba ({chartYear || '—'}).</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [formatCurrency(Number(v)), '']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #F3F4F6', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
          <h2 className="text-base font-bold text-gray-800">Historial de Gastos</h2>
          <div className="w-full sm:w-40">
            <Select
              label="Año historial"
              options={historyYearOptions}
              value={historyYear}
              onChange={setHistoryYear}
            />
          </div>
        </div>
        <RegistrosTable mode="gastos" gastos={gastosHistorialFiltrados} vehicles={vehicles} onDeleteGasto={deleteGasto} />
      </div>
    </div>
  );
};

export default Gastos;
