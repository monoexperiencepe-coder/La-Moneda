import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useGastosDataPending } from '../../hooks/useGastosDataPending';
import LoadingOverlay from '../../components/Loading/LoadingOverlay';
import SkeletonCard from '../../components/Loading/SkeletonCard';
import RegistrosTable from '../../components/Tables/RegistrosTable';
import Select from '../../components/Common/Select';
import Modal from '../../components/Common/Modal';
import { ColumnCountHintTh } from '../../components/Common/ColumnCountHintTh';
import ExpenseForm from '../../components/Forms/ExpenseForm';
import Button from '../../components/Common/Button';
import type { Gasto } from '../../data/types';
import { todayStr } from '../../utils/formatting';
import { formatVehicleLabelFull, formatVehicleIdFallback, formatVehicleSelectLabel } from '../../utils/vehicleDisplayNumber';
import { useAmountDisplay } from '../../hooks/useAmountDisplay';
import { MESES } from '../../data/catalogs';
import { filterRowsByYearMonth } from '../../utils/filterByYearMonth';
import { useCopilotNarrativeNavigation } from '../../hooks/useCopilotNarrativeNavigation';
import { gastoMatchesMaintenanceScope } from '../../modules/ai/maintenanceSubtipos';
import { REVISION_USER_LABEL } from '../../config/app';
import {
  isPendienteRevisionHiddenInOperativeUi,
  isPendienteRevisionTipoGasto,
  TIPO_GASTO_PENDIENTE_REVISION,
} from '../../config/gastosUiVisibility';
import { isVerboseDebug } from '../../config/verboseDebug';
import {
  DEFAULT_GASTOS_HISTORIAL_PAGE_SIZE,
  fetchGastosByTipoFullAll,
  fetchGastosHistorialPage,
  updateGastoCategoriaManual,
} from '../../services/gastosService';
import { useAuth } from '../../context/AuthContext';
import {
  canMoveGastoToTipo,
  canViewGlobalTotals,
  getMoveTargetGastoTipoGastoForUser,
  FINANZA_MOVE_TARGET_TIPO_GASTO,
  permissionUserFromAuth,
} from '../../utils/permissions';
import {
  formatInversionCompraDisplay,
  resolveInversionCompraKpi,
} from '../../utils/financialGlobalKpis';
import {
  formatGastosGlobalTotalDisplay,
  resolveGastosGlobalTotalState,
  resumenPorCategoriaFromSummary,
  summaryCategoria,
} from '../../utils/gastosFinancialSummary';
import { gastoMatchesTipoGasto, tipoGastoUiCanonical } from '../../utils/gastosTipoGasto';
import {
  getSubtipoFinancieroLabel,
  gastoMatchesSubtipoFinancieroFilter,
  subtipoFinancieroFilterValue,
} from '../../utils/subtipoFinancieroLabel';
import {
  getSubtipoFilterDbVariants,
  usesCanonicalSubtipoHistorialFilter,
} from '../../constants/subtipos/subtipoMatchesFilter';
import { auditInversionSubtipos } from '../../audit/auditInversionSubtipos';
import { normalizeRepresentacionInternaSubtipo, getRepresentacionInternaSubtipoLabel } from '../../utils/representacionInternaSubtipoLabel';
import { resolveOperativoSubtipoGastoCanon } from '../../utils/operativoSubtipo';
import { labelTipoGastoFinanciero } from '../../utils/tipoGastoLabels';
import {
  getDefaultSubtipoForTipoGasto,
  normalizeSubtipoForTipoGasto,
  tipoGastoRequiereVehiculo,
  tipoGastoUsaSubtipoOperativo,
} from '../../utils/gastoMoveCategoriaDefaults';
import { subtipoBelongsToCategoriaDestino } from '../../constants/subtipos/subtipoBelongsToCategoria';
import {
  getInversionSubtipoDedupeKey,
  getInversionSubtipoLabel,
} from '../../utils/inversionSubtipo';
import {
  buildSubtipoFilterSelectOptions,
  buildSubtipoSelectOptions,
  collectHistoricosSubtiposForTipoGasto,
  formatSubtipoOptionLabel,
  mergeSubtiposHistoricosConOficiales,
  logSubtipoInversionDebug,
  logSubtipoMoverOperativoVehiculoDebug,
} from '../../constants/gastosSubtipos';
import { normalizeGastoVehicleFkForDb } from '../../utils/vehicleId';
import PendienteRevisionConciliacionPanel from '../../components/Finanzas/PendienteRevisionConciliacionPanel';
import { cleanOperationalCommentForUi, gastoObservacionParaLista } from '../../utils/cleanOperationalComment';
import {
  enrichGastoHistorialActivity,
  gastoHistorialActivityStamp,
  isGastoRecentlyReclassified,
  mergeHistorialRowsWithPins,
  sortGastosHistorialByActivity,
} from '../../utils/gastoHistorialOrder';
import { extractYearsFromGastos, mergeHistorialYears } from '../../utils/gastoHistorialYears';
import { devMemoPerf } from '../../utils/devPerf';

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
  { id: 'op', label: 'Operativos por vehículo', tipo_gasto: 'operativo_vehiculo', emoji: '🔧', gradient: 'from-red-500/10 to-rose-500/10', border: 'border-red-200 hover:border-red-400' },
  {
    id: 'opf',
    label: 'Operativo flota general',
    tipo_gasto: 'operativo_flota_general',
    emoji: '🚛',
    gradient: 'from-orange-500/10 to-amber-500/10',
    border: 'border-orange-200 hover:border-orange-400',
  },
  { id: 'adm', label: 'Administrativos', tipo_gasto: 'administrativo_empresa', emoji: '🏢', gradient: 'from-slate-500/10 to-gray-500/10', border: 'border-slate-200 hover:border-slate-400' },
  { id: 'fin', label: 'Financieros', tipo_gasto: 'financiero_prestamo', emoji: '🏦', gradient: 'from-amber-500/10 to-orange-500/10', border: 'border-amber-200 hover:border-amber-400' },
  { id: 'pla', label: 'Planilla', tipo_gasto: 'planilla_laboral', emoji: '👥', gradient: 'from-indigo-500/10 to-blue-500/10', border: 'border-indigo-200 hover:border-indigo-400' },
  { id: 'per', label: 'Representación interna', tipo_gasto: 'representacion_interna', emoji: '🤝', gradient: 'from-pink-500/10 to-rose-500/10', border: 'border-pink-200 hover:border-pink-400' },
  { id: 'ogv', label: 'Otros gastos / Gastos varios', tipo_gasto: 'otros_gastos_varios', emoji: '📋', gradient: 'from-purple-500/10 to-violet-500/10', border: 'border-purple-200 hover:border-purple-400' },
  { id: 'glob', label: 'Globales', tipo_gasto: 'gastos_globales', emoji: '🌐', gradient: 'from-teal-500/10 to-cyan-500/10', border: 'border-teal-200 hover:border-teal-400' },
];

/** Parrilla Gastos (sin pendiente_revision en UI operativa; inversión → tarjeta aparte). */
const GASTO_PARILLA_TABS: GastoTabDef[] = [...GASTO_TABS];

/** Parrilla operador restringido: solo globales. */
const OPERADOR_GASTO_PARILLA_TABS: GastoTabDef[] = [
  GASTO_TABS.find((t) => t.tipo_gasto === 'gastos_globales')!,
];

/** Destinos en modal «mover categoría» (sin pendiente_revision en UI). */
const GASTO_CATEGORIAS_PARA_MOVIMIENTO: GastoTabDef[] = [
  ...GASTO_TABS.slice(0, 5),
  INVERSION_GASTO_TAB,
  ...GASTO_TABS.slice(5),
];

/** Franja superior en la tarjeta de resumen (acento por categoría). */
const TAB_ACCENT_STRIP: Record<string, string> = {
  op: 'from-red-500 via-rose-500 to-red-700',
  opf: 'from-orange-500 via-amber-500 to-orange-700',
  adm: 'from-slate-500 via-gray-600 to-slate-800',
  fin: 'from-amber-500 via-orange-500 to-amber-700',
  pla: 'from-indigo-500 via-blue-600 to-indigo-800',
  inv: 'from-violet-500 via-fuchsia-600 to-violet-800',
  per: 'from-pink-500 via-rose-500 to-pink-700',
  glob: 'from-teal-500 via-cyan-600 to-teal-800',
  rev: 'from-amber-500 via-orange-500 to-amber-700',
};

/** Degradado de barras del gráfico mensual (coherente con la categoría). */
const TAB_BAR_GRADIENT: Record<string, { from: string; to: string }> = {
  op: { from: '#FB7185', to: '#B91C1C' },
  opf: { from: '#FB923C', to: '#C2410C' },
  adm: { from: '#94A3B8', to: '#475569' },
  fin: { from: '#FBBF24', to: '#C2410C' },
  pla: { from: '#818CF8', to: '#3730A3' },
  inv: { from: '#C084FC', to: '#6B21A8' },
  per: { from: '#F472B6', to: '#BE185D' },
  glob: { from: '#2DD4BF', to: '#0F766E' },
  rev: { from: '#FBBF24', to: '#C2410C' },
};

