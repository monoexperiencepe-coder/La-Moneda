import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import Card from '../../components/Common/Card';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatCurrency, todayStr, toDateOnlyString } from '../../utils/formatting';
import { ingresoMontoPEN } from '../../utils/moneda';
import { calculateKPIs, calculateFinancialKPIs } from '../../utils/calculations';

type ResumenPreset = 'mes_actual' | 'mes_anterior' | 'anio_actual' | 'todo' | 'personalizado';

const CATEGORIA_MAP = [
  { key: 'operativo_vehiculo', label: 'Operativos' },
  { key: 'administrativo_empresa', label: 'Administrativos' },
  { key: 'financiero_prestamo', label: 'Financieros' },
  { key: 'planilla_laboral', label: 'Planilla' },
  { key: 'inversion_compra', label: 'Inversiones' },
  { key: 'personal_socios_familiares', label: 'Personales' },
  { key: 'gastos_globales', label: 'Globales' },
] as const;

function monthRange(year: number, month: number): { desde: string; hasta: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const desde = `${year}-${pad(month)}-01`;
  const last = new Date(year, month, 0).getDate();
  const hasta = `${year}-${pad(month)}-${pad(last)}`;
  return { desde, hasta };
}

function monthLabel(month: number): string {
  const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return names[Math.max(1, Math.min(12, month)) - 1];
}

function getRangeByPreset(
  preset: ResumenPreset,
  customYear: number,
  customMonth: number | 'all',
): { desde: string | null; hasta: string | null; label: string } {
  const t = todayStr();
  const yy = Number(t.slice(0, 4));
  const mm = Number(t.slice(5, 7));
  if (preset === 'mes_actual') {
    const r = monthRange(yy, mm);
    return { ...r, label: 'Mes actual' };
  }
  if (preset === 'mes_anterior') {
    const pm = mm === 1 ? 12 : mm - 1;
    const py = mm === 1 ? yy - 1 : yy;
    const r = monthRange(py, pm);
    return { ...r, label: 'Mes anterior' };
  }
  if (preset === 'anio_actual') {
    return { desde: `${yy}-01-01`, hasta: `${yy}-12-31`, label: 'Año actual' };
  }
  if (preset === 'personalizado') {
    if (customMonth === 'all') {
      return {
        desde: `${customYear}-01-01`,
        hasta: `${customYear}-12-31`,
        label: `Personalizado: ${customYear} (todo el año)`,
      };
    }
    const r = monthRange(customYear, customMonth);
    return { ...r, label: `Personalizado: ${monthLabel(customMonth)} ${customYear}` };
  }
  return { desde: null, hasta: null, label: 'Todo' };
}

function normalizeTipoGasto(raw: string | null | undefined, hasVehicle: boolean): string {
  const t = (raw ?? '').trim();
  if (!t) return hasVehicle ? 'operativo_vehiculo' : 'gastos_globales';
  const legacyMap: Record<string, string> = {
    financiero: 'financiero_prestamo',
    inversion: 'inversion_compra',
    personal_socios: 'personal_socios_familiares',
    operativo_flota_global: 'gastos_globales',
  };
  return legacyMap[t] ?? t;
}

