import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import RegistrosTable from '../../components/Tables/RegistrosTable';
import Select from '../../components/Common/Select';
import Modal from '../../components/Common/Modal';
import Button from '../../components/Common/Button';
import type { Gasto } from '../../data/types';
import { formatCurrency, todayStr } from '../../utils/formatting';
import { MESES } from '../../data/catalogs';
import { REVISION_USER_LABEL } from '../../config/app';
import { updateGastoCategoriaManual } from '../../services/gastosService';
import { useAuth } from '../../context/AuthContext';
import { gastoMatchesTipoGasto, tipoGastoEffective } from '../../utils/gastosTipoGasto';

const GastosMesChart = lazy(() => import('../../components/Finanzas/GastosMesChart'));

type GastoTabDef = {
  id: string;
  label: string;
  tipo_gasto: string;
  emoji: string;
  gradient: string;
  border: string;
};

/** Misma categoría que antes en la parrilla de Gastos; ahora solo en Finanzas → Inversiones. */
const INVERSION_GASTO_TAB: GastoTabDef = {
  id: 'inv',
  label: 'Inversión con utilidad',
  tipo_gasto: 'inversion_compra',
  emoji: '🚗',
  gradient: 'from-violet-500/10 to-fuchsia-500/10',
  border: 'border-violet-200 hover:border-violet-400',
};

/**
 * Años anteriores no entran en tendencia mensual ni en los selectores de año (evita ruido por fechas
 * mal parseadas: 1900, 2008, etc.). Los gastos siguen en BD; en historial "Todos los años" siguen visibles.
 */
const GASTOS_TREND_YEAR_MIN = 2009;

/** Tabs por tipo_gasto en la pantalla Gastos (sin inversiones; van a `/finanzas/inversiones`). */
const GASTO_TABS: GastoTabDef[] = [
  { id: 'op', label: 'Operativos', tipo_gasto: 'operativo_vehiculo', emoji: '🔧', gradient: 'from-red-500/10 to-rose-500/10', border: 'border-red-200 hover:border-red-400' },
  { id: 'adm', label: 'Administrativos', tipo_gasto: 'administrativo_empresa', emoji: '🏢', gradient: 'from-slate-500/10 to-gray-500/10', border: 'border-slate-200 hover:border-slate-400' },
  { id: 'fin', label: 'Financieros', tipo_gasto: 'financiero_prestamo', emoji: '🏦', gradient: 'from-amber-500/10 to-orange-500/10', border: 'border-amber-200 hover:border-amber-400' },
  { id: 'pla', label: 'Planilla', tipo_gasto: 'planilla_laboral', emoji: '👥', gradient: 'from-indigo-500/10 to-blue-500/10', border: 'border-indigo-200 hover:border-indigo-400' },
  { id: 'per', label: 'Personales', tipo_gasto: 'personal_socios_familiares', emoji: '🏠', gradient: 'from-pink-500/10 to-rose-500/10', border: 'border-pink-200 hover:border-pink-400' },
  { id: 'glob', label: 'Globales', tipo_gasto: 'gastos_globales', emoji: '🌐', gradient: 'from-teal-500/10 to-cyan-500/10', border: 'border-teal-200 hover:border-teal-400' },
];

/** Orden para el modal «mover categoría» (incluye inversiones). */
const GASTO_CATEGORIAS_PARA_MOVIMIENTO: GastoTabDef[] = [
  ...GASTO_TABS.slice(0, 4),
  INVERSION_GASTO_TAB,
  ...GASTO_TABS.slice(4),
];

/** Franja superior en la tarjeta de resumen (acento por categoría). */
const TAB_ACCENT_STRIP: Record<string, string> = {
  op: 'from-red-500 via-rose-500 to-red-700',
  adm: 'from-slate-500 via-gray-600 to-slate-800',
  fin: 'from-amber-500 via-orange-500 to-amber-700',
  pla: 'from-indigo-500 via-blue-600 to-indigo-800',
  inv: 'from-violet-500 via-fuchsia-600 to-violet-800',
  per: 'from-pink-500 via-rose-500 to-pink-700',
  glob: 'from-teal-500 via-cyan-600 to-teal-800',
};

