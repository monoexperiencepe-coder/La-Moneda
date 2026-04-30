import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { calculateKPIs, calculateVehicleRentability } from '../../utils/calculations';
import { ingresoMontoPEN } from '../../utils/moneda';
import { formatCurrency } from '../../utils/formatting';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { MESES, CATEGORIAS_GASTO_LABELS } from '../../data/catalogs';
import { CategoriaGasto } from '../../data/types';

const ReportesHub: React.FC = () => {
  const navigate = useNavigate();
  const { ingresos, gastos, descuentos, vehicles } = useRegistrosContext();
  const kpis = useMemo(() => calculateKPIs(ingresos, gastos, descuentos), [ingresos, gastos, descuentos]);
  const rentability = useMemo(
    () => calculateVehicleRentability(vehicles, ingresos, gastos, descuentos),
    [vehicles, ingresos, gastos, descuentos],
  );

  const monthlyData = useMemo(() => MESES.map(mes => {
    const month = String(mes.value).padStart(2, '0');
    const ing = ingresos.filter(i => i.fecha.includes(`-${month}-`)).reduce((s, i) => s + ingresoMontoPEN(i), 0);
    const gas = gastos.filter(g => g.fecha.includes(`-${month}-`)).reduce((s, g) => s + g.monto, 0);
    const reb = descuentos.filter(d => d.fecha.includes(`-${month}-`)).reduce((s, d) => s + d.monto, 0);
    return { mes: mes.label.slice(0, 3), Ingresos: ing, Gastos: gas, Rebajes: reb, Margen: ing - gas + reb };
  }), [ingresos, gastos, descuentos]);

  const gastosCat = useMemo(() => {
    const totals: Record<string, number> = {};
    gastos.forEach(g => { totals[g.categoria] = (totals[g.categoria] ?? 0) + g.monto; });
    return Object.entries(totals).map(([cat, total]) => ({
      cat: CATEGORIAS_GASTO_LABELS[cat as CategoriaGasto]?.replace('Gastos ', '') ?? cat,
      Total: total,
    }));
  }, [gastos]);

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

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
          <p className="text-xs text-emerald-600 font-medium mb-1">Total Ingresos</p>
          <p className="text-2xl font-bold text-emerald-700">{formatCurrency(kpis.totalIngresos)}</p>
          <p className="text-xs text-emerald-500 mt-1">{ingresos.length} registros</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl p-5">
          <p className="text-xs text-red-600 font-medium mb-1">Total Gastos</p>
          <p className="text-2xl font-bold text-red-700">{formatCurrency(kpis.totalGastos)}</p>
          <p className="text-xs text-red-500 mt-1">{gastos.length} registros</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
          <p className="text-xs text-amber-800 font-medium mb-1">Rebajes (descuentos)</p>
          <p className="text-2xl font-bold text-amber-900">{formatCurrency(kpis.totalDescuentos)}</p>
          <p className="text-xs text-amber-700 mt-1">{descuentos.length} registros</p>
        </div>
        <div className={`border rounded-2xl p-5 ${kpis.margenNeto >= 0 ? 'bg-primary-50 border-primary-100' : 'bg-gray-50 border-gray-100'}`}>
          <p className="text-xs text-gray-600 font-medium mb-1">Margen Neto</p>
          <p className={`text-2xl font-bold ${kpis.margenNeto >= 0 ? 'text-primary-700' : 'text-gray-700'}`}>{formatCurrency(kpis.margenNeto)}</p>
          <p className="text-xs text-gray-400 mt-1">
            {kpis.totalIngresos > 0 ? ((kpis.margenNeto / kpis.totalIngresos) * 100).toFixed(1) : 0}% margen
          </p>
        </div>
      </div>

      {/* Monthly area chart */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">Rendimiento Mensual</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="gIngresos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gGastos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => [formatCurrency(Number(v)), '']}
                contentStyle={{ borderRadius: '12px', border: '1px solid #F3F4F6', fontSize: '12px' }} />
              <Area type="monotone" dataKey="Ingresos" stroke="#10B981" strokeWidth={2.5} fill="url(#gIngresos)" dot={false} />
              <Area type="monotone" dataKey="Gastos" stroke="#EF4444" strokeWidth={2.5} fill="url(#gGastos)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
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