/** Misma limpieza que el detalle del registro (RegistrosTable). */
function formatGastoObservacionesModal(comentarios: string | null | undefined): string {
  const cleaned = cleanOperationalCommentForUi(comentarios);
  return cleaned || 'Sin observaciones';
}

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
  const { formatGlobalAmount, formatRecordAmount } = useAmountDisplay();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    gastos,
    vehicles,
    deleteGasto,
    upsertGasto,
    removeGastoLocal,
    applyGastoMovedLocal,
    subscribeGastoHistorialSync,
    filterGastosExcludingRemoved,
    registrosRemoteTick,
    toast,
    addGasto,
    showUndoToast,
    gastosLoadScope,
    isLoadingGastosFull,
    reloadGastosFull,
    reloadGastosOnly,
    gastosFinancialSummary,
    isLoadingGastosSummary,
  } = useRegistrosContext();
  const gastosDataPending = useGastosDataPending();
  const [gastosLoadLongWait, setGastosLoadLongWait] = useState(false);
  const { canEditFinances, user, profile, isFinancialOperador } = useAuth();
  const tenantEmpresaId = profile?.empresa_id;
  const permissionUser = useMemo(
    () => permissionUserFromAuth(user, profile?.email ?? null),
    [user, profile?.email],
  );
  const showGlobalTotals = canViewGlobalTotals(permissionUser);
  const parrillaTabs =
    isFinancialOperador && mode !== 'inversiones' ? OPERADOR_GASTO_PARILLA_TABS : GASTO_PARILLA_TABS;

  const isInversionesPage = mode === 'inversiones';
  const hidePageChrome = embeddedInParent && isInversionesPage;
  const [tabIndex, setTabIndex] = useState<number | null>(null);
  const tab = isInversionesPage
    ? INVERSION_GASTO_TAB
    : tabIndex == null
      ? null
      : (parrillaTabs[tabIndex] ?? null);

  const [registrarOpen, setRegistrarOpen] = useState(false);
  const [registrarSaving, setRegistrarSaving] = useState(false);
  const [prefillVehicleId, setPrefillVehicleId] = useState<number | null>(null);
  const [gastoFormKey, setGastoFormKey] = useState(0);

  useEffect(() => {
    if (isInversionesPage) return;
    if (searchParams.get('registrar') !== '1') return;
    const raw = searchParams.get('vehicleId');
    const vid = raw ? Number(raw) : NaN;
    console.warn('[gasto:create:open_modal]', {
      source: 'url_registrar_param',
      role: profile?.role ?? null,
      userId: user?.id ?? null,
      vehicleId: Number.isFinite(vid) && vid > 0 ? vid : null,
      isFinancialOperador,
    });
    setPrefillVehicleId(Number.isFinite(vid) && vid > 0 ? vid : null);
    setGastoFormKey((k) => k + 1);
    setRegistrarOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('registrar');
    next.delete('vehicleId');
    setSearchParams(next, { replace: true });
  }, [isInversionesPage, searchParams, setSearchParams, profile?.role, user?.id, isFinancialOperador]);

  useEffect(() => {
    if (isInversionesPage) return;
    const tipo = searchParams.get('tipo_gasto');
    if (tipo) {
      const idx = parrillaTabs.findIndex((t) => t.tipo_gasto === tipo);
      if (idx >= 0) setTabIndex(idx);
    }
    const y = searchParams.get('year');
    if (y && /^\d{4}$/.test(y)) setHistoryYear(y);
    const st = searchParams.get('subtipo_gasto') ?? searchParams.get('subtipo');
    if (st) setFilterSubtipoGasto(st);
    const q = searchParams.get('search');
    const hv = searchParams.get('highlightVehicle');
    const maintScope = searchParams.get('mantenimiento_scope') === '1';
    if (maintScope) {
      setMantenimientoScopeOnly(true);
      const idx = parrillaTabs.findIndex((t) => t.tipo_gasto === 'operativo_vehiculo');
      if (idx >= 0) setTabIndex(idx);
    } else {
      setMantenimientoScopeOnly(false);
    }
    if (q) setHistorialSearchInput(q);
    if (hv) setHistorialSearchInput(hv);
    if (tipo || y || st || q || hv || maintScope) {
      requestAnimationFrame(() =>
        document.getElementById('copilot-gastos-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      );
    }
  }, [searchParams, isInversionesPage, parrillaTabs]);

  const openRegistrarModal = () => {
    console.warn('[gasto:create:open_modal]', {
      source: 'header_button',
      role: profile?.role ?? null,
      userId: user?.id ?? null,
      isFinancialOperador,
      registrarOpenBefore: registrarOpen,
    });
    setPrefillVehicleId(null);
    setGastoFormKey((k) => k + 1);
    setRegistrarOpen(true);
  };

  useEffect(() => {
    if (!gastosDataPending) {
      setGastosLoadLongWait(false);
      return;
    }
    const t = window.setTimeout(() => setGastosLoadLongWait(true), 4000);
    return () => window.clearTimeout(t);
  }, [gastosDataPending]);

  const gastosForCalc = gastosDataPending ? [] : gastos;

  const closeRegistrarModal = () => {
    setRegistrarOpen(false);
    setPrefillVehicleId(null);
  };

  const gastosTab = useMemo(
    () => (tab ? gastosForCalc.filter((g) => gastoMatchesTipoGasto(g, tab.tipo_gasto)) : []),
    [gastosForCalc, tab],
  );

  const todayTotal = useMemo(
    () => gastosTab.filter((g) => g.fecha === todayStr()).reduce((s, g) => s + g.monto, 0),
    [gastosTab],
  );

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
  const [mantenimientoScopeOnly, setMantenimientoScopeOnly] = useState(false);
  const [historialRows, setHistorialRows] = useState<Gasto[]>([]);
  const [historialTotal, setHistorialTotal] = useState(0);
  const [historialPage, setHistorialPage] = useState(0);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialRefreshTick, setHistorialRefreshTick] = useState(0);
  const [historialScope, setHistorialScope] = useState<'recent' | 'full'>('recent');
  const [historialFullRowsByTipo, setHistorialFullRowsByTipo] = useState<Record<string, Gasto[]>>({});
  const [historialFullLoadedByTipo, setHistorialFullLoadedByTipo] = useState<Record<string, boolean>>({});
  const [historialFullLoadingByTipo, setHistorialFullLoadingByTipo] = useState<Record<string, boolean>>({});
  const [historialFullErrorByTipo, setHistorialFullErrorByTipo] = useState<Record<string, string | null>>({});
  const historialFullAbortRef = useRef<AbortController | null>(null);
  const historialFullLoadedRef = useRef<Record<string, boolean>>({});
  const historialFullLoadingRef = useRef<Record<string, boolean>>({});
  const historialFullRequestIdRef = useRef(0);
  const [historialFullRetryTick, setHistorialFullRetryTick] = useState(0);
  const [historialSearchInput, setHistorialSearchInput] = useState('');
  const [historialSearchDebounced, setHistorialSearchDebounced] = useState('');
  const [historialPinnedAt, setHistorialPinnedAt] = useState<Map<string, number>>(() => new Map());
  const [historialPinnedRows, setHistorialPinnedRows] = useState<Map<string, Gasto>>(() => new Map());
  const bumpHistorial = useCallback(() => setHistorialRefreshTick((n) => n + 1), []);

  useEffect(() => {
    if (registrosRemoteTick > 0) bumpHistorial();
  }, [registrosRemoteTick, bumpHistorial]);

  useEffect(() => {
    const t = window.setTimeout(() => setHistorialSearchDebounced(historialSearchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [historialSearchInput]);

  useEffect(() => {
    setHistorialScope('recent');
    setHistorialSearchInput('');
    setHistorialSearchDebounced('');
    setHistorialPinnedAt(new Map());
    setHistorialPinnedRows(new Map());
    historialFullAbortRef.current?.abort();
    historialFullAbortRef.current = null;
    historialFullRequestIdRef.current += 1;
    historialFullLoadingRef.current = {};
    historialFullLoadedRef.current = {};
    setHistorialFullLoadingByTipo({});
    setHistorialFullLoadedByTipo({});
  }, [tab?.tipo_gasto]);

  const historialServerSearch =
    historialScope === 'recent' && historialSearchDebounced.length >= 2;

  const activeTipoGasto = tab?.tipo_gasto ?? '';
  const historialFullRows = activeTipoGasto ? historialFullRowsByTipo[activeTipoGasto] ?? [] : [];
  const historialFullLoaded = Boolean(activeTipoGasto && historialFullLoadedByTipo[activeTipoGasto]);
  const historialFullLoading = Boolean(activeTipoGasto && historialFullLoadingByTipo[activeTipoGasto]);
  const historialFullError = activeTipoGasto ? historialFullErrorByTipo[activeTipoGasto] ?? null : null;

  /** Base analítica: historial completo en caché si terminó de cargar; si no, bootstrap en memoria. */
  const gastosForCategoriaAnalytics = useMemo(() => {
    if (historialFullLoaded) return historialFullRows;
    return gastosTab;
  }, [historialFullLoaded, historialFullRows, gastosTab]);

  const categoriaYearsMeta = useMemo(() => {
    const sources: { label: string; years: number[] }[] = [];
    if (historialFullLoaded) {
      sources.push({
        label: 'historialFull',
        years: extractYearsFromGastos(historialFullRows, { minYear: 1900, maxYear: 2100 }),
      });
    } else if (historialFullLoading) {
      sources.push({
        label: 'historialFullLoading',
        years: extractYearsFromGastos(gastosTab, { minYear: GASTOS_TREND_YEAR_MIN, maxYear: 2100 }),
      });
    }
    if (historialScope === 'recent' && historialRows.length > 0) {
      sources.push({
        label: 'historialRecent',
        years: extractYearsFromGastos(historialRows, { minYear: 1900, maxYear: 2100 }),
      });
    }
    sources.push({
      label: 'gastosContext',
      years: extractYearsFromGastos(gastosTab, { minYear: GASTOS_TREND_YEAR_MIN, maxYear: 2100 }),
    });
    return mergeHistorialYears(sources);
  }, [
    historialFullLoaded,
    historialFullRows,
    historialFullLoading,
    historialScope,
    historialRows,
    gastosTab,
  ]);

  const chartAvailableYears = categoriaYearsMeta.years;
  const historialAvailableYears = chartAvailableYears;

  const pinGastoHistorial = useCallback((gasto: Gasto, pinAtMs = Date.now()) => {
    const id = String(gasto.id);
    setHistorialPinnedAt((prev) => new Map(prev).set(id, pinAtMs));
    setHistorialPinnedRows((prev) => new Map(prev).set(id, gasto));
  }, []);

  useEffect(() => {
    setHistorialPage(0);
  }, [tab?.tipo_gasto, historyYear, historyMonth, filterSubtipoGasto, historialScope, historialSearchDebounced]);

  useEffect(() => {
    if (historialScope === 'full') return;
    if (!tab || gastosDataPending || !tenantEmpresaId) {
      setHistorialRows([]);
      setHistorialTotal(0);
      return;
    }
    let canceled = false;
    setHistorialLoading(true);
    const subtipoCanon = usesCanonicalSubtipoHistorialFilter(tab.tipo_gasto);
    const subtipoServer =
      filterSubtipoGasto && !subtipoCanon ? filterSubtipoGasto : undefined;
    const subtipoVariants =
      filterSubtipoGasto && subtipoCanon
        ? getSubtipoFilterDbVariants(tab.tipo_gasto, filterSubtipoGasto)
        : undefined;
    void fetchGastosHistorialPage(
      {
        tipo_gasto: tab.tipo_gasto,
        year: historyYear,
        month: historyMonth,
        subtipo: subtipoServer,
        subtipoVariants,
        search: historialServerSearch ? historialSearchDebounced : undefined,
        orderMode: 'actividad',
      },
      historialPage,
      DEFAULT_GASTOS_HISTORIAL_PAGE_SIZE,
      tenantEmpresaId,
    )
      .then(({ rows, total }) => {
        if (canceled) return;
        const visibleRows = filterGastosExcludingRemoved(rows);
        setHistorialRows(visibleRows);
        setHistorialTotal(
          visibleRows.length === rows.length ? total : Math.max(0, total - (rows.length - visibleRows.length)),
        );
      })
      .finally(() => {
        if (!canceled) setHistorialLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [
    tab,
    gastosDataPending,
    tenantEmpresaId,
    historyYear,
    historyMonth,
    filterSubtipoGasto,
    historialPage,
    historialRefreshTick,
    historialScope,
    historialSearchDebounced,
    historialServerSearch,
    filterGastosExcludingRemoved,
  ]);

  useEffect(() => {
    historialFullLoadedRef.current = historialFullLoadedByTipo;
  }, [historialFullLoadedByTipo]);

  useEffect(() => {
    historialFullLoadingRef.current = historialFullLoadingByTipo;
  }, [historialFullLoadingByTipo]);

  useEffect(() => {
    if (!tab || gastosDataPending || !tenantEmpresaId) return;
    const tipo = tab.tipo_gasto;
    if (historialFullLoadedRef.current[tipo] || historialFullLoadingRef.current[tipo]) return;

    const requestId = ++historialFullRequestIdRef.current;
    historialFullAbortRef.current?.abort();
    const ac = new AbortController();
    historialFullAbortRef.current = ac;

    historialFullLoadingRef.current[tipo] = true;
    setHistorialFullLoadingByTipo((prev) => ({ ...prev, [tipo]: true }));
    setHistorialFullErrorByTipo((prev) => ({ ...prev, [tipo]: null }));

    if (import.meta.env.DEV && isVerboseDebug()) {
      console.info('[historialFull:gastos] start', { tipo_gasto: tipo, requestId });
    }

    void fetchGastosByTipoFullAll(
      { tipo_gasto: tipo, orderMode: 'actividad' },
      tenantEmpresaId,
      { signal: ac.signal },
    )
      .then(({ rows, error }) => {
        const isCurrent = requestId === historialFullRequestIdRef.current;
        const cancelled = ac.signal.aborted || error === 'Cancelado';
        if (import.meta.env.DEV && isVerboseDebug()) {
          console.info('[historialFull:gastos] settled', {
            tipo_gasto: tipo,
            requestId,
            isCurrent,
            cancelled,
            rowsCount: rows.length,
            error: error ?? null,
          });
        }
        if (!isCurrent) return;

        const sortedRows = sortGastosHistorialByActivity(filterGastosExcludingRemoved(rows));
        setHistorialFullRowsByTipo((prev) => ({ ...prev, [tipo]: sortedRows }));

        if (error && error !== 'Cancelado') {
          setHistorialFullErrorByTipo((prev) => ({ ...prev, [tipo]: error }));
          historialFullLoadedRef.current[tipo] = false;
          setHistorialFullLoadedByTipo((prev) => ({ ...prev, [tipo]: false }));
          return;
        }

        if (cancelled && rows.length === 0) {
          historialFullLoadedRef.current[tipo] = false;
          setHistorialFullLoadedByTipo((prev) => ({ ...prev, [tipo]: false }));
          return;
        }

        historialFullLoadedRef.current[tipo] = true;
        setHistorialFullLoadedByTipo((prev) => ({ ...prev, [tipo]: true }));
        setHistorialFullErrorByTipo((prev) => ({ ...prev, [tipo]: null }));
      })
      .catch((err: unknown) => {
        if (requestId !== historialFullRequestIdRef.current) return;
        const message = err instanceof Error ? err.message : String(err);
        if (import.meta.env.DEV) {
          console.error('[historialFull:gastos] error', { tipo_gasto: tipo, error: message, requestId });
        }
        setHistorialFullErrorByTipo((prev) => ({ ...prev, [tipo]: message }));
        historialFullLoadedRef.current[tipo] = false;
        setHistorialFullLoadedByTipo((prev) => ({ ...prev, [tipo]: false }));
      })
      .finally(() => {
        historialFullLoadingRef.current[tipo] = false;
        setHistorialFullLoadingByTipo((prev) => ({ ...prev, [tipo]: false }));
        if (import.meta.env.DEV && isVerboseDebug()) {
          console.info('[historialFull:gastos] finally', {
            tipo_gasto: tipo,
            requestId,
            isCurrent: requestId === historialFullRequestIdRef.current,
          });
        }
      });

    return () => {
      ac.abort();
      historialFullLoadingRef.current[tipo] = false;
    };
  }, [tab, gastosDataPending, tenantEmpresaId, historialFullRetryTick, filterGastosExcludingRemoved]);

  /** Si el usuario pidió historial completo pero el prefetch abortó, relanzar carga. */
  useEffect(() => {
    if (historialScope !== 'full' || !tab || gastosDataPending || !tenantEmpresaId) return;
    if (historialFullLoaded || historialFullLoading) return;
    if (import.meta.env.DEV) {
      console.info('[historialFull:gastos] auto-retry', { tipo_gasto: tab.tipo_gasto });
    }
    setHistorialFullRetryTick((n) => n + 1);
  }, [
    historialScope,
    tab,
    gastosDataPending,
    tenantEmpresaId,
    historialFullLoaded,
    historialFullLoading,
  ]);

  const historialSourceRows = useMemo(() => {
    if (historialScope === 'full') return historialFullRows;
    const subtipoActivo = Boolean(filterSubtipoGasto?.trim());
    if (subtipoActivo && historialFullLoaded && historialFullRows.length > 0) {
      return historialFullRows;
    }
    return historialRows;
  }, [
    historialScope,
    historialFullRows,
    historialRows,
    filterSubtipoGasto,
    historialFullLoaded,
  ]);

  const historialRowsBaseDated = useMemo(() => {
    if (historialScope !== 'full') return historialSourceRows;
    if (historyYear === 'ALL' && historyMonth === 'ALL') return historialSourceRows;
    return filterRowsByYearMonth(historialSourceRows, historyYear, historyMonth);
  }, [historialSourceRows, historialScope, historyYear, historyMonth]);

  const filterSubtipoCanon = useMemo(() => {
    if (!filterSubtipoGasto?.trim() || !tab) return '';
    return subtipoFinancieroFilterValue(filterSubtipoGasto, tab.tipo_gasto);
  }, [filterSubtipoGasto, tab?.tipo_gasto]);

  const historialSourceTotal =
    historialScope === 'full' ? historialRowsBaseDated.length : historialTotal;
  const historialIsLoading = historialScope === 'full' ? historialFullLoading : historialLoading;

  const handleGastoDetalleSaved = useCallback(
    (g: Gasto) => {
      upsertGasto(g, { source: 'user' });
      if (import.meta.env.DEV) {
        void import('../../audit/techAuditDiagnostics').then(({ logHistorialEditOrder, logHistorialUpdatedAt }) => {
          logHistorialEditOrder({
            role: profile?.role ?? 'unknown',
            gastoId: String(g.id),
            newRevisadoAt: g.revisado_at,
            appearsOnTop: true,
            source: 'detail_edit',
          });
          logHistorialUpdatedAt({
            gastoId: String(g.id),
            revisado_at: g.revisado_at,
            createdAt: g.createdAt,
            fecha: g.fecha,
            path: 'detail_edit',
            willSurviveRefresh: Boolean(g.revisado_at),
          });
        });
      }
    },
    [upsertGasto, profile?.role],
  );

  const handleDeleteGastoHistorial = useCallback(
    async (id: string) => {
      await deleteGasto(id);
    },
    [deleteGasto],
  );

  const [moveTarget, setMoveTarget] = useState<Gasto | null>(null);
  const [moveTipo, setMoveTipo] = useState('');
  const [moveSubtipo, setMoveSubtipo] = useState('');
  const [moveVehicleId, setMoveVehicleId] = useState<string>('');
  const [moveMotivo, setMoveMotivo] = useState('');
  const [moveSaving, setMoveSaving] = useState(false);

  useEffect(() => {
    if (chartAvailableYears.length === 0) {
      setChartYear('');
      return;
    }
    setChartYear((prev) => {
      const n = prev ? Number(prev) : NaN;
      if (prev && Number.isFinite(n) && chartAvailableYears.includes(n)) return prev;
      return String(chartAvailableYears[0]);
    });
  }, [chartAvailableYears]);

  useEffect(() => {
    if (chartAvailableYears.length === 0) {
      setHistoryYear('ALL');
      return;
    }
    setHistoryYear((prev) => {
      if (prev === 'ALL') return prev;
      const n = Number(prev);
      if (Number.isFinite(n) && chartAvailableYears.includes(n)) return prev;
      return 'ALL';
    });
  }, [chartAvailableYears]);

  const chartYearNum = chartYear ? Number(chartYear) : NaN;

  const gastosDelAnioGrafico = useMemo(() => {
    if (!Number.isFinite(chartYearNum)) return [];
    const prefix = `${chartYearNum}-`;
    return gastosForCategoriaAnalytics.filter((g) => g.fecha.startsWith(prefix));
  }, [gastosForCategoriaAnalytics, chartYearNum]);

  /** Misma base que el desglose por subtipo (año del gráfico; si es «un mes», solo ese mes). Alimenta KPIs y gráfico. */
  const gastosResumenEjecutivo = useMemo(() => {
    if (!Number.isFinite(chartYearNum)) return [];
    if (subtipoPeriod === 'MONTH') {
      const mm = subtipoAggMonth.padStart(2, '0');
      return gastosForCategoriaAnalytics.filter(
        (g) => g.fecha.startsWith(`${chartYearNum}-`) && g.fecha.slice(5, 7) === mm,
      );
    }
    return gastosDelAnioGrafico;
  }, [gastosForCategoriaAnalytics, gastosDelAnioGrafico, chartYearNum, subtipoPeriod, subtipoAggMonth]);

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

  const chartData = useMemo(
    () =>
      devMemoPerf(
        'Gastos KPI chartData',
        () => {
          if (subtipoPeriod === 'MONTH' && Number.isFinite(chartYearNum)) {
            const mNum = Number(subtipoAggMonth);
            if (!Number.isFinite(mNum) || mNum < 1 || mNum > 12) return [];
            const dMax = new Date(chartYearNum, mNum, 0).getDate();
            const mm = String(mNum).padStart(2, '0');
            return Array.from({ length: dMax }, (_, idx) => {
              const d = idx + 1;
              const dd = String(d).padStart(2, '0');
              const iso = `${chartYearNum}-${mm}-${dd}`;
              const total = gastosResumenEjecutivo
                .filter((g) => g.fecha === iso)
                .reduce((s, g) => s + g.monto, 0);
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
        },
        { gastosTab: gastosForCategoriaAnalytics.length },
      ),
    [subtipoPeriod, chartYearNum, subtipoAggMonth, gastosResumenEjecutivo, gastosDelAnioGrafico, gastosForCategoriaAnalytics.length],
  );

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
    () => chartAvailableYears.map((y) => ({ value: String(y), label: String(y) })),
    [chartAvailableYears],
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
    if (subtipoPeriod === 'ALL') return gastosForCategoriaAnalytics;
    if (!Number.isFinite(chartYearNum)) return [];
    const prefix = `${chartYearNum}-`;
    const yearSlice = gastosForCategoriaAnalytics.filter((g) => g.fecha.startsWith(prefix));
    if (subtipoPeriod === 'YEAR') return yearSlice;
    const mm = subtipoAggMonth.padStart(2, '0');
    return yearSlice.filter((g) => g.fecha.slice(5, 7) === mm);
  }, [gastosForCategoriaAnalytics, subtipoPeriod, chartYearNum, subtipoAggMonth]);

  const subtipoAggRows = useMemo(
    () =>
      devMemoPerf(
        'Gastos KPI subtipoAggRows',
        () => {
          const map = new Map<string, { count: number; total: number }>();
          for (const g of gastosForSubtipoAgg) {
            let rowKey: string;
            if (tab?.tipo_gasto === 'representacion_interna') {
              const c = normalizeRepresentacionInternaSubtipo(g.subtipo_gasto);
              rowKey = c ? getRepresentacionInternaSubtipoLabel(c) : '(Sin subtipo)';
            } else if (tab?.tipo_gasto === 'inversion_compra') {
              const raw = g.subtipo_gasto?.trim();
              if (!raw) {
                rowKey = '(Sin subtipo)';
              } else {
                const canonKey = getInversionSubtipoDedupeKey(raw);
                rowKey = getInversionSubtipoLabel(canonKey);
              }
            } else {
              const raw = g.subtipo_gasto?.trim();
              rowKey =
                raw && raw.length > 0 ? getSubtipoFinancieroLabel(raw, g.tipo_gasto) : '(Sin subtipo)';
            }
            const cur = map.get(rowKey) ?? { count: 0, total: 0 };
            cur.count += 1;
            cur.total += g.monto;
            map.set(rowKey, cur);
          }
          return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
        },
        { sourceRows: gastosForSubtipoAgg.length },
      ),
    [gastosForSubtipoAgg, tab?.tipo_gasto],
  );

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
    () => [
      { value: 'ALL', label: 'Todos los años' },
      ...historialAvailableYears.map((y) => ({ value: String(y), label: String(y) })),
    ],
    [historialAvailableYears],
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

  const gastosHistorialEmptyHint = useMemo(() => {
    const parts: string[] = [];
    if (historyYear !== 'ALL') parts.push(`año ${historyYear}`);
    if (historyMonth !== 'ALL') {
      const lab = MESES.find((m) => String(m.value).padStart(2, '0') === historyMonth)?.label ?? 'mes';
      parts.push(lab);
    }
    if (parts.length === 0) return 'No hay gastos en esta categoría para los filtros actuales.';
    return `No hay gastos para ${parts.join(' · ')}. Cambie año o mes, o use «Todos».`;
  }, [historyYear, historyMonth]);

  const gastosForSubtipoOptions = useMemo(() => {
    if (historialScope === 'full' && historialFullLoaded) return gastosTab;
    return gastosTab;
  }, [historialScope, historialFullLoaded, gastosTab]);

  const subtipoGastoOptions = useMemo(() => {
    const tipo = tab?.tipo_gasto;
    if (!tipo) return [{ value: '', label: 'Todos subtipo' }];
    if (
      tipo === 'inversion_compra'
      || tipo === 'financiero_prestamo'
      || tipo === 'administrativo_empresa'
    ) {
      const opts = buildSubtipoFilterSelectOptions(tipo, gastosForSubtipoOptions, {
        todosLabel: 'Todos subtipo',
        showHistoricoBadge: true,
      });
      const seen = new Set<string>();
      const out: { value: string; label: string }[] = [{ value: '', label: 'Todos subtipo' }];
      for (const o of opts) {
        if (!o.value) continue;
        const fv = subtipoFinancieroFilterValue(o.value, tipo);
        if (!fv || seen.has(fv)) continue;
        seen.add(fv);
        out.push({ value: fv, label: o.label });
      }
      if (tipo === 'inversion_compra') {
        logSubtipoInversionDebug({
          source: 'gastos_filter',
          categoria: tipo,
          options: out.filter((o) => o.value),
        });
      }
      return out;
    }
    const skipHistoricosScan =
      historialScope === 'full' && historialFullLoaded && tipoGastoUsaSubtipoOperativo(tipo);
    const historicos = skipHistoricosScan
      ? []
      : collectHistoricosSubtiposForTipoGasto(gastosForSubtipoOptions, tipo);
    const merged = mergeSubtiposHistoricosConOficiales(tipo, historicos);
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [{ value: '', label: 'Todos subtipo' }];
    for (const o of merged) {
      let fv: string;
      if (tipo === 'representacion_interna') {
        fv = normalizeRepresentacionInternaSubtipo(o.value) || o.value;
      } else if (tipoGastoUsaSubtipoOperativo(tipo)) {
        fv = resolveOperativoSubtipoGastoCanon(o.value) ?? o.value;
      } else {
        fv = subtipoFinancieroFilterValue(o.value, tipo);
      }
      if (!fv || seen.has(fv)) continue;
      seen.add(fv);
      out.push({
        value: fv,
        label: formatSubtipoOptionLabel(tipo, o, o.isHistorico),
      });
    }
    return out;
  }, [gastosForSubtipoOptions, tab?.tipo_gasto, historialScope, historialFullLoaded]);

  const gastoVisibleEnHistorial = useCallback(
    (g: Gasto, opts?: { pinnedAtMs?: number }) => {
      if (tab && !gastoMatchesTipoGasto(g, tab.tipo_gasto)) return false;
      const pinnedAt = opts?.pinnedAtMs ?? historialPinnedAt.get(String(g.id));
      const skipDateFilter = isGastoRecentlyReclassified(g, pinnedAt);
      if (!skipDateFilter && filterRowsByYearMonth([g], historyYear, historyMonth).length === 0) {
        return false;
      }
      if (
        filterSubtipoGasto &&
        !gastoMatchesSubtipoFinancieroFilter(g.subtipo_gasto, filterSubtipoGasto, tab?.tipo_gasto)
      ) {
        return false;
      }
      if (mantenimientoScopeOnly && !gastoMatchesMaintenanceScope(g)) {
        return false;
      }
      return true;
    },
    [tab, historyYear, historyMonth, filterSubtipoGasto, historialPinnedAt, mantenimientoScopeOnly],
  );

  const removeGastoFromHistorialLocal = useCallback((id: string) => {
    const sid = String(id);
    setHistorialPinnedRows((prev) => {
      if (!prev.has(sid)) return prev;
      const next = new Map(prev);
      next.delete(sid);
      return next;
    });
    setHistorialPinnedAt((prev) => {
      if (!prev.has(sid)) return prev;
      const next = new Map(prev);
      next.delete(sid);
      return next;
    });
    setHistorialRows((prev) => {
      const next = prev.filter((g) => String(g.id) !== sid);
      if (next.length !== prev.length) {
        setHistorialTotal((t) => Math.max(0, t - 1));
      }
      return next;
    });
    setHistorialFullRowsByTipo((prev) => {
      let changed = false;
      const next: Record<string, Gasto[]> = { ...prev };
      for (const [tipo, rows] of Object.entries(prev)) {
        if (!rows?.length) continue;
        const filtered = rows.filter((g) => String(g.id) !== sid);
        if (filtered.length !== rows.length) {
          next[tipo] = filtered;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const syncHistorialRowLocal = useCallback(
    (gasto: Gasto, opts?: { kind?: 'created' | 'sync' }) => {
      const g = enrichGastoHistorialActivity(gasto);
      const id = String(g.id);
      const pinAtMs = Date.now();
      pinGastoHistorial(g, pinAtMs);
      const visible = gastoVisibleEnHistorial(g, { pinnedAtMs: pinAtMs });
      const matchesTab = tab ? gastoMatchesTipoGasto(g, tab.tipo_gasto) : false;
      if (import.meta.env.DEV && isVerboseDebug() && opts?.kind === 'created') {
        console.log('[historial:create-visible]', {
          gastoId: id,
          tipo_gasto: g.tipo_gasto,
          fecha: g.fecha,
          created_at: g.createdAt ?? null,
          revisado_at: g.revisado_at ?? null,
          quickViewIncludes: visible,
          fullHistoryIncludes: matchesTab,
          activeYearFilter: historyYear,
          activeMonthFilter: historyMonth,
          sortKey: gastoHistorialActivityStamp(g, pinAtMs),
        });
      }
      if (!visible) {
        removeGastoFromHistorialLocal(id);
        return;
      }
      if (import.meta.env.DEV) {
        void import('../../audit/techAuditDiagnostics').then(({ logHistorialEditOrder, logHistorialUpdatedAt }) => {
          logHistorialEditOrder({
            role: profile?.role ?? 'unknown',
            gastoId: id,
            tipo_gasto: g.tipo_gasto,
            subtipo_gasto: g.subtipo_gasto,
            revisado_at: g.revisado_at,
            createdAt: g.createdAt,
            fecha: g.fecha,
            source: 'historial_sync',
            pinned: true,
          });
          logHistorialUpdatedAt({
            gastoId: id,
            revisado_at: g.revisado_at,
            createdAt: g.createdAt,
            fecha: g.fecha,
            path: 'historial_sync',
            willSurviveRefresh: Boolean(g.revisado_at),
          });
        });
      }
      const sortPins = new Map(historialPinnedAt);
      sortPins.set(id, pinAtMs);
      setHistorialRows((prev) => {
        const beforeCount = prev.length;
        const idx = prev.findIndex((row) => String(row.id) === id);
        let next: Gasto[];
        if (idx >= 0) {
          next = [...prev];
          next[idx] = g;
        } else {
          setHistorialTotal((t) => t + 1);
          next = [g, ...prev];
        }
        const sorted = sortGastosHistorialByActivity(next, sortPins);
        if (import.meta.env.DEV && isVerboseDebug()) {
          console.log('[historial:quick-refresh]', {
            tipo_gasto: g.tipo_gasto,
            beforeCount,
            afterCount: sorted.length,
            insertedOnTop: sorted[0] != null && String(sorted[0].id) === id,
          });
        }
        return sorted;
      });
      if (activeTipoGasto && historialFullLoadedByTipo[activeTipoGasto]) {
        setHistorialFullRowsByTipo((prev) => {
          const rows = prev[activeTipoGasto] ?? [];
          const idx = rows.findIndex((row) => String(row.id) === id);
          let next: Gasto[];
          if (idx >= 0) {
            next = [...rows];
            next[idx] = g;
          } else {
            next = [g, ...rows];
          }
          return { ...prev, [activeTipoGasto]: sortGastosHistorialByActivity(next, sortPins) };
        });
      }
    },
    [
      gastoVisibleEnHistorial,
      removeGastoFromHistorialLocal,
      pinGastoHistorial,
      activeTipoGasto,
      historialFullLoadedByTipo,
      historialPinnedAt,
      profile?.role,
      tab,
      historyYear,
      historyMonth,
    ],
  );

  const loadHistorialCompleto = useCallback(() => {
    if (!tab) return;
    const tipo = tab.tipo_gasto;
    setHistorialFullErrorByTipo((prev) => ({ ...prev, [tipo]: null }));
    setHistorialScope('full');
    setHistorialPage(0);
    setHistoryYear('ALL');
    setHistoryMonth('ALL');
    if (!historialFullLoadedByTipo[tipo] && !historialFullLoadingByTipo[tipo]) {
      setHistorialFullRetryTick((n) => n + 1);
    }
  }, [tab, historialFullLoadedByTipo, historialFullLoadingByTipo]);

  const retryHistorialFull = useCallback(() => {
    if (!tab) return;
    const tipo = tab.tipo_gasto;
    historialFullLoadedRef.current[tipo] = false;
    historialFullLoadingRef.current[tipo] = false;
    setHistorialFullLoadedByTipo((prev) => ({ ...prev, [tipo]: false }));
    setHistorialFullLoadingByTipo((prev) => ({ ...prev, [tipo]: false }));
    setHistorialFullErrorByTipo((prev) => ({ ...prev, [tipo]: null }));
    historialFullAbortRef.current?.abort();
    historialFullAbortRef.current = null;
    historialFullRequestIdRef.current += 1;
    setHistorialFullRetryTick((n) => n + 1);
  }, [tab]);

  const volverHistorialVistaRapida = useCallback(() => {
    historialFullAbortRef.current?.abort();
    historialFullAbortRef.current = null;
    historialFullRequestIdRef.current += 1;
    if (activeTipoGasto) {
      historialFullLoadingRef.current[activeTipoGasto] = false;
      setHistorialFullLoadingByTipo((prev) => ({ ...prev, [activeTipoGasto]: false }));
    }
    setHistorialScope('recent');
    setHistorialPage(0);
    bumpHistorial();
  }, [bumpHistorial, activeTipoGasto]);

  useEffect(() => {
    return subscribeGastoHistorialSync((event) => {
      if (event.kind === 'created') {
        syncHistorialRowLocal(event.gasto, { kind: 'created' });
      } else if (event.kind === 'removed') {
        removeGastoFromHistorialLocal(event.id);
      } else if (event.kind === 'updated') {
        syncHistorialRowLocal(event.after);
      } else if (event.kind === 'moved') {
        if (event.movedOutOfView || event.removeFromVisible) {
          removeGastoFromHistorialLocal(String(event.before.id));
        } else {
          pinGastoHistorial(event.after);
          syncHistorialRowLocal(event.after);
        }
      }
    });
  }, [subscribeGastoHistorialSync, syncHistorialRowLocal, removeGastoFromHistorialLocal, pinGastoHistorial]);

  const historialRowsMerged = useMemo(() => {
    const pinsForTab = new Map<string, Gasto>();
    const pinsAt = new Map<string, number>();
    for (const [id, g] of historialPinnedRows) {
      if (!tab || !gastoMatchesTipoGasto(g, tab.tipo_gasto)) continue;
      const at = historialPinnedAt.get(id);
      if (!gastoVisibleEnHistorial(g, { pinnedAtMs: at })) continue;
      pinsForTab.set(id, g);
      if (at != null) pinsAt.set(id, at);
    }
    if (pinsForTab.size === 0) return historialRowsBaseDated;
    return mergeHistorialRowsWithPins(historialRowsBaseDated, pinsForTab, pinsAt);
  }, [historialRowsBaseDated, historialPinnedRows, historialPinnedAt, tab, gastoVisibleEnHistorial]);

  const historialFullPerfRef = useRef({ filterMs: 0, lastKey: '' });

  const historialRowsDisplayed = useMemo(() => {
    const t0 = performance.now();
    let rows = historialRowsMerged;
    if (filterSubtipoCanon) {
      rows = rows.filter((g) =>
        gastoMatchesSubtipoFinancieroFilter(g.subtipo_gasto, filterSubtipoCanon, tab?.tipo_gasto),
      );
    }
    historialFullPerfRef.current.filterMs = Math.round(performance.now() - t0);
    return rows;
  }, [historialRowsMerged, filterSubtipoCanon, tab?.tipo_gasto]);

  useEffect(() => {
    if (!import.meta.env.DEV || historialScope !== 'full' || !historialFullLoaded) return;
    const key = `${tab?.tipo_gasto}|${filterSubtipoCanon}|${historyYear}|${historyMonth}|${historialRowsDisplayed.length}`;
    if (historialFullPerfRef.current.lastKey === key) return;
    historialFullPerfRef.current.lastKey = key;
    console.info('[historialFull:perf]', {
      totalRows: historialFullRows.length,
      visibleRows: historialRowsDisplayed.length,
      pageSize: 200,
      filterMs: historialFullPerfRef.current.filterMs,
      sortMs: 0,
      renderMode: 'paginated',
    });
  }, [
    historialScope,
    historialFullLoaded,
    tab?.tipo_gasto,
    filterSubtipoCanon,
    historyYear,
    historyMonth,
    historialRowsDisplayed.length,
    historialFullRows.length,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV || !isVerboseDebug() || tab?.tipo_gasto !== 'inversion_compra') return;
    if (!historialFullLoaded || historialFullRows.length === 0) return;
    auditInversionSubtipos(historialFullRows);
  }, [tab?.tipo_gasto, historialFullLoaded, historialFullRows]);

  useEffect(() => {
    if (!import.meta.env.DEV || !isVerboseDebug() || !tab || historialRowsDisplayed.length === 0) return;
    const top = historialRowsDisplayed[0];
    void import('../../audit/techAuditDiagnostics').then(({ logHistorialAdminRefresh }) => {
      logHistorialAdminRefresh({
        scope: historialScope,
        tipo_gasto: tab.tipo_gasto,
        rowsCount: historialRowsDisplayed.length,
        topRow: top
          ? {
              id: String(top.id),
              revisado_at: top.revisado_at,
              fecha: top.fecha,
            }
          : undefined,
      });
    });
  }, [tab, historialScope, historialRowsDisplayed]);

  useEffect(() => {
    if (!import.meta.env.DEV || !isVerboseDebug() || !tab) return;
    if (tab.tipo_gasto === 'administrativo_empresa') {
      void import('../../audit/techAuditDiagnostics').then(({ auditSubtiposAdmin }) => {
        auditSubtiposAdmin(gastosForSubtipoOptions);
      });
    }
    void import('../../audit/techAuditDiagnostics').then(({ auditSubtiposAll }) => {
      auditSubtiposAll(gastosForSubtipoOptions);
    });
  }, [tab?.tipo_gasto, gastosForSubtipoOptions.length]);

  useEffect(() => {
    if (!import.meta.env.DEV || !isVerboseDebug() || !tab) return;
    console.log('[historial:years]', {
      categoria: tab.tipo_gasto,
      source: categoriaYearsMeta.source,
      years: chartAvailableYears,
      chartYear,
      totalRows: gastosForCategoriaAnalytics.length,
    });
  }, [tab, categoriaYearsMeta.source, chartAvailableYears, chartYear, gastosForCategoriaAnalytics.length]);

  useEffect(() => {
    if (!import.meta.env.DEV || !isVerboseDebug() || !tab || historialRowsDisplayed.length === 0) return;
    const first = historialRowsDisplayed[0]!;
    console.log('[historial:sort]', {
      categoria: tab.tipo_gasto,
      sortBy: 'actividad',
      firstRowFecha: first.fecha,
      firstRowUpdatedAt: first.revisado_at ?? null,
      firstRowCreatedAt: first.createdAt ?? null,
    });
  }, [tab, historialRowsDisplayed]);

  const historialFullButtonLabel = historialFullLoading
    ? 'Cargando historial completo…'
    : historialFullLoaded
      ? 'Viendo historial completo'
      : historialFullError
        ? 'Reintentar historial completo'
        : 'Preparando historial completo…';

  useEffect(() => {
    if (!import.meta.env.DEV || !isVerboseDebug() || !tab) return;
    console.log('[historialFull:state]', {
      tipo: tab.tipo_gasto,
      loading: historialFullLoading,
      loaded: historialFullLoaded,
      rowsCount: historialFullRows.length,
      scope: historialScope,
      error: historialFullError,
      chartYears: chartAvailableYears,
    });
  }, [
    tab,
    historialFullLoading,
    historialFullLoaded,
    historialFullRows.length,
    historialScope,
    historialFullError,
    chartAvailableYears,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV || !isVerboseDebug() || !tab) return;
    console.log('[historialFull:button]', {
      label: historialFullButtonLabel,
      disabled: historialScope === 'full',
      loading: historialFullLoading,
      loaded: historialFullLoaded,
      scope: historialScope,
    });
  }, [tab, historialFullButtonLabel, historialScope, historialFullLoading, historialFullLoaded]);

  useCopilotNarrativeNavigation({
    resolveTarget: (step) =>
      document.getElementById(step.target.replace(/^#/, '')) ??
      document.getElementById('copilot-gastos-table') ??
      document.getElementById('copilot-scroll-target'),
  });

  const handleRegistrarGasto = useCallback(
    async (data: Omit<Gasto, 'id' | 'createdAt'>) => {
      try {
        const created = await addGasto(data);
        if (!created) {
          console.error('[gasto:create:error]', { reason: 'addGasto_returned_null', payload: data });
          toast.error('No se pudo guardar el gasto. Revisa la consola ([gasto:create:error]).');
          return;
        }
        console.warn('[gasto:create:success]', created);
        setHistorialPage(0);
        bumpHistorial();
        if (!gastoVisibleEnHistorial(created)) {
          toast.info('Registro guardado, pero no aparece por el filtro actual.');
        }
        closeRegistrarModal();
      } catch (error) {
        console.error('[gasto:create:error]', error);
        toast.error(
          error instanceof Error ? error.message : 'Error al guardar el gasto. Revisa la consola.',
        );
        throw error;
      }
    },
    [addGasto, gastoVisibleEnHistorial, closeRegistrarModal, toast, bumpHistorial],
  );

  const localTotalFlota = useMemo(() => gastosForCalc.reduce((s, g) => s + g.monto, 0), [gastosForCalc]);
  const gastosGlobalState = useMemo(
    () =>
      resolveGastosGlobalTotalState(
        gastosFinancialSummary,
        localTotalFlota,
        gastos.length,
        gastosLoadScope,
        isLoadingGastosSummary,
      ),
    [
      gastosFinancialSummary,
      localTotalFlota,
      gastos.length,
      gastosLoadScope,
      isLoadingGastosSummary,
    ],
  );
  const totalFlota = gastosGlobalState.total ?? 0;
  const totalFlotaDisplay = formatGastosGlobalTotalDisplay(gastosGlobalState, formatGlobalAmount);
  const totalesDesdeBd = gastosGlobalState.source === 'rpc';

  useEffect(() => {
    if (!import.meta.env.DEV || !isVerboseDebug()) return;
    console.log('[Gastos] gastos source', {
      source: gastosGlobalState.source,
      total: gastosGlobalState.total,
      local: localTotalFlota,
      summary: gastosFinancialSummary?.totalGastos ?? null,
    });
  }, [gastosGlobalState, localTotalFlota, gastosFinancialSummary]);

  const statsInversionesGastos = useMemo(() => {
    const localRows = gastosForCalc.filter((g) => gastoMatchesTipoGasto(g, 'inversion_compra'));
    const kpi = resolveInversionCompraKpi(
      gastosFinancialSummary,
      {
        monto: localRows.reduce((s, g) => s + g.monto, 0),
        count: localRows.length,
      },
      gastosLoadScope,
      isLoadingGastosSummary,
    );
    return kpi;
  }, [gastosFinancialSummary, gastosForCalc, gastosLoadScope, isLoadingGastosSummary]);

  const resumenPorCategoria = useMemo(() => {
    if (gastosFinancialSummary) {
      return devMemoPerf(
        'Gastos KPI resumenPorCategoria (BD)',
        () =>
          resumenPorCategoriaFromSummary(
            gastosFinancialSummary,
            parrillaTabs.map((t) => t.tipo_gasto),
          ),
        { source: 'rpc' },
      );
    }
    if (gastosLoadScope === 'recent') {
      return Object.fromEntries(
        parrillaTabs.map((t) => [t.tipo_gasto, { count: 0, monto: 0 }]),
      );
    }
    return devMemoPerf(
      'Gastos KPI resumenPorCategoria',
      () =>
        Object.fromEntries(
          parrillaTabs.map((t) => {
            const rows = gastosForCalc.filter((g) => gastoMatchesTipoGasto(g, t.tipo_gasto));
            return [t.tipo_gasto, { count: rows.length, monto: rows.reduce((s, g) => s + g.monto, 0) }];
          }),
        ),
      { gastos: gastosForCalc.length, tabs: parrillaTabs.length },
    );
  }, [gastosFinancialSummary, gastosForCalc, parrillaTabs, gastosLoadScope]);

  const gastosPendienteRevisionAll = useMemo(
    () => gastosForCalc.filter((g) => gastoMatchesTipoGasto(g, 'pendiente_revision')),
    [gastosForCalc],
  );

  const statsPendienteRevision = useMemo(() => {
    if (gastosFinancialSummary) {
      const c = summaryCategoria(gastosFinancialSummary, 'pendiente_revision');
      return { n: c.count, monto: c.monto };
    }
    const rows = gastosPendienteRevisionAll;
    return { n: rows.length, monto: rows.reduce((s, g) => s + g.monto, 0) };
  }, [gastosFinancialSummary, gastosPendienteRevisionAll]);

  const totalMovimientosGlobal =
    gastosGlobalState.movementCount ??
    (gastosGlobalState.source === 'loading' ? null : gastos.length);
  const totalMovimientosDisplay =
    totalMovimientosGlobal == null ? '…' : String(totalMovimientosGlobal);

  const getVehicleLabel = useCallback(
    (vehicleId: number | null) => {
      if (!vehicleId) return 'General / sin unidad';
      const v = vehicles.find((x) => x.id === vehicleId);
      return v ? formatVehicleLabelFull(v) : formatVehicleIdFallback(vehicleId);
    },
    [vehicles],
  );

  useEffect(() => {
    if (!import.meta.env.DEV || !isVerboseDebug() || gastosDataPending) return;
    console.info('[perf] Gastos KPI snapshot', {
      gastos: gastosForCalc.length,
      tab: tab?.tipo_gasto ?? 'parrilla',
      resumenCategorias: Object.keys(resumenPorCategoria).length,
      tablaRows: historialRowsDisplayed.length,
      subtipoAggRows: subtipoAggRows.length,
      chartPoints: chartData.length,
    });
  }, [
    gastosDataPending,
    gastosForCalc.length,
    tab?.tipo_gasto,
    resumenPorCategoria,
    historialRowsDisplayed.length,
    subtipoAggRows.length,
    chartData.length,
  ]);

  const categoriaOptions = useMemo(() => {
    const moveTargets = new Set(getMoveTargetGastoTipoGastoForUser(permissionUser));
    return GASTO_CATEGORIAS_PARA_MOVIMIENTO.filter(
      (t) =>
        moveTargets.has(t.tipo_gasto)
        && (!isPendienteRevisionHiddenInOperativeUi() || !isPendienteRevisionTipoGasto(t.tipo_gasto)),
    ).map((t) => ({
      value: t.tipo_gasto,
      label: `${t.emoji} ${t.label}`,
    }));
  }, [permissionUser]);

  const canMoveToTipo = useCallback(
    (tipo: string) => canMoveGastoToTipo(permissionUser, tipo),
    [permissionUser],
  );

  const subtipoOptionsForMove = useMemo(() => {
    const extra: string[] = [];
    const currentSub = moveTarget?.subtipo_gasto?.trim() ?? '';
    if (currentSub && subtipoBelongsToCategoriaDestino(moveTipo, currentSub)) {
      extra.push(currentSub);
    }
    const rows = buildSubtipoSelectOptions(moveTipo, gastos, extra);
    const def = getDefaultSubtipoForTipoGasto(moveTipo);
    if (def?.trim() && !rows.some((r) => r.value === def)) {
      rows.unshift({
        value: def,
        label: formatSubtipoOptionLabel(moveTipo, { value: def, label: '', isHistorico: false }),
      });
    }
    const sorted = rows.sort((a, b) => a.label.localeCompare(b.label, 'es'));
    if (moveTipo === 'inversion_compra') {
      logSubtipoInversionDebug({
        source: 'gastos_mover',
        categoria: 'inversion_compra',
        options: sorted,
      });
    }
    if (moveTarget && moveTipo === 'operativo_vehiculo') {
      logSubtipoMoverOperativoVehiculoDebug({
        role: permissionUser.role,
        categoriaSeleccionada: moveTipo,
        options: sorted,
      });
    }
    return sorted;
  }, [gastos, moveTipo, moveTarget, permissionUser.role]);

  const vehicleOptions = useMemo(
    () => [
      { value: '', label: 'Seleccionar vehículo' },
      ...vehicles.map((v) => ({
        value: String(v.id),
        label: formatVehicleSelectLabel(v),
      })),
    ],
    [vehicles],
  );

  const openMoveModal = (g: Gasto) => {
    setMoveTarget(g);
    const canon = tipoGastoUiCanonical(g) ?? 'gastos_globales';
    setMoveTipo(canon);
    const rawSub = g.subtipo_gasto?.trim() ?? '';
    const initialSub =
      rawSub && subtipoBelongsToCategoriaDestino(canon, rawSub)
        ? normalizeSubtipoForTipoGasto(canon, rawSub)
        : getDefaultSubtipoForTipoGasto(canon);
    setMoveSubtipo(initialSub);
    const vid = g.vehicleId;
    const okVid =
      vid != null &&
      Number.isFinite(Number(vid)) &&
      Number(vid) > 0 &&
      vehicles.some((v) => v.id === vid);
    setMoveVehicleId(okVid ? String(vid) : '');
    setMoveMotivo('');
  };

  const handleMoveTipoChange = useCallback(
    (newTipo: string) => {
      setMoveTipo(newTipo);
      setMoveSubtipo((prev) => {
        const prevSub = prev.trim();
        if (prevSub && subtipoBelongsToCategoriaDestino(newTipo, prevSub)) {
          return normalizeSubtipoForTipoGasto(newTipo, prevSub);
        }
        return '';
      });
      const defaultSub = getDefaultSubtipoForTipoGasto(newTipo);
      const newNeedsVehicle = newTipo === 'operativo_vehiculo';
      if (!newNeedsVehicle) {
        setMoveVehicleId('');
      } else {
        const cur = moveTarget?.vehicleId;
        const ok =
          cur != null &&
          Number.isFinite(Number(cur)) &&
          Number(cur) > 0 &&
          vehicles.some((v) => v.id === cur);
        setMoveVehicleId(ok ? String(cur) : '');
      }
    },
    [moveTarget?.vehicleId, vehicles],
  );

  const resetMoveModal = useCallback(() => {
    setMoveTarget(null);
    setMoveMotivo('');
  }, []);

  const closeMoveModal = () => {
    if (moveSaving) return;
    resetMoveModal();
  };

  const isOperativoVehiculoTarget = moveTipo === 'operativo_vehiculo';
  const isOperativoFlotaTarget = moveTipo === 'operativo_flota_general';
  const isInversionTarget = moveTipo === 'inversion_compra';
  const targetNeedsVehicle = moveTipo === 'operativo_vehiculo';
  const currentEffectiveTipo = moveTarget ? (tipoGastoUiCanonical(moveTarget) ?? 'gastos_globales') : '';
  const currentSubtipo = moveTarget?.subtipo_gasto?.trim() ?? '';
  const currentVehicle = moveTarget?.vehicleId != null ? String(moveTarget.vehicleId) : '';
  const sourceHadVehicle =
    tipoGastoRequiereVehiculo(currentEffectiveTipo);
  const effectiveMoveVehicle =
    targetNeedsVehicle || isInversionTarget ? moveVehicleId : '';
  const effectiveCurrentVehicle = sourceHadVehicle ? currentVehicle : '';
  const normalizedDestSubtipo = normalizeSubtipoForTipoGasto(moveTipo, moveSubtipo);
  const normalizedSourceSubtipo = normalizeSubtipoForTipoGasto(currentEffectiveTipo, currentSubtipo);
  const hasAnyChange = moveTarget != null
    && (
      moveTipo !== currentEffectiveTipo
      || normalizedDestSubtipo !== normalizedSourceSubtipo
      || effectiveMoveVehicle !== effectiveCurrentVehicle
    );
  const moveVehicleNum = moveVehicleId.trim() === '' ? NaN : Number(moveVehicleId);
  const vehicleOkForTarget =
    !targetNeedsVehicle
    || (Number.isFinite(moveVehicleNum)
      && moveVehicleNum > 0
      && vehicles.some((v) => v.id === moveVehicleNum));
  useEffect(() => {
    if (!moveTarget) return;
    if (subtipoOptionsForMove.length === 0) return;
    if (subtipoOptionsForMove.some((o) => o.value === moveSubtipo)) return;
    const normalized = normalizeSubtipoForTipoGasto(moveTipo, moveSubtipo);
    if (subtipoOptionsForMove.some((o) => o.value === normalized)) {
      setMoveSubtipo(normalized);
      return;
    }
    setMoveSubtipo(getDefaultSubtipoForTipoGasto(moveTipo));
  }, [moveTarget, moveTipo, moveSubtipo, subtipoOptionsForMove]);

  const moveDisabled = !moveTarget
    || moveSaving
    || !hasAnyChange
    || !vehicleOkForTarget;

  const handleConfirmMoveCategoria = async () => {
    if (!moveTarget) return;
    if (moveDisabled) return;
    if (!canMoveToTipo(moveTipo)) {
      toast.error('Sin permiso', 'No puedes mover este gasto a esa categoría.');
      return;
    }
    const gastoId = moveTarget.id;
    let excelExtraBefore: Record<string, unknown> = {};
    try {
      excelExtraBefore = JSON.parse(JSON.stringify(moveTarget.excelExtra ?? {})) as Record<string, unknown>;
    } catch {
      excelExtraBefore = {};
    }
    const prevTipo = moveTarget.tipo_gasto ?? null;
    const prevSub = moveTarget.subtipo_gasto ?? null;
    const prevVeh = moveTarget.vehicleId ?? null;
    const prevEsGlobalFlota =
      moveTarget.es_global_flota !== undefined && moveTarget.es_global_flota !== null
        ? Boolean(moveTarget.es_global_flota)
        : moveTarget.vehicleId == null;
    const prevClasManual = moveTarget.clasificacion_manual ?? null;
    const prevReqRev = moveTarget.requiere_revision ?? null;
    const prevRevisadoAt = moveTarget.revisado_at ?? null;
    const prevRevisadoPor = moveTarget.revisado_por ?? null;
    const prevOrigen = moveTarget.origen_clasificacion ?? null;
    let toVehicleId: number | null = null;
    if (targetNeedsVehicle) {
      const n = Number(moveVehicleId);
      if (!Number.isFinite(n) || n <= 0 || !vehicles.some((v) => v.id === n)) {
        toast.error(
          'Falta vehículo',
          'Selecciona un N° de unidad válido de la lista (operativo por vehículo lo exige).',
        );
        return;
      }
      toVehicleId = n;
    } else if (isInversionTarget && moveVehicleId.trim()) {
      const n = Number(moveVehicleId);
      if (Number.isFinite(n) && n > 0 && vehicles.some((v) => v.id === n)) {
        toVehicleId = n;
      }
    }
    const subtipoFinal =
      normalizeSubtipoForTipoGasto(
        moveTipo,
        moveSubtipo.trim() || getDefaultSubtipoForTipoGasto(moveTipo) || '',
      ).trim() || null;
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
      to_subtipo_gasto: subtipoFinal,
      from_vehicle_id: normalizeGastoVehicleFkForDb(moveTarget.vehicleId),
      to_vehicle_id: normalizeGastoVehicleFkForDb(toVehicleId),
      motivo: moveMotivo.trim() || null,
      changed_at: changedAt,
    };
    const excelExtraNext: Record<string, unknown> = {
      ...(prevExtra as Record<string, unknown>),
      correcciones_categoria: [...prevHist, correction],
    };

    setMoveSaving(true);
    try {
      const result = await updateGastoCategoriaManual(moveTarget.id, {
        tipo_gasto: moveTipo,
        subtipo_gasto: subtipoFinal,
        vehicle_id: normalizeGastoVehicleFkForDb(
          targetNeedsVehicle || isInversionTarget ? toVehicleId : null,
        ),
        es_global_flota: isInversionTarget ? false : !targetNeedsVehicle,
        clasificacion_manual: true,
        requiere_revision: false,
        revisado_at: changedAt,
        revisado_por: REVISION_USER_LABEL,
        origen_clasificacion: 'correccion_manual_ui',
        excel_extra: excelExtraNext,
      }, {
        reason: moveMotivo.trim() || 'Mover gasto de categoría desde UI',
        sourceAction: 'move_category',
      }, tenantEmpresaId, { operatorClassifyMode: isFinancialOperador });
      if (!result.ok) {
        const short =
          result.supabase?.hint?.trim() ||
          result.supabase?.details?.trim() ||
          result.message;
        console.error('[mover-categoria:error]', {
          role: permissionUser.role,
          gastoId,
          fromTipo: prevTipo,
          toTipo: moveTipo,
          subtipo: subtipoFinal,
          rpcErrorCode: result.supabase?.code ?? null,
          rpcErrorMessage: short,
          allowedCategories: [...FINANZA_MOVE_TARGET_TIPO_GASTO],
          operatorClassifyMode: isFinancialOperador,
          updatePayload: result.updatePayload,
        });
        console.error('[Mover categoría] Detalle técnico', {
          message: result.message,
          gastoId: result.gastoId,
          empresaIdFrontend: result.empresaIdFrontend,
          empresaIdRow: result.empresaIdRow,
          supabase: result.supabase,
          updatePayload: result.updatePayload,
          patchSummary: result.patchSummary,
        });
        toast.error('No se pudo mover la categoría', short.length > 180 ? `${short.slice(0, 177)}…` : short);
        return;
      }

      const localSyncSilent = { reloadSummary: false as const, source: 'user' as const };
      resetMoveModal();

      applyGastoMovedLocal(moveTarget, result.gasto, {
        movedOutOfView: result.movedOutOfView,
        ...localSyncSilent,
      });

      if (import.meta.env.DEV) {
        console.log('[historial:move-refresh]', {
          gastoId: result.gasto.id,
          oldCategoria: prevTipo,
          newCategoria: result.gasto.tipo_gasto ?? moveTipo,
          updatedAt: result.gasto.revisado_at ?? changedAt,
          appearsOnTop:
            !result.movedOutOfView &&
            tab != null &&
            gastoMatchesTipoGasto(result.gasto, tab.tipo_gasto),
        });
      }

      bumpHistorial();

      if (
        !result.movedOutOfView &&
        tab &&
        gastoMatchesTipoGasto(result.gasto, tab.tipo_gasto)
      ) {
        pinGastoHistorial(result.gasto);
      }

      if (isFinancialOperador) {
        toast.success('Gasto clasificado correctamente');
      } else if (result.movedOutOfView) {
        toast.info(
          'Gasto clasificado',
          'La categoría asignada ya no aparece en tu listado (solo gastos globales).',
        );
      } else {
        if (!gastoVisibleEnHistorial(result.gasto)) {
          toast.info('Registro guardado, pero no aparece por el filtro actual.');
        }
      }

      showUndoToast({
        message: 'Categoría movida',
        detail: result.movedOutOfView
          ? 'Clasificación guardada; el gasto salió de tu vista.'
          : 'El gasto se movió correctamente.',
        undoAction: {
          type: 'move',
          label: 'Revertir mover categoría',
          entityType: 'gasto',
          entityId: gastoId,
          undo: async () => {
            const rev = await updateGastoCategoriaManual(
              gastoId,
              {
                tipo_gasto: prevTipo,
                subtipo_gasto: prevSub,
                vehicle_id: normalizeGastoVehicleFkForDb(prevVeh),
                es_global_flota: prevEsGlobalFlota,
                clasificacion_manual: prevClasManual,
                requiere_revision: prevReqRev,
                revisado_at: prevRevisadoAt,
                revisado_por: prevRevisadoPor,
                origen_clasificacion: prevOrigen,
                excel_extra: Object.keys(excelExtraBefore).length > 0 ? excelExtraBefore : null,
              },
              {
                reason: 'Deshacer mover categoría',
                sourceAction: 'undo_move_category',
              },
              tenantEmpresaId,
              { operatorClassifyMode: isFinancialOperador },
            );
            if (!rev.ok) throw new Error('undo_failed');
            applyGastoMovedLocal(result.gasto, rev.gasto, {
              movedOutOfView: rev.movedOutOfView,
              ...(isFinancialOperador ? localSyncSilent : { source: 'undo' as const }),
            });
          },
        },
      });
    } catch (e) {
      console.error('[Mover categoría] Excepción no controlada', e);
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
                {gastosDataPending ? (
                  <span className="inline-block h-3.5 w-56 max-w-full rounded-md shimmer-bg align-middle" aria-hidden />
                ) : isInversionesPage ? (
                  <>
                    {statsInversionesGastos.source === 'loading'
                      ? statsInversionesGastos.loadingLabel
                      : `${statsInversionesGastos.count} movimiento${statsInversionesGastos.count === 1 ? '' : 's'} · ${formatInversionCompraDisplay(statsInversionesGastos, formatGlobalAmount)} en inversión con utilidad (tabla gastos${statsInversionesGastos.source === 'bd' ? ' · BD' : ''})`}
                  </>
                ) : showGlobalTotals ? (
                  <>
                    {totalMovimientosDisplay} movimientos · {totalFlotaDisplay}
                    {totalesDesdeBd ? ' (BD)' : ''}
                  </>
                ) : (
                  <>
                    {gastos.length} movimientos en tus categorías asignadas
                  </>
                )}
              </p>
            </div>
          </div>
          {!isFinancialOperador ? (
            <button
              type="button"
              onClick={openRegistrarModal}
              className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold shadow-soft transition-all">
              + Registrar
            </button>
          ) : null}
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

      {tab == null && !isInversionesPage && gastosDataPending ? (
        <div className="relative min-h-[320px] rounded-2xl" aria-busy="true" aria-label="Cargando gastos">
          <LoadingOverlay
            active
            message={gastosLoadLongWait ? 'Optimizando registros…' : 'Cargando registros recientes…'}
            submessage={
              gastosLoadLongWait
                ? 'Volúmenes grandes pueden tardar un momento.'
                : 'Sincronizando categorías y montos…'
            }
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4">
            {parrillaTabs.map((t) => (
              <SkeletonCard key={t.id} lines={3} className="min-h-[7.5rem]" />
            ))}
            {showGlobalTotals ? <SkeletonCard lines={3} className="min-h-[7.5rem]" /> : null}
          </div>
        </div>
      ) : null}

      {tab == null && !isInversionesPage && !gastosDataPending ? (
        <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-2" role="tablist" aria-label="Categoría de gasto">
          {parrillaTabs.map((t, i) => {
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
                  <span className="text-xs font-bold text-gray-800 tabular-nums sm:text-sm">{formatGlobalAmount(data.monto)}</span>
                </div>
                <h3 className="text-sm font-bold text-gray-900 mb-0.5">{t.label}</h3>
                <p className="text-[11px] text-gray-500 min-h-[1rem]">
                  {data.count} registro{data.count === 1 ? '' : 's'}
                </p>
                <div className="mt-2 text-[10px] font-semibold text-primary-700/80">
                  Entrar a {t.label}
                </div>
              </button>
            );
          })}
          {showGlobalTotals ? (
            <button
              type="button"
              onClick={() => navigate('/finanzas/inversiones/utilidad')}
              className={`mission-btn bg-gradient-to-br ${INVERSION_GASTO_TAB.gradient} border-2 ${INVERSION_GASTO_TAB.border} group text-left`}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-2xl group-hover:scale-110 transition-transform">{INVERSION_GASTO_TAB.emoji}</span>
                <span className="text-xs font-bold text-gray-800 tabular-nums sm:text-sm">
                  {formatInversionCompraDisplay(statsInversionesGastos, formatGlobalAmount)}
                </span>
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-0.5">{INVERSION_GASTO_TAB.label}</h3>
              <p className="text-[11px] text-gray-500 min-h-[1rem]">
                {statsInversionesGastos.count} registro{statsInversionesGastos.count === 1 ? '' : 's'}
              </p>
              <div className="mt-2 text-[10px] font-semibold text-violet-700/80">Abrir en Inversiones →</div>
            </button>
          ) : null}
        </div>
        {showGlobalTotals && gastosLoadScope === 'recent' ? (
          <div className="rounded-xl border border-sky-200/90 bg-sky-50/80 px-3 py-2.5 text-[11px] leading-snug text-sky-950 sm:text-xs">
            <p className="font-semibold">Vista rápida en tablas · totales globales desde BD</p>
            <p className="mt-0.5">
              Los montos de la parrilla usan agregados de Supabase ({isLoadingGastosSummary ? 'actualizando…' : 'totales reales'}).
              Globales en memoria están completos. Cargar histórico completo es opcional (solo para filas en memoria).
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2"
              loading={isLoadingGastosFull}
              onClick={() => void reloadGastosFull()}
            >
              {isLoadingGastosFull ? 'Cargando histórico…' : 'Cargar histórico completo (opcional)'}
            </Button>
          </div>
        ) : null}
        </div>
      ) : null}

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

      {!isPendienteRevisionHiddenInOperativeUi()
      && tab.tipo_gasto === TIPO_GASTO_PENDIENTE_REVISION ? (
        <PendienteRevisionConciliacionPanel
          pendientes={gastosPendienteRevisionAll}
          totalGastosFlota={showGlobalTotals ? totalFlota : 0}
          showHistoricoPercent={showGlobalTotals}
          vehicles={vehicles}
          canEdit={canEditFinances}
          canMoveToTipo={canMoveToTipo}
          userLabel={user.name || REVISION_USER_LABEL}
          categoriaOptions={categoriaOptions}
          applyGastoMovedLocal={applyGastoMovedLocal}
          upsertGasto={upsertGasto}
          removeGastoLocal={removeGastoLocal}
          operatorClassifyMode={isFinancialOperador}
          toast={toast}
          showUndoToast={showUndoToast}
          getVehicleLabel={getVehicleLabel}
        />
      ) : null}

      <div className="relative overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_20px_40px_-24px_rgba(15,23,42,0.14)]">
        {gastosDataPending ? (
          <LoadingOverlay
            active
            message={gastosLoadLongWait ? 'Optimizando registros…' : 'Cargando registros recientes…'}
            submessage={
              gastosLoadLongWait
                ? 'Volúmenes grandes pueden tardar un momento.'
                : 'Sincronizando categorías y montos…'
            }
          />
        ) : null}
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
                  {formatGlobalAmount(animatedTotal)}
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
                      {formatGlobalAmount(chartYearInsights.avgMonthly)}
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
                      {formatGlobalAmount(chartMonthAggG?.avgPerMov ?? 0)}
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
                      {formatGlobalAmount(chartYearInsights.peakTotal)}
                    </p>
                  </>
                )}
              </div>
              {tab.tipo_gasto !== 'planilla_laboral' ? (
                <div className="rounded-lg border border-red-100/90 bg-gradient-to-br from-red-50/90 to-white p-2.5 shadow-sm ring-1 ring-red-900/[0.05] sm:p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700/90">Gasto de hoy</p>
                  <p className="mt-1 text-base font-bold tabular-nums text-red-900 sm:text-lg">
                    {formatGlobalAmount(todayTotal)}
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
            <span className="tabular-nums font-semibold text-slate-900">{formatGlobalAmount(subtipoAggGrand.total)}</span>
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
                              {formatGlobalAmount(agg.total)}
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
                            {formatGlobalAmount(subtipoAggGrand.total)}
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
            <h2 id="copilot-scroll-target" className="text-base font-semibold tracking-tight text-slate-900">Historial · {tab.label}</h2>
            {historialSourceTotal > 0 || historialFullLoaded ? (
              <p className="mt-0.5 text-[11px] text-slate-500">
                {historialScope === 'full' && historialFullLoaded
                  ? `${historialFullRows.length} registro${historialFullRows.length === 1 ? '' : 's'} cargados de esta categoría · viendo historial completo`
                  : `${historialSourceTotal} registro${historialSourceTotal === 1 ? '' : 's'} en esta categoría · carga paginada`}
              </p>
            ) : null}
            <p className="mt-0.5 text-[11px] text-slate-500">Ordenado por última actualización</p>
            {historialFullError ? (
              <p className="mt-0.5 text-[11px] text-amber-800">{historialFullError}</p>
            ) : historialFullLoading && !historialFullLoaded ? (
              <p className="mt-0.5 text-[11px] text-slate-500">Cargando años históricos para gráfico…</p>
            ) : null}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end [&_.label]:mb-0.5 [&_.label]:text-[10px] [&_.label]:font-semibold [&_.label]:text-slate-600">
            {historialScope === 'full' ? (
              <>
                <Button
                  type="button"
                  variant="primary"
                  className="!text-xs !py-2 !px-3 shrink-0"
                  disabled
                >
                  {historialFullButtonLabel}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="!text-xs !py-2 !px-3 shrink-0"
                  onClick={volverHistorialVistaRapida}
                >
                  Vista rápida
                </Button>
                {historialFullError && !historialFullLoading ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="!text-xs !py-2 !px-3 shrink-0"
                    onClick={retryHistorialFull}
                  >
                    Reintentar
                  </Button>
                ) : null}
              </>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="!text-xs !py-2 !px-3 shrink-0"
                onClick={loadHistorialCompleto}
                disabled={historialIsLoading || !tab}
              >
                Ver historial completo
              </Button>
            )}
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
        {historialFullError && historialScope === 'full' && !historialFullLoading ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-4 mb-3">
            <p className="text-sm font-semibold text-amber-950">No se pudo cargar el historial completo</p>
            <p className="mt-1 text-xs text-amber-900">{historialFullError}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" variant="primary" className="!text-xs !py-2 !px-3" onClick={retryHistorialFull}>
                Reintentar
              </Button>
              <Button type="button" variant="secondary" className="!text-xs !py-2 !px-3" onClick={volverHistorialVistaRapida}>
                Volver a vista rápida
              </Button>
            </div>
          </div>
        ) : null}
        <div id="copilot-gastos-table" className="relative">
          <RegistrosTable
            mode="gastos"
            gastos={historialRowsDisplayed}
            vehicles={vehicles}
            onDeleteGasto={handleDeleteGastoHistorial}
            showClasificacionFinanciera
            onMoveCategoriaGasto={canEditFinances ? openMoveModal : undefined}
            onGastoDetalleSaved={canEditFinances ? handleGastoDetalleSaved : undefined}
            preserveServerOrder
            recentlyReclassifiedAt={historialPinnedAt}
            fullHistoryView={historialScope === 'full' && historialFullLoaded}
            serverHistorialSearch={{
              query: historialSearchInput,
              appliedQuery: historialSearchDebounced,
              onQueryChange: (q) => {
                setHistorialSearchInput(q);
                if (historialScope === 'recent') setHistorialPage(0);
              },
              serverSide: historialServerSearch,
              scopeRecent: historialScope === 'recent',
              totalInCategory: historialSourceTotal,
              searching: historialIsLoading,
            }}
            {...(historialScope === 'recent'
              ? {
                  serverPagination: {
                    total: historialTotal,
                    page: historialPage,
                    pageSize: DEFAULT_GASTOS_HISTORIAL_PAGE_SIZE,
                    onPageChange: setHistorialPage,
                    loading: historialLoading,
                  },
                }
              : {})}
          />
        </div>
      </div>
        </>
      )}

      <Modal
        isOpen={moveTarget != null}
        onClose={closeMoveModal}
        title="Mover gasto de categoría"
        size="lg"
        closeLocked={moveSaving}
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
              {moveSaving ? 'Guardando…' : 'Confirmar movimiento'}
            </Button>
          </>
        )}
      >
        {!moveTarget ? null : (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-1.5">
              <p className="text-sm text-gray-800 break-words">
                <span className="font-semibold">Descripción:</span>{' '}
                {moveTarget.motivo?.trim() || moveTarget.subtipo_gasto?.trim() || 'Sin descripción'}
              </p>
              <p className="text-sm text-gray-800 break-words whitespace-pre-wrap leading-snug">
                <span className="font-semibold">Observaciones:</span>{' '}
                {formatGastoObservacionesModal(moveTarget.comentarios)}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Monto:</span> {formatRecordAmount(moveTarget.monto, moveTarget)}
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
              onChange={handleMoveTipoChange}
            />

            <Select
              label="Subtipo (opcional)"
              options={subtipoOptionsForMove}
              value={moveSubtipo}
              onChange={setMoveSubtipo}
            />

            {isOperativoFlotaTarget && (
              <p className="text-xs text-orange-900 rounded-lg border border-orange-200 bg-orange-50/90 px-3 py-2 leading-snug">
                Operativo flota general / sin vehículo específico. Usar cuando el gasto corresponde a varios
                vehículos o no hay trazabilidad exacta. No se exige N° de unidad.
              </p>
            )}

            {isInversionTarget && (
              <p className="text-xs text-violet-800 rounded-lg border border-violet-100 bg-violet-50/90 px-3 py-2">
                Inversión con utilidad: el vehículo es opcional (cuotas parciales o sin unidad definida).
              </p>
            )}

            {targetNeedsVehicle && (
              <Select
                label="Vehículo (obligatorio para operativo por vehículo)"
                options={vehicleOptions}
                value={moveVehicleId}
                onChange={setMoveVehicleId}
              />
            )}

            {isInversionTarget && !targetNeedsVehicle && (
              <Select
                label="Vehículo (opcional)"
                options={vehicleOptions}
                value={moveVehicleId}
                onChange={setMoveVehicleId}
                placeholder="Sin vehículo"
              />
            )}

            {isOperativoVehiculoTarget && !moveVehicleId && (
              <p className="text-xs text-amber-700">Debes seleccionar un vehículo para operativo por vehículo.</p>
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
        closeLocked={registrarSaving}
        title={isInversionesPage ? 'Registrar inversión con utilidad' : 'Registrar gasto'}
        size="xl"
      >
        <ExpenseForm
          key={gastoFormKey}
          vehicles={vehicles}
          gastos={gastos}
          onSubmit={handleRegistrarGasto}
          onLoadingChange={setRegistrarSaving}
          noCard
          prefillVehicleId={prefillVehicleId}
          finanzaPreset={isInversionesPage ? 'inversion_compra' : null}
        />
      </Modal>
    </div>
  );
};

export default Gastos;
