import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import RegistrosTable from '../../components/Tables/RegistrosTable';
import Select from '../../components/Common/Select';
import type { Gasto } from '../../data/types';
import { Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { formatCurrency, todayStr } from '../../utils/formatting';
import { MESES } from '../../data/catalogs';

/** Tabs por tipo_gasto (Excel migración final + legacy); sin pestaña «Todos». */
const GASTO_TABS: {
  id: string;
  label: string;
  tipo_gasto: string;
  emoji: string;
  gradient: string;
  border: string;
}[] = [
  { id: 'op', label: 'Operativos', tipo_gasto: 'operativo_vehiculo', emoji: '🔧', gradient: 'from-red-500/10 to-rose-500/10', border: 'border-red-200 hover:border-red-400' },
  { id: 'adm', label: 'Administrativos', tipo_gasto: 'administrativo_empresa', emoji: '🏢', gradient: 'from-slate-500/10 to-gray-500/10', border: 'border-slate-200 hover:border-slate-400' },
  { id: 'fin', label: 'Financieros', tipo_gasto: 'financiero_prestamo', emoji: '🏦', gradient: 'from-amber-500/10 to-orange-500/10', border: 'border-amber-200 hover:border-amber-400' },
  { id: 'pla', label: 'Planilla', tipo_gasto: 'planilla_laboral', emoji: '👥', gradient: 'from-indigo-500/10 to-blue-500/10', border: 'border-indigo-200 hover:border-indigo-400' },
  { id: 'inv', label: 'Inversiones', tipo_gasto: 'inversion_compra', emoji: '🚗', gradient: 'from-violet-500/10 to-fuchsia-500/10', border: 'border-violet-200 hover:border-violet-400' },
  { id: 'per', label: 'Personales', tipo_gasto: 'personal_socios_familiares', emoji: '🏠', gradient: 'from-pink-500/10 to-rose-500/10', border: 'border-pink-200 hover:border-pink-400' },
  { id: 'glob', label: 'Globales', tipo_gasto: 'gastos_globales', emoji: '🌐', gradient: 'from-teal-500/10 to-cyan-500/10', border: 'border-teal-200 hover:border-teal-400' },
];

/** Legacy tipo_gasto antes de migración (compat). */
const LEGACY_TIPO_MAP: Record<string, string> = {
  financiero: 'financiero_prestamo',
  inversion: 'inversion_compra',
  personal_socios: 'personal_socios_familiares',
  operativo_flota_global: 'gastos_globales',
};

function tipoGastoEffective(g: Gasto): string | null {
  const raw = g.tipo_gasto?.trim();
  if (!raw) {
    if (g.vehicleId != null) return 'operativo_vehiculo';
    return 'gastos_globales';
  }
  return LEGACY_TIPO_MAP[raw] ?? raw;
}

function gastoEnTab(g: Gasto, tabTipo: string): boolean {
  return tipoGastoEffective(g) === tabTipo;
}

const Gastos: React.FC = () => {
  const navigate = useNavigate();
  const { gastos, vehicles, deleteGasto } = useRegistrosContext();
  const { open } = useDrawer();

  const [tabIndex, setTabIndex] = useState<number | null>(null);
  const tab = tabIndex == null ? null : (GASTO_TABS[tabIndex] ?? null);

  const gastosTab = useMemo(
    () => (tab ? gastos.filter((g) => gastoEnTab(g, tab.tipo_gasto)) : []),
    [gastos, tab],
  );

  const todayTotal = useMemo(
    () => gastosTab.filter((g) => g.fecha === todayStr()).reduce((s, g) => s + g.monto, 0),
    [gastosTab],
  );

  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const g of gastosTab) {
      const y = Number(g.fecha.slice(0, 4));
      if (Number.isFinite(y) && y > 0) ys.add(y);
    }
    return [...ys].sort((a, b) => b - a);
  }, [gastosTab]);

  const [chartYear, setChartYear] = useState<string>('');
  const [historyYear, setHistoryYear] = useState<string>('ALL');

  useEffect(() => {
    if (availableYears.length === 0) {
      setChartYear('');
      return;
    }
    setChartYear((prev) => {
      const n = prev ? Number(prev) : NaN;
      if (prev && Number.isFinite(n) && availableYears.includes(n)) return prev;
      return String(availableYears[0]);
    });
  }, [availableYears]);

  useEffect(() => {
    if (availableYears.length === 0) {
      setHistoryYear('ALL');
      return;
    }
    setHistoryYear((prev) => {
      if (prev === 'ALL') return prev;
      const n = Number(prev);
      if (Number.isFinite(n) && availableYears.includes(n)) return prev;
      return 'ALL';
    });
  }, [availableYears]);

  const chartYearNum = chartYear ? Number(chartYear) : NaN;

  const gastosDelAnioGrafico = useMemo(() => {
    if (!Number.isFinite(chartYearNum)) return [];
    const prefix = `${chartYearNum}-`;
    return gastosTab.filter((g) => g.fecha.startsWith(prefix));
  }, [gastosTab, chartYearNum]);

  const totalAnioGrafico = gastosDelAnioGrafico.reduce((s, g) => s + g.monto, 0);

  const chartData = useMemo(() => {
    return MESES.map((mes) => {
      const month = String(mes.value).padStart(2, '0');
      const total = gastosDelAnioGrafico
        .filter((g) => g.fecha.slice(5, 7) === month)
        .reduce((s, g) => s + g.monto, 0);
      return { mes: mes.label.slice(0, 3), total };
    });
  }, [gastosDelAnioGrafico]);

  const yearOptions = useMemo(
    () => availableYears.map((y) => ({ value: String(y), label: String(y) })),
    [availableYears],
  );

  const historyYearOptions = useMemo(
    () => [{ value: 'ALL', label: 'Todos los años' }, ...yearOptions],
    [yearOptions],
  );

  const gastosHistorialFiltrados = useMemo(() => {
    if (historyYear === 'ALL') return gastosTab;
    const prefix = `${historyYear}-`;
    return gastosTab.filter((g) => g.fecha.startsWith(prefix));
  }, [gastosTab, historyYear]);

  const [filterSubtipoGasto, setFilterSubtipoGasto] = useState('');
  const [filterReqRevision, setFilterReqRevision] = useState('');

  const subtipoGastoOptions = useMemo(() => {
    const s = new Set<string>();
    for (const g of gastosHistorialFiltrados) {
      const t = g.subtipo_gasto?.trim();
      if (t) s.add(t);
    }
    return [{ value: '', label: 'Todos subtipo' }, ...[...s].sort().map((v) => ({ value: v, label: v }))];
  }, [gastosHistorialFiltrados]);

  const reqRevisionOptions = [
    { value: '', label: 'Todas (revisión)' },
    { value: 'si', label: 'Requiere revisión' },
    { value: 'no', label: 'Sin marca de revisión' },
  ];

  const gastosParaTabla = useMemo(() => {
    let d = gastosHistorialFiltrados;
    if (filterSubtipoGasto) d = d.filter((g) => (g.subtipo_gasto ?? '') === filterSubtipoGasto);
    if (filterReqRevision === 'si') d = d.filter((g) => g.requiere_revision === true);
    if (filterReqRevision === 'no') d = d.filter((g) => g.requiere_revision !== true);
    return d;
  }, [gastosHistorialFiltrados, filterSubtipoGasto, filterReqRevision]);

  const totalFlota = useMemo(() => gastos.reduce((s, g) => s + g.monto, 0), [gastos]);
  const resumenPorCategoria = useMemo(
    () =>
      Object.fromEntries(
        GASTO_TABS.map((t) => {
          const rows = gastos.filter((g) => gastoEnTab(g, t.tipo_gasto));
          return [t.tipo_gasto, { count: rows.length, monto: rows.reduce((s, g) => s + g.monto, 0) }];
        }),
      ),
    [gastos],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/finanzas')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">💸 Gastos</h1>
            <p className="text-sm text-gray-500">
              {gastos.length} movimientos · S/ {totalFlota.toLocaleString('es-PE', { minimumFractionDigits: 2 })} total tabla
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Selecciona una categoría para ver su resumen y su historial. «Caja negocio» sigue en Finanzas → Caja negocio.
            </p>
          </div>
        </div>
        <button onClick={() => open('expense')}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold shadow-soft transition-all">
          + Registrar
        </button>
      </div>

      {tab == null && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-3" role="tablist" aria-label="Categoría de gasto">
          {GASTO_TABS.map((t, i) => {
            const data = resumenPorCategoria[t.tipo_gasto] ?? { count: 0, monto: 0 };
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={false}
                onClick={() => setTabIndex(i)}
                className={`mission-btn bg-gradient-to-br ${t.gradient} border-2 ${t.border} group text-left`}
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-3xl group-hover:scale-110 transition-transform">{t.emoji}</span>
                  <span className="text-sm font-bold text-gray-800 tabular-nums">{formatCurrency(data.monto)}</span>
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-1">{t.label}</h3>
                <p className="text-xs text-gray-500">{data.count} registros</p>
                <div className="mt-3 text-[11px] font-semibold text-primary-700/80">
                  Entrar a {t.label}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!tab ? null : (
        <>
      <div className="flex items-center justify-between">
        <h2 className="text-base sm:text-lg font-bold text-gray-800">Categoría: {tab.label}</h2>
        <button
          type="button"
          onClick={() => setTabIndex(null)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          ← Volver a categorías
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
          <p className="text-xs text-red-600 font-medium mb-1">Total HOY ({tab.label})</p>
          <p className="text-2xl font-bold text-red-700">{formatCurrency(todayTotal)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-soft">
          <p className="text-xs text-gray-500 font-medium mb-1">
            {chartYear ? `Total ${chartYear}` : 'Total año'} ({tab.label})
          </p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalAnioGrafico)}</p>
          <p className="text-[11px] text-gray-400 mt-1">Mismo año que el gráfico inferior · pestaña actual</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-700">Gastos por Mes</h3>
            <p className="text-xs text-gray-500 mt-1">
              Pestaña «{tab.label}» · año calendario.
            </p>
          </div>
          {yearOptions.length > 0 ? (
            <div className="w-full sm:w-40 shrink-0">
              <Select label="Año" options={yearOptions} value={chartYear} onChange={setChartYear} />
            </div>
          ) : (
            <p className="text-xs text-gray-400">Sin fechas para graficar en esta pestaña</p>
          )}
        </div>
        <div className="h-48">
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
        </div>
      </div>

      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
          <h2 className="text-base font-bold text-gray-800">Historial · {tab.label}</h2>
          <div className="w-full sm:w-44">
            <Select
              label="Año historial"
              options={historyYearOptions}
              value={historyYear}
              onChange={setHistoryYear}
            />
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap mb-3">
          <div className="w-full sm:w-52">
            <Select
              label="subtipo_gasto"
              options={subtipoGastoOptions}
              value={filterSubtipoGasto}
              onChange={setFilterSubtipoGasto}
            />
          </div>
          <div className="w-full sm:w-56">
            <Select
              label="Revisión"
              options={reqRevisionOptions}
              value={filterReqRevision}
              onChange={setFilterReqRevision}
            />
          </div>
        </div>
        <RegistrosTable
          mode="gastos"
          gastos={gastosParaTabla}
          vehicles={vehicles}
          onDeleteGasto={deleteGasto}
          showClasificacionFinanciera
        />
      </div>
        </>
      )}
    </div>
  );
};

export default Gastos;
