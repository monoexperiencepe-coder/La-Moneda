import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import {
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Trash2, Eye, ArrowRightLeft,
  Pencil, Loader2,
} from 'lucide-react';
import Badge from '../Common/Badge';
import Button from '../Common/Button';
import Select from '../Common/Select';
import Modal from '../Common/Modal';
import { Ingreso, Gasto, Vehicle } from '../../data/types';
import { formatDate, formatDateTimePe } from '../../utils/formatting';
import { ingresoMontoPEN } from '../../utils/moneda';
import { buildIngresoMoneyPatch } from '../../utils/ingresoMutations';
import { CATEGORIAS_GASTO_LABELS } from '../../data/catalogs';
import { getDetallesMetodoPago, METODOS_PAGO } from '../../data/factCatalog';
import { inferCategoriaFromTipoGasto } from '../../utils/factMappers';
import { mapSubtipoToFactTipo } from '../../constants/subtipos/mapSubtipoToFactTipo';
import { subtipoBelongsToCategoria } from '../../constants/subtipos/subtipoBelongsToCategoria';
import { updateGastoDetalleManual, type GastoDetalleManualPatch } from '../../services/gastosService';
import {
  updateIngresoDetalleManual,
  type IngresoDetalleManualPatch,
} from '../../services/ingresosService';
import { getSubtiposIngreso, TIPOS_INGRESO_FACT } from '../../data/factCatalog';
import {
  getIngresoPeriodoDias,
  INGRESO_SUBTIPO_PERSONALIZADO,
  isIngresoPeriodoPersonalizado,
  ingresoPeriodoPersonalizadoHistorial,
  LM_PERIODO_DIAS_KEY,
  calcPeriodoPersonalizadoFin,
  stampPeriodoDiasExtra,
  subtiposIngresoConPersonalizado,
  syncPeriodoPersonalizadoFin,
  validatePeriodoPersonalizadoRango,
} from '../../utils/ingresoPeriodoPersonalizado';
import { undoUpdateGastoDetalle } from '../../undo/factories';
import { isGastoRecentlyReclassified } from '../../utils/gastoHistorialOrder';
import { useRegistrosContext } from '../../context/RegistrosContext';
import Input from '../Common/Input';
import {
  confianzaTier,
  confianzaBadgeVariant,
} from '../../utils/clasificacionGasto';
import { useAmountDisplay } from '../../hooks/useAmountDisplay';
import { useAuth } from '../../context/AuthContext';
import { canMutateIngresos, isAdminRole } from '../../utils/roles';
import {
  cleanIngresoComentarioParaUi,
  cleanIngresoDetalleOperativoParaUi,
  ingresoComentarioAuditRaw,
  ingresoComentarioParaLista,
} from '../../utils/ingresoImportComment';
import {
  cleanOperationalCommentForUi,
  gastoObservacionParaLista,
  operationalCommentAuditRaw,
} from '../../utils/cleanOperationalComment';
import { labelCategoriaIngresoExtraordinario } from '../../data/ingresoAlcanceCatalog';
import { isIngresoExtraordinario, isIngresoVehicular } from '../../utils/ingresoAlcance';
import { vehicleIdSortRank } from '../../utils/sortByVehicle';
import { formatVehicleIdPlaca, formatVehicleIdFallback } from '../../utils/vehicleDisplayNumber';
import { vehicleIdKey } from '../../utils/vehicleId';
import { extractVehicleSearchIds, isStrictVehicleOnlyQuery } from '../../utils/vehicleSearchFromQuery';
import {
  gastoSearchHaystack,
  ingresoSearchHaystack,
  matchesHistorialRecordSearch,
  queryHasGeneralSearchIntent,
} from '../../utils/recordSearch';
import { labelTipoGastoFinanciero } from '../../utils/tipoGastoLabels';
import { getSubtipoFinancieroLabel } from '../../utils/subtipoFinancieroLabel';
import { buildSubtipoSelectOptions } from '../../constants/gastosSubtipos';
import {
  normalizeSubtipoCanonForGastoSave,
  resolveSubtipoCanonForGastoEdit,
  tipoGastoPermiteEdicionSubtipoOficial,
} from '../../utils/gastoMoveCategoriaDefaults';
import { motivoFromSubtipoCanon } from '../../utils/gastoEditSubtipoMotivo';
import { tipoGastoUiCanonical } from '../../utils/gastosTipoGasto';
import { sortRegistrosByLatestCreatedOrDate } from '../../utils/sortRegistrosByLatestCreatedOrDate';
import { sumGastosHistorialPEN, sumIngresosHistorialPEN } from '../../utils/historialRegistroTotals';
import { useBootstrapPending } from '../../hooks/useBootstrapPending';
import { useGastosDataPending } from '../../hooks/useGastosDataPending';
import { useDeferredRecalc } from '../../hooks/useDeferredRecalc';
import { RegistroCountLabel, SkeletonTableRows, TableBodySurface, UpdatingChrome } from '../Loading';
import SearchField from '../Common/SearchField';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';

type TableMode = 'ingresos' | 'gastos';

interface RegistrosTableProps {
  mode: TableMode;
  ingresos?: Ingreso[];
  gastos?: Gasto[];
  vehicles: Vehicle[];
  onDeleteIngreso?: (id: string) => Promise<boolean | void> | boolean | void;
  onDeleteGasto?: (id: string) => void;
  /** Muestra columna de capa financiera (tipo_gasto, confianza, etc.) en modo gastos. */
  showClasificacionFinanciera?: boolean;
  /** Acción opcional para mover un gasto de categoría desde UI. */
  onMoveCategoriaGasto?: (gasto: Gasto) => void;
  /** Tras guardar edición manual en el modal de detalle (solo gastos); p. ej. `upsertGasto`. */
  onGastoDetalleSaved?: (gasto: Gasto) => void;
  /** Tras guardar edición manual en el modal de detalle (solo ingresos); p. ej. `upsertIngreso`. */
  onIngresoDetalleSaved?: (ingreso: Ingreso) => void;
  /** Paginación server-side (historial gastos desde Supabase). */
  serverPagination?: {
    total: number;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    loading?: boolean;
  };
  /** Búsqueda controlada por el padre (historial gastos server-side). */
  serverHistorialSearch?: {
    query: string;
    /** Valor debounced del padre para filtrar sin bloquear el input. */
    appliedQuery?: string;
    onQueryChange: (q: string) => void;
    serverSide: boolean;
    scopeRecent?: boolean;
    totalInCategory?: number;
    /** Fetch server en curso (spinner discreto). */
    searching?: boolean;
  };
  /** Pin local tras mover — badge «Reclasificado». */
  recentlyReclassifiedAt?: ReadonlyMap<string, number>;
  /** No reordenar filas ya ordenadas por Supabase. */
  preserveServerOrder?: boolean;
  /** Vista «historial completo» (todas las filas visibles; búsqueda local). */
  fullHistoryView?: boolean;
}

type SortDir = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [
  { value: 10, label: '10 por página' },
  { value: 25, label: '25 por página' },
  { value: 50, label: '50 por página' },
];

const FULL_HISTORY_PAGE_SIZE_OPTIONS = [
  { value: 100, label: '100 por página' },
  { value: 200, label: '200 por página' },
  { value: 500, label: '500 por página' },
];

/** Texto truncado con tooltip nativo si supera `maxLen` caracteres. */
const TruncatedText: React.FC<{ text: string | null | undefined; maxLen?: number; className?: string }> = ({
  text,
  maxLen = 60,
  className = '',
}) => {
  if (!text) return <span className="text-gray-400">—</span>;
  const isLong = text.length > maxLen;
  return (
    <span
      className={`block truncate max-w-[180px] ${className}`}
      title={isLong ? text : undefined}
    >
      {isLong ? `${text.slice(0, maxLen)}…` : text}
    </span>
  );
};

