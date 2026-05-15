import React from 'react';
import type { ReportesPeriodPreset } from '../../../utils/reportesAnalytics';

interface ReportesPeriodFilterProps {
  preset: ReportesPeriodPreset;
  customYear: number;
  yearOptions: number[];
  onPresetChange: (p: ReportesPeriodPreset) => void;
  onCustomYearChange: (y: number) => void;
}

const PRESETS: { value: ReportesPeriodPreset; label: string }[] = [
  { value: 'anio_actual', label: 'Año actual' },
  { value: 'personalizado', label: 'Elegir año' },
  { value: 'todo', label: 'Histórico' },
];

const ReportesPeriodFilter: React.FC<ReportesPeriodFilterProps> = ({
  preset,
  customYear,
  yearOptions,
  onPresetChange,
  onCustomYearChange,
}) => (
  <div className="flex flex-wrap items-center gap-2">
    {PRESETS.map((p) => (
      <button
        key={p.value}
        type="button"
        onClick={() => onPresetChange(p.value)}
        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
          preset === p.value
            ? 'bg-violet-600 text-white shadow-sm'
            : 'border border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-800'
        }`}
      >
        {p.label}
      </button>
    ))}
    {preset === 'personalizado' && yearOptions.length > 0 ? (
      <select
        value={customYear}
        onChange={(e) => onCustomYearChange(Number(e.target.value))}
        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm"
      >
        {yearOptions.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    ) : null}
  </div>
);

export default ReportesPeriodFilter;
