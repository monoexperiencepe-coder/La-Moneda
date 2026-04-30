import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import RegistrosTable from '../../components/Tables/RegistrosTable';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency, todayStr } from '../../utils/formatting';
import { ingresoMontoPEN } from '../../utils/moneda';
import { MESES } from '../../data/catalogs';

const Ingresos: React.FC = () => {
  const navigate = useNavigate();
  const { ingresos, gastos, vehicles, deleteIngreso } = useRegistrosContext();
  const { open } = useDrawer();

  const todayTotal = ingresos.filter(i => i.fecha === todayStr()).reduce((s, i) => s + ingresoMontoPEN(i), 0);
  const monthTotal = ingresos.reduce((s, i) => s + ingresoMontoPEN(i), 0);

  const chartData = useMemo(() => {
    return MESES.map(mes => {
      const month = String(mes.value).padStart(2, '0');
      const total = ingresos.filter(i => i.fecha.includes(`-${month}-`)).reduce((s, i) => s + ingresoMontoPEN(i), 0);
      return { mes: mes.label.slice(0, 3), total };
    });
  }, [ingresos]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/finanzas')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">💰 Ingresos</h1>
            <p className="text-sm text-gray-500">{ingresos.length} registros totales</p>
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
          <p className="text-xs text-gray-500 font-medium mb-1">Total Período</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(monthTotal)}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">Ingresos por Mes</h3>
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
        <h2 className="text-base font-bold text-gray-800 mb-3">Historial de Ingresos</h2>
        <RegistrosTable mode="ingresos" ingresos={ingresos} vehicles={vehicles} onDeleteIngreso={deleteIngreso} />
      </div>
    </div>
  );
};

export default Ingresos;
