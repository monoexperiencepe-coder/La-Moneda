import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, History, Layers, Sparkles, Zap } from 'lucide-react';
import type { Gasto, Vehicle } from '../../data/types';
import { formatCurrency } from '../../utils/formatting';
import { sugerirClasificacionGasto } from '../../utils/gastoClasificacionSugerencia';
import { moveGastoCategoria } from '../../utils/gastoCategoriaMove';
import {
  getPendienteConciliacionState,
  recordConciliacionMove,
  syncPendienteBaseline,
  type PendienteConciliacionState,
} from '../../utils/pendienteRevisionConciliacionStorage';
import { labelTipoGastoFinanciero } from '../../utils/tipoGastoLabels';
import {
  getDefaultSubtipoForTipoGasto,
  getValidSubtiposForTipoGastoFinanza,
  normalizeSubtipoForTipoGasto,
  tipoGastoRequiereVehiculo,
} from '../../utils/gastoMoveCategoriaDefaults';
import type { ApplyGastoLocalOpts } from '../../utils/gastoLocalMutations';
import { gastoObservacionParaLista } from '../../utils/cleanOperationalComment';
import { getSubtipoFinancieroLabel } from '../../utils/subtipoFinancieroLabel';
import { getOperativoSubtipoLabel } from '../../utils/operativoSubtipo';
import { tipoGastoUsaSubtipoOperativo } from '../../utils/gastoMoveCategoriaDefaults';
import { getRepresentacionInternaSubtipoLabel } from '../../utils/representacionInternaSubtipoLabel';
import Select from '../Common/Select';
import Button from '../Common/Button';
import Modal from '../Common/Modal';
import type { ShowUndoToastParams } from '../../hooks/useUndoToast';
import { updateGastoCategoriaManual } from '../../services/gastosService';
import { normalizeGastoVehicleFkForDb } from '../../utils/vehicleId';
import { useAuth } from '../../context/AuthContext';

export type CategoriaMovimientoOption = { value: string; label: string };

type PanelMode = 'overview' | 'quick' | 'bulk';

type ToastApi = {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
};

type Props = {
  pendientes: Gasto[];
  totalGastosFlota: number;
  /** Si false, no muestra % del histórico global (operador restringido). */
  showHistoricoPercent?: boolean;
  vehicles: Vehicle[];
  canEdit: boolean;
  canMoveToTipo?: (tipo: string) => boolean;
  userLabel: string;
  categoriaOptions: CategoriaMovimientoOption[];
  applyGastoMovedLocal?: (
    before: Gasto,
    after: Gasto,
    opts?: ApplyGastoLocalOpts & { movedOutOfView?: boolean },
  ) => void;
  upsertGasto: (g: Gasto, opts?: ApplyGastoLocalOpts) => void;
  removeGastoLocal?: (id: string, opts?: ApplyGastoLocalOpts) => void;
  /** Operador restringido: UPDATE sin SELECT si destino no es tab visible. */
  operatorClassifyMode?: boolean;
  toast: ToastApi;
  showUndoToast: (params: ShowUndoToastParams) => void;
  getVehicleLabel: (vehicleId: number | null) => string;
};

function subtipoLabel(tipo: string, sub: string): string {
  if (tipo === 'representacion_interna') return getRepresentacionInternaSubtipoLabel(sub);
  if (tipoGastoUsaSubtipoOperativo(tipo)) return getOperativoSubtipoLabel(sub);
  return getSubtipoFinancieroLabel(sub, tipo);
}

