import React from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import Card from '../Common/Card';
import { CategoriaGasto } from '../../data/types';
import { CATEGORIAS_GASTO_LABELS, CATEGORIA_COLORS } from '../../data/catalogs';
import { formatCurrency } from '../../utils/formatting';

interface ExpensesByCategoryProps {
  gastosPorCategoria: Record<string, number>;
}

const COLORS = ['#4F46E5', '#8B5CF6', '#F59E0B', '#10B981'];

const CustomTooltip = ({ active, payload }: Record<string, unknown>) => {
  if (active && Array.isArray(payload) && payload.length) {
    const item = payload[0] as { name: string; value: number; payload: { percentage: number } };
    return (
      <div className="bg-white border border-gray-100 rounded-xl shadow-soft-md p-3">
        <p className="text-xs font-semibold text-gray-700 mb-1">{item.name}</p>
        <p className="text-sm font-bold text-gray-900">{formatCurrency(item.value)}</p>
        <p className="text-xs text-gray-400">{item.payload.percentage.toFixed(1)}% del total</p>
      </div>
    );
  }
  return null;
};

const ExpensesByCategory: React.FC<ExpensesByCategoryProps> = ({ gastosPorCategoria }) => {
  const total = Object.values(gastosPorCategoria).reduce((s, v) => s + v, 0);

  const chartData = Object.entries(gastosPorCategoria)
    .filter(([, val]) => val > 0)
    .map(([key, value]) => ({
      name: CATEGORIAS_GASTO_LABELS[key as CategoriaGasto] ?? key,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0,
      color: CATEGORIA_COLORS[key as CategoriaGasto] ?? '#6B7280',
    }));

  if (chartData.length === 0) {
    return (
      <Card title="Gastos por Categoría" subtitle="Distribución de gastos">
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
          Sin datos para el período seleccionado
        </div>
      </Card>
    );
  }

  return (
    <Card title="Gastos por Categoría" subtitle="Distribución porcentual de gastos">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={95}
              paddingAngle={3}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  stroke="none"
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
              formatter={(value) => <span className="text-gray-600">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export default ExpensesByCategory;