/** Degradado de barras del gráfico mensual (coherente con la categoría). */
const TAB_BAR_GRADIENT: Record<string, { from: string; to: string }> = {
  op: { from: '#FB7185', to: '#B91C1C' },
  adm: { from: '#94A3B8', to: '#475569' },
  fin: { from: '#FBBF24', to: '#C2410C' },
  pla: { from: '#818CF8', to: '#3730A3' },
  inv: { from: '#C084FC', to: '#6B21A8' },
  per: { from: '#F472B6', to: '#BE185D' },
  glob: { from: '#2DD4BF', to: '#0F766E' },
};

const PERIODO_SUBTIPO_OPTIONS: { value: 'ALL' | 'YEAR' | 'MONTH'; label: string }[] = [
  { value: 'ALL', label: 'Histórico completo' },
  { value: 'YEAR', label: 'Un año entero' },
  { value: 'MONTH', label: 'Un solo mes' },
];

interface GastosProps {
  /** Vista dedicada en `/finanzas/inversiones` (misma lógica que la antigua pestaña). */
  mode?: 'default' | 'inversiones';
  /** Oculta cabeceras de página cuando este bloque va dentro de tabs en Inversiones. */
  embeddedInParent?: boolean;
}

const Gastos: React.FC<GastosProps> = ({ mode = 'default', embeddedInParent = false }) => {
  const navigate = useNavigate();
  const { gastos, vehicles, deleteGasto, refreshFromSupabase, toast } = useRegistrosContext();
  const { canEditFinances } = useAuth();
  const { open } = useDrawer();

  const isInversionesPage = mode === 'inversiones';
  const hidePageChrome = embeddedInParent && isInversionesPage;
  const [tabIndex, setTabIndex] = useState<number | null>(null);
  const tab = isInversionesPage
    ? INVERSION_GASTO_TAB
    : tabIndex == null
      ? null
      : (GASTO_TABS[tabIndex] ?? null);

  const gastosTab = useMemo(
    () => (tab ? gastos.filter((g) => gastoMatchesTipoGasto(g, tab.tipo_gasto)) : []),
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
      if (Number.isFinite(y) && y >= GASTOS_TREND_YEAR_MIN) ys.add(y);
    }
    return [...ys].sort((a, b) => b - a);
  }, [gastosTab]);

  const [chartYear, setChartYear] = useState<string>('');
  const [historyYear, setHistoryYear] = useState<string>('ALL');
  const [animatedTotal, setAnimatedTotal] = useState(0);
  const prevTotalRef = useRef(0);
  const [subtipoPeriod, setSubtipoPeriod] = useState<'ALL' | 'YEAR' | 'MONTH'>('ALL');
  const [subtipoAggYear, setSubtipoAggYear] = useState('');
  const [subtipoAggMonth, setSubtipoAggMonth] = useState(() =>
    String(new Date().getMonth() + 1).padStart(2, '0'),
  );

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
      setSubtipoAggYear('');
      return;
    }
    setSubtipoAggYear((prev) => {
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

  useEffect(() => {
    const from = prevTotalRef.current;
    const to = totalAnioGrafico;
    if (Math.abs(to - from) < 0.01) {
      setAnimatedTotal(to);
      return;
    }
    const duration = 420;
    const start = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      // easeOutCubic para que termine suave
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (to - from) * eased;
      setAnimatedTotal(v);
      if (p < 1) rafId = requestAnimationFrame(tick);
      else prevTotalRef.current = to;
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [totalAnioGrafico]);

  const chartData = useMemo(() => {
    return MESES.map((mes) => {
      const month = String(mes.value).padStart(2, '0');
      const total = gastosDelAnioGrafico
        .filter((g) => g.fecha.slice(5, 7) === month)
        .reduce((s, g) => s + g.monto, 0);
      return { mes: mes.label.slice(0, 3), total };
    });
  }, [gastosDelAnioGrafico]);

  /** KPIs legibles para el dueño: promedio mensual del año del gráfico y mes pico. */
  const chartYearInsights = useMemo(() => {
    if (!Number.isFinite(chartYearNum)) {
      return { avgMonthly: 0, peakLabel: '—', peakTotal: 0 };
    }
    const avgMonthly = totalAnioGrafico / 12;
    let peakTotal = 0;
    let peakLabel = '—';
    for (const mes of MESES) {
      const mm = String(mes.value).padStart(2, '0');
      const monthTotal = gastosDelAnioGrafico
        .filter((g) => g.fecha.slice(5, 7) === mm)
        .reduce((s, g) => s + g.monto, 0);
      if (monthTotal > peakTotal) {
        peakTotal = monthTotal;
        peakLabel = mes.label;
      }
    }
    if (peakTotal <= 0) peakLabel = '—';
    return { avgMonthly, peakLabel, peakTotal };
  }, [chartYearNum, totalAnioGrafico, gastosDelAnioGrafico]);

  const yearOptions = useMemo(
    () => availableYears.map((y) => ({ value: String(y), label: String(y) })),
    [availableYears],
  );

  const monthOptionsAgg = useMemo(
    () =>
      MESES.map((m) => ({
        value: String(m.value).padStart(2, '0'),
        label: m.label,
      })),
    [],
  );

  const gastosForSubtipoAgg = useMemo(() => {
    if (subtipoPeriod === 'ALL') return gastosTab;
    if (!subtipoAggYear.trim()) return [];
    if (subtipoPeriod === 'YEAR') {
      const prefix = `${subtipoAggYear.trim()}-`;
      return gastosTab.filter((g) => g.fecha.startsWith(prefix));
    }
    const mm = subtipoAggMonth.padStart(2, '0');
    const prefix = `${subtipoAggYear.trim()}-${mm}-`;
    return gastosTab.filter((g) => g.fecha.startsWith(prefix));
  }, [gastosTab, subtipoPeriod, subtipoAggYear, subtipoAggMonth]);

  const subtipoAggRows = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const g of gastosForSubtipoAgg) {
      const raw = g.subtipo_gasto?.trim();
      const key = raw && raw.length > 0 ? raw : '(Sin subtipo)';
      const cur = map.get(key) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += g.monto;
      map.set(key, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [gastosForSubtipoAgg]);

  const subtipoAggGrand = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const [, v] of subtipoAggRows) {
      count += v.count;
      total += v.total;
    }
    return { count, total };
  }, [subtipoAggRows]);

  const subtipoAggPeriodLabel = useMemo(() => {
    if (subtipoPeriod === 'ALL') return 'Todos los años';
    if (!subtipoAggYear) return '—';
    if (subtipoPeriod === 'YEAR') return `Año ${subtipoAggYear}`;
    const mesNombre = MESES.find((m) => String(m.value).padStart(2, '0') === subtipoAggMonth.padStart(2, '0'))?.label;
    return `${mesNombre ?? 'Mes'} ${subtipoAggYear}`;
  }, [subtipoPeriod, subtipoAggYear, subtipoAggMonth]);

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
  const [moveTarget, setMoveTarget] = useState<Gasto | null>(null);
  const [moveTipo, setMoveTipo] = useState('');
  const [moveSubtipo, setMoveSubtipo] = useState('');
  const [moveVehicleId, setMoveVehicleId] = useState<string>('');
  const [moveMotivo, setMoveMotivo] = useState('');
  const [moveSaving, setMoveSaving] = useState(false);

  const subtipoGastoOptions = useMemo(() => {
    const s = new Set<string>();
    for (const g of gastosHistorialFiltrados) {
      const t = g.subtipo_gasto?.trim();
      if (t) s.add(t);
    }
    return [{ value: '', label: 'Todos subtipo' }, ...[...s].sort().map((v) => ({ value: v, label: v }))];
  }, [gastosHistorialFiltrados]);

  const gastosParaTabla = useMemo(() => {
    let d = gastosHistorialFiltrados;
    if (filterSubtipoGasto) d = d.filter((g) => (g.subtipo_gasto ?? '') === filterSubtipoGasto);
    return d;
  }, [gastosHistorialFiltrados, filterSubtipoGasto]);

  const totalFlota = useMemo(() => gastos.reduce((s, g) => s + g.monto, 0), [gastos]);
  const statsInversionesGastos = useMemo(() => {
    const rows = gastos.filter((g) => gastoMatchesTipoGasto(g, 'inversion_compra'));
    return { n: rows.length, monto: rows.reduce((s, g) => s + g.monto, 0) };
  }, [gastos]);

  const resumenPorCategoria = useMemo(
    () =>
      Object.fromEntries(
        GASTO_TABS.map((t) => {
          const rows = gastos.filter((g) => gastoMatchesTipoGasto(g, t.tipo_gasto));
          return [t.tipo_gasto, { count: rows.length, monto: rows.reduce((s, g) => s + g.monto, 0) }];
        }),
      ),
    [gastos],
  );

  const categoriaOptions = useMemo(
    () => GASTO_CATEGORIAS_PARA_MOVIMIENTO.map((t) => ({ value: t.tipo_gasto, label: `${t.emoji} ${t.label}` })),
    [],
  );

  const subtipoOptionsForMove = useMemo(() => {
    const set = new Set<string>();
    for (const g of gastos) {
      const sameTipo = tipoGastoEffective(g) === moveTipo;
      if (!sameTipo) continue;
      const s = g.subtipo_gasto?.trim();
      if (s) set.add(s);
    }
    if (moveTarget?.subtipo_gasto?.trim()) set.add(moveTarget.subtipo_gasto.trim());
    return [{ value: '', label: 'Sin subtipo' }, ...[...set].sort().map((s) => ({ value: s, label: s }))];
  }, [gastos, moveTipo, moveTarget]);

  const vehicleOptions = useMemo(
    () => [
      { value: '', label: 'Seleccionar vehículo' },
      ...vehicles.map((v) => ({ value: String(v.id), label: `${v.marca} ${v.modelo} (${v.placa})` })),
    ],
    [vehicles],
  );

  const openMoveModal = (g: Gasto) => {
    setMoveTarget(g);
    setMoveTipo(tipoGastoEffective(g) ?? 'gastos_globales');
    setMoveSubtipo(g.subtipo_gasto?.trim() ?? '');
    setMoveVehicleId(g.vehicleId != null ? String(g.vehicleId) : '');
    setMoveMotivo('');
  };

  const closeMoveModal = () => {
    if (moveSaving) return;
    setMoveTarget(null);
    setMoveMotivo('');
  };

  const isOperativoTarget = moveTipo === 'operativo_vehiculo';
  const currentEffectiveTipo = moveTarget ? (tipoGastoEffective(moveTarget) ?? 'gastos_globales') : '';
  const currentSubtipo = moveTarget?.subtipo_gasto?.trim() ?? '';
  const currentVehicle = moveTarget?.vehicleId != null ? String(moveTarget.vehicleId) : '';
  const hasAnyChange = moveTarget != null
    && (
      moveTipo !== currentEffectiveTipo
      || moveSubtipo !== currentSubtipo
      || (isOperativoTarget ? moveVehicleId : '') !== (currentEffectiveTipo === 'operativo_vehiculo' ? currentVehicle : '')
    );
  const moveDisabled = !moveTarget
    || moveSaving
    || !hasAnyChange
    || (isOperativoTarget && !moveVehicleId);

  const handleConfirmMoveCategoria = async () => {
    if (!moveTarget) return;
    if (moveDisabled) return;
    const toVehicleId = isOperativoTarget ? Number(moveVehicleId) : null;
    if (isOperativoTarget && !Number.isFinite(toVehicleId)) return;
    const changedAt = new Date().toISOString();
    const prevExtra = (moveTarget.excelExtra && typeof moveTarget.excelExtra === 'object')
      ? moveTarget.excelExtra
      : {};
    const prevHistRaw = (prevExtra as Record<string, unknown>).correcciones_categoria;
    const prevHist = Array.isArray(prevHistRaw) ? prevHistRaw : [];
    const correction = {
      from_tipo_gasto: moveTarget.tipo_gasto ?? null,
      to_tipo_gasto: moveTipo,
      from_subtipo_gasto: moveTarget.subtipo_gasto ?? null,
      to_subtipo_gasto: moveSubtipo || null,
      from_vehicle_id: moveTarget.vehicleId ?? null,
      to_vehicle_id: isOperativoTarget ? toVehicleId : null,
      motivo: moveMotivo.trim() || null,
      changed_at: changedAt,
    };
    const excelExtraNext: Record<string, unknown> = {
      ...(prevExtra as Record<string, unknown>),
      correcciones_categoria: [...prevHist, correction],
    };

    setMoveSaving(true);
    try {
      const updated = await updateGastoCategoriaManual(moveTarget.id, {
        tipo_gasto: moveTipo,
        subtipo_gasto: moveSubtipo || null,
        vehicle_id: isOperativoTarget ? toVehicleId : null,
        es_global_flota: !isOperativoTarget,
        clasificacion_manual: true,
        requiere_revision: false,
        revisado_at: changedAt,
        revisado_por: REVISION_USER_LABEL,
        origen_clasificacion: 'correccion_manual_ui',
        excel_extra: excelExtraNext,
      }, {
        reason: moveMotivo.trim() || 'Mover gasto de categoría desde UI',
      });
      if (!updated) {
        toast.error('No se pudo mover la categoría', 'No se logró actualizar el gasto en Supabase.');
        return;
      }
      toast.success('Categoría actualizada', 'El gasto se movió correctamente.');
      await refreshFromSupabase();
      closeMoveModal();
    } catch (e) {
      toast.error('Error al mover categoría', e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setMoveSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {!hidePageChrome ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/finanzas')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
              <ChevronLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {isInversionesPage ? '🚗 Inversiones' : '💸 Gastos'}
              </h1>
              <p className="text-sm text-gray-500">
                {isInversionesPage ? (
                  <>
                    {statsInversionesGastos.n} movimiento{statsInversionesGastos.n === 1 ? '' : 's'} ·{' '}
                    {formatCurrency(statsInversionesGastos.monto)} en inversión con utilidad (tabla gastos)
                  </>
                ) : (
                  <>
                    {gastos.length} movimientos · S/ {totalFlota.toLocaleString('es-PE', { minimumFractionDigits: 2 })} total tabla
                  </>
                )}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {isInversionesPage
                  ? 'Compras e inversión en flota (tipo_gasto inversion_compra). «Caja negocio» sigue en Finanzas → Caja negocio.'
                  : 'Selecciona una categoría para ver su resumen y su historial. Inversiones: Finanzas → Inversiones. «Caja negocio» sigue en Finanzas → Caja negocio.'}
              </p>
            </div>
          </div>
          <button onClick={() => open('expense')}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold shadow-soft transition-all">
            + Registrar
          </button>
        </div>
      ) : null}

      {tab == null && !isInversionesPage && (
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
      {!hidePageChrome ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Vista detalle</p>
            <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-slate-900">
              {tab.emoji} {tab.label}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => (isInversionesPage ? navigate('/finanzas') : setTabIndex(null))}
            className="shrink-0 rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-900/5 transition hover:border-slate-300 hover:bg-slate-50"
          >
            {isInversionesPage ? '← Volver a Finanzas' : '← Cambiar categoría'}
          </button>
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_28px_56px_-28px_rgba(15,23,42,0.18)]">
        <div
          className={`h-1 w-full bg-gradient-to-r ${TAB_ACCENT_STRIP[tab.id] ?? TAB_ACCENT_STRIP.op}`}
          aria-hidden
        />
        <div className="pointer-events-none absolute -right-20 -top-28 h-56 w-56 rounded-full bg-gradient-to-br from-slate-100/70 to-transparent blur-3xl" aria-hidden />

        <div className="relative p-4 sm:p-6">
          <div className="mb-5 flex flex-col gap-4 border-b border-slate-100 pb-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Resumen ejecutivo</p>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
                Números del año elegido en <span className="font-semibold text-slate-800">tendencia</span>
                {' · '}
                La tabla ordena gastos por <span className="font-semibold text-slate-800">subtipo</span>
                , según el alcance que indiques abajo.
              </p>
            </div>

            <div
              className={`grid grid-cols-2 gap-2 sm:gap-3 ${tab.tipo_gasto === 'planilla_laboral' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}
            >
              <div className="rounded-xl border border-slate-100/95 bg-gradient-to-br from-white to-slate-50/80 p-3.5 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Total {chartYear || 'año'}
                </p>
                <p className="mt-1.5 text-xl font-bold tabular-nums tracking-tight text-emerald-900 sm:text-2xl">
                  {formatCurrency(animatedTotal)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100/95 bg-gradient-to-br from-white to-slate-50/80 p-3.5 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Promedio mensual</p>
                <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                  {formatCurrency(chartYearInsights.avgMonthly)}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">Promedio sobre 12 meses</p>
              </div>
              <div className="rounded-xl border border-slate-100/95 bg-gradient-to-br from-white to-slate-50/80 p-3.5 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mes más alto</p>
                <p className="mt-1.5 text-sm font-bold capitalize leading-snug text-slate-900 sm:text-base">
                  {chartYearInsights.peakLabel}
                </p>
                <p className="mt-1 text-base font-semibold tabular-nums text-slate-700 sm:text-lg">
                  {formatCurrency(chartYearInsights.peakTotal)}
                </p>
              </div>
              {tab.tipo_gasto !== 'planilla_laboral' ? (
                <div className="rounded-xl border border-red-100/90 bg-gradient-to-br from-red-50/90 to-white p-3.5 shadow-sm ring-1 ring-red-900/[0.05] sm:p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700/90">Gasto de hoy</p>
                  <p className="mt-1.5 text-lg font-bold tabular-nums text-red-900 sm:text-xl">
                    {formatCurrency(todayTotal)}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-5 xl:flex-row xl:items-stretch xl:justify-between xl:gap-8">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tendencia</span>
                <div className="flex flex-wrap items-end gap-3">
                  {yearOptions.length > 0 ? (
                    <div className="w-[9rem] shrink-0 sm:w-36 [&_.label]:mb-1 [&_.label]:text-xs [&_.label]:font-semibold [&_.label]:text-slate-600">
                      <Select label="Año del gráfico" options={yearOptions} value={chartYear} onChange={setChartYear} />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">Sin fechas en esta categoría</p>
                  )}
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 border-t border-slate-100 pt-4 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Desglose por subtipo</span>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[10rem] flex-1 sm:flex-none sm:w-44 [&_.label]:mb-1 [&_.label]:text-xs [&_.label]:font-semibold [&_.label]:text-slate-600">
                    <Select
                      label="Qué período sumar"
                      options={PERIODO_SUBTIPO_OPTIONS}
                      value={subtipoPeriod}
                      onChange={(v) => setSubtipoPeriod(v as 'ALL' | 'YEAR' | 'MONTH')}
                    />
                  </div>
                  {subtipoPeriod !== 'ALL' && yearOptions.length > 0 ? (
                    <div className="w-[7.25rem] shrink-0 sm:w-32 [&_.label]:mb-1 [&_.label]:text-xs [&_.label]:font-semibold [&_.label]:text-slate-600">
                      <Select label="Año del desglose" options={yearOptions} value={subtipoAggYear} onChange={setSubtipoAggYear} />
                    </div>
                  ) : null}
                  {subtipoPeriod === 'MONTH' ? (
                    <div className="w-[8rem] shrink-0 sm:w-36 [&_.label]:mb-1 [&_.label]:text-xs [&_.label]:font-semibold [&_.label]:text-slate-600">
                      <Select label="Mes del desglose" options={monthOptionsAgg} value={subtipoAggMonth} onChange={setSubtipoAggMonth} />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <p className="mb-4 text-xs leading-relaxed text-slate-600">
            Subtipos mostrados: <span className="font-semibold text-slate-800">{subtipoAggPeriodLabel}</span>
            {' — '}
            <span className="tabular-nums">{subtipoAggGrand.count} movimientos</span>
            {' · '}
            <span className="tabular-nums font-semibold text-slate-900">{formatCurrency(subtipoAggGrand.total)}</span>
          </p>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
            <div className="min-w-0 lg:col-span-5">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Tendencia mensual</h3>
                <span className="text-xs font-medium tabular-nums text-slate-400">{chartYear}</span>
              </div>
              <div className="h-[11rem] rounded-xl border border-slate-100 bg-gradient-to-b from-slate-50/60 to-white px-1 pt-1 shadow-inner shadow-slate-900/[0.04] sm:h-44 lg:h-[14rem]">
                <Suspense fallback={<div className="h-full w-full animate-pulse rounded-lg bg-slate-100" />}>
                  <GastosMesChart
                    chartData={chartData}
                    barFrom={(TAB_BAR_GRADIENT[tab.id] ?? TAB_BAR_GRADIENT.op).from}
                    barTo={(TAB_BAR_GRADIENT[tab.id] ?? TAB_BAR_GRADIENT.op).to}
                  />
                </Suspense>
              </div>
            </div>

            <div className="flex min-w-0 flex-col border-t border-slate-100 pt-5 lg:col-span-7 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Ranking por subtipo</h3>
              {subtipoAggRows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 py-8 text-center text-sm text-slate-500">
                  Sin datos para este período de desglose.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-sm shadow-slate-900/[0.03]">
                  <div className="max-h-[min(280px,44vh)] overflow-y-auto lg:max-h-[min(300px,40vh)]">
                    <table className="min-w-full text-left text-[13px]">
                      <thead className="sticky top-0 z-[1] bg-slate-50/95 shadow-[0_1px_0_0_rgb(226_232_240)] backdrop-blur-sm">
                        <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          <th className="py-2.5 pl-3 pr-2 font-semibold">Concepto</th>
                          <th className="w-14 py-2.5 pr-2 text-right font-semibold tabular-nums">Nº</th>
                          <th className="py-2.5 pr-3 text-right font-semibold tabular-nums">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subtipoAggRows.map(([nombre, agg]) => (
                          <tr
                            key={nombre}
                            className="border-b border-slate-50 transition-colors hover:bg-emerald-50/50"
                          >
                            <td className="py-2.5 pl-3 pr-2 font-medium leading-snug text-slate-900">{nombre}</td>
                            <td className="py-2.5 pr-2 text-right tabular-nums text-slate-600">{agg.count}</td>
                            <td className="py-2.5 pr-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                              {formatCurrency(agg.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 border-t border-slate-200 bg-slate-100/95 backdrop-blur-sm">
                        <tr>
                          <td className="py-2.5 pl-3 pr-2 text-sm font-bold text-slate-900">Total</td>
                          <td className="py-2.5 pr-2 text-right text-sm font-bold tabular-nums text-slate-800">
                            {subtipoAggGrand.count}
                          </td>
                          <td className="py-2.5 pr-3 text-right text-sm font-bold tabular-nums text-emerald-900">
                            {formatCurrency(subtipoAggGrand.total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200/80 pt-8">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Movimientos</p>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Historial · {tab.label}</h2>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end [&_.label]:mb-1 [&_.label]:text-xs [&_.label]:font-semibold [&_.label]:text-slate-600">
            <div className="w-full sm:w-44">
              <Select
                label="Filtrar por año"
                options={historyYearOptions}
                value={historyYear}
                onChange={setHistoryYear}
              />
            </div>
            <div className="w-full sm:w-56">
              <Select
                label="Filtrar por subtipo"
                options={subtipoGastoOptions}
                value={filterSubtipoGasto}
                onChange={setFilterSubtipoGasto}
              />
            </div>
          </div>
        </div>
        <RegistrosTable
          mode="gastos"
          gastos={gastosParaTabla}
          vehicles={vehicles}
          onDeleteGasto={deleteGasto}
          showClasificacionFinanciera
          onMoveCategoriaGasto={canEditFinances ? openMoveModal : undefined}
        />
      </div>
        </>
      )}

      <Modal
        isOpen={moveTarget != null}
        onClose={closeMoveModal}
        title="Mover gasto de categoría"
        size="md"
        footer={(
          <>
            <Button variant="ghost" onClick={closeMoveModal} disabled={moveSaving}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmMoveCategoria}
              loading={moveSaving}
              disabled={moveDisabled}
            >
              Confirmar movimiento
            </Button>
          </>
        )}
      >
        {!moveTarget ? null : (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-1.5">
              <p className="text-sm text-gray-800">
                <span className="font-semibold">Descripción:</span> {moveTarget.motivo || moveTarget.comentarios || 'Sin descripción'}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Monto:</span> {formatCurrency(moveTarget.monto)}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Categoría actual:</span> {currentEffectiveTipo}
              </p>
            </div>

            <Select
              label="Nueva categoría"
              options={categoriaOptions}
              value={moveTipo}
              onChange={setMoveTipo}
            />

            <Select
              label="Subtipo (opcional)"
              options={subtipoOptionsForMove}
              value={moveSubtipo}
              onChange={setMoveSubtipo}
            />

            {isOperativoTarget && (
              <Select
                label="Vehículo (obligatorio para operativo)"
                options={vehicleOptions}
                value={moveVehicleId}
                onChange={setMoveVehicleId}
              />
            )}

            <div>
              <label htmlFor="motivo-cambio-categoria" className="label">Motivo del cambio (opcional)</label>
              <textarea
                id="motivo-cambio-categoria"
                value={moveMotivo}
                onChange={(e) => setMoveMotivo(e.target.value)}
                className="input-field min-h-20"
                placeholder="Ej: Revisión manual por validación contable."
              />
            </div>

            {isOperativoTarget && !moveVehicleId && (
              <p className="text-xs text-amber-700">Debes seleccionar un vehículo para categoría operativo_vehiculo.</p>
            )}
            {!hasAnyChange && (
              <p className="text-xs text-gray-500">No hay cambios para guardar.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Gastos;
