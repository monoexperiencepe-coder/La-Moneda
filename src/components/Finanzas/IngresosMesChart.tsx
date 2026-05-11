import React from 'react';
import { Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { formatCurrency } from '../../utils/formatting';

export interface IngresosMesChartProps {
  chartData: Array<{ mes: string; total: number }>;
  barFrom?: string;
  barTo?: string;
}

const IngresosMesChart: React.FC<IngresosMesChartProps> = ({
  chartData,
  barFrom = '#34D399',
  barTo = '#047857',
}) => {
  const gid = React.useId().replace(/:/g, '');
  const gradId = `ingresoBar-${gid}`;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 6, right: 8, left: -12, bottom: 2 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={barFrom} stopOpacity={0.95} />
            <stop offset="100%" stopColor={barTo} stopOpacity={1} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" strokeOpacity={0.85} vertical={false} />
        <XAxis
          dataKey="mes"
          tick={{ fontSize: 12, fill: '#64748B', fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
          dy={4}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#94A3B8' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `S/${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          cursor={{ fill: 'rgba(236, 253, 245, 0.9)', radius: 8 }}
          formatter={(v) => [formatCurrency(Number(v)), 'Ingresos del mes']}
          labelFormatter={(label) => `Mes: ${label}`}
          contentStyle={{
            borderRadius: '14px',
            border: '1px solid rgba(209, 250, 229, 0.95)',
            boxShadow: '0 10px 40px -12px rgba(6, 78, 59, 0.2)',
            fontSize: '13px',
            padding: '10px 14px',
          }}
        />
        <Bar dataKey="total" fill={`url(#${gradId})`} radius={[8, 8, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default IngresosMesChart;