function gastoListaEtiquetas(
  g: Gasto,
  showFin: boolean,
): { primary: string; secondary: string | null } {
  const subtipoFin = g.subtipo_gasto
    ? getSubtipoFinancieroLabel(g.subtipo_gasto, g.tipo_gasto)
    : null;
  const primary =
    showFin && g.tipo_gasto
      ? labelTipoGastoFinanciero(g.tipo_gasto)
      : g.motivo || CATEGORIAS_GASTO_LABELS[g.categoria];
  const secondaryRaw = showFin
    ? subtipoFin || g.subcategoria || g.subTipo
    : g.subcategoria || g.subTipo || g.categoriaReal;
  const norm = (s: string) => s.trim().toLowerCase().replace(/_/g, ' ');
  const secondary =
    secondaryRaw && norm(secondaryRaw) !== norm(primary) ? secondaryRaw : null;
  return { primary, secondary };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeComentariosPatch(s: string): string {
  return s.replace(/\u0000/g, '').trim();
}

type GastoEditDraft = {
  fecha: string;
  fechaRegistro: string;
  vehicleIdStr: string;
  /** Subtipo oficial de la categoría financiera actual (Tipo Fact inferido al guardar). */
  subtipoCanon: string;
  metodoPago: string;
  metodoPagoDetalle: string;
  montoStr: string;
  comentarios: string;
};

function gastoToEditDraft(g: Gasto): GastoEditDraft {
  const tg = tipoGastoUiCanonical(g) ?? (g.tipo_gasto ?? '').trim();
  return {
    fecha: g.fecha.slice(0, 10),
    fechaRegistro: g.fechaRegistro.slice(0, 10),
    vehicleIdStr: g.vehicleId != null ? String(g.vehicleId) : '',
    subtipoCanon: resolveSubtipoCanonForGastoEdit(tg, g.subtipo_gasto),
    metodoPago: g.metodoPago,
    metodoPagoDetalle: g.metodoPagoDetalle,
    montoStr: String(g.monto),
    comentarios: g.comentarios ?? '',
  };
}

function buildGastoDetallePatch(
  baseline: Gasto,
  draft: GastoEditDraft,
): { patch: GastoDetalleManualPatch; error: string | null } {
  const patch: GastoDetalleManualPatch = {};
  const f = draft.fecha.trim().slice(0, 10);
  const fr = draft.fechaRegistro.trim().slice(0, 10);
  if (!ISO_DATE_RE.test(f)) return { patch: {}, error: 'Fecha movimiento no válida (AAAA-MM-DD).' };
  if (!ISO_DATE_RE.test(fr)) return { patch: {}, error: 'Fecha registro no válida (AAAA-MM-DD).' };
  if (f !== baseline.fecha.slice(0, 10)) patch.fecha = f;
  if (fr !== baseline.fechaRegistro.slice(0, 10)) patch.fechaRegistro = fr;

  const vidStr = draft.vehicleIdStr.trim();
  let vid: number | null = null;
  if (vidStr !== '') {
    const n = Number(vidStr);
    if (!Number.isFinite(n) || n <= 0) return { patch: {}, error: 'Vehículo inválido (elige unidad o General).' };
    vid = Math.round(n);
  }
  if ((baseline.vehicleId ?? null) !== vid) patch.vehicleId = vid;

  const tg = tipoGastoUiCanonical(baseline) ?? (baseline.tipo_gasto ?? '').trim();
  if (tipoGastoPermiteEdicionSubtipoOficial(tg)) {
    const canonRaw = draft.subtipoCanon.trim();
    if (!canonRaw) return { patch: {}, error: 'Elige subtipo.' };
    const canon = normalizeSubtipoCanonForGastoSave(tg, canonRaw);
    const fact = mapSubtipoToFactTipo(tg, canon);
    if (!fact) return { patch: {}, error: 'Subtipo no válido para esta categoría.' };

    const subtipoGasto = canon.trim() || null;
    const baseSubtipo = (baseline.subtipo_gasto ?? '').trim() || null;
    if (subtipoGasto !== baseSubtipo) patch.subtipo_gasto = subtipoGasto;
    if (fact.tipo !== baseline.tipo) patch.tipo = fact.tipo;
    if ((fact.subTipo ?? null) !== (baseline.subTipo ?? null)) patch.subTipo = fact.subTipo;
    const catKpi = inferCategoriaFromTipoGasto(fact.tipo);
    if (catKpi !== baseline.categoria) patch.categoria = catKpi;
    const motivoLabel = motivoFromSubtipoCanon(tg, canon);
    if (motivoLabel !== baseline.motivo.trim()) patch.motivo = motivoLabel;
  }

  if (draft.metodoPago !== baseline.metodoPago || draft.metodoPagoDetalle.trim() !== baseline.metodoPagoDetalle.trim()) {
    patch.metodoPago = draft.metodoPago;
    patch.metodoPagoDetalle = draft.metodoPagoDetalle.trim();
  }

  const m = Number(String(draft.montoStr).replace(',', '.'));
  if (!Number.isFinite(m)) return { patch: {}, error: 'Monto inválido.' };
  if (baseline.monto >= 0 && m < 0) {
    return { patch: {}, error: 'El monto debe ser mayor o igual a 0.' };
  }
  if (m !== baseline.monto) patch.monto = m;

  const com = sanitizeComentariosPatch(draft.comentarios);
  if (com !== sanitizeComentariosPatch(baseline.comentarios ?? '')) patch.comentarios = com;

  return { patch, error: null };
}

/** Texto para línea «Cubre» / periodo en listados de ingresos. */
function ingresoCubreLabel(i: Ingreso): string | null {
  const pers = ingresoPeriodoPersonalizadoHistorial(i);
  if (pers) {
    return pers.rango ? `${pers.etiqueta} · ${pers.rango}` : pers.etiqueta;
  }
  const d = i.fechaDesde?.trim();
  const h = i.fechaHasta?.trim();
  if (!d && !h) return null;
  return `${d ? formatDate(d) : '—'} → ${h ? formatDate(h) : '—'}`;
}

function ingresoCubreLineas(i: Ingreso): { line1: string; line2: string | null } | null {
  const pers = ingresoPeriodoPersonalizadoHistorial(i);
  if (!pers) return null;
  return { line1: pers.etiqueta, line2: pers.rango };
}

type IngresoEditDraft = {
  fecha: string;
  vehicleIdStr: string;
  tipo: string;
  subTipo: string;
  periodoDias: string;
  fechaDesde: string;
  fechaHasta: string;
  montoStr: string;
  moneda: 'PEN' | 'USD';
  tipoCambioStr: string;
  comentarios: string;
};

function ingresoToEditDraft(i: Ingreso): IngresoEditDraft {
  const dias = getIngresoPeriodoDias(i);
  const esPers = isIngresoPeriodoPersonalizado(i);
  const fechaPago = i.fecha.slice(0, 10);
  const fechaInicio =
    esPers && i.fechaDesde?.trim()
      ? i.fechaDesde.slice(0, 10)
      : esPers
        ? fechaPago
        : '';
  let fechaHasta = i.fechaHasta?.slice(0, 10) ?? '';
  if (esPers && !fechaHasta && dias != null && fechaInicio) {
    fechaHasta = calcPeriodoPersonalizadoFin(fechaInicio, dias) ?? '';
  }
  return {
    fecha: fechaPago,
    vehicleIdStr: i.vehicleId != null ? String(i.vehicleId) : '',
    tipo: i.tipo,
    subTipo: i.subTipo ?? '',
    periodoDias: dias != null ? String(dias) : '',
    fechaDesde: fechaInicio,
    fechaHasta,
    montoStr: String(i.monto),
    moneda: i.moneda === 'USD' ? 'USD' : 'PEN',
    tipoCambioStr: i.tipoCambio != null ? String(i.tipoCambio) : '',
    comentarios: i.comentarios ?? '',
  };
}

function buildIngresoDetallePatch(
  baseline: Ingreso,
  draft: IngresoEditDraft,
): { patch: IngresoDetalleManualPatch; error: string | null } {
  const patch: IngresoDetalleManualPatch = {};
  const f = draft.fecha.trim().slice(0, 10);
  if (!ISO_DATE_RE.test(f)) return { patch: {}, error: 'Fecha no válida (AAAA-MM-DD).' };
  if (f !== baseline.fecha.slice(0, 10)) patch.fecha = f;

  const vidStr = draft.vehicleIdStr.trim();
  let vid: number | null = null;
  if (vidStr !== '') {
    const n = Number(vidStr);
    if (!Number.isFinite(n) || n <= 0) return { patch: {}, error: 'Vehículo inválido.' };
    vid = Math.round(n);
  }
  if ((baseline.vehicleId ?? null) !== vid) patch.vehicleId = vid;

  const subTipo = draft.subTipo.trim() || null;
  if ((baseline.subTipo ?? null) !== subTipo) patch.subTipo = subTipo;

  const esPersonalizado =
    subTipo?.toLowerCase() === INGRESO_SUBTIPO_PERSONALIZADO.toLowerCase();
  if (esPersonalizado) {
    const fd = draft.fechaDesde.trim().slice(0, 10);
    if (!ISO_DATE_RE.test(fd)) {
      return { patch: {}, error: 'Indica fecha inicio del periodo (AAAA-MM-DD).' };
    }
    const dias = Number(draft.periodoDias);
    if (!draft.periodoDias.trim() || !Number.isFinite(dias) || dias < 1 || dias > 366) {
      return { patch: {}, error: 'Indica cantidad de días (1–366) para periodo personalizado.' };
    }
    const diasInt = Math.round(dias);
    const fh = draft.fechaHasta.trim().slice(0, 10);
    const rango = validatePeriodoPersonalizadoRango(fd, fh, diasInt);
    if (!rango.ok) return { patch: {}, error: rango.message };
    const extra = stampPeriodoDiasExtra(baseline.excelExtra ?? null, diasInt);
    const prevDias = getIngresoPeriodoDias(baseline);
    if (diasInt !== prevDias || !isIngresoPeriodoPersonalizado(baseline)) {
      patch.excelExtra = extra;
    }
    if ((baseline.fechaDesde ?? null) !== fd) patch.fechaDesde = fd;
    if ((baseline.fechaHasta ?? null) !== fh) patch.fechaHasta = fh;
  } else {
    const fd = draft.fechaDesde.trim() || null;
    const fh = draft.fechaHasta.trim() || null;
    if ((baseline.fechaDesde ?? null) !== fd) patch.fechaDesde = fd;
    if ((baseline.fechaHasta ?? null) !== fh) patch.fechaHasta = fh;
    if (isIngresoPeriodoPersonalizado(baseline) || baseline.excelExtra?.[LM_PERIODO_DIAS_KEY] != null) {
      patch.excelExtra = stampPeriodoDiasExtra(baseline.excelExtra ?? null, null);
    }
  }

  let money;
  try {
    money = buildIngresoMoneyPatch({
      monto: Number(String(draft.montoStr).replace(',', '.')),
      moneda: draft.moneda,
      tipoCambio:
        draft.tipoCambioStr.trim() === ''
          ? null
          : Number(String(draft.tipoCambioStr).replace(',', '.')),
    });
  } catch (e) {
    return { patch: {}, error: e instanceof Error ? e.message : 'Datos monetarios inválidos.' };
  }
  const baselineMoneda = baseline.moneda === 'USD' ? 'USD' : 'PEN';
  const moneyChanged =
    money.monto !== baseline.monto ||
    money.moneda !== baselineMoneda ||
    money.tipoCambio !== (baseline.tipoCambio ?? null);
  if (moneyChanged) Object.assign(patch, money);

  const com = sanitizeComentariosPatch(draft.comentarios);
  if (com !== sanitizeComentariosPatch(baseline.comentarios ?? '')) patch.comentarios = com;

  return { patch, error: null };
}

const RegistrosTable: React.FC<RegistrosTableProps> = ({
  mode,
  ingresos = [],
  gastos = [],
  vehicles,
  onDeleteIngreso,
  onDeleteGasto,
  showClasificacionFinanciera = false,
  onMoveCategoriaGasto,
  onGastoDetalleSaved,
  onIngresoDetalleSaved,
  serverPagination,
  serverHistorialSearch,
  recentlyReclassifiedAt,
  preserveServerOrder = false,
  fullHistoryView = false,
}) => {
  const { role, isFinancialOperador, profile } = useAuth();
  const {
    formatGlobalAmount,
    formatRecordAmount,
    showContador24hHint,
    contador24hHint,
  } = useAmountDisplay();
  const { toast, showUndoToast } = useRegistrosContext();
  const showDeleteIngreso = mode !== 'ingresos' || canMutateIngresos(role);
  const showDeleteGasto = mode !== 'gastos' || !isFinancialOperador;
  const tenantEmpresaId = profile?.empresa_id;
  const colCount = 5;
  const localDebouncedSearch = useDebouncedSearch('', 300);
  const serverControlledSearch = Boolean(serverHistorialSearch);
  const searchInputValue = serverControlledSearch
    ? serverHistorialSearch!.query
    : localDebouncedSearch.inputValue;
  const setSearchInputValue = serverControlledSearch
    ? serverHistorialSearch!.onQueryChange
    : localDebouncedSearch.setInputValue;
  const filterQuery = serverControlledSearch
    ? serverHistorialSearch!.serverSide
      ? ''
      : (serverHistorialSearch!.appliedQuery ?? serverHistorialSearch!.query)
    : localDebouncedSearch.appliedValue;
  const searchDebouncing = serverControlledSearch
    ? searchInputValue.trim() !== (serverHistorialSearch!.appliedQuery ?? serverHistorialSearch!.query).trim()
    : localDebouncedSearch.isDebouncing;
  const searchLoading = Boolean(serverHistorialSearch?.searching || serverPagination?.loading);
  const clearSearch = serverControlledSearch
    ? () => serverHistorialSearch!.onQueryChange('')
    : localDebouncedSearch.clear;
  const [sortKey, setSortKey] = useState<string>('fecha');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const pageSizeSelectOptions = fullHistoryView ? FULL_HISTORY_PAGE_SIZE_OPTIONS : PAGE_SIZE_OPTIONS;

  useEffect(() => {
    if (!fullHistoryView) return;
    setPageSize((prev) => (prev >= 100 ? prev : 200));
    setPage(1);
  }, [fullHistoryView]);
  const [showFullHistory, setShowFullHistory] = useState(false);

  useEffect(() => {
    if (fullHistoryView) setShowFullHistory(true);
  }, [fullHistoryView]);
  const [deletePending, setDeletePending] = useState<
    null | { kind: 'ingreso'; row: Ingreso } | { kind: 'gasto'; id: string }
  >(null);
  const [deletingIngresoId, setDeletingIngresoId] = useState<string | null>(null);
  const [deletingGastoId, setDeletingGastoId] = useState<string | null>(null);
  const [deleteConfirmBusy, setDeleteConfirmBusy] = useState(false);
  const [viewItem, setViewItem] = useState<Ingreso | Gasto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const openingDetailRef = useRef(false);
  const [gastoDetailEditing, setGastoDetailEditing] = useState(false);
  const [gastoEditBaseline, setGastoEditBaseline] = useState<Gasto | null>(null);
  const [gastoEditDraft, setGastoEditDraft] = useState<GastoEditDraft | null>(null);
  const [gastoSaveBusy, setGastoSaveBusy] = useState(false);
  const gastoEditInitialSerialized = useRef('');
  const [ingresoDetailEditing, setIngresoDetailEditing] = useState(false);
  const [ingresoEditBaseline, setIngresoEditBaseline] = useState<Ingreso | null>(null);
  const [ingresoEditDraft, setIngresoEditDraft] = useState<IngresoEditDraft | null>(null);
  const [ingresoSaveBusy, setIngresoSaveBusy] = useState(false);
  const ingresoEditInitialSerialized = useRef('');

  const ingresoDetalleUi = useMemo(() => {
    if (mode !== 'ingresos' || !viewItem) return null;
    const ing = viewItem as Ingreso;
    return {
      comentario: cleanIngresoComentarioParaUi(ing.comentarios),
      detalleOperativo: cleanIngresoDetalleOperativoParaUi(ing.detalleOperativo),
      auditRaw: ingresoComentarioAuditRaw(ing.comentarios, ing.detalleOperativo),
    };
  }, [mode, viewItem]);

  const gastoDetalleUi = useMemo(() => {
    if (mode !== 'gastos' || !viewItem) return null;
    const g = viewItem as Gasto;
    return {
      observacion: cleanOperationalCommentForUi(g.comentarios),
      detalleOperativo: cleanOperationalCommentForUi(g.detalleOperativo),
      auditRaw: operationalCommentAuditRaw(g.comentarios, g.detalleOperativo),
    };
  }, [mode, viewItem]);

  const closeDetail = useCallback(() => {
    setViewItem(null);
    setDetailLoading(false);
    setGastoDetailEditing(false);
    setGastoEditBaseline(null);
    setGastoEditDraft(null);
    setGastoSaveBusy(false);
    gastoEditInitialSerialized.current = '';
    setIngresoDetailEditing(false);
    setIngresoEditBaseline(null);
    setIngresoEditDraft(null);
    setIngresoSaveBusy(false);
    ingresoEditInitialSerialized.current = '';
  }, []);

  const beginOpenDetail = useCallback((item: Ingreso | Gasto) => {
    if (openingDetailRef.current) return;
    openingDetailRef.current = true;
    try {
      flushSync(() => setDetailLoading(true));
      flushSync(() => {
        setGastoDetailEditing(false);
        setGastoEditBaseline(null);
        setGastoEditDraft(null);
        setGastoSaveBusy(false);
        gastoEditInitialSerialized.current = '';
        setIngresoDetailEditing(false);
        setIngresoEditBaseline(null);
        setIngresoEditDraft(null);
        setIngresoSaveBusy(false);
        ingresoEditInitialSerialized.current = '';
        setViewItem(item);
        setDetailLoading(false);
      });
    } finally {
      openingDetailRef.current = false;
    }
  }, []);

  /** Abre el modal de detalle en modo edición (misma condición que el botón «Editar» del footer). */
  const beginOpenGastoEdit = useCallback(
    (item: Gasto) => {
      if (!onGastoDetalleSaved) return;
      if (openingDetailRef.current) return;
      openingDetailRef.current = true;
      try {
        const d = gastoToEditDraft(item);
        flushSync(() => {
          setDetailLoading(false);
          setGastoSaveBusy(false);
          setViewItem(item);
          setGastoEditBaseline(item);
          setGastoEditDraft(d);
          gastoEditInitialSerialized.current = JSON.stringify(d);
          setGastoDetailEditing(true);
        });
      } finally {
        openingDetailRef.current = false;
      }
    },
    [onGastoDetalleSaved],
  );

  /** Abre el modal de detalle en modo edición (misma condición que el botón «Editar» del footer). */
  const beginOpenIngresoEdit = useCallback(
    (item: Ingreso) => {
      if (!onIngresoDetalleSaved || !canMutateIngresos(role)) return;
      if (openingDetailRef.current) return;
      openingDetailRef.current = true;
      try {
        const d = ingresoToEditDraft(item);
        flushSync(() => {
          setDetailLoading(false);
          setIngresoSaveBusy(false);
          setGastoDetailEditing(false);
          setGastoEditBaseline(null);
          setGastoEditDraft(null);
          gastoEditInitialSerialized.current = '';
          setViewItem(item);
          setIngresoEditBaseline(item);
          setIngresoEditDraft(d);
          ingresoEditInitialSerialized.current = JSON.stringify(d);
          setIngresoDetailEditing(true);
        });
      } finally {
        openingDetailRef.current = false;
      }
    },
    [onIngresoDetalleSaved, role],
  );

  const getVehicleLabel = useCallback((vehicleId: number | string | null) => {
    const k = vehicleIdKey(vehicleId);
    if (!k) return 'General';
    const v = vehicles.find((x) => String(x.id) === k);
    return v ? `${v.marca} ${v.modelo} (${v.placa})` : formatVehicleIdFallback(k);
  }, [vehicles]);

  const getVehicleIdPlaca = (vehicleId: number | string | null) => {
    const k = vehicleIdKey(vehicleId);
    if (!k) return 'General';
    const v = vehicles.find((x) => String(x.id) === k);
    if (!v) return formatVehicleIdFallback(k);
    return formatVehicleIdPlaca(v);
  };

  const gastoDetalleEditable = mode === 'gastos' && Boolean(onGastoDetalleSaved);
  const ingresoDetalleEditable =
    mode === 'ingresos' && Boolean(onIngresoDetalleSaved) && canMutateIngresos(role);

  const gastoEditDirty =
    Boolean(gastoEditDraft) &&
    gastoEditInitialSerialized.current !== '' &&
    JSON.stringify(gastoEditDraft) !== gastoEditInitialSerialized.current;

  const ingresoEditDirty =
    Boolean(ingresoEditDraft) &&
    ingresoEditInitialSerialized.current !== '' &&
    JSON.stringify(ingresoEditDraft) !== ingresoEditInitialSerialized.current;

  const ingresoEditSubtipos = useMemo(() => {
    if (!ingresoEditDraft) return [];
    const base = getSubtiposIngreso(ingresoEditDraft.tipo);
    return ingresoEditDraft.tipo === 'ALQUILER'
      ? subtiposIngresoConPersonalizado(base).map((s) => ({ value: s, label: s }))
      : base.map((s) => ({ value: s, label: s }));
  }, [ingresoEditDraft]);

  const ingresoEditEsPersonalizado = Boolean(
    ingresoEditDraft &&
      ingresoEditDraft.subTipo.trim().toLowerCase() === INGRESO_SUBTIPO_PERSONALIZADO.toLowerCase(),
  );

  useEffect(() => {
    if (!import.meta.env.DEV || mode !== 'gastos') return;
    console.log('[form:edit]', {
      role,
      canEdit: Boolean(onGastoDetalleSaved),
      disabledReason: onGastoDetalleSaved ? null : 'sin permiso canEditFinances (onGastoDetalleSaved undefined)',
      submitBlocked: gastoDetailEditing ? !gastoEditDirty || gastoSaveBusy : 'not_editing',
    });
  }, [mode, role, onGastoDetalleSaved, gastoDetailEditing, gastoEditDirty, gastoSaveBusy]);

  const vehicleSelectOptions = useMemo(
    () => [
      { value: '', label: 'General / sin vehículo' },
      ...vehicles.map((v) => ({
        value: String(v.id),
        label: `${v.marca} ${v.modelo} (${v.placa})`,
      })),
    ],
    [vehicles],
  );

  const metodoPagoOptions = useMemo(
    () => METODOS_PAGO.map((m) => ({ value: m, label: m })),
    [],
  );

  const metodoDetalleOptions = useMemo(() => {
    if (!gastoEditDraft) return [];
    const rows = getDetallesMetodoPago(gastoEditDraft.metodoPago).map((r) => ({
      value: r.detalle,
      label: r.detalle,
    }));
    const cur = gastoEditDraft.metodoPagoDetalle.trim();
    if (cur && !rows.some((r) => r.value === cur)) {
      return [{ value: cur, label: `${cur} (actual)` }, ...rows];
    }
    return rows;
  }, [gastoEditDraft]);

  const gastoEditTipoGasto = useMemo(
    () =>
      gastoEditBaseline
        ? (tipoGastoUiCanonical(gastoEditBaseline) ?? (gastoEditBaseline.tipo_gasto ?? '').trim())
        : '',
    [gastoEditBaseline],
  );

  const gastoEditPermiteSubtipoOficial = useMemo(
    () => tipoGastoPermiteEdicionSubtipoOficial(gastoEditTipoGasto),
    [gastoEditTipoGasto],
  );

  const subtipoCanonEditOptions = useMemo(() => {
    if (!gastoEditDraft || !gastoEditBaseline || !gastoEditPermiteSubtipoOficial) return [];
    const extra: string[] = [];
    const current = gastoEditBaseline.subtipo_gasto?.trim();
    if (current && subtipoBelongsToCategoria(gastoEditTipoGasto, current)) {
      extra.push(current);
    }
    return buildSubtipoSelectOptions(gastoEditTipoGasto, gastos, extra, {
      showHistoricoBadge: false,
    });
  }, [
    gastoEditDraft,
    gastoEditBaseline,
    gastoEditPermiteSubtipoOficial,
    gastoEditTipoGasto,
    gastos,
  ]);

  const startGastoEdit = useCallback(() => {
    if (mode !== 'gastos' || !viewItem || !onGastoDetalleSaved || !('signo' in viewItem)) return;
    const g = viewItem as Gasto;
    const d = gastoToEditDraft(g);
    setGastoEditBaseline(g);
    setGastoEditDraft(d);
    gastoEditInitialSerialized.current = JSON.stringify(d);
    setGastoDetailEditing(true);
  }, [mode, viewItem, onGastoDetalleSaved]);

  const cancelGastoEdit = useCallback(() => {
    setGastoDetailEditing(false);
    setGastoEditBaseline(null);
    setGastoEditDraft(null);
    gastoEditInitialSerialized.current = '';
  }, []);

  const startIngresoEdit = useCallback(() => {
    if (mode !== 'ingresos' || !viewItem || !onIngresoDetalleSaved) return;
    const i = viewItem as Ingreso;
    const d = ingresoToEditDraft(i);
    setIngresoEditBaseline(i);
    setIngresoEditDraft(d);
    ingresoEditInitialSerialized.current = JSON.stringify(d);
    setIngresoDetailEditing(true);
  }, [mode, viewItem, onIngresoDetalleSaved]);

  const cancelIngresoEdit = useCallback(() => {
    setIngresoDetailEditing(false);
    setIngresoEditBaseline(null);
    setIngresoEditDraft(null);
    ingresoEditInitialSerialized.current = '';
  }, []);

  const handleSaveIngresoDetail = useCallback(async () => {
    if (!ingresoEditBaseline || !ingresoEditDraft || !onIngresoDetalleSaved || ingresoSaveBusy) return;
    const { patch, error: buildErr } = buildIngresoDetallePatch(ingresoEditBaseline, ingresoEditDraft);
    if (buildErr) {
      toast.error('Revisa el formulario', buildErr);
      return;
    }
    if (Object.keys(patch).length === 0) {
      toast.info('Sin cambios', 'No hay campos modificados para guardar.');
      return;
    }
    setIngresoSaveBusy(true);
    try {
      const res = await updateIngresoDetalleManual(ingresoEditBaseline.id, patch, tenantEmpresaId);
      if (!res.ok) {
        const msg = res.supabase?.hint?.trim() || res.supabase?.details?.trim() || res.error || 'Error desconocido.';
        toast.error('No se pudo guardar', msg.length > 200 ? `${msg.slice(0, 197)}…` : msg);
        return;
      }
      onIngresoDetalleSaved(res.ingreso);
      toast.success('Ingreso actualizado', 'Cambios guardados con auditoría.');
      closeDetail();
    } finally {
      setIngresoSaveBusy(false);
    }
  }, [
    ingresoEditBaseline,
    ingresoEditDraft,
    ingresoSaveBusy,
    onIngresoDetalleSaved,
    tenantEmpresaId,
    toast,
    closeDetail,
  ]);

  const handleSaveGastoDetail = useCallback(async () => {
    if (!gastoEditBaseline || !gastoEditDraft || !onGastoDetalleSaved || gastoSaveBusy) return;
    const { patch, error: buildErr } = buildGastoDetallePatch(gastoEditBaseline, gastoEditDraft);
    if (buildErr) {
      toast.error('Revisa el formulario', buildErr);
      return;
    }
    if (Object.keys(patch).length === 0) {
      toast.info('Sin cambios', 'No hay campos modificados para guardar.');
      return;
    }
    setGastoSaveBusy(true);
    try {
      const res = await updateGastoDetalleManual(gastoEditBaseline.id, patch, tenantEmpresaId);
      if (!res.ok) {
        console.error('[Detalle gasto] updateGastoDetalleManual', res.supabase ?? res.error);
        const msg =
          res.supabase?.hint?.trim() ||
          res.supabase?.details?.trim() ||
          res.error ||
          'Error desconocido.';
        toast.error('No se pudo guardar', msg.length > 200 ? `${msg.slice(0, 197)}…` : msg);
        return;
      }
      onGastoDetalleSaved(res.gasto);
      showUndoToast({
        message: 'Gasto actualizado',
        detail: 'Los cambios se guardaron en Supabase.',
        undoAction: undoUpdateGastoDetalle(gastoEditBaseline, onGastoDetalleSaved),
      });
      closeDetail();
    } finally {
      setGastoSaveBusy(false);
    }
  }, [gastoEditBaseline, gastoEditDraft, gastoSaveBusy, onGastoDetalleSaved, toast, showUndoToast, closeDetail]);

  const rawData = mode === 'ingresos' ? ingresos : gastos;
  const globalBootstrapPending = useBootstrapPending();
  const gastosDataPending = useGastosDataPending();
  const bootstrapPending = mode === 'gastos' ? gastosDataPending : globalBootstrapPending;
  const serverMode = Boolean(serverPagination);

  const filterInputs = useMemo(
    () => ({ query: filterQuery }),
    [filterQuery],
  );
  const { deferred: deferredFilters, isRecalculating } = useDeferredRecalc(filterInputs);
  const deferredQuery = deferredFilters.query;

  useEffect(() => {
    setPage(1);
  }, [filterQuery]);

  const rawDataLenRef = useRef(rawData.length);
  useEffect(() => {
    if (rawData.length > rawDataLenRef.current) setPage(1);
    rawDataLenRef.current = rawData.length;
  }, [rawData.length]);

  const vehicleSearchIds = useMemo(
    () => extractVehicleSearchIds(searchInputValue, vehicles),
    [searchInputValue, vehicles],
  );

  const vehicleSearchStrict = useMemo(
    () => isStrictVehicleOnlyQuery(searchInputValue, vehicleSearchIds),
    [searchInputValue, vehicleSearchIds],
  );

  const generalSearchIntent = useMemo(() => queryHasGeneralSearchIntent(searchInputValue), [searchInputValue]);

  const deferredVehicleSearchIds = useMemo(
    () => extractVehicleSearchIds(deferredQuery, vehicles),
    [deferredQuery, vehicles],
  );

  const deferredVehicleSearchStrict = useMemo(
    () => isStrictVehicleOnlyQuery(deferredQuery, deferredVehicleSearchIds),
    [deferredQuery, deferredVehicleSearchIds],
  );

  const filtered = useMemo(() => {
    let data = rawData;

    if (serverHistorialSearch?.serverSide) return data;

    /* ── Búsqueda libre ── */
    if (!deferredQuery.trim()) return data;
    const idSet = new Set(deferredVehicleSearchIds);

    return data.filter(item => {
      const vidRaw = 'vehicleId' in item ? item.vehicleId : null;
      const vidNum = vidRaw != null && Number.isFinite(Number(vidRaw)) ? Number(vidRaw) : null;
      const byVehicleId = idSet.size > 0 && vidNum != null && idSet.has(vidNum);

      const vehicleLabel = getVehicleLabel('vehicleId' in item ? item.vehicleId : null);
      const haystackParts =
        mode === 'ingresos'
          ? [ingresoSearchHaystack(item as Ingreso, vehicleLabel)]
          : [gastoSearchHaystack(item as Gasto, vehicleLabel)];

      return matchesHistorialRecordSearch(item, deferredQuery, haystackParts, {
        vehicleMatch: byVehicleId,
        vehicleStrict: deferredVehicleSearchStrict,
      });
    });
  }, [rawData, deferredQuery, mode, getVehicleLabel, deferredVehicleSearchIds, deferredVehicleSearchStrict, serverHistorialSearch?.serverSide]);

  const rowVehicleRank = (item: Ingreso | Gasto) =>
    vehicleIdSortRank('vehicleId' in item ? item.vehicleId : null);

  const sorted = useMemo(() => {
    if (serverMode && preserveServerOrder) return filtered;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'fecha' || sortKey === 'registro') {
        const cmp = sortRegistrosByLatestCreatedOrDate(a, b);
        return sortDir === 'desc' ? cmp : -cmp;
      }
      if (sortKey === 'monto') {
        const m = sortDir === 'asc' ? a.monto - b.monto : b.monto - a.monto;
        if (m !== 0) return m;
        return sortRegistrosByLatestCreatedOrDate(a, b);
      }
      if (sortKey === 'vehiculo') {
        const vr = rowVehicleRank(a) - rowVehicleRank(b);
        const cmp = sortDir === 'asc' ? vr : -vr;
        if (cmp !== 0) return cmp;
        return sortRegistrosByLatestCreatedOrDate(a, b);
      }
      return sortRegistrosByLatestCreatedOrDate(a, b);
    });
  }, [filtered, sortKey, sortDir, serverMode, preserveServerOrder]);

  const totalPages = serverMode
    ? Math.max(1, Math.ceil((serverPagination!.total || 0) / serverPagination!.pageSize))
    : Math.max(1, Math.ceil(sorted.length / pageSize));
  const uiPage = serverMode ? serverPagination!.page + 1 : page;
  const goToPage = (p: number) => {
    const next = Math.max(1, Math.min(totalPages, p));
    if (serverMode) serverPagination!.onPageChange(next - 1);
    else setPage(next);
  };
  const paginated = serverMode
    ? sorted
    : sorted.slice((page - 1) * pageSize, page * pageSize);

  const historialResumen = useMemo(() => {
    const filteredCount = serverMode ? serverPagination!.total : sorted.length;
    const filteredTotal = serverMode
      ? 0
      : mode === 'ingresos'
        ? sumIngresosHistorialPEN(sorted as Ingreso[])
        : sumGastosHistorialPEN(sorted as Gasto[]);
    const pageTotal =
      mode === 'ingresos'
        ? sumIngresosHistorialPEN(paginated as Ingreso[])
        : sumGastosHistorialPEN(paginated as Gasto[]);
    const effectivePage = serverMode ? serverPagination!.page + 1 : page;
    const effectivePageSize = serverMode ? serverPagination!.pageSize : pageSize;
    const isPaginated = serverMode
      ? filteredCount > effectivePageSize
      : filteredCount > pageSize;
    const rangeFrom =
      filteredCount === 0 ? 0 : (effectivePage - 1) * effectivePageSize + 1;
    const rangeTo = Math.min(effectivePage * effectivePageSize, filteredCount);
    return { filteredCount, filteredTotal, pageTotal, isPaginated, rangeFrom, rangeTo };
  }, [sorted, paginated, mode, page, pageSize, serverMode, serverPagination]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'fecha' || key === 'registro' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const SortIcon = ({ col }: { col: string }) => (
    <span className="ml-1 inline-flex flex-col">
      <ChevronUp size={10} className={sortKey === col && sortDir === 'asc' ? 'text-primary-500' : 'text-gray-300'} />
      <ChevronDown size={10} className={sortKey === col && sortDir === 'desc' ? 'text-primary-500' : 'text-gray-300'} />
    </span>
  );

  const canShowEmpty = !bootstrapPending && !isRecalculating && !(serverPagination?.loading);

  const emptyMessage = (
    <div className="text-center py-10 text-gray-400 text-sm space-y-3">
      <p>
        {searchInputValue
          ? `Sin resultados para «${searchInputValue.trim()}»`
          : 'Sin registros disponibles'}
      </p>
      {searchInputValue.trim() ? (
        <button
          type="button"
          className="text-sm font-semibold text-primary-600 hover:text-primary-800 hover:underline"
          onClick={() => {
            clearSearch();
            setPage(1);
          }}
        >
          Limpiar búsqueda
        </button>
      ) : null}
    </div>
  );

  const confirmDelete = async () => {
    if (!deletePending || deleteConfirmBusy) return;
    if (deletePending.kind === 'ingreso') {
      const ing = deletePending.row;
      setDeleteConfirmBusy(true);
      setDeletePending(null);
      setDeletingIngresoId(ing.id);
      try {
        await onDeleteIngreso?.(ing.id);
      } finally {
        setDeleteConfirmBusy(false);
        setDeletingIngresoId((cur) => (cur === ing.id ? null : cur));
      }
      return;
    }
    const gid = deletePending.id;
    setDeleteConfirmBusy(true);
    setDeletingGastoId(gid);
    try {
      await onDeleteGasto?.(gid);
      setDeletePending(null);
    } finally {
      setDeleteConfirmBusy(false);
      setDeletingGastoId((cur) => (cur === gid ? null : cur));
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-soft content-enter">
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-100">
        <div className="relative flex-1 w-full sm:max-w-md">
          <SearchField
            value={searchInputValue}
            onChange={setSearchInputValue}
            debouncing={searchDebouncing}
            loading={searchLoading}
            onClear={clearSearch}
            placeholder={
              mode === 'ingresos'
                ? 'Buscar ingresos (texto, general, #3, carro 5, placa…)'
                : 'Buscar gastos (texto, general, #3, carro 5, placa…)'
            }
            aria-describedby={vehicleSearchIds.length > 0 ? 'registros-busqueda-vehiculo' : undefined}
          />
          {vehicleSearchIds.length > 0 ? (
            <p id="registros-busqueda-vehiculo" className="mt-1.5 pl-1 text-[11px] leading-snug text-emerald-800">
              <span className="font-semibold">
                {vehicleSearchStrict ? 'Solo movimientos de:' : 'Incluye unidad:'}
              </span>{' '}
              {vehicleSearchIds.map((id) => (
                <span key={id} className="mr-2 inline-block">
                  #{id} — {getVehicleLabel(id)}
                </span>
              ))}
            </p>
          ) : null}
          {generalSearchIntent ? (
            <p className="mt-1.5 pl-1 text-[11px] leading-snug text-indigo-800">
              <span className="font-semibold">Filtrando:</span> registros sin vehículo (generales / flota general)
            </p>
          ) : null}
          {serverHistorialSearch?.scopeRecent && searchInputValue.trim().length >= 2 && !serverHistorialSearch.serverSide ? (
            <p className="mt-1.5 pl-1 text-[11px] leading-snug text-amber-800">
              No aparece en la carga rápida. Usa «Historial completo» para buscar en toda la categoría.
            </p>
          ) : null}
          {serverHistorialSearch?.serverSide && serverHistorialSearch.totalInCategory != null ? (
            <p className="mt-1.5 pl-1 text-[11px] leading-snug text-slate-500">
              {serverHistorialSearch.totalInCategory} registro
              {serverHistorialSearch.totalInCategory === 1 ? '' : 's'} en esta categoría
              {searchInputValue.trim() ? ' · búsqueda en servidor' : ''}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <RegistroCountLabel
            count={filtered.length}
            pending={bootstrapPending}
            updating={isRecalculating}
          />
          <button
            type="button"
            onClick={() => {
              setShowFullHistory((v) => !v);
              setPage(1);
            }}
            className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold transition-colors ${
              showFullHistory
                ? 'border-violet-300 bg-violet-100 text-violet-800 hover:bg-violet-200'
                : 'border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
            } ${serverMode || fullHistoryView ? 'hidden' : ''}`}
          >
            {showFullHistory ? 'Volver a paginado' : 'Ver historial completo'}
          </button>
          <div className={`w-full sm:w-40 ${serverMode || fullHistoryView ? 'hidden' : ''}`}>
            <Select
              options={pageSizeSelectOptions.map(o => ({ value: o.value, label: o.label }))}
              value={pageSize}
              onChange={v => { setPageSize(Number(v)); setPage(1); }}
            />
          </div>
        </div>
      </div>

      {/* ── Móvil: cards compactas ── */}
      <div className="block md:hidden px-3 py-3 space-y-2.5">
        <TableBodySurface
          pending={bootstrapPending}
          updating={isRecalculating}
          isEmpty={canShowEmpty && paginated.length === 0}
          empty={emptyMessage}
          minHeight="min-h-[12rem]"
          skeletonRows={5}
        >
          <div className="space-y-2.5 stagger-children">
          {paginated.map((item) => {
            const cubreIngresoMobile =
              mode === 'ingresos' ? ingresoCubreLabel(item as Ingreso) : null;
            const ingresoPeriodoLineasMobile =
              mode === 'ingresos' ? ingresoCubreLineas(item as Ingreso) : null;
            const ingresoCommentMobile =
              mode === 'ingresos' ? ingresoComentarioParaLista((item as Ingreso).comentarios) : null;
            const ingresoSubtipoMobile =
              mode === 'ingresos' ? (item as Ingreso).subTipo?.trim() : '';
            const ingresoEsExtraordinarioMobile =
              mode === 'ingresos' ? isIngresoExtraordinario(item as Ingreso) : false;
            const ingresoCategoriaMobile =
              mode === 'ingresos' && ingresoEsExtraordinarioMobile
                ? labelCategoriaIngresoExtraordinario((item as Ingreso).subTipo)
                : null;
            const gastoObsMobile =
              mode === 'gastos' ? gastoObservacionParaLista(item as Gasto) : null;
            const gastoEtiquetasMobile =
              mode === 'gastos' ? gastoListaEtiquetas(item as Gasto, showClasificacionFinanciera) : null;
            const gastoReclassifiedMobile =
              mode === 'gastos' &&
              isGastoRecentlyReclassified(
                item as Gasto,
                recentlyReclassifiedAt?.get(String((item as Gasto).id)),
              );
            return (
            <div
              key={mode === 'ingresos' ? `ingreso-${(item as Ingreso).id}` : `gasto-${(item as Gasto).id}`}
              role="button"
              tabIndex={0}
              className={`w-full text-left rounded-xl border border-gray-100 bg-white shadow-sm active:scale-[0.995] transition-all cursor-pointer hover:border-gray-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 ${
                mode === 'ingresos' ? 'p-2.5 space-y-1.5' : 'p-3'
              }`}
              onClick={() => beginOpenDetail(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  beginOpenDetail(item);
                }
              }}
              aria-label={
                mode === 'ingresos'
                  ? `Abrir detalle del ingreso del ${formatDate((item as Ingreso).fecha)}`
                  : `Abrir detalle del gasto del ${formatDate(item.fecha)}`
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-900">{formatDate(item.fecha)}</p>
                  {mode === 'ingresos' && ingresoPeriodoLineasMobile && !ingresoEsExtraordinarioMobile ? (
                    <div className="mt-0.5 space-y-0.5">
                      <p className="text-[10px] text-emerald-800 font-semibold leading-snug">
                        {ingresoPeriodoLineasMobile.line1}
                      </p>
                      {ingresoPeriodoLineasMobile.line2 ? (
                        <p className="text-[10px] text-emerald-700 font-medium leading-snug">
                          {ingresoPeriodoLineasMobile.line2}
                        </p>
                      ) : null}
                    </div>
                  ) : mode === 'ingresos' && cubreIngresoMobile && !ingresoEsExtraordinarioMobile ? (
                    <p className="text-[10px] text-emerald-700 font-medium mt-0.5 leading-snug">
                      Cubre: {cubreIngresoMobile}
                    </p>
                  ) : null}
                  {mode === 'ingresos' && ingresoEsExtraordinarioMobile ? (
                    <p className="text-[10px] text-violet-700 font-medium mt-0.5 leading-snug">
                      Ingreso de empresa
                    </p>
                  ) : mode === 'ingresos' ? (
                    <p className="text-[11px] text-gray-600 mt-0.5 truncate leading-snug">
                      {getVehicleLabel('vehicleId' in item ? item.vehicleId : null)}
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-600 mt-0.5 truncate leading-snug">
                      {getVehicleLabel('vehicleId' in item ? item.vehicleId : null)}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {mode === 'ingresos' ? (
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-600 tabular-nums">
                        {formatRecordAmount(ingresoMontoPEN(item as Ingreso), item as Ingreso, { signPrefix: '+' })}
                      </p>
                      {showContador24hHint(item as Ingreso) ? (
                        <p className="text-[9px] text-amber-600 leading-tight">{contador24hHint}</p>
                      ) : null}
                    </div>
                  ) : (item as Gasto).monto < 0 ? (
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-600 tabular-nums">
                        {formatRecordAmount(Math.abs((item as Gasto).monto), item as Gasto, { signPrefix: '−' })}
                      </p>
                      {showContador24hHint(item as Gasto) ? (
                        <p className="text-[9px] text-amber-600 leading-tight">{contador24hHint}</p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-500 tabular-nums">
                        {formatRecordAmount((item as Gasto).monto, item as Gasto, { signPrefix: '−' })}
                      </p>
                      {showContador24hHint(item as Gasto) ? (
                        <p className="text-[9px] text-amber-600 leading-tight">{contador24hHint}</p>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              {mode === 'ingresos' ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {ingresoEsExtraordinarioMobile ? (
                    <>
                      <Badge variant="secondary" size="sm">Extraordinario</Badge>
                      {ingresoCategoriaMobile ? (
                        <span className="text-[10px] text-gray-600 truncate max-w-[10rem]">{ingresoCategoriaMobile}</span>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Badge variant="success" size="sm">{(item as Ingreso).tipo}</Badge>
                      {ingresoSubtipoMobile ? (
                        <span className="text-[10px] text-gray-500 truncate max-w-[10rem]">{ingresoSubtipoMobile}</span>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-800">{gastoEtiquetasMobile?.primary}</span>
                    {gastoEtiquetasMobile?.secondary ? (
                      <span className="text-[10px] text-gray-500 truncate max-w-[10rem]">
                        {gastoEtiquetasMobile.secondary}
                      </span>
                    ) : null}
                    {gastoReclassifiedMobile ? (
                      <Badge variant="secondary" size="sm">Reclasificado</Badge>
                    ) : null}
                  </div>
                  {gastoObsMobile ? (
                    <p className="text-[11px] text-gray-600 line-clamp-2 leading-snug">{gastoObsMobile}</p>
                  ) : null}
                </>
              )}

              {mode === 'gastos' && showClasificacionFinanciera && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {(item as Gasto).tipo_gasto ? (
                    <Badge variant="secondary" size="sm">
                      {labelTipoGastoFinanciero((item as Gasto).tipo_gasto)}
                    </Badge>
                  ) : null}
                      {(item as Gasto).subtipo_gasto ? (
                    <span className="text-[10px] text-gray-500 truncate max-w-[140px]">
                      {getSubtipoFinancieroLabel((item as Gasto).subtipo_gasto, (item as Gasto).tipo_gasto)}
                    </span>
                  ) : null}
                  <Badge
                    variant={confianzaBadgeVariant(confianzaTier((item as Gasto).clasificacion_confianza))}
                    size="sm"
                    dot
                  >
                    {(item as Gasto).clasificacion_confianza != null
                      ? `${((item as Gasto).clasificacion_confianza! * 100).toFixed(0)}%`
                      : '—'}
                  </Badge>
                  {(item as Gasto).clasificacion_manual ? (
                    <span className="text-[10px] font-semibold text-violet-600">Manual</span>
                  ) : null}
                </div>
              )}

              <div
                className={`flex items-center gap-2 ${
                  (mode === 'ingresos' && !ingresoCommentMobile) || (mode === 'gastos' && !gastoObsMobile)
                    ? 'justify-end mt-2'
                    : 'justify-between mt-2'
                }`}
              >
                {mode === 'ingresos' && ingresoCommentMobile ? (
                  <p className="text-[11px] text-gray-500 truncate min-w-0 flex-1 line-clamp-2">
                    {ingresoCommentMobile}
                  </p>
                ) : mode === 'gastos' && !gastoObsMobile ? (
                  <p className="text-[11px] text-gray-500 truncate">
                    {(item as Gasto).metodoPago || 'Sin método'}
                  </p>
                ) : null}
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {mode === 'gastos' && onMoveCategoriaGasto && (
                    <button
                      type="button"
                      onClick={() => onMoveCategoriaGasto(item as Gasto)}
                      className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors"
                      title="Mover categoría"
                    >
                      <ArrowRightLeft size={14} />
                    </button>
                  )}
                  {gastoDetalleEditable && (
                    <button
                      type="button"
                      onClick={() => beginOpenGastoEdit(item as Gasto)}
                      className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors"
                      title="Editar gasto"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {ingresoDetalleEditable && (
                    <button
                      type="button"
                      onClick={() => beginOpenIngresoEdit(item as Ingreso)}
                      className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors"
                      title="Editar ingreso"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => beginOpenDetail(item)}
                    className="p-1.5 rounded-lg hover:bg-primary-50 text-gray-400 hover:text-primary-500 transition-colors"
                    title="Ver detalles"
                  >
                    <Eye size={14} />
                  </button>
                  {mode === 'ingresos' ? (
                    showDeleteIngreso && (
                      <button
                        type="button"
                        disabled={deletingIngresoId === (item as Ingreso).id}
                        onClick={() => setDeletePending({ kind: 'ingreso', row: item as Ingreso })}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        title="Eliminar"
                      >
                        {deletingIngresoId === (item as Ingreso).id ? (
                          <Loader2 size={14} className="animate-spin text-red-500" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    )
                  ) : (
                    showDeleteGasto && (
                      <button
                        type="button"
                        onClick={() => setDeletePending({ kind: 'gasto', id: (item as Gasto).id })}
                        disabled={deletingGastoId === String((item as Gasto).id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                        title="Eliminar"
                      >
                        {deletingGastoId === String((item as Gasto).id) ? (
                          <Loader2 size={14} className="animate-spin text-red-500" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
            );
          })}
          </div>
        </TableBodySurface>
      </div>

      {/* ── Desktop: tabla completa ── */}
      <div className="hidden md:block overflow-x-auto relative min-h-[18rem]">
        <UpdatingChrome active={isRecalculating} />
        <table className="w-full min-w-[720px] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th
                className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 py-3 cursor-pointer hover:text-gray-700 whitespace-nowrap"
                onClick={() => handleSort('fecha')}
              >
                {mode === 'ingresos' ? 'Fecha movimiento' : 'Fecha'} <SortIcon col="fecha" />
              </th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 py-3">
                {mode === 'ingresos' ? 'Tipo / Sub tipo' : 'Categoría / Motivo'}
              </th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">
                Método de pago
              </th>
              <th
                className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 py-3 cursor-pointer hover:text-gray-700 whitespace-nowrap"
                onClick={() => handleSort('monto')}
              >
                Monto <SortIcon col="monto" />
              </th>
              <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 py-3">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {bootstrapPending ? (
              <tr>
                <td colSpan={colCount} className="p-3">
                  <SkeletonTableRows rows={6} cols={5} />
                </td>
              </tr>
            ) : canShowEmpty && paginated.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="text-center py-12 text-gray-400 text-sm">
                  {searchInputValue
                    ? 'No se encontraron resultados para los filtros aplicados'
                    : 'Sin registros disponibles'}
                </td>
              </tr>
            ) : (
              paginated.map((item) => {
                const cubreIngresoRow =
                  mode === 'ingresos' ? ingresoCubreLabel(item as Ingreso) : null;
                const ingresoPeriodoLineasRow =
                  mode === 'ingresos' ? ingresoCubreLineas(item as Ingreso) : null;
                const ingresoEsExtraordinarioRow =
                  mode === 'ingresos' ? isIngresoExtraordinario(item as Ingreso) : false;
                const ingresoCategoriaRow =
                  ingresoEsExtraordinarioRow
                    ? labelCategoriaIngresoExtraordinario((item as Ingreso).subTipo)
                    : null;
                const gastoObsRow =
                  mode === 'gastos' ? gastoObservacionParaLista(item as Gasto) : null;
                const gastoEtiquetasRow =
                  mode === 'gastos' ? gastoListaEtiquetas(item as Gasto, showClasificacionFinanciera) : null;
                const gastoReclassifiedRow =
                  mode === 'gastos' &&
                  isGastoRecentlyReclassified(
                    item as Gasto,
                    recentlyReclassifiedAt?.get(String((item as Gasto).id)),
                  );
                return (
                <tr
                  key={mode === 'ingresos' ? `ingreso-${(item as Ingreso).id}` : `gasto-${(item as Gasto).id}`}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  title="Clic en la fila para ver detalles"
                  onClick={() => beginOpenDetail(item)}
                >
                  {/* Fecha */}
                  <td className="px-2 py-3 text-sm text-gray-600 align-top whitespace-nowrap max-w-[140px]">
                    {mode === 'ingresos' ? (
                      <div className="space-y-0.5">
                        <p className="font-semibold text-gray-900">{formatDate((item as Ingreso).fecha)}</p>
                        {ingresoPeriodoLineasRow && !ingresoEsExtraordinarioRow ? (
                          <div className="space-y-0.5">
                            <p className="text-[10px] text-emerald-800 font-semibold leading-snug">
                              {ingresoPeriodoLineasRow.line1}
                            </p>
                            {ingresoPeriodoLineasRow.line2 ? (
                              <p className="text-[10px] text-emerald-700 font-medium leading-snug">
                                {ingresoPeriodoLineasRow.line2}
                              </p>
                            ) : null}
                          </div>
                        ) : cubreIngresoRow && !ingresoEsExtraordinarioRow ? (
                          <p className="text-[10px] text-emerald-800 font-medium leading-snug">
                            Cubre: {cubreIngresoRow}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      formatDate(item.fecha)
                    )}
                  </td>

                  {/* Tipo / Categoría */}
                  <td className="px-2 py-3">
                    {mode === 'ingresos' ? (
                      <div>
                        {ingresoEsExtraordinarioRow ? (
                          <>
                            <Badge variant="secondary">Extraordinario</Badge>
                            {ingresoCategoriaRow ? (
                              <p className="mt-0.5 text-[11px] font-medium text-gray-700">{ingresoCategoriaRow}</p>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <Badge variant="success">{(item as Ingreso).tipo}</Badge>
                            {(item as Ingreso).subTipo ? (
                              <p className="mt-0.5 text-[11px] text-gray-500">{(item as Ingreso).subTipo}</p>
                            ) : null}
                            <p className="mt-0.5 inline-flex items-center rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 text-[11px] font-semibold">
                              Vehículo: {getVehicleIdPlaca((item as Ingreso).vehicleId)}
                            </p>
                          </>
                        )}
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-semibold text-gray-800">{gastoEtiquetasRow?.primary}</p>
                        {gastoEtiquetasRow?.secondary ? (
                          <p className="text-[11px] text-gray-500 mt-0.5">{gastoEtiquetasRow.secondary}</p>
                        ) : null}
                        {gastoReclassifiedRow ? (
                          <p className="mt-1">
                            <Badge variant="secondary" size="sm">Reclasificado</Badge>
                          </p>
                        ) : null}
                        {gastoObsRow ? (
                          <p className="text-[11px] text-gray-600 mt-0.5 line-clamp-2 leading-snug">{gastoObsRow}</p>
                        ) : null}
                        <p className="mt-1 inline-flex items-center rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 text-[11px] font-semibold">
                          Vehículo: {getVehicleIdPlaca((item as Gasto).vehicleId)}
                        </p>
                      </div>
                    )}
                  </td>

                  {/* Método de pago */}
                  <td className="px-2 py-3 text-xs text-gray-700 max-w-[120px]">
                    <p className="font-medium text-gray-800">{item.metodoPago}</p>
                  </td>

                  {/* Monto */}
                  <td className="px-2 py-3 text-right">
                    {mode === 'ingresos' ? (
                      <div className="text-sm font-bold text-emerald-600">
                        {(item as Ingreso).moneda === 'USD' ? (
                          <>
                            <span>
                              {formatRecordAmount((item as Ingreso).monto, item as Ingreso, {
                                currency: 'USD',
                                signPrefix: '+',
                              })}
                            </span>
                            <span className="block text-[10px] font-normal text-gray-500">
                              ≈ {formatRecordAmount(ingresoMontoPEN(item as Ingreso), item as Ingreso)}
                            </span>
                          </>
                        ) : (
                          <span>
                            {formatRecordAmount((item as Ingreso).monto, item as Ingreso, { signPrefix: '+' })}
                          </span>
                        )}
                        {showContador24hHint(item as Ingreso) ? (
                          <span className="block text-[9px] font-normal text-amber-600">{contador24hHint}</span>
                        ) : null}
                      </div>
                    ) : (item as Gasto).monto < 0 ? (
                      <span className="text-sm font-bold text-emerald-600" title="Descuento / rebaja">
                        {formatRecordAmount(Math.abs((item as Gasto).monto), item as Gasto, { signPrefix: '−' })}
                        <span className="block text-[10px] font-normal text-gray-500">rebaja</span>
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-red-500">
                          {formatRecordAmount((item as Gasto).monto, item as Gasto, { signPrefix: '−' })}
                      </span>
                    )}
                  </td>

                  {/* Acciones */}
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      {mode === 'gastos' && onMoveCategoriaGasto && (
                        <button
                          type="button"
                          onClick={() => onMoveCategoriaGasto(item as Gasto)}
                          className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors"
                          title="Mover categoría"
                        >
                          <ArrowRightLeft size={15} />
                        </button>
                      )}
                      {gastoDetalleEditable && (
                        <button
                          type="button"
                          onClick={() => beginOpenGastoEdit(item as Gasto)}
                          className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors"
                          title="Editar gasto"
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      {ingresoDetalleEditable && (
                        <button
                          type="button"
                          onClick={() => beginOpenIngresoEdit(item as Ingreso)}
                          className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors"
                          title="Editar ingreso"
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => beginOpenDetail(item)}
                        className="p-1.5 rounded-lg hover:bg-primary-50 text-gray-400 hover:text-primary-500 transition-colors"
                        title="Ver detalles"
                      >
                        <Eye size={15} />
                      </button>
                      {mode === 'ingresos' ? (
                        showDeleteIngreso && (
                          <button
                            type="button"
                            disabled={deletingIngresoId === (item as Ingreso).id}
                            onClick={() => setDeletePending({ kind: 'ingreso', row: item as Ingreso })}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                            title="Eliminar"
                          >
                            {deletingIngresoId === (item as Ingreso).id ? (
                              <Loader2 size={15} className="animate-spin text-red-500" />
                            ) : (
                              <Trash2 size={15} />
                            )}
                          </button>
                        )
                      ) : (
                        showDeleteGasto && (
                          <button
                            type="button"
                            onClick={() => setDeletePending({ kind: 'gasto', id: (item as Gasto).id })}
                            disabled={deletingGastoId === String((item as Gasto).id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                            title="Eliminar"
                          >
                            {deletingGastoId === String((item as Gasto).id) ? (
                              <Loader2 size={15} className="animate-spin text-red-500" />
                            ) : (
                              <Trash2 size={15} />
                            )}
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Paginación ── */}
      {!serverMode && historialResumen.filteredCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-3 py-3 sm:px-5">
          <p className="text-xs text-gray-500">
            Página {uiPage} de {totalPages}
          </p>
          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => goToPage(uiPage - 1)}
              disabled={uiPage === 1 || serverPagination?.loading}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum = i + 1;
              if (totalPages > 5) {
                if (uiPage <= 3) pageNum = i + 1;
                else if (uiPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = uiPage - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => goToPage(pageNum)}
                  className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                    uiPage === pageNum ? 'bg-primary-500 text-white' : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => goToPage(uiPage + 1)}
              disabled={uiPage === totalPages || serverPagination?.loading}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {historialResumen.filteredCount > 0 ? (
        <div className="border-t border-slate-200/80 bg-slate-50/90 px-3 py-3 sm:px-5 sm:py-3.5">
          <p className="text-xs leading-relaxed text-slate-600">
            <span className="font-medium text-slate-800">
              Mostrando {historialResumen.rangeFrom}–{historialResumen.rangeTo} de {historialResumen.filteredCount}{' '}
              registro{historialResumen.filteredCount === 1 ? '' : 's'}
            </span>
            {historialResumen.isPaginated ? (
              <>
                <span className="mx-1.5 text-slate-300">·</span>
                <span>
                  Esta página:{' '}
                  <span className="font-semibold tabular-nums text-slate-800">
                    {formatGlobalAmount(historialResumen.pageTotal)}
                  </span>
                </span>
              </>
            ) : null}
            <span className="mx-1.5 text-slate-300">·</span>
            <span>
              Total filtrado:{' '}
              <span className="font-semibold tabular-nums text-slate-900">
                {formatGlobalAmount(historialResumen.filteredTotal)}
              </span>
            </span>
          </p>
          <p className="mt-1.5 text-sm font-semibold text-slate-800">
            {mode === 'ingresos' ? 'Total de ingresos mostrados' : 'Total de gastos mostrados'}:{' '}
            <span
              className={`tabular-nums ${mode === 'ingresos' ? 'text-emerald-800' : 'text-rose-800'}`}
            >
              {formatGlobalAmount(historialResumen.filteredTotal)}
            </span>
          </p>
        </div>
      ) : null}

      {/* ── Modal: confirmar eliminación ── */}
      <Modal
        isOpen={deletePending !== null}
        onClose={() => setDeletePending(null)}
        closeLocked={deleteConfirmBusy}
        title="Confirmar eliminación"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletePending(null)} disabled={deleteConfirmBusy}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()} loading={deleteConfirmBusy}>
              {deleteConfirmBusy ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          ¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.
        </p>
      </Modal>

      {/* ── Modal: ver detalles (spinner inmediato para evitar doble clic) ── */}
      <Modal
        isOpen={detailLoading || viewItem !== null}
        onClose={closeDetail}
        title={
          viewItem
            ? mode === 'gastos' && gastoDetailEditing
              ? 'Editar registro'
              : mode === 'ingresos' && ingresoDetailEditing
                ? 'Editar ingreso'
                : 'Detalles del registro'
            : 'Abriendo registro'
        }
        size={(mode === 'gastos' && gastoDetailEditing) || (mode === 'ingresos' && ingresoDetailEditing) ? 'lg' : 'sm'}
        footer={
          viewItem && mode === 'gastos' && gastoDetalleEditable ? (
            gastoDetailEditing ? (
              <>
                <Button variant="ghost" onClick={cancelGastoEdit} disabled={gastoSaveBusy}>
                  Cancelar edición
                </Button>
                <Button
                  onClick={() => void handleSaveGastoDetail()}
                  loading={gastoSaveBusy}
                  disabled={!gastoEditDirty || gastoSaveBusy}
                >
                  Guardar cambios
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={closeDetail}>
                  Cerrar
                </Button>
                <Button onClick={startGastoEdit}>Editar</Button>
              </>
            )
          ) : viewItem && mode === 'ingresos' && ingresoDetalleEditable ? (
            ingresoDetailEditing ? (
              <>
                <Button variant="ghost" onClick={cancelIngresoEdit} disabled={ingresoSaveBusy}>
                  Cancelar edición
                </Button>
                <Button
                  onClick={() => void handleSaveIngresoDetail()}
                  loading={ingresoSaveBusy}
                  disabled={!ingresoEditDirty || ingresoSaveBusy}
                >
                  Guardar cambios
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={closeDetail}>
                  Cerrar
                </Button>
                <Button onClick={startIngresoEdit}>Editar</Button>
              </>
            )
          ) : (
            <Button onClick={closeDetail}>Cerrar</Button>
          )
        }
      >
        {detailLoading && !viewItem ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-gray-600" role="status" aria-live="polite">
            <Loader2 className="h-10 w-10 animate-spin text-primary-500" aria-hidden />
            <p className="text-sm font-medium">Cargando…</p>
          </div>
        ) : viewItem && mode === 'ingresos' && ingresoDetailEditing && ingresoEditDraft ? (
          <div className="space-y-3 pr-0.5">
            {ingresoEditSubtipos.length > 0 ? (
              <Select
                label="Sub tipo / periodo"
                options={ingresoEditSubtipos}
                value={ingresoEditDraft.subTipo}
                onChange={(v) =>
                  setIngresoEditDraft((d) => {
                    if (!d) return d;
                    const personalizado =
                      v.trim().toLowerCase() === INGRESO_SUBTIPO_PERSONALIZADO.toLowerCase();
                    const periodoDias = personalizado ? d.periodoDias : '';
                    const fechaDesde = personalizado ? d.fechaDesde || d.fecha : d.fechaDesde;
                    return {
                      ...d,
                      subTipo: v,
                      periodoDias,
                      fechaDesde: personalizado ? fechaDesde : d.fechaDesde,
                      fechaHasta: personalizado
                        ? syncPeriodoPersonalizadoFin(fechaDesde, periodoDias, d.fechaHasta)
                        : d.fechaHasta,
                    };
                  })
                }
              />
            ) : null}
            <Input
              label="Fecha movimiento / pago"
              type="date"
              value={ingresoEditDraft.fecha}
              onChange={(e) => {
                const fecha = e.target.value;
                setIngresoEditDraft((d) => (d ? { ...d, fecha } : d));
              }}
            />
            <Select
              label="Vehículo"
              options={vehicleSelectOptions.filter((o) => o.value !== '')}
              value={ingresoEditDraft.vehicleIdStr}
              onChange={(v) => setIngresoEditDraft((d) => (d ? { ...d, vehicleIdStr: v } : d))}
            />
            {ingresoEditEsPersonalizado ? (
              <div className="space-y-3 rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900/80">
                  Periodo cubierto por este ingreso
                </p>
                <Input
                  label="Fecha inicio"
                  type="date"
                  value={ingresoEditDraft.fechaDesde}
                  onChange={(e) => {
                    const fechaDesde = e.target.value;
                    setIngresoEditDraft((d) =>
                      d
                        ? {
                            ...d,
                            fechaDesde,
                            fechaHasta: syncPeriodoPersonalizadoFin(
                              fechaDesde,
                              d.periodoDias,
                              d.fechaHasta,
                            ),
                          }
                        : d,
                    );
                  }}
                />
                <Input
                  label="Cantidad de días"
                  type="number"
                  min="1"
                  max="366"
                  value={ingresoEditDraft.periodoDias}
                  onChange={(e) => {
                    const periodoDias = e.target.value;
                    setIngresoEditDraft((d) =>
                      d
                        ? {
                            ...d,
                            periodoDias,
                            fechaHasta: syncPeriodoPersonalizadoFin(
                              d.fechaDesde,
                              periodoDias,
                              d.fechaHasta,
                            ),
                          }
                        : d,
                    );
                  }}
                />
                <Input
                  label="Fecha fin"
                  type="date"
                  value={ingresoEditDraft.fechaHasta}
                  onChange={(e) =>
                    setIngresoEditDraft((d) => (d ? { ...d, fechaHasta: e.target.value } : d))
                  }
                />
              </div>
            ) : (
              <>
                <Input
                  label="Periodo desde (opcional)"
                  type="date"
                  value={ingresoEditDraft.fechaDesde}
                  onChange={(e) =>
                    setIngresoEditDraft((d) => (d ? { ...d, fechaDesde: e.target.value } : d))
                  }
                />
                <Input
                  label="Periodo hasta (opcional)"
                  type="date"
                  value={ingresoEditDraft.fechaHasta}
                  onChange={(e) =>
                    setIngresoEditDraft((d) => (d ? { ...d, fechaHasta: e.target.value } : d))
                  }
                />
              </>
            )}
            <Input
              label="Monto"
              inputMode="decimal"
              value={ingresoEditDraft.montoStr}
              onChange={(e) => setIngresoEditDraft((d) => (d ? { ...d, montoStr: e.target.value } : d))}
            />
            <Select
              label="Moneda"
              options={[
                { value: 'PEN', label: 'PEN · Soles' },
                { value: 'USD', label: 'USD · Dólares' },
              ]}
              value={ingresoEditDraft.moneda}
              onChange={(v) =>
                setIngresoEditDraft((d) =>
                  d
                    ? {
                        ...d,
                        moneda: v === 'USD' ? 'USD' : 'PEN',
                        tipoCambioStr: v === 'USD' ? d.tipoCambioStr : '',
                      }
                    : d,
                )
              }
            />
            {ingresoEditDraft.moneda === 'USD' ? (
              <Input
                label="Tipo de cambio (S/ por US$)"
                inputMode="decimal"
                value={ingresoEditDraft.tipoCambioStr}
                onChange={(e) =>
                  setIngresoEditDraft((d) => (d ? { ...d, tipoCambioStr: e.target.value } : d))
                }
              />
            ) : null}
            <div className="w-full">
              <label htmlFor="ingreso-edit-comentarios" className="label">
                Comentarios
              </label>
              <textarea
                id="ingreso-edit-comentarios"
                rows={3}
                value={ingresoEditDraft.comentarios}
                onChange={(e) =>
                  setIngresoEditDraft((d) => (d ? { ...d, comentarios: e.target.value } : d))
                }
                className="input-field w-full text-sm resize-y min-h-[4rem]"
              />
            </div>
          </div>
        ) : viewItem && mode === 'gastos' && gastoDetailEditing && gastoEditDraft ? (
          <div className="space-y-3 pr-0.5">
            <p className="text-[10px] text-slate-500 leading-snug">
              Para cambiar la categoría financiera (capa tipo gasto / subtipo financiero) usa el botón «Mover categoría» en la fila del listado.
            </p>
            <Input
              label="Fecha movimiento"
              type="date"
              value={gastoEditDraft.fecha}
              onChange={(e) => setGastoEditDraft((d) => (d ? { ...d, fecha: e.target.value } : d))}
            />
            <Select
              label="Vehículo"
              options={vehicleSelectOptions}
              value={gastoEditDraft.vehicleIdStr}
              onChange={(v) => setGastoEditDraft((d) => (d ? { ...d, vehicleIdStr: v } : d))}
            />
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-slate-700">Categoría financiera</p>
              <p className="mt-0.5 text-sm text-slate-900">
                {labelTipoGastoFinanciero(gastoEditTipoGasto)}
              </p>
              <p className="mt-1 text-[10px] text-slate-500 leading-snug">
                Para cambiar de categoría usa «Mover categoría» en el listado.
              </p>
            </div>
            {gastoEditPermiteSubtipoOficial ? (
              <>
                <Select
                  label="Subtipo"
                  options={subtipoCanonEditOptions}
                  value={gastoEditDraft.subtipoCanon}
                  onChange={(v) => {
                    if (!v) return;
                    const canon = resolveSubtipoCanonForGastoEdit(gastoEditTipoGasto, v);
                    setGastoEditDraft((d) => (d ? { ...d, subtipoCanon: canon } : d));
                  }}
                  helper="Clasificación interna calculada automáticamente."
                />
                <p className="text-[10px] text-slate-500 leading-snug -mt-1">
                  Tipo Fact, subtipo Fact y categoría KPI se actualizan al guardar según el subtipo elegido.
                </p>
              </>
            ) : (
              <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2.5 text-[11px] text-amber-950 leading-snug">
                <p className="font-medium">Subtipo no editable aquí</p>
                <p className="mt-0.5">
                  Valor actual:{' '}
                  <span className="font-medium">
                    {getSubtipoFinancieroLabel(
                      gastoEditBaseline?.subtipo_gasto,
                      gastoEditBaseline?.tipo_gasto,
                    )}
                  </span>
                  . Usa «Mover categoría» si necesitas otra categoría financiera.
                </p>
              </div>
            )}
            <Input
              label="Fecha registro"
              type="date"
              value={gastoEditDraft.fechaRegistro}
              onChange={(e) => setGastoEditDraft((d) => (d ? { ...d, fechaRegistro: e.target.value } : d))}
            />
            <Select
              label="Método de pago"
              options={metodoPagoOptions}
              value={gastoEditDraft.metodoPago}
              onChange={(v) =>
                setGastoEditDraft((d) => {
                  if (!d) return d;
                  const first = getDetallesMetodoPago(v)[0];
                  return { ...d, metodoPago: v, metodoPagoDetalle: first?.detalle ?? '' };
                })
              }
            />
            {metodoDetalleOptions.length > 0 ? (
              <Select
                label="Cuenta / detalle de pago"
                options={metodoDetalleOptions}
                value={gastoEditDraft.metodoPagoDetalle}
                onChange={(v) => setGastoEditDraft((d) => (d ? { ...d, metodoPagoDetalle: v } : d))}
              />
            ) : (
              <Input
                label="Cuenta / detalle de pago"
                value={gastoEditDraft.metodoPagoDetalle}
                onChange={(e) => setGastoEditDraft((d) => (d ? { ...d, metodoPagoDetalle: e.target.value } : d))}
              />
            )}
            <Input
              label="Monto (PEN)"
              inputMode="decimal"
              value={gastoEditDraft.montoStr}
              onChange={(e) => setGastoEditDraft((d) => (d ? { ...d, montoStr: e.target.value } : d))}
            />
            <div className="w-full">
              <label htmlFor="gasto-edit-comentarios" className="label">
                Observaciones
              </label>
              <textarea
                id="gasto-edit-comentarios"
                rows={3}
                value={gastoEditDraft.comentarios}
                onChange={(e) => setGastoEditDraft((d) => (d ? { ...d, comentarios: e.target.value } : d))}
                className="input-field w-full text-sm resize-y min-h-[4rem]"
              />
            </div>
          </div>
        ) : viewItem ? (
          <dl className="space-y-3">
            {mode === 'gastos' && (
              <div className="flex justify-between">
                <dt className="text-xs text-gray-500 font-medium">Fecha movimiento</dt>
                <dd className="text-sm text-gray-900">{formatDate(viewItem.fecha)}</dd>
              </div>
            )}
            {mode === 'ingresos' && isIngresoVehicular(viewItem as Ingreso) ? (
              <div className="flex justify-between gap-4">
                <dt className="text-xs text-gray-500 font-medium shrink-0">Vehículo</dt>
                <dd className="text-sm text-gray-900 text-right">
                  {getVehicleIdPlaca(viewItem.vehicleId)}
                </dd>
              </div>
            ) : mode === 'ingresos' && isIngresoExtraordinario(viewItem as Ingreso) ? (
              <div className="flex justify-between gap-4">
                <dt className="text-xs text-gray-500 font-medium shrink-0">Alcance</dt>
                <dd className="text-sm text-gray-900 text-right">
                  <Badge variant="secondary" size="sm">Extraordinario</Badge>
                </dd>
              </div>
            ) : mode === 'gastos' ? (
              <div className="flex justify-between gap-4">
                <dt className="text-xs text-gray-500 font-medium shrink-0">Vehículo</dt>
                <dd className="text-sm text-gray-900 text-right">
                  {getVehicleIdPlaca(viewItem.vehicleId)}
                </dd>
              </div>
            ) : null}

            {mode === 'ingresos' ? (
              <>
                <div className="rounded-xl border border-gray-100 bg-slate-50 px-3 py-3 space-y-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Fechas</p>
                  {(() => {
                    const ing = viewItem as Ingreso;
                    const pers = isIngresoPeriodoPersonalizado(ing)
                      ? ingresoPeriodoPersonalizadoHistorial(ing)
                      : null;
                    return (
                      <>
                        <div className="flex justify-between gap-3">
                          <dt className="text-xs text-gray-600 shrink-0">Fecha de movimiento / pago</dt>
                          <dd className="text-sm text-gray-900 text-right font-medium">
                            {formatDate(ing.fecha)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-xs text-gray-600 shrink-0">Registrado en sistema</dt>
                          <dd className="text-sm text-gray-900 text-right tabular-nums">
                            {formatDateTimePe(ing.createdAt)}
                          </dd>
                        </div>
                        {pers ? (
                          <div className="flex justify-between gap-3">
                            <dt className="text-xs text-gray-600 shrink-0">{pers.etiqueta}</dt>
                            <dd className="text-sm text-gray-900 text-right tabular-nums font-medium">
                              {pers.rango ?? '—'}
                            </dd>
                          </div>
                        ) : (
                          <div className="flex justify-between gap-3">
                            <dt className="text-xs text-gray-600 shrink-0">Período cubierto</dt>
                            <dd className="text-sm text-gray-900 text-right">
                              {ing.fechaDesde?.trim() || ing.fechaHasta?.trim()
                                ? `${ing.fechaDesde?.trim() ? formatDate(ing.fechaDesde!) : '—'} → ${ing.fechaHasta?.trim() ? formatDate(ing.fechaHasta!) : '—'}`
                                : '—'}
                            </dd>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* ─ Tipo / subTipo ─ */}
                <div className="flex justify-between gap-4">
                  <dt className="text-xs text-gray-500 font-medium shrink-0">Tipo</dt>
                  <dd>
                    {isIngresoExtraordinario(viewItem as Ingreso) ? (
                      <Badge variant="secondary">Extraordinario</Badge>
                    ) : (
                      <Badge variant="success">{(viewItem as Ingreso).tipo}</Badge>
                    )}
                  </dd>
                </div>
                {(viewItem as Ingreso).subTipo && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">
                      {isIngresoExtraordinario(viewItem as Ingreso) ? 'Categoría' : 'Sub tipo'}
                    </dt>
                    <dd className="text-sm text-gray-900 text-right">
                      {isIngresoExtraordinario(viewItem as Ingreso)
                        ? labelCategoriaIngresoExtraordinario((viewItem as Ingreso).subTipo)
                        : (viewItem as Ingreso).subTipo}
                    </dd>
                  </div>
                )}

                {/* ─ Contexto operativo (ingresos) ─ */}
                {(viewItem as Ingreso).tipoOperacion && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Tipo operación</dt>
                    <dd className="text-sm text-gray-900 text-right">{(viewItem as Ingreso).tipoOperacion}</dd>
                  </div>
                )}
                {ingresoDetalleUi?.detalleOperativo && (
                  <div>
                    <dt className="text-xs text-gray-500 font-medium mb-1">Detalle operativo</dt>
                    <dd className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 break-words">
                      {ingresoDetalleUi.detalleOperativo}
                    </dd>
                  </div>
                )}

                {/* ─ Pago ─ */}
                <div className="flex justify-between gap-4">
                  <dt className="text-xs text-gray-500 font-medium shrink-0">Método de pago</dt>
                  <dd className="text-sm text-gray-900 text-right">{(viewItem as Ingreso).metodoPago}</dd>
                </div>
                {(viewItem as Ingreso).celularMetodo && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Celular / cuenta</dt>
                    <dd className="text-sm text-gray-900 text-right">{(viewItem as Ingreso).celularMetodo}</dd>
                  </div>
                )}

                {/* ─ Moneda ─ */}
                <div className="flex justify-between gap-4">
                  <dt className="text-xs text-gray-500 font-medium shrink-0">Moneda</dt>
                  <dd className="text-sm text-gray-900 text-right">{(viewItem as Ingreso).moneda ?? 'PEN'}</dd>
                </div>
                {((viewItem as Ingreso).moneda === 'USD' || (viewItem as Ingreso).tipoCambio) && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Tipo cambio (S/ × US$)</dt>
                    <dd className="text-sm text-gray-900 text-right">
                      {(viewItem as Ingreso).tipoCambio != null ? (viewItem as Ingreso).tipoCambio?.toFixed(4) : '—'}
                    </dd>
                  </div>
                )}
                {(viewItem as Ingreso).moneda === 'USD' && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Equiv. ref. soles</dt>
                    <dd className="text-sm text-gray-900 text-right">
                      {formatRecordAmount(ingresoMontoPEN(viewItem as Ingreso), viewItem as Ingreso)}
                    </dd>
                  </div>
                )}

                <div className="flex justify-between gap-4">
                  <dt className="text-xs text-gray-500 font-medium shrink-0">Fecha registro (Fact)</dt>
                  <dd className="text-sm text-gray-900 text-right">{formatDate((viewItem as Ingreso).fechaRegistro)}</dd>
                </div>
              </>
            ) : (
              <>
                {/* ─ Tipo / sub ─ */}
                <div className="flex justify-between gap-4">
                  <dt className="text-xs text-gray-500 font-medium shrink-0">Tipo (Fact)</dt>
                  <dd className="text-sm text-gray-900 text-right font-medium">{(viewItem as Gasto).tipo}</dd>
                </div>
                {(viewItem as Gasto).subTipo && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Sub tipo</dt>
                    <dd className="text-sm text-gray-900 text-right">{(viewItem as Gasto).subTipo}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-xs text-gray-500 font-medium">Categoría KPI</dt>
                  <dd className="text-sm text-gray-900">{CATEGORIAS_GASTO_LABELS[(viewItem as Gasto).categoria]}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-xs text-gray-500 font-medium">Motivo</dt>
                  <dd className="text-sm text-gray-900">{(viewItem as Gasto).motivo}</dd>
                </div>

                {/* ─ Contexto operativo (gastos) ─ */}
                {gastoDetalleUi?.detalleOperativo && (
                  <div>
                    <dt className="text-xs text-gray-500 font-medium mb-1">Detalle operativo</dt>
                    <dd className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 break-words">
                      {gastoDetalleUi.detalleOperativo}
                    </dd>
                  </div>
                )}

                {/* ─ Período ─ */}
                {((viewItem as Gasto).fechaDesde || (viewItem as Gasto).fechaHasta) && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Período</dt>
                    <dd className="text-sm text-gray-900 text-right">
                      {(viewItem as Gasto).fechaDesde ? formatDate((viewItem as Gasto).fechaDesde!) : '—'}
                      {' → '}
                      {(viewItem as Gasto).fechaHasta ? formatDate((viewItem as Gasto).fechaHasta!) : '—'}
                    </dd>
                  </div>
                )}

                <div className="flex justify-between gap-4">
                  <dt className="text-xs text-gray-500 font-medium shrink-0">Fecha registro</dt>
                  <dd className="text-sm text-gray-900">{formatDate((viewItem as Gasto).fechaRegistro)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-xs text-gray-500 font-medium shrink-0">Método de pago</dt>
                  <dd className="text-sm text-gray-900 text-right">{(viewItem as Gasto).metodoPago}</dd>
                </div>
                {(viewItem as Gasto).celularMetodo && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Celular / cuenta</dt>
                    <dd className="text-sm text-gray-900 text-right">{(viewItem as Gasto).celularMetodo}</dd>
                  </div>
                )}
                {(viewItem as Gasto).pagadoA?.trim() && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-xs text-gray-500 font-medium shrink-0">Pagado a</dt>
                    <dd className="text-sm text-gray-900 text-right font-medium">{(viewItem as Gasto).pagadoA}</dd>
                  </div>
                )}
              </>
            )}

            {/* ─ Monto ─ */}
            <div className="flex justify-between">
              <dt className="text-xs text-gray-500 font-medium">
                {mode === 'gastos' && viewItem.monto < 0 ? 'Rebaja (descuento)' : 'Monto'}
              </dt>
              <dd
                className={`text-sm font-bold ${
                  mode === 'ingresos'
                    ? 'text-emerald-600'
                    : viewItem.monto < 0
                      ? 'text-emerald-600'
                      : 'text-red-500'
                }`}
              >
                {mode === 'ingresos' && (
                  (viewItem as Ingreso).moneda === 'USD' ? (
                    <div className="text-right">
                      <span className="block">
                        {formatRecordAmount((viewItem as Ingreso).monto, viewItem as Ingreso, { currency: 'USD' })}
                      </span>
                      <span className="block text-xs font-normal text-gray-500">
                        ≈ {formatRecordAmount(ingresoMontoPEN(viewItem as Ingreso), viewItem as Ingreso)}
                      </span>
                      {showContador24hHint(viewItem as Ingreso) ? (
                        <span className="block text-[10px] text-amber-600">{contador24hHint}</span>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      {formatRecordAmount(viewItem.monto, viewItem as Ingreso)}
                      {showContador24hHint(viewItem as Ingreso) ? (
                        <span className="block text-[10px] text-amber-600">{contador24hHint}</span>
                      ) : null}
                    </>
                  )
                )}
                {mode === 'gastos' && viewItem.monto < 0 && (
                  <>
                    {formatRecordAmount(Math.abs(viewItem.monto), viewItem as Gasto, { signPrefix: '−' })}
                    {showContador24hHint(viewItem as Gasto) ? (
                      <span className="block text-[10px] text-amber-600">{contador24hHint}</span>
                    ) : null}
                  </>
                )}
                {mode === 'gastos' && viewItem.monto >= 0 && (
                  <>
                    {formatRecordAmount(viewItem.monto, viewItem as Gasto, { signPrefix: '−' })}
                    {showContador24hHint(viewItem as Gasto) ? (
                      <span className="block text-[10px] text-amber-600">{contador24hHint}</span>
                    ) : null}
                  </>
                )}
              </dd>
            </div>

            {/* ─ Comentarios ─ */}
            {mode === 'ingresos' ? (
              ingresoDetalleUi?.comentario ? (
                <div>
                  <dt className="text-xs text-gray-500 font-medium mb-1">Comentarios</dt>
                  <dd className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 break-words">
                    {ingresoDetalleUi.comentario}
                  </dd>
                </div>
              ) : null
            ) : (
              gastoDetalleUi?.observacion ? (
                <div>
                  <dt className="text-xs text-gray-500 font-medium mb-1">Observaciones</dt>
                  <dd className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 break-words">
                    {gastoDetalleUi.observacion}
                  </dd>
                </div>
              ) : null
            )}

            {mode === 'ingresos' && isAdminRole(role) && ingresoDetalleUi?.auditRaw && (
              <div>
                <dt className="text-xs text-gray-500 font-medium mb-1">Notas técnicas (importación)</dt>
                <dd className="text-xs text-gray-500 bg-slate-100 rounded-lg p-3 break-words font-mono whitespace-pre-wrap">
                  {ingresoDetalleUi.auditRaw}
                </dd>
              </div>
            )}

            {mode === 'gastos' && isAdminRole(role) && gastoDetalleUi?.auditRaw && (
              <div>
                <dt className="text-xs text-gray-500 font-medium mb-1">Notas técnicas (importación)</dt>
                <dd className="text-xs text-gray-500 bg-slate-100 rounded-lg p-3 break-words font-mono whitespace-pre-wrap">
                  {gastoDetalleUi.auditRaw}
                </dd>
              </div>
            )}
          </dl>
        ) : null}
      </Modal>
    </div>
  );
};

export default RegistrosTable;
