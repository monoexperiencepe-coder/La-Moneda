import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import Select from '../Common/Select';
import { formatCurrency, formatMontoGraficoBarra } from '../../utils/formatting';

export type MonthlyBarChartVariant = 'emerald' | 'teal';

const VARIANT_STYLES: Record<
  MonthlyBarChartVariant,
  { bar: string; labelFill: string; gridAmountClass: string }
> = {
  emerald: {
    bar: '#10B981',
    labelFill: '#047857',
    gridAmountClass: 'text-emerald-800',
  },
  teal: {
    bar: '#14B8A6',
    labelFill: '#0F766E',
    gridAmountClass: 'text-teal-900',
  },
};

export interface MonthlyBarChartCardProps {
  title: string;
  subtitle?: string;
  chartYear: string;
  onChartYearChange: (value: string) => void;
  yearOptions: { value: string; label: string }[];
  chartData: { mes: string; total: number }[];
  tooltipSeriesName: string;
  variant?: MonthlyBarChartVariant;
  /** Texto opcional bajo el subtítulo (ej. aclarar filtros activos). */
  footerHint?: string;
}

const MonthlyBarChartCard: React.FC<MonthlyBarChartCardProps> = ({
  title,
  subtitle,
  chartYear,
  onChartYearChange,
  yearOptions,
  chartData,
  tooltipSeriesName,
  variant = 'emerald',
  footerHint,
}) => {
  const vs = VARIANT_STYLES[variant];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-700">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          {footerHint && <p className="text-[11px] text-gray-400 mt-1">{footerHint}</p>}
        </div>
        {yearOptions.length > 0 ? (
          <div className="w-full sm:w-40 shrink-0">
            <Select label="Año" options={yearOptions} value={chartYear} onChange={onChartYearChange} />
          </div>
        ) : (
          <p className="text-xs text-gray-400">Sin fechas para graficar</p>
        )}
      </div>
      <div className="h-[260px] sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 28, right: 8, left: 4, bottom: 4 }} barCategoryGap="18%">
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis
              dataKey="mes"
              tick={{ fontSize: 11, fill: '#6B7280', fontWeight: 500 }}
              axisLine={{ stroke: '#E5E7EB' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `S/${(v / 1000).toFixed(0)}k`}
              width={44}
            />
            <Tooltip
              formatter={(v) => [formatCurrency(Number(v)), tooltipSeriesName]}
              labelFormatter={(label) => `Mes: ${label}`}
              contentStyle={{
                borderRadius: '12px',
                border: '1px solid #E5E7EB',
                fontSize: '12px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07)',
              }}
            />
            <Bar dataKey="total" fill={vs.bar} radius={[8, 8, 0, 0]} maxBarSize={52}>
              <LabelList
                dataKey="total"
                position="top"
                offset={8}
                formatter={(v: number | string) => formatMontoGraficoBarra(Number(v))}
                style={{
                  fill: vs.labelFill,
                  fontSize: 11,
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-5 pt-5 border-t border-gray-100">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Montos del año ({chartYear || '—'})
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
          {chartData.map((row) => (
            <div
              key={row.mes}
              className="rounded-xl bg-gradient-to-b from-gray-50 to-white border border-gray-100/90 px-2 py-2 text-center shadow-sm"
            >
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{row.mes}</div>
              <div className={`mt-1 text-xs font-bold tabular-nums leading-tight ${vs.gridAmountClass}`}>
                {row.total > 0 ? formatCurrency(row.total) : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MonthlyBarChartCard;
