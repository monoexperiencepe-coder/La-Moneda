import React from 'react';
import { Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { formatCurrency } from '../../utils/formatting';

export interface GastosMesChartProps {
  chartData: Array<{ mes: string; total: number }>;
  /** Colores premium para barras (por categoría de gasto). */
  barFrom?: string;
  barTo?: string;
  /** `month`: eje por nombre de mes. `day`: eje por día dentro del mes filtrado. */
  bucket?: 'month' | 'day';
}

const GastosMesChart: React.FC<GastosMesChartProps> = ({
  chartData,
  barFrom = '#FB7185',
  barTo = '#B91C1C',
  bucket = 'month',
}) => {
  const gid = React.useId().replace(/:/g, '');
  const gradId = `gastoBar-${gid}`;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        margin={{ top: 4, right: 6, left: -14, bottom: bucket === 'day' ? 14 : 0 }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={barFrom} stopOpacity={0.95} />
            <stop offset="100%" stopColor={barTo} stopOpacity={1} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" strokeOpacity={0.85} vertical={false} />
        <XAxis
          dataKey="mes"
          tick={{ fontSize: bucket === 'day' ? 9 : 10, fill: '#64748B', fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
          dy={4}
          interval={bucket === 'day' ? 'preserveStartEnd' : 0}
          angle={bucket === 'day' ? -32 : 0}
          textAnchor={bucket === 'day' ? 'end' : 'middle'}
          height={bucket === 'day' ? 30 : undefined}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#94A3B8' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `S/${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          cursor={{ fill: 'rgba(248, 250, 252, 0.85)', radius: 8 }}
          formatter={(v) => [
            formatCurrency(Number(v)),
            bucket === 'day' ? 'Total del día' : 'Gastos del mes',
          ]}
          labelFormatter={(label) => (bucket === 'day' ? `Día ${label}` : `Mes: ${label}`)}
          contentStyle={{
            borderRadius: '14px',
            border: '1px solid rgba(226, 232, 240, 0.95)',
            boxShadow: '0 10px 40px -12px rgba(15, 23, 42, 0.18)',
            fontSize: '13px',
            padding: '10px 14px',
          }}
        />
        <Bar
          dataKey="total"
          fill={`url(#${gradId})`}
          radius={[8, 8, 0, 0]}
          maxBarSize={bucket === 'day' ? 12 : 28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default GastosMesChart;
