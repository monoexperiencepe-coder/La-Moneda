import React from 'react';
import { Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { formatCurrency } from '../../utils/formatting';

interface GastosMesChartProps {
  chartData: Array<{ mes: string; total: number }>;
}

const GastosMesChart: React.FC<GastosMesChartProps> = ({ chartData }) => {
  return (
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
  );
};

export default GastosMesChart;
