import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import RegistrosTable from '../../components/Tables/RegistrosTable';
import Select from '../../components/Common/Select';
import Modal from '../../components/Common/Modal';
import { ColumnCountHintTh } from '../../components/Common/ColumnCountHintTh';
import ExpenseForm from '../../components/Forms/ExpenseForm';
import Button from '../../components/Common/Button';
import type { Gasto } from '../../data/types';
import { formatCurrency, todayStr } from '../../utils/formatting';
import { MESES } from '../../data/catalogs';
import { filterRowsByYearMonth } from '../../utils/filterByYearMonth';
import { REVISION_USER_LABEL } from '../../config/app';
import { updateGastoCategoriaManual } from '../../services/gastosService';
import { useAuth } from '../../context/AuthContext';
import { gastoMatchesTipoGasto, tipoGastoUiCanonical } from '../../utils/gastosTipoGasto';
import {
  getSubtipoFinancieroLabel,
  gastoMatchesSubtipoFinancieroFilter,
  subtipoFinancieroFilterValue,
  SUBTIPO_FILTRO_PRESTAMO_FUSION,
} from '../../utils/subtipoFinancieroLabel';
import { SUBTIPOS_REPRESENTACION_INTERNA } from '../../data/representacionInterna';
import {
  getRepresentacionInternaSubtipoLabel,
  normalizeRepresentacionInternaSubtipo,
} from '../../utils/representacionInternaSubtipoLabel';
import { labelTipoGastoFinanciero } from '../../utils/tipoGastoLabels';

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
  { id: 'per', label: 'Representación interna', tipo_gasto: 'representacion_interna', emoji: '🤝', gradient: 'from-pink-500/10 to-rose-500/10', border: 'border-pink-200 hover:border-pink-400' },
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { gastos, vehicles, deleteGasto, refreshFromSupabase, toast, addGasto } = useRegistrosContext();
  const { canEditFinances } = useAuth();

  const isInversionesPage = mode === 'inversiones';
  const hidePageChrome = embeddedInParent && isInversionesPage;
  const [tabIndex, setTabIndex] = useState<number | null>(null);
  const tab = isInversionesPage
    ? INVERSION_GASTO_TAB
    : tabIndex == null
      ? null
      : (GASTO_TABS[tabIndex] ?? null);

  const [registrarOpen, setRegistrarOpen] = useState(false);
  const [prefillVehicleId, setPrefillVehicleId] = useState<number | null>(null);
  const [gastoFormKey, setGastoFormKey] = useState(0);

  useEffect(() => {
    if (isInversionesPage) return;
    if (searchParams.get('registrar') !== '1') return;
    const raw = searchParams.get('vehicleId');
    const vid = raw ? Number(raw) : NaN;
    setPrefillVehicleId(Number.isFinite(vid) && vid > 0 ? vid : null);
    setGastoFormKey((k) => k + 1);
    setRegistrarOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('registrar');
    next.delete('vehicleId');
    setSearchParams(next, { replace: true });
  }, [isInversionesPage, searchParams, setSearchParams]);

  const openRegistrarModal = () => {
    setPrefillVehicleId(null);
    setGastoFormKey((k) => k + 1);
    setRegistrarOpen(true);
  };

  const closeRegistrarModal = () => {
    setRegistrarOpen(false);
    setPrefillVehicleId(null);
  };

  const handleRegistrarGasto = async (data: Omit<Gasto, 'id' | 'createdAt'>) => {
    const created = await addGasto(data);
    if (created) closeRegistrarModal();
  };

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
  const [historyMonth, setHistoryMonth] = useState<string>('ALL');
  const [animatedTotal, setAnimatedTotal] = useState(0);
  const prevTotalRef = useRef(0);
  const [subtipoPeriod, setSubtipoPeriod] = useState<'ALL' | 'YEAR' | 'MONTH'>('ALL');
  const [subtipoAggMonth, setSubtipoAggMonth] = useState(() =>
    String(new Date().getMonth() + 1).padStart(2, '0'),
  );
  const [filterSubtipoGasto, setFilterSubtipoGasto] = useState('');
  const [moveTarget, setMoveTarget] = useState<Gasto | null>(null);
  const [moveTipo, setMoveTipo] = useState('');
  const [moveSubtipo, setMoveSubtipo] = useState('');
  const [moveVehicleId, setMoveVehicleId] = useState<string>('');
  const [moveMotivo, setMoveMotivo] = useState('');
  const [moveSaving, setMoveSaving] = useState(false);

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

  /** Misma base que el desglose por subtipo (año del gráfico; si es «un mes», solo ese mes). Alimenta KPIs y gráfico. */
  const gastosResumenEjecutivo = useMemo(() => {
    if (!Number.isFinite(chartYearNum)) return [];
    if (subtipoPeriod === 'MONTH') {
      const mm = subtipoAggMonth.padStart(2, '0');
      return gastosTab.filter(
        (g) => g.fecha.startsWith(`${chartYearNum}-`) && g.fecha.slice(5, 7) === mm,
      );
    }
    return gastosDelAnioGrafico;
  }, [gastosTab, gastosDelAnioGrafico, chartYearNum, subtipoPeriod, subtipoAggMonth]);

  const totalAnioGrafico = gastosResumenEjecutivo.reduce((s, g) => s + g.monto, 0);

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
    if (subtipoPeriod === 'MONTH' && Number.isFinite(chartYearNum)) {
      const mNum = Number(subtipoAggMonth);
      if (!Number.isFinite(mNum) || mNum < 1 || mNum > 12) return [];
      const dMax = new Date(chartYearNum, mNum, 0).getDate();
      const mm = String(mNum).padStart(2, '0');
      return Array.from({ length: dMax }, (_, idx) => {
        const d = idx + 1;
        const dd = String(d).padStart(2, '0');
        const iso = `${chartYearNum}-${mm}-${dd}`;
        const total = gastosResumenEjecutivo.filter((g) => g.fecha === iso).reduce((s, g) => s + g.monto, 0);
        return { mes: String(d), total };
      });
    }
    return MESES.map((mes) => {
      const month = String(mes.value).padStart(2, '0');
      const total = gastosDelAnioGrafico
        .filter((g) => g.fecha.slice(5, 7) === month)
        .reduce((s, g) => s + g.monto, 0);
      return { mes: mes.label.slice(0, 3), total };
    });
  }, [subtipoPeriod, chartYearNum, subtipoAggMonth, gastosResumenEjecutivo, gastosDelAnioGrafico]);

  const chartMonthLabelG = useMemo(() => {
    if (subtipoPeriod !== 'MONTH') return '';
    return MESES.find((m) => String(m.value).padStart(2, '0') === subtipoAggMonth.padStart(2, '0'))?.label ?? '';
  }, [subtipoPeriod, subtipoAggMonth]);

  const chartMonthAggG = useMemo(() => {
    if (subtipoPeriod !== 'MONTH') return null;
    const rows = gastosResumenEjecutivo;
    const total = rows.reduce((s, g) => s + g.monto, 0);
    const count = rows.length;
    const avgPerMov = count > 0 ? total / count : 0;
    return { total, count, avgPerMov };
  }, [subtipoPeriod, gastosResumenEjecutivo]);

  /** KPIs: año completo salvo vista «un mes» (entonces ver tarjetas alternas abajo). */
  const chartYearInsights = useMemo(() => {
    if (!Number.isFinite(chartYearNum) || subtipoPeriod === 'MONTH') {
      return { avgMonthly: 0, peakLabel: '—', peakTotal: 0 };
    }
    const tot = gastosDelAnioGrafico.reduce((s, g) => s + g.monto, 0);
    const avgMonthly = tot / 12;
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
  }, [chartYearNum, subtipoPeriod, gastosDelAnioGrafico]);

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
    if (!Number.isFinite(chartYearNum)) return [];
    const prefix = `${chartYearNum}-`;
    const yearSlice = gastosTab.filter((g) => g.fecha.startsWith(prefix));
    if (subtipoPeriod === 'YEAR') return yearSlice;
    const mm = subtipoAggMonth.padStart(2, '0');
    return yearSlice.filter((g) => g.fecha.slice(5, 7) === mm);
  }, [gastosTab, subtipoPeriod, chartYearNum, subtipoAggMonth]);

  const subtipoAggRows = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const g of gastosForSubtipoAgg) {
      let rowKey: string;
      if (tab?.tipo_gasto === 'representacion_interna') {
        const c = normalizeRepresentacionInternaSubtipo(g.subtipo_gasto);
        rowKey = c ? getRepresentacionInternaSubtipoLabel(c) : '(Sin subtipo)';
      } else {
        const raw = g.subtipo_gasto?.trim();
        rowKey = raw && raw.length > 0 ? getSubtipoFinancieroLabel(raw) : '(Sin subtipo)';
      }
      const cur = map.get(rowKey) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += g.monto;
      map.set(rowKey, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [gastosForSubtipoAgg, tab?.tipo_gasto]);

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
    if (!Number.isFinite(chartYearNum)) return '—';
    if (subtipoPeriod === 'YEAR') return `Año ${chartYear}`;
    const mesNombre = MESES.find((m) => String(m.value).padStart(2, '0') === subtipoAggMonth.padStart(2, '0'))?.label;
    return `${mesNombre ?? 'Mes'} ${chartYear}`;
  }, [subtipoPeriod, chartYear, chartYearNum, subtipoAggMonth]);

  const historyYearOptions = useMemo(
    () => [{ value: 'ALL', label: 'Todos los años' }, ...yearOptions],
    [yearOptions],
  );

  const historyMonthOptions = useMemo(
    () => [
      { value: 'ALL', label: 'Todos los meses' },
      ...MESES.map((m) => ({
        value: String(m.value).padStart(2, '0'),
        label: m.label,
      })),
    ],
    [],
  );

  const gastosHistorialFiltrados = useMemo(
    () => filterRowsByYearMonth(gastosTab, historyYear, historyMonth),
    [gastosTab, historyYear, historyMonth],
  );

  const gastosHistorialEmptyHint = useMemo(() => {
    if (gastosTab.length === 0) return 'No hay gastos en esta categoría.';
    const parts: string[] = [];
    if (historyYear !== 'ALL') parts.push(`año ${historyYear}`);
    if (historyMonth !== 'ALL') {
      const lab = MESES.find((m) => String(m.value).padStart(2, '0') === historyMonth)?.label ?? 'mes';
      parts.push(lab);
    }
    if (parts.length === 0) return '';
    return `No hay gastos para ${parts.join(' · ')}. Cambie año o mes, o use «Todos».`;
  }, [gastosTab.length, historyYear, historyMonth]);

  useEffect(() => {
    if (filterSubtipoGasto === SUBTIPO_FILTRO_PRESTAMO_FUSION && tab?.tipo_gasto !== 'financiero_prestamo') {
      setFilterSubtipoGasto('');
    }
  }, [tab?.tipo_gasto, filterSubtipoGasto]);

  const subtipoGastoOptions = useMemo(() => {
    if (tab?.tipo_gasto === 'representacion_interna') {
      const fromData = new Set<string>();
      for (const g of gastosHistorialFiltrados) {
        const c = normalizeRepresentacionInternaSubtipo(g.subtipo_gasto);
        if (c) fromData.add(c);
      }
      const ordered: string[] = [...SUBTIPOS_REPRESENTACION_INTERNA];
      for (const c of [...fromData].sort((a, b) => a.localeCompare(b, 'es'))) {
        if (!ordered.includes(c)) ordered.push(c);
      }
      return [
        { value: '', label: 'Todos subtipo' },
        ...ordered.map((c) => ({ value: c, label: getRepresentacionInternaSubtipoLabel(c) })),
      ];
    }
    const raws = new Set<string>();
    for (const g of gastosHistorialFiltrados) {
      const t = g.subtipo_gasto?.trim();
      if (t) raws.add(t);
    }
    const sorted = [...raws].sort((a, b) => a.localeCompare(b, 'es'));
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [{ value: '', label: 'Todos subtipo' }];
    for (const raw of sorted) {
      const fv = subtipoFinancieroFilterValue(raw, tab?.tipo_gasto);
      if (seen.has(fv)) continue;
      seen.add(fv);
      out.push({ value: fv, label: getSubtipoFinancieroLabel(raw) });
    }
    return out;
  }, [gastosHistorialFiltrados, tab?.tipo_gasto]);

  const gastosParaTabla = useMemo(() => {
    let d = gastosHistorialFiltrados;
    if (filterSubtipoGasto) {
      d = d.filter((g) => gastoMatchesSubtipoFinancieroFilter(g.subtipo_gasto, filterSubtipoGasto, tab?.tipo_gasto));
    }
    return d;
  }, [gastosHistorialFiltrados, filterSubtipoGasto, tab?.tipo_gasto]);

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
    if (moveTipo === 'representacion_interna') {
      for (const c of SUBTIPOS_REPRESENTACION_INTERNA) set.add(c);
    }
    for (const g of gastos) {
      if (!gastoMatchesTipoGasto(g, moveTipo)) continue;
      const s = g.subtipo_gasto?.trim();
      if (!s) continue;
      if (moveTipo === 'representacion_interna') {
        const c = normalizeRepresentacionInternaSubtipo(s);
        if (c) set.add(c);
        else set.add(s);
      } else {
        set.add(s);
      }
    }
    if (moveTarget?.subtipo_gasto?.trim()) {
      const s = moveTarget.subtipo_gasto.trim();
      if (moveTipo === 'representacion_interna') {
        const c = normalizeRepresentacionInternaSubtipo(s);
        if (c) set.add(c);
        else set.add(s);
      } else {
        set.add(s);
      }
    }
    const labelFor = (v: string) =>
      moveTipo === 'representacion_interna'
        ? getRepresentacionInternaSubtipoLabel(v)
        : getSubtipoFinancieroLabel(v);
    return [{ value: '', label: 'Sin subtipo' }, ...[...set].sort().map((s) => ({ value: s, label: labelFor(s) }))];
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
    setMoveTipo(tipoGastoUiCanonical(g) ?? 'gastos_globales');
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
  const isInversionTarget = moveTipo === 'inversion_compra';
  const targetNeedsVehicle = isOperativoTarget || isInversionTarget;
  const currentEffectiveTipo = moveTarget ? (tipoGastoUiCanonical(moveTarget) ?? 'gastos_globales') : '';
  const currentSubtipo = moveTarget?.subtipo_gasto?.trim() ?? '';
  const currentVehicle = moveTarget?.vehicleId != null ? String(moveTarget.vehicleId) : '';
  const sourceHadVehicle =
    currentEffectiveTipo === 'operativo_vehiculo' || currentEffectiveTipo === 'inversion_compra';
  const effectiveMoveVehicle = targetNeedsVehicle ? moveVehicleId : '';
  const effectiveCurrentVehicle = sourceHadVehicle ? currentVehicle : '';
  const hasAnyChange = moveTarget != null
    && (
      moveTipo !== currentEffectiveTipo
      || moveSubtipo !== currentSubtipo
      || effectiveMoveVehicle !== effectiveCurrentVehicle
    );
  const moveDisabled = !moveTarget
    || moveSaving
    || !hasAnyChange
    || (targetNeedsVehicle && !moveVehicleId);

  const handleConfirmMoveCategoria = async () => {
    if (!moveTarget) return;
    if (moveDisabled) return;
    const toVehicleId = targetNeedsVehicle ? Number(moveVehicleId) : null;
    if (targetNeedsVehicle && !Number.isFinite(toVehicleId)) return;
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
      to_vehicle_id: targetNeedsVehicle ? toVehicleId : null,
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
        vehicle_id: targetNeedsVehicle ? toVehicleId : null,
        es_global_flota: !targetNeedsVehicle,
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
    <div className="space-y-4 animate-fade-in">
      {!hidePageChrome ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/finanzas')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
              <ChevronLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {isInversionesPage ? '🚗 Inversiones' : '💸 Gastos'}
              </h1>
              <p className="text-xs text-gray-500">
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
          <button
            type="button"
            onClick={openRegistrarModal}
            className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold shadow-soft transition-all">
            + Registrar
          </button>
        </div>
      ) : isInversionesPage && embeddedInParent ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={openRegistrarModal}
            className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-soft transition-all"
          >
            + Registrar inversión
          </button>
        </div>
      ) : null}

      {tab == null && !isInversionesPage && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-2" role="tablist" aria-label="Categoría de gasto">
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
                <div className="flex items-start justify-between mb-2">
                  <span className="text-2xl group-hover:scale-110 transition-transform">{t.emoji}</span>
                  <span className="text-xs font-bold text-gray-800 tabular-nums sm:text-sm">{formatCurrency(data.monto)}</span>
                </div>
                <h3 className="text-sm font-bold text-gray-900 mb-0.5">{t.label}</h3>
                <p className="text-[11px] text-gray-500">{data.count} registros</p>
                <div className="mt-2 text-[10px] font-semibold text-primary-700/80">
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Vista detalle</p>
            <h2 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900">
              {tab.emoji} {tab.label}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => (isInversionesPage ? navigate('/finanzas') : setTabIndex(null))}
            className="shrink-0 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm shadow-slate-900/5 transition hover:border-slate-300 hover:bg-slate-50"
          >
            {isInversionesPage ? '← Volver a Finanzas' : '← Cambiar categoría'}
          </button>
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_20px_40px_-24px_rgba(15,23,42,0.14)]">
        <div
          className={`h-1 w-full bg-gradient-to-r ${TAB_ACCENT_STRIP[tab.id] ?? TAB_ACCENT_STRIP.op}`}
          aria-hidden
        />
        <div className="pointer-events-none absolute -right-20 -top-28 h-56 w-56 rounded-full bg-gradient-to-br from-slate-100/70 to-transparent blur-3xl" aria-hidden />

        <div className="relative p-3 sm:p-4">
          <div className="mb-3 flex flex-col gap-2.5 border-b border-slate-100 pb-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Resumen ejecutivo</p>
              <p className="mt-0.5 max-w-3xl text-[11px] leading-snug text-slate-600">
                KPIs y tendencia usan el <span className="font-semibold text-slate-800">año del gráfico</span>. Con{' '}
                <span className="font-semibold text-slate-800">un año</span> o <span className="font-semibold text-slate-800">un mes</span>, totales y gráfica coinciden. En{' '}
                <span className="font-semibold text-slate-800">histórico completo</span> el ranking es multi-año; la tendencia sigue siendo el año elegido.
              </p>
            </div>

            <div
              className={`grid grid-cols-2 gap-1.5 sm:gap-2 ${tab.tipo_gasto === 'planilla_laboral' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}
            >
              <div className="rounded-lg border border-slate-100/95 bg-gradient-to-br from-white to-slate-50/80 p-2.5 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {subtipoPeriod === 'MONTH'
                    ? `Total ${chartMonthLabelG || 'mes'} ${chartYear || ''}`.trim()
                    : `Total ${chartYear || 'año'}`}
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums tracking-tight text-emerald-900 sm:text-xl">
                  {formatCurrency(animatedTotal)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-100/95 bg-gradient-to-br from-white to-slate-50/80 p-2.5 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-3">
                {subtipoPeriod === 'MONTH' ? (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Movimientos</p>
                    <p className="mt-1 text-base font-bold tabular-nums text-slate-900 sm:text-lg">
                      {chartMonthAggG?.count ?? 0}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">Mes filtrado</p>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Promedio mensual</p>
                    <p className="mt-1 text-base font-bold tabular-nums text-slate-900 sm:text-lg">
                      {formatCurrency(chartYearInsights.avgMonthly)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">Sobre 12 meses</p>
                  </>
                )}
              </div>
              <div className="rounded-lg border border-slate-100/95 bg-gradient-to-br from-white to-slate-50/80 p-2.5 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-3">
                {subtipoPeriod === 'MONTH' ? (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Promedio / mov.</p>
                    <p className="mt-1 text-base font-bold tabular-nums text-slate-900 sm:text-lg">
                      {formatCurrency(chartMonthAggG?.avgPerMov ?? 0)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">Mes filtrado</p>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Mes más alto</p>
                    <p className="mt-1 text-xs font-bold capitalize leading-tight text-slate-900 sm:text-sm">
                      {chartYearInsights.peakLabel}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-700 sm:text-base">
                      {formatCurrency(chartYearInsights.peakTotal)}
                    </p>
                  </>
                )}
              </div>
              {tab.tipo_gasto !== 'planilla_laboral' ? (
                <div className="rounded-lg border border-red-100/90 bg-gradient-to-br from-red-50/90 to-white p-2.5 shadow-sm ring-1 ring-red-900/[0.05] sm:p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700/90">Gasto de hoy</p>
                  <p className="mt-1 text-base font-bold tabular-nums text-red-900 sm:text-lg">
                    {formatCurrency(todayTotal)}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-stretch xl:justify-between xl:gap-5">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Tendencia</span>
                <div className="flex flex-wrap items-end gap-2">
                  {yearOptions.length > 0 ? (
                    <div className="w-[8.5rem] shrink-0 sm:w-[8.75rem] [&_.label]:mb-0.5 [&_.label]:text-[10px] [&_.label]:font-semibold [&_.label]:text-slate-600">
                      <Select label="Año del gráfico" options={yearOptions} value={chartYear} onChange={setChartYear} />
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400">Sin fechas en esta categoría</p>
                  )}
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1 border-t border-slate-100 pt-3 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Desglose por subtipo</span>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[9.5rem] flex-1 sm:flex-none sm:w-40 [&_.label]:mb-0.5 [&_.label]:text-[10px] [&_.label]:font-semibold [&_.label]:text-slate-600">
                    <Select
                      label="Qué período sumar"
                      options={PERIODO_SUBTIPO_OPTIONS}
                      value={subtipoPeriod}
                      onChange={(v) => setSubtipoPeriod(v as 'ALL' | 'YEAR' | 'MONTH')}
                    />
                  </div>
                  {subtipoPeriod === 'MONTH' ? (
                    <div className="w-[7.5rem] shrink-0 sm:w-32 [&_.label]:mb-0.5 [&_.label]:text-[10px] [&_.label]:font-semibold [&_.label]:text-slate-600">
                      <Select label="Mes" options={monthOptionsAgg} value={subtipoAggMonth} onChange={setSubtipoAggMonth} />
                    </div>
                  ) : null}
                </div>
                {subtipoPeriod !== 'ALL' && yearOptions.length > 0 ? (
                  <p className="text-[10px] leading-snug text-slate-500">
                    Año del desglose = <span className="font-semibold text-slate-700">Año del gráfico</span> ({chartYear || '—'}).
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <p className="mb-2.5 text-[11px] leading-snug text-slate-600">
            Subtipos mostrados: <span className="font-semibold text-slate-800">{subtipoAggPeriodLabel}</span>
            {' — '}
            <span className="tabular-nums">{subtipoAggGrand.count} movimientos</span>
            {' · '}
            <span className="tabular-nums font-semibold text-slate-900">{formatCurrency(subtipoAggGrand.total)}</span>
          </p>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
            <div className="min-w-0 lg:col-span-5">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {subtipoPeriod === 'MONTH' ? 'Tendencia por día' : 'Tendencia mensual'}
                </h3>
                <span className="text-[10px] font-medium tabular-nums text-slate-400">
                  {subtipoPeriod === 'MONTH' ? `${chartMonthLabelG} ${chartYear}`.trim() : chartYear}
                </span>
              </div>
              <div className="h-[9.5rem] rounded-lg border border-slate-100 bg-gradient-to-b from-slate-50/60 to-white px-0.5 pt-0.5 shadow-inner shadow-slate-900/[0.04] sm:h-[10.5rem] lg:h-[11.5rem]">
                <Suspense fallback={<div className="h-full w-full animate-pulse rounded-lg bg-slate-100" />}>
                  <GastosMesChart
                    chartData={chartData}
                    barFrom={(TAB_BAR_GRADIENT[tab.id] ?? TAB_BAR_GRADIENT.op).from}
                    barTo={(TAB_BAR_GRADIENT[tab.id] ?? TAB_BAR_GRADIENT.op).to}
                    bucket={subtipoPeriod === 'MONTH' ? 'day' : 'month'}
                  />
                </Suspense>
              </div>
            </div>

            <div className="flex min-w-0 flex-col border-t border-slate-100 pt-3 lg:col-span-7 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Ranking por subtipo</h3>
              {subtipoAggRows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 py-5 text-center text-xs text-slate-500">
                  Sin datos para este período de desglose.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-100 shadow-sm shadow-slate-900/[0.03]">
                  <div className="max-h-[min(240px,40vh)] overflow-y-auto lg:max-h-[min(260px,36vh)]">
                    <table className="min-w-full text-left text-[12px]">
                      <thead className="sticky top-0 z-[1] bg-slate-50/95 shadow-[0_1px_0_0_rgb(226_232_240)] backdrop-blur-sm">
                        <tr className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          <th className="py-1.5 pl-2 pr-1.5 font-semibold">Concepto</th>
                          <ColumnCountHintTh
                            className="!py-1.5 !pr-1.5"
                            hint="Cantidad de registros en la categoría y período indicado arriba (mismo año del gráfico; si eliges un mes, solo ese mes)."
                          />
                          <th className="py-1.5 pr-2 text-right font-semibold tabular-nums">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subtipoAggRows.map(([nombre, agg]) => (
                          <tr
                            key={nombre}
                            className="border-b border-slate-50 transition-colors hover:bg-emerald-50/50"
                          >
                            <td className="py-1.5 pl-2 pr-1.5 font-medium leading-tight text-slate-900">{nombre}</td>
                            <td className="py-1.5 pr-1.5 text-right tabular-nums text-slate-600">{agg.count}</td>
                            <td className="py-1.5 pr-2 text-right text-[12px] font-semibold tabular-nums text-slate-900">
                              {formatCurrency(agg.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 border-t border-slate-200 bg-slate-100/95 backdrop-blur-sm">
                        <tr>
                          <td className="py-1.5 pl-2 pr-1.5 text-xs font-bold text-slate-900">Total</td>
                          <td className="py-1.5 pr-1.5 text-right text-xs font-bold tabular-nums text-slate-800">
                            {subtipoAggGrand.count}
                          </td>
                          <td className="py-1.5 pr-2 text-right text-xs font-bold tabular-nums text-emerald-900">
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

      <div className="border-t border-slate-200/80 pt-5">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Movimientos</p>
            <h2 className="text-base font-semibold tracking-tight text-slate-900">Historial · {tab.label}</h2>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end [&_.label]:mb-0.5 [&_.label]:text-[10px] [&_.label]:font-semibold [&_.label]:text-slate-600">
            <div className="w-full min-w-0 sm:w-[7.5rem]">
              <Select
                label="Historial — año"
                options={historyYearOptions}
                value={historyYear}
                onChange={setHistoryYear}
              />
            </div>
            <div className="w-full min-w-0 sm:w-[7.5rem]">
              <Select
                label="Historial — mes"
                options={historyMonthOptions}
                value={historyMonth}
                onChange={setHistoryMonth}
              />
            </div>
            <div className="w-full min-w-0 sm:w-52">
              <Select
                label="Filtrar por subtipo"
                options={subtipoGastoOptions}
                value={filterSubtipoGasto}
                onChange={setFilterSubtipoGasto}
              />
            </div>
          </div>
        </div>
        {gastosParaTabla.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/90 py-10 text-center text-xs text-slate-600">
            {gastosHistorialFiltrados.length === 0
              ? gastosHistorialEmptyHint
              : 'No hay gastos con el subtipo seleccionado en este período (año / mes). Pruebe «Todos subtipo».'}
          </div>
        ) : (
          <RegistrosTable
            mode="gastos"
            gastos={gastosParaTabla}
            vehicles={vehicles}
            onDeleteGasto={deleteGasto}
            showClasificacionFinanciera
            onMoveCategoriaGasto={canEditFinances ? openMoveModal : undefined}
          />
        )}
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
                <span className="font-semibold">Categoría actual:</span>{' '}
                {labelTipoGastoFinanciero(currentEffectiveTipo)}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Nueva categoría:</span>{' '}
                {labelTipoGastoFinanciero(moveTipo)}
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

            {isInversionTarget && (
              <p className="text-xs text-violet-800 rounded-lg border border-violet-100 bg-violet-50/90 px-3 py-2">
                Inversión con utilidad: el gasto debe quedar asociado a un vehículo.
              </p>
            )}

            {targetNeedsVehicle && (
              <Select
                label={isInversionTarget ? 'Vehículo (obligatorio para inversión con utilidad)' : 'Vehículo (obligatorio para operativo)'}
                options={vehicleOptions}
                value={moveVehicleId}
                onChange={setMoveVehicleId}
              />
            )}

            {isOperativoTarget && !moveVehicleId && (
              <p className="text-xs text-amber-700">Debes seleccionar un vehículo para categoría operativo_vehiculo.</p>
            )}
            {isInversionTarget && !moveVehicleId && (
              <p className="text-xs text-amber-700">Debes seleccionar un vehículo para inversión con utilidad.</p>
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

            {!hasAnyChange && (
              <p className="text-xs text-gray-500">No hay cambios para guardar.</p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={registrarOpen}
        onClose={closeRegistrarModal}
        title={isInversionesPage ? 'Registrar inversión con utilidad' : 'Registrar gasto'}
        size="xl"
      >
        <ExpenseForm
          key={gastoFormKey}
          vehicles={vehicles}
          gastos={gastos}
          onSubmit={handleRegistrarGasto}
          noCard
          prefillVehicleId={prefillVehicleId}
          finanzaPreset={isInversionesPage ? 'inversion_compra' : null}
        />
      </Modal>
    </div>
  );
};

export default Gastos;
