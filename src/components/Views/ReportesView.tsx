import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Card from '../Common/Card';
import { Ingreso, Gasto, Descuento, Vehicle } from '../../data/types';
import { formatCurrency } from '../../utils/formatting';
import { calculateVehicleRentability } from '../../utils/calculations';
import { ingresoMontoPEN } from '../../utils/moneda';
import { CATEGORIAS_GASTO_LABELS, MESES } from '../../data/catalogs';
import { TrendingUp, Car, DollarSign } from 'lucide-react';

interface ReportesViewProps {
  ingresos: Ingreso[];
  gastos: Gasto[];
  descuentos?: Descuento[];
  vehicles: Vehicle[];
}

const ReportesView: React.FC<ReportesViewProps> = ({ ingresos, gastos, descuentos = [], vehicles }) => {
  const vehicleRentability = useMemo(
    () => calculateVehicleRentability(vehicles, ingresos, gastos, descuentos),
    [vehicles, ingresos, gastos, descuentos],
  );

  const monthlyData = useMemo(() => {
    return MESES.map(mes => {
      const month = String(mes.value).padStart(2, '0');
      const monthIngresos = ingresos
        .filter(i => i.fecha.includes(`-${month}-`))
        .reduce((s, i) => s + ingresoMontoPEN(i), 0);
      const monthGastos = gastos
        .filter(g => g.fecha.includes(`-${month}-`))
        .reduce((s, g) => s + g.monto, 0);
      const monthRebajes = descuentos
        .filter(d => d.fecha.includes(`-${month}-`))
        .reduce((s, d) => s + d.monto, 0);
      return {
        mes: mes.label.slice(0, 3),
        Ingresos: monthIngresos,
        Gastos: monthGastos,
        Margen: monthIngresos - monthGastos + monthRebajes,
      };
    });
  }, [ingresos, gastos, descuentos]);

  const gastosPorCategoria = useMemo(() => {
    const totals: Record<string, number> = {};
    gastos.forEach(g => {
      totals[g.categoria] = (totals[g.categoria] ?? 0) + g.monto;
    });
    return Object.entries(totals).map(([cat, total]) => ({
      categoria: CATEGORIAS_GASTO_LABELS[cat as keyof typeof CATEGORIAS_GASTO_LABELS] ?? cat,
      Total: total,
    }));
  }, [gastos]);

  const totalIngresos = ingresos.reduce((s, i) => s + ingresoMontoPEN(i), 0);
  const totalGastos = gastos.reduce((s, g) => s + g.monto, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        <p className="text-sm text-gray-500 mt-0.5">Análisis financiero completo de la flota</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp size={20} className="text-emerald-500" />
            <span className="text-sm font-semibold text-emerald-800">Total Ingresos</span>
          </div>
          <p className="text-2xl font-bold text-emerald-700">{formatCurrency(totalIngresos)}</p>
          <p className="text-xs text-emerald-500 mt-1">{ingresos.length} registros</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign size={20} className="text-red-500" />
            <span className="text-sm font-semibold text-red-800">Total Gastos</span>
          </div>
          <p className="text-2xl font-bold text-red-700">{formatCurrency(totalGastos)}</p>
          <p className="text-xs text-red-500 mt-1">{gastos.length} registros</p>
        </div>
        <div className={`border rounded-xl p-5 ${totalIngresos - totalGastos >= 0 ? 'bg-primary-50 border-primary-100' : 'bg-gray-50 border-gray-100'}`}>
          <div className="flex items-center gap-3 mb-2">
            <Car size={20} className={totalIngresos - totalGastos >= 0 ? 'text-primary-500' : 'text-gray-500'} />
            <span className={`text-sm font-semibold ${totalIngresos - totalGastos >= 0 ? 'text-primary-800' : 'text-gray-700'}`}>
              Margen Neto
            </span>
          </div>
          <p className={`text-2xl font-bold ${totalIngresos - totalGastos >= 0 ? 'text-primary-700' : 'text-gray-700'}`}>
            {formatCurrency(totalIngresos - totalGastos)}
          </p>
          <p className={`text-xs mt-1 ${totalIngresos - totalGastos >= 0 ? 'text-primary-500' : 'text-gray-500'}`}>
            {totalIngresos > 0 ? ((1 - totalGastos / totalIngresos) * 100).toFixed(1) : 0}% margen
          </p>
        </div>
      </div>

      {/* Monthly performance chart */}
      <Card title="Rendimiento Mensual" subtitle="Ingresos, gastos y margen por mes">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `S/${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value) => [formatCurrency(Number(value)), '']}
                contentStyle={{ borderRadius: '12px', border: '1px solid #F3F4F6', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }} />
              <Bar dataKey="Ingresos" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Gastos" fill="#EF4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Margen" fill="#4F46E5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Gastos por categoría */}
      <Card title="Gastos por Categoría" subtitle="Total acumulado por tipo de gasto">
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={gastosPorCategoria} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                tickFormatter={(v) => `S/${v.toLocaleString()}`} />
              <YAxis dataKey="categoria" type="category" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} width={130} />
              <Tooltip
                formatter={(value) => [formatCurrency(Number(value)), 'Total']}
                contentStyle={{ borderRadius: '12px', border: '1px solid #F3F4F6', fontSize: '12px' }}
              />
              <Bar dataKey="Total" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Vehicle rentability table */}
      <Card title="Rentabilidad por Vehículo" subtitle="Análisis completo de ingresos y gastos por unidad">
        <div className="overflow-x-auto -mx-6">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="bg-gray-50 border-y border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">Vehículo</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">Ingresos</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">Gastos</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {vehicleRentability.map(({ vehicle, totalIngresos, totalGastos, margen }) => (
                <tr key={vehicle.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3">
                    <p className="text-sm font-semibold text-gray-900">{vehicle.marca} {vehicle.modelo}</p>
                    <p className="text-xs text-gray-400">{vehicle.placa}</p>
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-emerald-600 font-medium">
                    {formatCurrency(totalIngresos)}
                  </td>
                  <td className="px-3 py-3 text-right text-sm text-red-500 font-medium">
                    {formatCurrency(totalGastos)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className={`text-sm font-bold ${margen >= 0 ? 'text-primary-600' : 'text-red-600'}`}>
                      {formatCurrency(margen)}
                    </span>
                  </td>
                </tr>
              ))}
              {vehicleRentability.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-400 text-sm">Sin datos</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default ReportesView;