function subtipoOptionsForTipo(
  tipo: string,
  gastos: Gasto[],
  seedSubtipo?: string,
): { value: string; label: string }[] {
  const base = new Set<string>(getValidSubtiposForTipoGastoFinanza(tipo));
  const def = getDefaultSubtipoForTipoGasto(tipo);
  if (def) base.add(def);
  if (seedSubtipo?.trim()) base.add(normalizeSubtipoForTipoGasto(tipo, seedSubtipo));
  for (const g of gastos) {
    if ((g.tipo_gasto ?? '').trim() === tipo) {
      const s = g.subtipo_gasto?.trim();
      if (s) base.add(normalizeSubtipoForTipoGasto(tipo, s));
    }
  }
  return [...base]
    .filter((s) => s.length > 0)
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((s) => ({ value: s, label: subtipoLabel(tipo, s) }));
}

const PendienteRevisionConciliacionPanel: React.FC<Props> = ({
  pendientes,
  totalGastosFlota,
  showHistoricoPercent = true,
  vehicles,
  canEdit,
  canMoveToTipo,
  userLabel,
  categoriaOptions,
  applyGastoMovedLocal,
  upsertGasto,
  removeGastoLocal,
  operatorClassifyMode = false,
  toast,
  showUndoToast,
  getVehicleLabel,
}) => {
  const { profile } = useAuth();
  const tenantEmpresaId = profile?.empresa_id;

  const [mode, setMode] = useState<PanelMode>('overview');
  const [concState, setConcState] = useState<PendienteConciliacionState>(() => getPendienteConciliacionState());
  const [quickIndex, setQuickIndex] = useState(0);
  const defaultMoveTipo = categoriaOptions[0]?.value ?? 'gastos_globales';
  const [moveTipo, setMoveTipo] = useState(defaultMoveTipo);
  const [moveSubtipo, setMoveSubtipo] = useState(() => getDefaultSubtipoForTipoGasto(defaultMoveTipo) ?? '');
  const [moveVehicleId, setMoveVehicleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTipo, setBulkTipo] = useState(defaultMoveTipo);
  const [bulkSubtipo, setBulkSubtipo] = useState(() => getDefaultSubtipoForTipoGasto(defaultMoveTipo) ?? '');
  const [bulkVehicleId, setBulkVehicleId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const pendingCount = pendientes.length;
  const pendingMonto = useMemo(() => pendientes.reduce((s, g) => s + g.monto, 0), [pendientes]);

  useEffect(() => {
    setConcState(syncPendienteBaseline(pendingCount, pendingMonto));
  }, [pendingCount, pendingMonto]);

  const pctHistorico =
    totalGastosFlota > 0 ? (pendingMonto / totalGastosFlota) * 100 : 0;

  const baseline = Math.max(concState.baselineCount, pendingCount, 1);
  const limpiadosDesdeBase = Math.max(0, concState.baselineCount - pendingCount);
  const progresoPct = Math.min(100, Math.round((limpiadosDesdeBase / baseline) * 100));

  const sortedPendientes = useMemo(
    () => [...pendientes].sort((a, b) => b.fecha.localeCompare(a.fecha) || Number(b.id) - Number(a.id)),
    [pendientes],
  );

  const quickGasto = sortedPendientes[quickIndex] ?? null;
  const quickSugerencia = quickGasto ? sugerirClasificacionGasto(quickGasto) : null;

  const subtipoOpts = useMemo(
    () => subtipoOptionsForTipo(moveTipo, pendientes, moveSubtipo),
    [moveTipo, pendientes, moveSubtipo],
  );

  const bulkSubtipoOpts = useMemo(
    () => subtipoOptionsForTipo(bulkTipo, pendientes, bulkSubtipo),
    [bulkTipo, pendientes, bulkSubtipo],
  );

  const vehicleOptions = useMemo(
    () => [
      { value: '', label: 'Seleccionar vehículo' },
      ...vehicles.map((v) => ({
        value: String(v.id),
        label: `#${v.id} ${v.marca} ${v.modelo} (${v.placa})`,
      })),
    ],
    [vehicles],
  );

  useEffect(() => {
    if (quickSugerencia && mode === 'quick') {
      const suggested = quickSugerencia.tipo_gasto;
      const allowed = canMoveToTipo?.(suggested) ?? true;
      const tipo = allowed ? suggested : defaultMoveTipo;
      setMoveTipo(tipo);
      setMoveSubtipo(
        allowed
          ? quickSugerencia.subtipo_gasto
          : getDefaultSubtipoForTipoGasto(tipo) ?? '',
      );
    }
  }, [
    quickGasto?.id,
    mode,
    quickSugerencia?.tipo_gasto,
    quickSugerencia?.subtipo_gasto,
    canMoveToTipo,
    defaultMoveTipo,
  ]);

  useEffect(() => {
    if (!subtipoOpts.some((o) => o.value === moveSubtipo)) {
      setMoveSubtipo(getDefaultSubtipoForTipoGasto(moveTipo));
    }
  }, [moveTipo, moveSubtipo, subtipoOpts]);

  useEffect(() => {
    if (!bulkSubtipoOpts.some((o) => o.value === bulkSubtipo)) {
      setBulkSubtipo(getDefaultSubtipoForTipoGasto(bulkTipo));
    }
  }, [bulkTipo, bulkSubtipo, bulkSubtipoOpts]);

  const applyMove = useCallback(
    async (gasto: Gasto, tipo: string, subtipo: string, vehIdStr: string, motivo: string) => {
      if (canMoveToTipo && !canMoveToTipo(tipo)) {
        toast.error('Sin permiso', 'No puedes clasificar en esa categoría.');
        return false;
      }
      const vehNum = vehIdStr.trim() === '' ? null : Number(vehIdStr);
      let vehicleId: number | null = null;
      if (vehNum != null && Number.isFinite(vehNum) && vehNum > 0) {
        vehicleId = vehNum;
      } else if (gasto.vehicleId != null) {
        const gv = Number(gasto.vehicleId);
        vehicleId = Number.isFinite(gv) && gv > 0 ? gv : null;
      }

      const res = await moveGastoCategoria({
        gasto,
        toTipoGasto: tipo,
        toSubtipoGasto: subtipo,
        vehicleId: tipoGastoRequiereVehiculo(tipo) ? vehicleId : null,
        motivo,
        vehicles,
        tenantEmpresaId,
        operatorClassifyMode,
      });

      if (!res.ok) {
        toast.error('No se pudo clasificar', res.message);
        return false;
      }

      const localSyncSilent = operatorClassifyMode
        ? ({ reloadSummary: false as const, source: 'user' as const })
        : ({ source: 'user' as const });

      applyGastoMovedLocal?.(gasto, res.gasto, {
        movedOutOfView: res.movedOutOfView,
        ...localSyncSilent,
      });
      const subFinal = res.gasto.subtipo_gasto ?? subtipo;
      setConcState(
        recordConciliacionMove({
          gastoId: gasto.id,
          monto: gasto.monto,
          motivo: gasto.motivo?.slice(0, 80) ?? '',
          from_tipo_gasto: res.prevTipo,
          to_tipo_gasto: tipo,
          from_subtipo_gasto: res.prevSub,
          to_subtipo_gasto: subFinal,
          userLabel,
        }),
      );

      showUndoToast({
        message: 'Gasto clasificado',
        detail: labelTipoGastoFinanciero(tipo),
        undoAction: {
          type: 'update',
          label: 'Revertir clasificación',
          entityType: 'gasto',
          entityId: gasto.id,
          undo: async () => {
            const rev = await updateGastoCategoriaManual(
              gasto.id,
              {
                tipo_gasto: res.prevTipo,
                subtipo_gasto: res.prevSub,
                vehicle_id: normalizeGastoVehicleFkForDb(gasto.vehicleId),
                requiere_revision: true,
                clasificacion_manual: gasto.clasificacion_manual ?? null,
                revisado_at: gasto.revisado_at ?? null,
                revisado_por: gasto.revisado_por ?? null,
                origen_clasificacion: gasto.origen_clasificacion ?? null,
              },
              {
                reason: 'Deshacer conciliación rápida',
                sourceAction: 'undo_move_category',
              },
              tenantEmpresaId,
              { operatorClassifyMode },
            );
            if (!rev.ok) throw new Error('undo_failed');
            applyGastoMovedLocal?.(res.gasto, rev.gasto, {
              movedOutOfView: rev.movedOutOfView,
              ...(operatorClassifyMode
                ? { reloadSummary: false as const, source: 'undo' as const }
                : { source: 'undo' as const }),
            });
          },
        },
      });
      return true;
    },
    [vehicles, applyGastoMovedLocal, operatorClassifyMode, toast, showUndoToast, userLabel, canMoveToTipo, tenantEmpresaId],
  );

  const handleQuickApply = async (advance: boolean) => {
    if (!quickGasto || !canEdit) return;
    setSaving(true);
    try {
      const ok = await applyMove(
        quickGasto,
        moveTipo,
        moveSubtipo,
        moveVehicleId || (quickGasto.vehicleId != null ? String(quickGasto.vehicleId) : ''),
        'Clasificación rápida — conciliación',
      );
      if (ok && advance) {
        setQuickIndex((i) => Math.min(i, Math.max(0, sortedPendientes.length - 2)));
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedRows = sortedPendientes.filter((g) => selectedIds.has(g.id));
  const bulkNeedsVehicle = tipoGastoRequiereVehiculo(bulkTipo);

  const handleBulkConfirm = async () => {
    if (!canEdit || selectedRows.length === 0) return;
    setBulkSaving(true);
    let okN = 0;
    try {
      for (const g of selectedRows) {
        const veh =
          bulkVehicleId ||
          (g.vehicleId != null ? String(g.vehicleId) : '');
        const ok = await applyMove(
          g,
          bulkTipo,
          bulkSubtipo,
          veh,
          `Revisión en lote (${selectedRows.length})`,
        );
        if (ok) okN += 1;
      }
      toast.success(
        'Lote aplicado',
        `${okN} de ${selectedRows.length} registro${selectedRows.length === 1 ? '' : 's'} clasificados.`,
      );
      setSelectedIds(new Set());
      setBulkOpen(false);
      setMode('overview');
    } finally {
      setBulkSaving(false);
    }
  };

  const lastConcLabel = concState.lastConciliacionAt
    ? new Date(concState.lastConciliacionAt).toLocaleString('es-PE', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—';

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-300/90 bg-gradient-to-br from-amber-50 to-orange-50/40 px-3 py-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-950">Conciliación financiera</p>
            <p className="mt-1 text-sm tabular-nums text-amber-900">
              <span className="font-semibold">{pendingCount}</span> registros pendientes ·{' '}
              <span className="font-semibold">{formatCurrency(pendingMonto)}</span>
              {showHistoricoPercent && totalGastosFlota > 0 ? (
                <span className="text-amber-800/90">
                  {' '}
                  · {pctHistorico.toFixed(2)}% del histórico de gastos
                </span>
              ) : null}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-amber-200/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                style={{ width: `${progresoPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-amber-800/95">
              Progreso: {progresoPct}% · Faltan {pendingCount} · Limpiados (sesión + base):{' '}
              {concState.sessionResolvedCount + limpiadosDesdeBase} · Última conciliación: {lastConcLabel}
            </p>
            <Link
              to="/finanzas/ia-clasificacion"
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900"
            >
              <Sparkles className="h-3 w-3" aria-hidden />
              Centro de Clasificación IA (solo sugerencias)
            </Link>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'quick' ? 'overview' : 'quick');
                  setQuickIndex(0);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold shadow-sm transition ${
                  mode === 'quick'
                    ? 'bg-amber-600 text-white'
                    : 'bg-white text-amber-900 ring-1 ring-amber-200 hover:bg-amber-50'
                }`}
              >
                <Zap size={14} />
                Clasificar rápido
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'bulk' ? 'overview' : 'bulk');
                  setSelectedIds(new Set());
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold shadow-sm transition ${
                  mode === 'bulk'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                <Layers size={14} />
                Revisión en lote
              </button>
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                <History size={14} />
                Historial ({concState.history.length})
              </button>
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-[12px] leading-snug text-amber-900/90 border-t border-amber-200/60 pt-2">
          Estos gastos aún no están clasificados. Revísalos y muévelos a su categoría correcta. Las sugerencias son
          heurísticas (no IA) y <strong>no</strong> se aplican solas.
        </p>
      </div>

      {historyOpen ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 max-h-48 overflow-y-auto">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Historial local (esta sesión / navegador)
          </p>
          {concState.history.length === 0 ? (
            <p className="text-xs text-slate-500">Sin movimientos registrados aún.</p>
          ) : (
            <ul className="space-y-1.5 text-[11px] text-slate-700">
              {concState.history.slice(0, 30).map((h) => (
                <li key={h.id} className="border-b border-slate-50 pb-1">
                  <span className="font-semibold">{h.userLabel}</span> · {formatCurrency(h.monto)} ·{' '}
                  {labelTipoGastoFinanciero(h.from_tipo_gasto)} →{' '}
                  <span className="text-emerald-800">{labelTipoGastoFinanciero(h.to_tipo_gasto)}</span> ·{' '}
                  {new Date(h.at).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {mode === 'quick' && canEdit ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          {sortedPendientes.length === 0 ? (
            <p className="text-sm text-emerald-700 font-semibold">Cola vacía — no quedan pendientes de revisión.</p>
          ) : quickGasto ? (
            <>
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                <span>
                  Registro {quickIndex + 1} de {sortedPendientes.length}
                </span>
                <span className="tabular-nums font-semibold text-slate-700">{formatCurrency(quickGasto.monto)}</span>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 space-y-2 text-sm">
                <p>
                  <span className="text-slate-500 text-xs uppercase font-semibold">Motivo</span>
                  <br />
                  <span className="font-medium text-slate-900">{quickGasto.motivo || '—'}</span>
                </p>
                <p className="text-xs text-slate-600">
                  <span className="font-semibold">{quickGasto.fecha}</span>
                  {' · '}
                  {getVehicleLabel(
                    quickGasto.vehicleId != null ? Number(quickGasto.vehicleId) : null,
                  )}
                </p>
                {(() => {
                  const nota = gastoObservacionParaLista(quickGasto);
                  return nota ? (
                    <p className="text-xs text-slate-600 line-clamp-2 leading-snug">{nota}</p>
                  ) : null;
                })()}
              </div>
              {quickSugerencia ? (
                <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2 text-xs text-violet-900">
                  <span className="font-bold">Sugerencia:</span>{' '}
                  {labelTipoGastoFinanciero(quickSugerencia.tipo_gasto)} /{' '}
                  {subtipoLabel(quickSugerencia.tipo_gasto, quickSugerencia.subtipo_gasto)} —{' '}
                  {quickSugerencia.razon}
                  <button
                    type="button"
                    className="ml-2 font-semibold underline"
                    onClick={() => {
                      setMoveTipo(quickSugerencia.tipo_gasto);
                      setMoveSubtipo(quickSugerencia.subtipo_gasto);
                    }}
                  >
                    Usar sugerencia
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">Sin sugerencia automática para este texto.</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Select
                  label="Categoría destino"
                  options={categoriaOptions}
                  value={moveTipo}
                  onChange={(v) => {
                    setMoveTipo(v);
                    setMoveSubtipo(getDefaultSubtipoForTipoGasto(v));
                    if (!tipoGastoRequiereVehiculo(v)) setMoveVehicleId('');
                  }}
                />
                <Select
                  label="Subtipo"
                  options={subtipoOpts}
                  value={moveSubtipo}
                  onChange={setMoveSubtipo}
                />
                {tipoGastoRequiereVehiculo(moveTipo) ? (
                  <Select
                    label="Vehículo"
                    options={vehicleOptions}
                    value={moveVehicleId || (quickGasto.vehicleId != null ? String(quickGasto.vehicleId) : '')}
                    onChange={setMoveVehicleId}
                  />
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button loading={saving} onClick={() => void handleQuickApply(true)}>
                  Aplicar y siguiente
                  <ChevronRight size={16} className="ml-1" />
                </Button>
                <Button variant="secondary" disabled={saving} onClick={() => void handleQuickApply(false)}>
                  Aplicar
                </Button>
                <Button
                  variant="ghost"
                  disabled={saving || quickIndex <= 0}
                  onClick={() => setQuickIndex((i) => Math.max(0, i - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="ghost"
                  disabled={saving || quickIndex >= sortedPendientes.length - 1}
                  onClick={() => setQuickIndex((i) => i + 1)}
                >
                  Omitir
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {mode === 'bulk' && canEdit ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <p className="text-xs text-slate-600">
            Marca registros similares y muévelos en lote (p. ej. varios SAT → multas y trámites).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                setSelectedIds(new Set(sortedPendientes.map((g) => g.id)))
              }
            >
              Seleccionar todos ({sortedPendientes.length})
            </Button>
            <Button variant="ghost" onClick={() => setSelectedIds(new Set())}>
              Limpiar selección
            </Button>
            <Button
              disabled={selectedIds.size === 0}
              onClick={() => setBulkOpen(true)}
            >
              Mover {selectedIds.size} seleccionados…
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-50">
            {sortedPendientes.map((g) => {
              const sug = sugerirClasificacionGasto(g);
              return (
                <label
                  key={g.id}
                  className="flex items-start gap-2 px-2 py-2 hover:bg-slate-50 cursor-pointer text-xs"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selectedIds.has(g.id)}
                    onChange={() => toggleSelect(g.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-slate-800">{g.fecha}</span>
                    {' · '}
                    <span className="tabular-nums">{formatCurrency(g.monto)}</span>
                    <br />
                    <span className="text-slate-700 line-clamp-1">{g.motivo}</span>
                    {(() => {
                      const nota = gastoObservacionParaLista(g);
                      return nota ? (
                        <span className="block text-slate-500 text-[10px] line-clamp-2 leading-snug">{nota}</span>
                      ) : null;
                    })()}
                    {sug ? (
                      <span className="text-violet-700 text-[10px]">
                        Sug.: {labelTipoGastoFinanciero(sug.tipo_gasto)}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      <Modal
        isOpen={bulkOpen}
        onClose={() => !bulkSaving && setBulkOpen(false)}
        title={`Confirmar lote (${selectedRows.length} registros)`}
        closeLocked={bulkSaving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkOpen(false)} disabled={bulkSaving}>
              Cancelar
            </Button>
            <Button loading={bulkSaving} onClick={() => void handleBulkConfirm()}>
              Confirmar y mover
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700 mb-3">
          Se clasificarán <strong>{selectedRows.length}</strong> gastos. Monto total:{' '}
          <strong>{formatCurrency(selectedRows.reduce((s, g) => s + g.monto, 0))}</strong>.
        </p>
        <div className="space-y-3">
          <Select label="Nueva categoría" options={categoriaOptions} value={bulkTipo} onChange={setBulkTipo} />
          <Select label="Subtipo" options={bulkSubtipoOpts} value={bulkSubtipo} onChange={setBulkSubtipo} />
          {bulkNeedsVehicle ? (
            <Select label="Vehículo (si aplica a todos)" options={vehicleOptions} value={bulkVehicleId} onChange={setBulkVehicleId} />
          ) : null}
        </div>
      </Modal>
    </div>
  );
};

export default PendienteRevisionConciliacionPanel;
