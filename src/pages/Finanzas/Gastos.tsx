import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import RegistrosTable from '../../components/Tables/RegistrosTable';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatCurrency, todayStr } from '../../utils/formatting';
import { CATEGORIAS_GASTO_LABELS, CATEGORIA_COLORS } from '../../data/catalogs';
import { CategoriaGasto } from '../../data/types';

const Gastos: React.FC = () => {
  const navigate = useNavigate();
  const { gastos, vehicles, deleteGasto } = useRegistrosContext();
  const { open } = useDrawer();

  const todayTotal = gastos.filter(g => g.fecha === todayStr()).reduce((s, g) => s + g.monto, 0);
  const monthTotal = gastos.reduce((s, g) => s + g.monto, 0);

  const pieData = useMemo(() => {
    const totals: Record<string, number> = {};
    gastos.forEach(g => { totals[g.categoria] = (totals[g.categoria] ?? 0) + g.monto; });
    return Object.entries(totals).map(([cat, value]) => ({
      name: CATEGORIAS_GASTO_LABELS[cat as CategoriaGasto] ?? cat,
      value,
      color: CATEGORIA_COLORS[cat as CategoriaGasto] ?? '#6B7280',
    }));
  }, [gastos]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/finanzas')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">💸 Gastos</h1>
            <p className="text-sm text-gray-500">{gastos.length} registros totales</p>
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
          <p className="text-xs text-gray-500 font-medium mb-1">Total Período</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(monthTotal)}</p>
        </div>
      </div>

      {pieData.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">Distribución por Categoría</h3>
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
        <h2 className="text-base font-bold text-gray-800 mb-3">Historial de Gastos</h2>
        <RegistrosTable mode="gastos" gastos={gastos} vehicles={vehicles} onDeleteGasto={deleteGasto} />
      </div>
    </div>
  );
};

export default Gastos;
