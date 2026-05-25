import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  EyeOff,
  Filter,
  Loader2,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  Check,
  CheckSquare,
  Square,
  ListChecks,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRegistrosContext } from '../../context/RegistrosContext';
import Badge from '../../components/Common/Badge';
import Button from '../../components/Common/Button';
import Card from '../../components/Common/Card';
import Modal from '../../components/Common/Modal';
import Select from '../../components/Common/Select';
import {
  applyIaClasificacionSugerencia,
  canApplyIaSugerencia,
  canUseIaClasificacionCentro,
  fetchIaClasificacionAuditReciente,
  fetchPendientesConSugerencia,
  insertIaClasificacionAudit,
} from '../../services/ai/iaClasificacionService';
import {
  fetchClasificacionFeedbackReciente,
  fetchUltimoFeedbackPorGastos,
  registrarFeedbackIgnorado,
} from '../../services/ai/clasificacionFeedbackService';
import { applyIaClasificacionLote } from '../../services/ai/iaClasificacionLoteService';
import IAClasificacionLoteModal from '../../components/Finanzas/IAClasificacionLoteModal';
import {
  buildLoteResumenConfirmacion,
  evaluaElegibilidadLote,
  IA_LOTE_CONFIANZA_RECOMENDADA,
  type IaLoteElegibilidad,
} from '../../utils/iaClasificacionLote';
import type {
  ClasificacionFeedbackResumen,
  ClasificacionFeedbackRow,
} from '../../modules/ai/clasificacionFeedbackTypes';
import { FINANZA_MOVE_TARGET_TIPO_GASTO } from '../../utils/permissions';
import type { ClasificacionSugerenciaFuente } from '../../modules/ai/clasificacionMemoriaTypes';
import type {
  IaClasificacionAuditRow,
  IaClasificacionUiStatus,
  IaPendienteSugerencia,
} from '../../modules/ai/iaClasificacionTypes';
import { formatCurrency, formatDate } from '../../utils/formatting';
import { labelTipoGastoFinanciero } from '../../utils/tipoGastoLabels';
import { labelForSubtipoCatalogo } from '../../constants/gastosSubtipos';
import IAClasificacionCalidadPanel from '../../components/Finanzas/IAClasificacionCalidadPanel';
import {
  agruparPorCampo,
  buildCalidadPorId,
  computeIaCalidadMetricas,
  computeIaFeedbackMetricas,
  computePatronesAprendidos,
  iaCalidadConfianzaBanda,
  pasaFiltroCalidadRapido,
  pasaFiltroConfianzaPanel,
  resolveUmbralMontoAlto,
  type IaCalidadFiltroRapido,
  type IaSugerenciaCalidadEval,
} from '../../utils/iaClasificacionCalidad';
import {
  loadIaClasificacionUiState,
  setIaClasificacionUiStatus,
  type IaClasificacionUiMap,
} from '../../utils/iaClasificacionUiState';
import {
  isFinancialOperadorRestricted,
  permissionUserFromAuth,
} from '../../utils/permissions';

const STATUS_LABEL: Record<IaClasificacionUiStatus, string> = {
  pendiente: 'Pendiente',
  revisado: 'Revisado',
  aplicado: 'Aplicado',
  ignorado: 'Ignorado',
  error: 'Error',
  seleccionado: 'Seleccionado',
  aplicando: 'Aplicando…',
  aplicado_lote: 'Aplicado (lote)',
  error_lote: 'Error (lote)',
};

const STATUS_VARIANT: Record<
  IaClasificacionUiStatus,
  'neutral' | 'success' | 'secondary' | 'danger' | 'primary' | 'warning'
> = {
  pendiente: 'neutral',
  revisado: 'success',
  aplicado: 'primary',
  ignorado: 'secondary',
  error: 'danger',
  seleccionado: 'primary',
  aplicando: 'warning',
  aplicado_lote: 'primary',
  error_lote: 'danger',
};

function formatConfianza(c: number | null | undefined): string {
  if (c == null || Number.isNaN(c)) return '—';
  return `${Math.round(c * 100)}%`;
}

function formatAuditAction(a: string): string {
  if (a === 'batch_analyze') return 'Lote analizado';
  if (a === 'marcar_revisado') return 'Marcado revisado';
  if (a === 'ocultar') return 'Sugerencia oculta';
  if (a === 'reanalizar') return 'Re-analizado';
  if (a === 'aplicar_sugerencia') return 'Sugerencia aplicada';
  if (a === 'error_aplicar') return 'Error al aplicar';
  if (a === 'aplicar_sugerencia_lote') return 'Sugerencia aplicada (lote)';
  if (a === 'error_aplicar_lote') return 'Error al aplicar (lote)';
  if (a === 'lote_completado') return 'Lote completado';
  return a;
}

const IAClasificacionPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, isFinancialOperador, canEditFinances } = useAuth();
  const { vehicles, toast, applyGastoMovedLocal, upsertGasto } = useRegistrosContext();
  const permUser = permissionUserFromAuth(user, profile?.email ?? null);
  const operatorClassifyMode = isFinancialOperador;
  const empresaId = profile?.empresa_id ?? '';
  const userId = profile?.id ?? user.id;
  const canUse = canUseIaClasificacionCentro(permUser);
  const showAuditPanel = !isFinancialOperadorRestricted(permUser);

  const [rows, setRows] = useState<IaPendienteSugerencia[]>([]);
  const [meta, setMeta] = useState({ totalPendientes: 0, totalGlobales: 0, count: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uiMap, setUiMap] = useState<IaClasificacionUiMap>(() =>
    empresaId && userId ? loadIaClasificacionUiState(empresaId, userId) : {},
  );
  const [auditRows, setAuditRows] = useState<IaClasificacionAuditRow[]>([]);

  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroConfianza, setFiltroConfianza] = useState<'all' | 'alta' | 'media' | 'baja'>('all');
  const [filtroCalidadRapido, setFiltroCalidadRapido] = useState<IaCalidadFiltroRapido>('all');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroPlaca, setFiltroPlaca] = useState('');
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');
  const [filtroMontoMin, setFiltroMontoMin] = useState('');
  const [filtroMontoMax, setFiltroMontoMax] = useState('');
  const [filtroEstadoUi, setFiltroEstadoUi] = useState<'all' | IaClasificacionUiStatus>('pendiente');
  const [showFilters, setShowFilters] = useState(false);
  const [confirmRow, setConfirmRow] = useState<IaPendienteSugerencia | null>(null);
  const [applyTipo, setApplyTipo] = useState('');
  const [applySubtipo, setApplySubtipo] = useState('');
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [feedbackPorGasto, setFeedbackPorGasto] = useState<Map<number, ClasificacionFeedbackResumen>>(
    () => new Map(),
  );
  const [feedbackHistorial, setFeedbackHistorial] = useState<ClasificacionFeedbackRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [umbralLoteConfianza, setUmbralLoteConfianza] = useState(IA_LOTE_CONFIANZA_RECOMENDADA);
  const [loteModalOpen, setLoteModalOpen] = useState(false);
  const [loteApplying, setLoteApplying] = useState(false);
  const [loteProgress, setLoteProgress] = useState<{ current: number; total: number } | null>(null);
  const [loteApplyingGastoId, setLoteApplyingGastoId] = useState<number | null>(null);
  const [loteLastSummary, setLoteLastSummary] = useState<string | null>(null);

  const loadAudit = useCallback(async () => {
    if (!showAuditPanel) return;
    const list = await fetchIaClasificacionAuditReciente(empresaId, 40);
    setAuditRows(list);
  }, [empresaId, showAuditPanel]);

  const runAnalyze = useCallback(
    async (limit: number, auditBatch = false) => {
      if (!canUse || !empresaId) return;
      setLoading(true);
      setError(null);
      const res = await fetchPendientesConSugerencia(user, profile?.email ?? null, empresaId, limit);
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRows(res.payload.sugerencias);
      setMeta({
        count: res.payload.count,
        totalPendientes: res.payload.totalPendientes,
        totalGlobales: res.payload.totalGlobales,
      });
      const ids = res.payload.sugerencias.map((s) => s.id);
      const [ultimoFb, histFb] = await Promise.all([
        fetchUltimoFeedbackPorGastos(ids, empresaId),
        fetchClasificacionFeedbackReciente(empresaId, 500),
      ]);
      setFeedbackPorGasto(ultimoFb);
      setFeedbackHistorial(histFb);
      if (auditBatch) {
        await insertIaClasificacionAudit({
          action: 'batch_analyze',
          razon: `Lote ${limit} · ${res.payload.count} sugerencias · ${res.durationMs}ms`,
          userRole: user.role,
        }, empresaId);
        await loadAudit();
      }
    },
    [canUse, empresaId, user, profile?.email, loadAudit],
  );

  useEffect(() => {
    if (!canUse) return;
    void runAnalyze(40);
    void loadAudit();
  }, [canUse]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (empresaId && userId) {
      setUiMap(loadIaClasificacionUiState(empresaId, userId));
    }
  }, [empresaId, userId]);

  const uiStatusRaw = useCallback(
    (id: number): IaClasificacionUiStatus => uiMap[String(id)] ?? 'pendiente',
    [uiMap],
  );

  const uiStatus = useCallback(
    (id: number): IaClasificacionUiStatus => {
      if (loteApplyingGastoId === id) return 'aplicando';
      const raw = uiStatusRaw(id);
      if (
        selectedIds.has(id) &&
        (raw === 'pendiente' || raw === 'revisado')
      ) {
        return 'seleccionado';
      }
      return raw;
    },
    [loteApplyingGastoId, selectedIds, uiStatusRaw],
  );

  const logReview = useCallback(
    async (
      row: IaPendienteSugerencia,
      action: 'marcar_revisado' | 'ocultar' | 'reanalizar',
    ) => {
      await insertIaClasificacionAudit(
        {
          gastoId: row.id,
          action,
          tipoActual: row.tipo_actual,
          subtipoActual: row.subtipo_actual,
          tipoSugerido: row.tipo_gasto_sugerido,
          subtipoSugerido: row.subtipo_sugerido,
          confianza: row.confianza,
          razon: row.razon,
          userRole: user.role,
        },
        empresaId,
      );
      if (showAuditPanel) await loadAudit();
    },
    [empresaId, user.role, showAuditPanel, loadAudit],
  );

  const mergeFeedbackLocal = useCallback((fb: ClasificacionFeedbackRow) => {
    setFeedbackPorGasto((prev) =>
      new Map(prev).set(fb.gasto_id, {
        feedback_resultado: fb.feedback_resultado,
        correction_level: fb.correction_level,
      }),
    );
    setFeedbackHistorial((prev) => [fb, ...prev]);
  }, []);

  const setStatus = useCallback(
    async (row: IaPendienteSugerencia, status: IaClasificacionUiStatus) => {
      if (!empresaId || !userId) return;
      const next = setIaClasificacionUiStatus(empresaId, userId, row.id, status, uiMap);
      setUiMap(next);
      if (status === 'revisado') await logReview(row, 'marcar_revisado');
      if (status === 'ignorado') {
        await logReview(row, 'ocultar');
        const fb = await registrarFeedbackIgnorado(row, empresaId);
        if (fb) mergeFeedbackLocal(fb);
      }
    },
    [empresaId, userId, uiMap, logReview, mergeFeedbackLocal],
  );

  const confirmApply = useCallback(async () => {
    const row = confirmRow;
    if (!row || !empresaId || applyingId != null) return;
    setApplyingId(row.id);
    setConfirmRow(null);
    const res = await applyIaClasificacionSugerencia({
      row,
      user,
      email: profile?.email ?? null,
      empresaId,
      vehicles,
      operatorClassifyMode,
      destinoTipo: applyTipo,
      destinoSubtipo: applySubtipo,
    });
    setApplyingId(null);
    if (!res.ok) {
      if (empresaId && userId) {
        const next = setIaClasificacionUiStatus(empresaId, userId, row.id, 'error', uiMap);
        setUiMap(next);
      }
      toast.error('No se pudo aplicar', res.message);
      return;
    }
    const beforeTipo = row.tipo_actual ?? 'pendiente_revision';
    if (res.removeFromIaList) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setMeta((m) => ({
        ...m,
        count: Math.max(0, m.count - 1),
        totalPendientes:
          beforeTipo === 'pendiente_revision' ? Math.max(0, m.totalPendientes - 1) : m.totalPendientes,
        totalGlobales:
          beforeTipo === 'gastos_globales' ? Math.max(0, m.totalGlobales - 1) : m.totalGlobales,
      }));
    } else {
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                tipo_actual: res.tipoAplicado,
                subtipo_actual: res.subtipoAplicado,
              }
            : r,
        ),
      );
    }
    applyGastoMovedLocal?.(res.gastoBefore, res.gasto, {
      movedOutOfView: res.movedOutOfView,
      source: 'user',
      reloadSummary: !operatorClassifyMode,
    });
    upsertGasto(res.gasto, { source: 'user', reloadSummary: !operatorClassifyMode });
    if (empresaId && userId) {
      const next = setIaClasificacionUiStatus(empresaId, userId, row.id, 'aplicado', uiMap);
      setUiMap(next);
    }
    if (res.feedback) {
      mergeFeedbackLocal(res.feedback);
      const msg =
        res.feedback.feedback_resultado === 'correcto'
          ? 'Sugerencia aplicada (IA acertó)'
          : res.feedback.feedback_resultado === 'parcialmente_correcto'
            ? 'Aplicado con corrección de subtipo'
            : 'Aplicado con categoría distinta a la IA';
      toast.success(msg, labelTipoGastoFinanciero(res.tipoAplicado));
    } else {
      toast.success('Sugerencia aplicada', labelTipoGastoFinanciero(res.tipoAplicado));
    }
    if (showAuditPanel) await loadAudit();
  }, [
    confirmRow,
    applyTipo,
    applySubtipo,
    empresaId,
    applyingId,
    user,
    profile?.email,
    vehicles,
    operatorClassifyMode,
    uiMap,
    userId,
    toast,
    applyGastoMovedLocal,
    upsertGasto,
    showAuditPanel,
    loadAudit,
    mergeFeedbackLocal,
  ]);

  useEffect(() => {
    if (!confirmRow) return;
    setApplyTipo(confirmRow.tipo_gasto_sugerido ?? '');
    setApplySubtipo(confirmRow.subtipo_sugerido ?? '');
  }, [confirmRow]);

  const tipoDestinoOptions = useMemo(
    () =>
      FINANZA_MOVE_TARGET_TIPO_GASTO.map((t) => ({
        value: t,
        label: labelTipoGastoFinanciero(t),
      })),
    [],
  );

  const reanalizarFila = useCallback(
    async (row: IaPendienteSugerencia) => {
      const res = await fetchPendientesConSugerencia(user, profile?.email ?? null, empresaId, 100);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const updated = res.payload.sugerencias.find((s) => s.id === row.id);
      if (updated) {
        setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      }
      if (empresaId && userId) {
        const next = setIaClasificacionUiStatus(empresaId, userId, row.id, 'pendiente', uiMap);
        setUiMap(next);
      }
      await logReview(row, 'reanalizar');
    },
    [user, profile?.email, empresaId, userId, uiMap, logReview],
  );

  const categoriasSugeridas = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.tipo_gasto_sugerido) set.add(r.tipo_gasto_sugerido);
    }
    return [...set].sort();
  }, [rows]);

  const placas = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.placa?.trim()) set.add(r.placa.trim());
    }
    return [...set].sort();
  }, [rows]);

  const umbralMontoAlto = useMemo(() => resolveUmbralMontoAlto(rows), [rows]);
  const calidadPorId = useMemo(() => buildCalidadPorId(rows, umbralMontoAlto), [rows, umbralMontoAlto]);

  const elegibilidadPorId = useMemo(() => {
    const map = new Map<number, IaLoteElegibilidad>();
    for (const r of rows) {
      map.set(
        r.id,
        evaluaElegibilidadLote(r, permUser, uiStatusRaw(r.id), calidadPorId.get(r.id), umbralLoteConfianza),
      );
    }
    return map;
  }, [rows, permUser, calidadPorId, umbralLoteConfianza, uiStatusRaw]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.id)),
    [rows, selectedIds],
  );

  const loteResumenConfirmacion = useMemo(
    () => (selectedRows.length > 0 ? buildLoteResumenConfirmacion(selectedRows, elegibilidadPorId) : null),
    [selectedRows, elegibilidadPorId],
  );

  const loteSelectionStats = useMemo(() => {
    let alta = 0;
    let riesgo = 0;
    let monto = 0;
    for (const r of selectedRows) {
      const ev = elegibilidadPorId.get(r.id);
      if (ev?.altaConfianza) alta += 1;
      if (ev?.conRiesgo) riesgo += 1;
      monto += Number.isFinite(r.monto) ? r.monto : 0;
    }
    return { count: selectedRows.length, alta, riesgo, monto };
  }, [selectedRows, elegibilidadPorId]);

  const metricasCalidad = useMemo(
    () => computeIaCalidadMetricas(rows, uiMap, calidadPorId),
    [rows, uiMap, calidadPorId],
  );

  const porCategoriaCalidad = useMemo(
    () =>
      agruparPorCampo(rows, 'tipo_gasto_sugerido', (k) => labelTipoGastoFinanciero(k), 10),
    [rows],
  );

  const porSubtipoCalidad = useMemo(
    () =>
      agruparPorCampo(rows, 'subtipo_sugerido', (k) => {
        const sample = rows.find((r) => r.subtipo_sugerido === k);
        const tipo = sample?.tipo_gasto_sugerido ?? 'operativo_vehiculo';
        return labelForSubtipoCatalogo(tipo, k);
      }, 10),
    [rows],
  );

  const patronesAprendidos = useMemo(() => computePatronesAprendidos(rows, 6), [rows]);

  const feedbackMetricas = useMemo(
    () => computeIaFeedbackMetricas(feedbackHistorial),
    [feedbackHistorial],
  );

  const filtered = useMemo(() => {
    const q = filtroTexto.trim().toLowerCase();
    const mMin = filtroMontoMin ? Number(filtroMontoMin) : null;
    const mMax = filtroMontoMax ? Number(filtroMontoMax) : null;
    return rows.filter((r) => {
      const stRaw = uiStatusRaw(r.id);
      if (filtroEstadoUi !== 'all') {
        if (filtroEstadoUi === 'seleccionado') {
          if (!selectedIds.has(r.id)) return false;
        } else if (stRaw !== filtroEstadoUi) return false;
      }
      if (filtroCategoria && r.tipo_gasto_sugerido !== filtroCategoria) return false;
      if (filtroPlaca && (r.placa ?? '') !== filtroPlaca) return false;
      if (filtroFechaDesde && r.fecha < filtroFechaDesde) return false;
      if (filtroFechaHasta && r.fecha > filtroFechaHasta) return false;
      if (mMin != null && !Number.isNaN(mMin) && r.monto < mMin) return false;
      if (mMax != null && !Number.isNaN(mMax) && r.monto > mMax) return false;
      const calidad = calidadPorId.get(r.id);
      if (!pasaFiltroCalidadRapido(r, filtroCalidadRapido, calidad)) return false;
      if (!pasaFiltroConfianzaPanel(r, filtroConfianza, calidad)) return false;
      if (!q) return true;
      const blob = [
        r.motivo,
        r.comentario,
        r.placa,
        r.tipo_actual,
        r.subtipo_actual,
        r.tipo_gasto_sugerido,
        r.subtipo_sugerido,
        r.razon,
        String(r.id),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [
    rows,
    uiStatus,
    filtroTexto,
    filtroConfianza,
    filtroCategoria,
    filtroPlaca,
    filtroFechaDesde,
    filtroFechaHasta,
    filtroMontoMin,
    filtroMontoMax,
    filtroEstadoUi,
    filtroCalidadRapido,
    calidadPorId,
    uiStatusRaw,
    selectedIds,
  ]);

  const stats = useMemo(() => {
    const pend = filtered.filter((r) => uiStatus(r.id) === 'pendiente').length;
    const rev = filtered.filter((r) => uiStatus(r.id) === 'revisado').length;
    const apl = filtered.filter((r) => {
      const st = uiStatus(r.id);
      return st === 'aplicado' || st === 'aplicado_lote';
    }).length;
    const ign = filtered.filter((r) => uiStatus(r.id) === 'ignorado').length;
    const err = filtered.filter((r) => {
      const st = uiStatus(r.id);
      return st === 'error' || st === 'error_lote';
    }).length;
    const sel = filtered.filter((r) => selectedIds.has(r.id)).length;
    return { pend, rev, apl, ign, err, sel };
  }, [filtered, uiStatus, selectedIds]);

  const toggleSelectRow = useCallback(
    (row: IaPendienteSugerencia) => {
      const ev = elegibilidadPorId.get(row.id);
      if (!ev?.selectable || loteApplying) return;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(row.id)) next.delete(row.id);
        else next.add(row.id);
        return next;
      });
    },
    [elegibilidadPorId, loteApplying],
  );

  const selectVisibleSelectable = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const r of filtered) {
        const ev = elegibilidadPorId.get(r.id);
        if (ev?.selectable) next.add(r.id);
      }
      return next;
    });
  }, [filtered, elegibilidadPorId]);

  const selectAltaConfianzaRecomendada = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const r of filtered) {
        const ev = elegibilidadPorId.get(r.id);
        if (ev?.selectable && ev.recomendadoLote) next.add(r.id);
      }
      return next;
    });
  }, [filtered, elegibilidadPorId]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const confirmLoteApply = useCallback(async () => {
    if (!empresaId || !canEditFinances || selectedRows.length === 0 || loteApplying) return;
    setLoteApplying(true);
    setLoteProgress({ current: 0, total: selectedRows.length });

    const summary = await applyIaClasificacionLote({
      rows: selectedRows,
      user,
      email: profile?.email ?? null,
      empresaId,
      vehicles,
      operatorClassifyMode,
      onProgress: (p) => {
        setLoteProgress({ current: p.current, total: p.total });
        setLoteApplyingGastoId(p.gastoId);
      },
    });

    const okIds = new Set<number>();
    let nextUi = { ...uiMap };

    for (const item of summary.items) {
      if (item.ok) {
        okIds.add(item.gastoId);
        applyGastoMovedLocal?.(item.gastoBefore, item.gasto, {
          movedOutOfView: item.movedOutOfView,
          source: 'user',
          reloadSummary: !operatorClassifyMode,
        });
        upsertGasto(item.gasto, { source: 'user', reloadSummary: !operatorClassifyMode });
        if (item.feedback) mergeFeedbackLocal(item.feedback);
        if (item.removeFromList) {
          setRows((prev) => prev.filter((r) => r.id !== item.gastoId));
        } else {
          setRows((prev) =>
            prev.map((r) =>
              r.id === item.gastoId
                ? {
                    ...r,
                    tipo_actual: item.tipoAplicado,
                    subtipo_actual: item.subtipoAplicado,
                  }
                : r,
            ),
          );
        }
        if (userId) {
          nextUi = setIaClasificacionUiStatus(empresaId, userId, item.gastoId, 'aplicado_lote', nextUi);
        }
      } else if (userId) {
        nextUi = setIaClasificacionUiStatus(empresaId, userId, item.gastoId, 'error_lote', nextUi);
      }
    }

    setUiMap(nextUi);
    setMeta((m) => {
      let totalPendientes = m.totalPendientes;
      let totalGlobales = m.totalGlobales;
      let count = m.count;
      for (const item of summary.items) {
        if (!item.ok || !item.removeFromList) continue;
        const row = selectedRows.find((r) => r.id === item.gastoId);
        const beforeTipo = row?.tipo_actual ?? 'pendiente_revision';
        count = Math.max(0, count - 1);
        if (beforeTipo === 'pendiente_revision') totalPendientes = Math.max(0, totalPendientes - 1);
        if (beforeTipo === 'gastos_globales') totalGlobales = Math.max(0, totalGlobales - 1);
      }
      return { ...m, count, totalPendientes, totalGlobales };
    });

    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of okIds) next.delete(id);
      return next;
    });

    setLoteApplying(false);
    setLoteApplyingGastoId(null);
    setLoteProgress(null);
    setLoteModalOpen(false);
    setLoteLastSummary(
      `Lote ${summary.batchId.slice(0, 8)}… · ${summary.exitos} aplicados · ${summary.fallos} errores`,
    );
    toast.success(
      'Lote completado',
      `${summary.exitos} de ${summary.total} sugerencias aplicadas correctamente.`,
    );
    if (showAuditPanel) await loadAudit();
  }, [
    empresaId,
    canEditFinances,
    selectedRows,
    loteApplying,
    user,
    profile?.email,
    vehicles,
    operatorClassifyMode,
    uiMap,
    userId,
    applyGastoMovedLocal,
    upsertGasto,
    mergeFeedbackLocal,
    toast,
    showAuditPanel,
    loadAudit,
  ]);

  if (!canUse) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center text-sm text-slate-600">
        No tienes permiso para el Centro de Clasificación IA.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
      <header className="flex flex-wrap items-start gap-3">
        <button
          type="button"
          onClick={() => navigate(isFinancialOperador ? '/finanzas/gastos' : '/finanzas')}
          className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Volver"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-500" aria-hidden />
            <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">Centro de Clasificación IA</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            Sugerencias para pendientes y globales. Aplicar requiere tu confirmación — la IA no modifica datos sola.
          </p>
        </div>
      </header>

      {rows.length > 0 && (
        <IAClasificacionCalidadPanel
          metricas={metricasCalidad}
          porCategoria={porCategoriaCalidad}
          porSubtipo={porSubtipoCalidad}
          patronesAprendidos={patronesAprendidos}
          feedbackMetricas={feedbackMetricas}
          filtroRapido={filtroCalidadRapido}
          onFiltroRapido={setFiltroCalidadRapido}
          loading={loading}
        />
      )}

      <Card className="border-indigo-100 bg-indigo-50/40 p-3 sm:p-4">
        <p className="text-xs text-indigo-900 sm:text-sm">
          <strong>Pendientes en BD:</strong> {meta.totalPendientes} · <strong>Globales:</strong>{' '}
          {meta.totalGlobales} · <strong>Analizados:</strong> {meta.count}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={loading}
            onClick={() => void runAnalyze(40)}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Actualizar (40)
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={loading}
            onClick={() => void runAnalyze(100, true)}
          >
            Analizar 100 pendientes
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="h-4 w-4" />
            Filtros
          </Button>
        </div>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      {showFilters && (
        <Card className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 sm:p-4">
          <label className="text-xs text-slate-600 sm:col-span-2 lg:col-span-3">
            Buscar texto
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              placeholder="motivo, placa, razón…"
            />
          </label>
          <Select
            label="Confianza"
            value={filtroConfianza}
            onChange={(v) => setFiltroConfianza(v as typeof filtroConfianza)}
            options={[
              { value: 'all', label: 'Todas' },
              { value: 'alta', label: 'Alta (≥85%)' },
              { value: 'media', label: 'Media (60–84%)' },
              { value: 'baja', label: 'Baja (<60%)' },
            ]}
          />
          <Select
            label="Categoría sugerida"
            value={filtroCategoria}
            onChange={setFiltroCategoria}
            options={[{ value: '', label: 'Todas' }, ...categoriasSugeridas.map((c) => ({
              value: c,
              label: labelTipoGastoFinanciero(c),
            }))]}
          />
          <Select
            label="Vehículo (placa)"
            value={filtroPlaca}
            onChange={setFiltroPlaca}
            options={[{ value: '', label: 'Todos' }, ...placas.map((p) => ({ value: p, label: p }))]}
          />
          <label className="text-xs text-slate-600">
            Fecha desde
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={filtroFechaDesde}
              onChange={(e) => setFiltroFechaDesde(e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-600">
            Fecha hasta
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={filtroFechaHasta}
              onChange={(e) => setFiltroFechaHasta(e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-600">
            Monto mín.
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={filtroMontoMin}
              onChange={(e) => setFiltroMontoMin(e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-600">
            Monto máx.
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={filtroMontoMax}
              onChange={(e) => setFiltroMontoMax(e.target.value)}
            />
          </label>
          <Select
            label="Estado revisión (local)"
            value={filtroEstadoUi}
            onChange={(v) => setFiltroEstadoUi(v as typeof filtroEstadoUi)}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'pendiente', label: 'Pendiente' },
              { value: 'revisado', label: 'Revisado' },
              { value: 'aplicado', label: 'Aplicado' },
              { value: 'ignorado', label: 'Ignorado' },
              { value: 'error', label: 'Error' },
              { value: 'seleccionado', label: 'Seleccionado' },
              { value: 'aplicado_lote', label: 'Aplicado (lote)' },
              { value: 'error_lote', label: 'Error (lote)' },
            ]}
          />
        </Card>
      )}

      {canEditFinances && rows.length > 0 && (
        <Card className="border-violet-200/80 bg-violet-50/30 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <ListChecks className="h-4 w-4 text-violet-700" aria-hidden />
            <p className="text-xs font-semibold text-violet-950 sm:text-sm">Aplicación masiva supervisada</p>
          </div>
          <p className="mt-1 text-[11px] text-violet-900/90">
            Selecciona sugerencias y confirma en lote. La IA no aplica nada sola; cada registro usa la misma ruta
            segura que «Aplicar sugerencia».
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-[11px] text-slate-600">
              Umbral confianza mín. (%)
              <input
                type="number"
                min={50}
                max={100}
                className="mt-0.5 w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                value={Math.round(umbralLoteConfianza * 100)}
                disabled={loteApplying}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) setUmbralLoteConfianza(Math.min(1, Math.max(0.5, n / 100)));
                }}
              />
            </label>
            <Button type="button" size="sm" variant="secondary" disabled={loteApplying} onClick={selectVisibleSelectable}>
              Seleccionar visibles
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={loteApplying}
              onClick={selectAltaConfianzaRecomendada}
              title={`≥${Math.round(IA_LOTE_CONFIANZA_RECOMENDADA * 100)}%, memoria/mixto, sin revisión`}
            >
              Seleccionar alta confianza
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={loteApplying || selectedIds.size === 0} onClick={clearSelection}>
              Limpiar selección
            </Button>
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={loteApplying || loteSelectionStats.count === 0}
              onClick={() => setLoteModalOpen(true)}
            >
              Aplicar seleccionados ({loteSelectionStats.count})
            </Button>
          </div>
          {loteSelectionStats.count > 0 && (
            <p className="mt-2 text-[11px] text-slate-700">
              Alta confianza: <strong>{loteSelectionStats.alta}</strong> · Con riesgo:{' '}
              <strong className={loteSelectionStats.riesgo > 0 ? 'text-amber-800' : ''}>
                {loteSelectionStats.riesgo}
              </strong>
              · Monto total: <strong>{formatCurrency(loteSelectionStats.monto)}</strong>
            </p>
          )}
          {loteLastSummary && (
            <p className="mt-2 text-[11px] text-emerald-800">{loteLastSummary}</p>
          )}
        </Card>
      )}

      <IAClasificacionLoteModal
        isOpen={loteModalOpen}
        resumen={loteResumenConfirmacion}
        applying={loteApplying}
        progress={loteProgress}
        tieneRiesgo={(loteResumenConfirmacion?.conRiesgo ?? 0) > 0}
        onClose={() => !loteApplying && setLoteModalOpen(false)}
        onConfirm={() => void confirmLoteApply()}
      />

      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
        <span>Mostrando {filtered.length} filas</span>
        <span>· Pendiente: {stats.pend}</span>
        <span>· Revisado: {stats.rev}</span>
        <span>· Aplicado: {stats.apl}</span>
        <span>· Ignorado: {stats.ign}</span>
        {stats.sel > 0 ? <span>· Seleccionados: {stats.sel}</span> : null}
        {stats.err > 0 ? <span>· Error: {stats.err}</span> : null}
      </div>

      <Modal
        isOpen={confirmRow != null}
        onClose={() => setConfirmRow(null)}
        title="Aplicar sugerencia IA"
        size="md"
        closeLocked={applyingId != null}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={applyingId != null} onClick={() => setConfirmRow(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={applyingId != null || !canEditFinances}
              onClick={() => void confirmApply()}
            >
              {applyingId != null ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar y aplicar'}
            </Button>
          </div>
        }
      >
        {confirmRow && (
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              <strong>#{confirmRow.id}</strong> · {confirmRow.motivo ?? 'Sin motivo'}
            </p>
            <p>
              Pasará de{' '}
              <span className="font-medium">{labelTipoGastoFinanciero(confirmRow.tipo_actual)}</span>
              {confirmRow.subtipo_actual ? ` / ${confirmRow.subtipo_actual}` : ''} a{' '}
              <span className="font-medium text-indigo-800">
                {labelTipoGastoFinanciero(confirmRow.tipo_gasto_sugerido)}
              </span>
              {confirmRow.subtipo_sugerido ? ` / ${confirmRow.subtipo_sugerido}` : ''} (
              {formatConfianza(confirmRow.confianza)}).
            </p>
            <p className="text-xs text-slate-500">{confirmRow.razon}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                label="Categoría a aplicar"
                value={applyTipo}
                onChange={setApplyTipo}
                options={tipoDestinoOptions}
              />
              <label className="text-xs text-slate-600 sm:col-span-2">
                Subtipo a aplicar
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  value={applySubtipo}
                  onChange={(e) => setApplySubtipo(e.target.value)}
                  placeholder="ej. arrancador, frenos…"
                />
              </label>
            </div>
            <p className="text-[11px] text-slate-500">
              Puedes ajustar categoría/subtipo antes de aplicar. El feedback registrará si la IA acertó, fue parcial o
              incorrecta.
            </p>
            <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              Esta acción reclasifica el gasto en la base de datos. Puedes revertir desde Finanzas si hace falta.
            </p>
          </div>
        )}
      </Modal>

      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-slate-500">No hay registros con los filtros actuales.</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {canEditFinances ? (
                    <th className="w-8 px-2 py-2 font-medium" aria-label="Selección">
                      <span className="sr-only">Sel.</span>
                    </th>
                  ) : null}
                  <th className="px-2 py-2 font-medium">Fecha</th>
                  <th className="px-2 py-2 font-medium">Monto</th>
                  <th className="px-2 py-2 font-medium">Motivo / comentario</th>
                  <th className="px-2 py-2 font-medium">Placa</th>
                  <th className="px-2 py-2 font-medium">Actual</th>
                  <th className="px-2 py-2 font-medium">Sugerencia IA</th>
                  <th className="px-2 py-2 font-medium">Conf.</th>
                  <th className="px-2 py-2 font-medium">Estado</th>
                  <th className="px-2 py-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <FilaTabla
                    key={r.id}
                    row={r}
                    uiStatus={uiStatus(r.id)}
                    calidad={calidadPorId.get(r.id)}
                    feedback={feedbackPorGasto.get(r.id)}
                    elegibilidad={elegibilidadPorId.get(r.id)}
                    selected={selectedIds.has(r.id)}
                    showCheckbox={canEditFinances}
                    canApply={
                      canEditFinances &&
                      canApplyIaSugerencia(permUser, r).ok &&
                      !loteApplying
                    }
                    applying={applyingId === r.id || loteApplyingGastoId === r.id}
                    onToggleSelect={() => toggleSelectRow(r)}
                    onAplicar={() => setConfirmRow(r)}
                    onRevisado={() => void setStatus(r, 'revisado')}
                    onOcultar={() => void setStatus(r, 'ignorado')}
                    onReanalizar={() => void reanalizarFila(r)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((r) => (
              <FilaCard
                key={r.id}
                row={r}
                uiStatus={uiStatus(r.id)}
                calidad={calidadPorId.get(r.id)}
                feedback={feedbackPorGasto.get(r.id)}
                elegibilidad={elegibilidadPorId.get(r.id)}
                selected={selectedIds.has(r.id)}
                showCheckbox={canEditFinances}
                canApply={
                  canEditFinances &&
                  canApplyIaSugerencia(permUser, r).ok &&
                  !loteApplying
                }
                applying={applyingId === r.id || loteApplyingGastoId === r.id}
                onToggleSelect={() => toggleSelectRow(r)}
                onAplicar={() => setConfirmRow(r)}
                onRevisado={() => void setStatus(r, 'revisado')}
                onOcultar={() => void setStatus(r, 'ignorado')}
                onReanalizar={() => void reanalizarFila(r)}
              />
            ))}
          </div>
        </>
      )}

      {showAuditPanel && auditRows.length > 0 && (
        <Card className="p-3 sm:p-4">
          <h2 className="text-sm font-semibold text-slate-800">Auditoría reciente (admin)</h2>
          <p className="mt-1 text-xs text-slate-500">
            Qué sugirió la IA y qué acción tomó cada revisor. No modifica gastos automáticamente.
          </p>
          <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-xs text-slate-700">
            {auditRows.slice(0, 20).map((a) => (
              <li key={a.id} className="border-b border-slate-100 pb-2">
                {a.gasto_id != null && a.gasto_id > 0 ? (
                  <>
                    <span className="font-medium">#{a.gasto_id}</span> · {formatAuditAction(a.action)}
                  </>
                ) : (
                  formatAuditAction(a.action)
                )}
                {a.aplicado_manual && a.tipo_aplicado ? (
                  <span>
                    {' '}
                    ✓ {labelTipoGastoFinanciero(a.tipo_aplicado)}
                    {a.subtipo_aplicado ? ` / ${a.subtipo_aplicado}` : ''}
                  </span>
                ) : a.tipo_sugerido ? (
                  <span>
                    {' '}
                    → {labelTipoGastoFinanciero(a.tipo_sugerido)}
                    {a.subtipo_sugerido ? ` / ${a.subtipo_sugerido}` : ''}
                  </span>
                ) : null}
                {a.confianza != null && <span> · {formatConfianza(a.confianza)}</span>}
                {a.batch_id ? <span className="text-indigo-600"> · lote {a.batch_id.slice(0, 8)}</span> : null}
                <span className="block text-slate-400">
                  {new Date(a.created_at).toLocaleString('es-PE')}
                  {a.user_role ? ` · ${a.user_role}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};

function calidadBadgeVariant(banda: ReturnType<typeof iaCalidadConfianzaBanda>): 'success' | 'warning' | 'danger' {
  if (banda === 'alta') return 'success';
  if (banda === 'media') return 'warning';
  return 'danger';
}

type FilaProps = {
  row: IaPendienteSugerencia;
  uiStatus: IaClasificacionUiStatus;
  calidad?: IaSugerenciaCalidadEval;
  feedback?: ClasificacionFeedbackResumen;
  elegibilidad?: IaLoteElegibilidad;
  selected?: boolean;
  showCheckbox?: boolean;
  canApply: boolean;
  applying: boolean;
  onToggleSelect?: () => void;
  onAplicar: () => void;
  onRevisado: () => void;
  onOcultar: () => void;
  onReanalizar: () => void;
};

function CalidadDebilBadge({ calidad }: { calidad?: IaSugerenciaCalidadEval }) {
  if (!calidad?.requiereRevision) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900"
      title={calidad.motivos.join(' · ')}
    >
      Requiere revisión
    </span>
  );
}

const FUENTE_LABEL: Record<ClasificacionSugerenciaFuente, string> = {
  memoria_humana: 'Aprendido de historial humano',
  heuristica: 'Heurística',
  mixto: 'Mixto',
};

const FUENTE_STYLE: Record<ClasificacionSugerenciaFuente, string> = {
  memoria_humana: 'bg-indigo-100 text-indigo-900 ring-indigo-200',
  heuristica: 'bg-slate-100 text-slate-700 ring-slate-200',
  mixto: 'bg-violet-100 text-violet-900 ring-violet-200',
};

function FeedbackHumanoBadge({ feedback }: { feedback?: ClasificacionFeedbackResumen }) {
  if (!feedback) return null;
  const styles: Record<ClasificacionFeedbackResumen['feedback_resultado'], string> = {
    correcto: 'bg-emerald-100 text-emerald-900 ring-emerald-200',
    parcialmente_correcto: 'bg-amber-100 text-amber-900 ring-amber-200',
    incorrecto: 'bg-red-100 text-red-900 ring-red-200',
    ignorado: 'bg-slate-100 text-slate-600 ring-slate-200',
  };
  const labels: Record<ClasificacionFeedbackResumen['feedback_resultado'], string> = {
    correcto: 'IA acertó',
    parcialmente_correcto: 'IA corregida',
    incorrecto: 'IA incorrecta',
    ignorado: 'Ignorada',
  };
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${styles[feedback.feedback_resultado]}`}
    >
      {labels[feedback.feedback_resultado]}
    </span>
  );
}

function FuenteSugerenciaBadge({ row }: { row: IaPendienteSugerencia }) {
  const fuente = row.fuente ?? 'heuristica';
  const title =
    row.memoria_match != null
      ? `${FUENTE_LABEL[fuente]} · ${row.memoria_match.texto_relacionado} (${Math.round(row.memoria_match.score * 100)}%)`
      : FUENTE_LABEL[fuente];
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${FUENTE_STYLE[fuente]}`}
      title={title}
    >
      {fuente === 'memoria_humana' ? 'Basado en memoria' : FUENTE_LABEL[fuente]}
    </span>
  );
}

function subtipoLabel(row: IaPendienteSugerencia, sub: string | null): string {
  if (!sub) return '—';
  const tipo = row.tipo_gasto_sugerido ?? row.tipo_actual ?? 'operativo_vehiculo';
  return labelForSubtipoCatalogo(tipo, sub);
}

const FilaTabla: React.FC<FilaProps> = ({
  row,
  uiStatus,
  calidad,
  feedback,
  elegibilidad,
  selected,
  showCheckbox,
  canApply,
  applying,
  onToggleSelect,
  onAplicar,
  onRevisado,
  onOcultar,
  onReanalizar,
}) => {
  const banda = calidad?.banda ?? iaCalidadConfianzaBanda(row.confianza);
  const motivoLine = [row.motivo, row.comentario].filter(Boolean).join(' · ') || '—';
  const selectable = elegibilidad?.selectable === true;
  return (
    <tr className={`text-slate-800 ${selected ? 'bg-violet-50/60' : ''}`}>
      {showCheckbox ? (
        <td className="px-2 py-2 align-top">
          <button
            type="button"
            className="rounded p-0.5 text-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!selectable}
            title={selectable ? 'Seleccionar para lote' : elegibilidad?.motivoNoSelectable ?? 'No seleccionable'}
            onClick={onToggleSelect}
            aria-pressed={selected}
          >
            {selected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </button>
        </td>
      ) : null}
      <td className="whitespace-nowrap px-2 py-2">{formatDate(row.fecha)}</td>
      <td className="whitespace-nowrap px-2 py-2">{formatCurrency(row.monto)}</td>
      <td className="max-w-[200px] px-2 py-2">
        <span className="line-clamp-2" title={motivoLine}>
          {motivoLine}
        </span>
        <span className="text-[10px] text-slate-400">#{row.id}</span>
      </td>
      <td className="px-2 py-2">{row.placa ?? '—'}</td>
      <td className="px-2 py-2">
        {labelTipoGastoFinanciero(row.tipo_actual)}
        {row.subtipo_actual ? ` / ${row.subtipo_actual}` : ''}
      </td>
      <td className="px-2 py-2">
        <span className="font-medium text-indigo-800">
          {row.tipo_gasto_sugerido ? labelTipoGastoFinanciero(row.tipo_gasto_sugerido) : '—'}
        </span>
        {row.subtipo_sugerido && (
          <span className="block text-indigo-600">/ {subtipoLabel(row, row.subtipo_sugerido)}</span>
        )}
        <span className="mt-0.5 block text-[10px] text-slate-500">{row.razon}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          <FuenteSugerenciaBadge row={row} />
          <FeedbackHumanoBadge feedback={feedback} />
        </span>
      </td>
      <td className="px-2 py-2">
        <div className="flex flex-col gap-1">
          <Badge variant={calidadBadgeVariant(banda)}>{formatConfianza(row.confianza)}</Badge>
          <CalidadDebilBadge calidad={calidad} />
        </div>
      </td>
      <td className="px-2 py-2">
        <Badge variant={STATUS_VARIANT[uiStatus]}>{STATUS_LABEL[uiStatus]}</Badge>
      </td>
      <td className="px-2 py-2">
        <div className="flex flex-col gap-1">
          {canApply && uiStatus !== 'aplicado' && uiStatus !== 'aplicado_lote' ? (
            <button
              type="button"
              disabled={applying}
              className="text-left text-[10px] font-semibold text-indigo-800 hover:underline disabled:opacity-50"
              onClick={onAplicar}
            >
              {applying ? 'Aplicando…' : 'Aplicar sugerencia'}
            </button>
          ) : null}
          <button
            type="button"
            className="text-left text-[10px] text-emerald-700 hover:underline disabled:opacity-50"
            disabled={applying}
            onClick={onRevisado}
          >
            Marcar revisado
          </button>
          <button
            type="button"
            className="text-left text-[10px] text-slate-600 hover:underline disabled:opacity-50"
            disabled={applying}
            onClick={onOcultar}
          >
            Ocultar sugerencia
          </button>
          <button
            type="button"
            className="text-left text-[10px] text-indigo-700 hover:underline disabled:opacity-50"
            disabled={applying}
            onClick={onReanalizar}
          >
            Volver a analizar
          </button>
        </div>
      </td>
    </tr>
  );
};

const FilaCard: React.FC<FilaProps> = ({
  row,
  uiStatus,
  calidad,
  feedback,
  elegibilidad,
  selected,
  showCheckbox,
  canApply,
  applying,
  onToggleSelect,
  onAplicar,
  onRevisado,
  onOcultar,
  onReanalizar,
}) => {
  const banda = calidad?.banda ?? iaCalidadConfianzaBanda(row.confianza);
  const motivoLine = [row.motivo, row.comentario].filter(Boolean).join(' · ') || '—';
  const selectable = elegibilidad?.selectable === true;
  return (
    <Card className={`p-3 ${selected ? 'ring-2 ring-violet-300' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 gap-2">
          {showCheckbox ? (
            <button
              type="button"
              className="shrink-0 rounded p-1 text-violet-800 disabled:opacity-40"
              disabled={!selectable}
              onClick={onToggleSelect}
              aria-pressed={selected}
            >
              {selected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
            </button>
          ) : null}
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{formatDate(row.fecha)} · #{row.id}</p>
            <p className="font-semibold text-slate-900">{formatCurrency(row.monto)}</p>
          </div>
        </div>
        <Badge variant={STATUS_VARIANT[uiStatus]}>{STATUS_LABEL[uiStatus]}</Badge>
      </div>
      <p className="mt-2 text-sm text-slate-800">{motivoLine}</p>
      {row.placa && <p className="text-xs text-slate-500">Placa: {row.placa}</p>}
      <p className="mt-2 text-xs">
        <span className="text-slate-500">Actual: </span>
        {labelTipoGastoFinanciero(row.tipo_actual)}
        {row.subtipo_actual ? ` / ${row.subtipo_actual}` : ''}
      </p>
      <div className="mt-2 rounded-lg bg-indigo-50/80 p-2">
        <p className="text-xs font-medium text-indigo-900">
          {row.tipo_gasto_sugerido ? labelTipoGastoFinanciero(row.tipo_gasto_sugerido) : 'Sin sugerencia'}
          {row.subtipo_sugerido ? ` · ${subtipoLabel(row, row.subtipo_sugerido)}` : ''}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant={calidadBadgeVariant(banda)}>{formatConfianza(row.confianza)}</Badge>
          <CalidadDebilBadge calidad={calidad} />
        </div>
        <p className="mt-1 text-[11px] text-indigo-800/90">{row.razon}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          <FuenteSugerenciaBadge row={row} />
          <FeedbackHumanoBadge feedback={feedback} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {canApply && uiStatus !== 'aplicado' && uiStatus !== 'aplicado_lote' ? (
          <Button type="button" size="sm" variant="primary" disabled={applying} onClick={onAplicar}>
            {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Aplicar sugerencia
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="secondary" onClick={onRevisado}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          Revisado
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onOcultar}>
          <EyeOff className="h-3.5 w-3.5" />
          Ocultar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onReanalizar}>
          <RefreshCw className="h-3.5 w-3.5" />
          Re-analizar
        </Button>
      </div>
    </Card>
  );
};

export default IAClasificacionPage;