const Resumen: React.FC = () => {
  const navigate = useNavigate();
  const { ingresos, gastos, vehicles } = useRegistrosContext();
  const [preset, setPreset] = useState<ResumenPreset>('mes_actual');
  const current = todayStr();
  const currentYear = Number(current.slice(0, 4));
  const currentMonth = Number(current.slice(5, 7));
  const [customYear, setCustomYear] = useState<number>(currentYear);
  const [customMonth, setCustomMonth] = useState<number | 'all'>(currentMonth);
  const range = useMemo(
    () => getRangeByPreset(preset, customYear, customMonth),
    [preset, customYear, customMonth],
  );

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const i of ingresos) {
      const y = Number(toDateOnlyString(i.fecha)?.slice(0, 4));
      if (Number.isFinite(y)) years.add(y);
    }
    for (const g of gastos) {
      const y = Number(toDateOnlyString(g.fecha)?.slice(0, 4));
      if (Number.isFinite(y)) years.add(y);
    }
    years.add(currentYear);
    return [...years].sort((a, b) => b - a);
  }, [ingresos, gastos, currentYear]);

  const inPeriod = (fecha: string) => {
    const d = toDateOnlyString(fecha);
    if (!d) return false;
    if (!range.desde || !range.hasta) return true;
    return d >= range.desde && d <= range.hasta;
  };

  const ingresosP = useMemo(() => ingresos.filter((i) => inPeriod(i.fecha)), [ingresos, range]);
  const gastosP = useMemo(() => gastos.filter((g) => inPeriod(g.fecha)), [gastos, range]);

  const totalIngresos = useMemo(() => ingresosP.reduce((s, i) => s + ingresoMontoPEN(i), 0), [ingresosP]);
  const totalGastos = useMemo(() => gastosP.reduce((s, g) => s + g.monto, 0), [gastosP]);
  const resultadoNeto = totalIngresos - totalGastos;
  const margenPct = totalIngresos > 0 ? (resultadoNeto / totalIngresos) * 100 : null;

  const hasData = ingresosP.length > 0 || gastosP.length > 0;

  const distribucion = useMemo(() => {
    const total = totalGastos;
    const acc: Record<string, number> = Object.fromEntries(CATEGORIA_MAP.map((c) => [c.key, 0]));
    for (const g of gastosP) {
      const k = normalizeTipoGasto(g.tipo_gasto, g.vehicleId != null);
      if (acc[k] != null) acc[k] += g.monto;
    }
    return CATEGORIA_MAP.map((c) => {
      const monto = acc[c.key] ?? 0;
      const pct = total > 0 ? (monto / total) * 100 : 0;
      return { key: c.key, label: c.label, monto, pct };
    }).sort((a, b) => b.monto - a.monto);
  }, [gastosP, totalGastos]);

  const byKey = Object.fromEntries(distribucion.map((d) => [d.key, d.monto]));
  const alertas = useMemo(() => {
    const out: { tone: 'danger' | 'warning' | 'success'; text: string }[] = [];
    if (resultadoNeto < 0) out.push({ tone: 'danger', text: 'Resultado negativo' });
    if (totalIngresos > 0 && (byKey.financiero_prestamo ?? 0) > totalIngresos * 0.3) {
      out.push({ tone: 'danger', text: 'Gasto financiero alto' });
    }
    if (totalIngresos > 0 && (byKey.planilla_laboral ?? 0) > totalIngresos * 0.25) {
      out.push({ tone: 'warning', text: 'Planilla elevada' });
    }
    if (totalGastos > 0 && (byKey.gastos_globales ?? 0) > totalGastos * 0.1) {
      out.push({ tone: 'warning', text: 'Hay gastos globales por revisar' });
    }
    if (!out.length) out.push({ tone: 'success', text: 'Sin alertas críticas' });
    return out;
  }, [resultadoNeto, totalIngresos, totalGastos, byKey]);

  const topOperativosVehiculo = useMemo(() => {
    const map = new Map<number, number>();
    for (const g of gastosP) {
      const k = normalizeTipoGasto(g.tipo_gasto, g.vehicleId != null);
      if (k !== 'operativo_vehiculo') continue;
      if (g.vehicleId == null) continue;
      map.set(g.vehicleId, (map.get(g.vehicleId) ?? 0) + g.monto);
    }
    return [...map.entries()]
      .map(([vehicleId, monto]) => {
        const v = vehicles.find((x) => x.id === vehicleId);
        const name = v ? `${v.marca} ${v.modelo} (${v.placa})` : `Unidad #${vehicleId}`;
        return { vehicleId, name, monto };
      })
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 5);
  }, [gastosP, vehicles]);

  const legacy = useMemo(() => calculateKPIs(ingresosP, gastosP, []), [ingresosP, gastosP]);
  const intel = useMemo(() => calculateFinancialKPIs(ingresosP, gastosP), [ingresosP, gastosP]);

  const cardValue = (v: number | null) =>
    hasData ? (v == null ? 'Sin datos del periodo' : formatCurrency(v)) : 'Sin datos del periodo';
  const cardPct = (v: number | null) =>
    hasData && v != null ? `${v.toFixed(1)}%` : 'Sin datos del periodo';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/finanzas')}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 shrink-0"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📋 Resumen Ejecutivo</h1>
          <p className="text-sm text-gray-500">Vista para decisión rápida del dueño de flota.</p>
        </div>
      </div>

      <Card title="Periodo" subtitle={`Vista: ${range.label}${range.desde && range.hasta ? ` · ${range.desde} → ${range.hasta}` : ''}`}>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'mes_actual', label: 'Mes actual' },
            { id: 'mes_anterior', label: 'Mes anterior' },
            { id: 'anio_actual', label: 'Año actual' },
            { id: 'todo', label: 'Todo' },
            { id: 'personalizado', label: 'Personalizado' },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id as ResumenPreset)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${
                preset === p.id
                  ? 'bg-primary-50 border-primary-300 text-primary-700'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'personalizado' && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              className="input-field"
              value={customYear}
              onChange={(e) => setCustomYear(Number(e.target.value))}
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  Año {y}
                </option>
              ))}
            </select>
            <select
              className="input-field"
              value={customMonth}
              onChange={(e) => setCustomMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            >
              <option value="all">Todo el año</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="!p-4">
          <p className="text-xs text-gray-500">Ingresos del periodo</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">{cardValue(totalIngresos)}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-gray-500">Gastos del periodo</p>
          <p className="text-xl font-bold text-red-700 mt-1">{cardValue(totalGastos)}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-gray-500">Resultado neto</p>
          <p className={`text-xl font-bold mt-1 ${resultadoNeto >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {cardValue(resultadoNeto)}
          </p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-gray-500">Margen neto %</p>
          <p className={`text-xl font-bold mt-1 ${margenPct == null || margenPct >= 0 ? 'text-slate-800' : 'text-red-700'}`}>
            {cardPct(margenPct)}
          </p>
        </Card>
      </div>

      <Card title="¿Dónde se fue el dinero?" subtitle="Distribución de gastos por categoría (tipo_gasto).">
        {totalGastos <= 0 ? (
          <p className="text-sm text-gray-500">Sin datos del periodo.</p>
        ) : (
          <div className="space-y-3">
            {distribucion.map((d) => (
              <div key={d.key}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-gray-800">{d.label}</span>
                  <span className="text-gray-600 tabular-nums">
                    {formatCurrency(d.monto)} · {d.pct.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-2 bg-primary-500 rounded-full" style={{ width: `${Math.max(0, Math.min(100, d.pct))}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Alertas accionables">
        <ul className="space-y-2">
          {alertas.map((a, i) => (
            <li
              key={`${a.text}-${i}`}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                a.tone === 'danger'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : a.tone === 'warning'
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}
            >
              {a.text}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Top gastos operativos por vehículo">
        {topOperativosVehiculo.length === 0 ? (
          <p className="text-sm text-gray-500">Sin gastos operativos registrados en este periodo.</p>
        ) : (
          <div className="space-y-2">
            {topOperativosVehiculo.map((x, idx) => (
              <div key={x.vehicleId} className="flex items-center justify-between text-sm">
                <span className="text-gray-800">
                  {idx + 1}. {x.name}
                </span>
                <span className="font-semibold text-red-700 tabular-nums">{formatCurrency(x.monto)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <details className="bg-white rounded-xl border border-gray-100 shadow-soft p-4">
        <summary className="cursor-pointer text-sm font-bold text-gray-800">Detalle técnico</summary>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-gray-100 p-3">
            <p className="text-xs text-gray-500">Legacy</p>
            <p className="text-gray-700">Total ingresos: {formatCurrency(legacy.totalIngresos)}</p>
            <p className="text-gray-700">Total gastos: {formatCurrency(legacy.totalGastos)}</p>
            <p className="text-gray-700">Margen neto: {formatCurrency(legacy.margenNeto)}</p>
          </div>
          <div className="rounded-lg border border-gray-100 p-3">
            <p className="text-xs text-gray-500">Inteligente</p>
            <p className="text-gray-700">Gastos operativos: {formatCurrency(intel.gastos_operativos)}</p>
            <p className="text-gray-700">Gastos financieros: {formatCurrency(intel.gastos_financieros)}</p>
            <p className="text-gray-700">Gastos administrativos: {formatCurrency(intel.gastos_administrativos)}</p>
            <p className="text-gray-700">Utilidad operativa: {formatCurrency(intel.utilidad_operativa)}</p>
            <p className="text-gray-700">Utilidad neta simple: {formatCurrency(intel.utilidad_neta_simple)}</p>
          </div>
        </div>
      </details>
    </div>
  );
};

export default Resumen;
