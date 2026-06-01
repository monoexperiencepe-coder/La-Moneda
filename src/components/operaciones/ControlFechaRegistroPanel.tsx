import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Card from '../Common/Card';
import Input from '../Common/Input';
import Select from '../Common/Select';
import Button from '../Common/Button';
import { esControlFechaSinAlertaVencimiento, TIPOS_CONTROL_FECHA_OPTIONS } from '../../data/controlFechaCatalog';
import { formatDate, todayStr } from '../../utils/formatting';
import { diffDaysFromToday } from '../../utils/fleetPanel';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useAuth } from '../../context/AuthContext';
import type { ControlFechasHistoryFilters } from '../../services/controlFechasService';
import { fetchDocumentacionFullAll } from '../../services/controlFechasService';
import { vehicleIdSortRank } from '../../utils/sortByVehicle';
import { matchesHistorialRecordSearch } from '../../utils/recordSearch';
import {
  documentacionHistorialTipoLabel,
  documentacionHistorialVehiculoLine,
  matchesDocumentacionSearch,
  type DocumentacionSearchContext,
} from '../../utils/documentacionHistorialSearch';
import type { ControlFecha, TipoControlFecha } from '../../data/types';
import { ChevronDown, ChevronUp, Trash2, Loader2, Pencil } from 'lucide-react';
import EditarControlFechaModal from './EditarControlFechaModal';

const emptyHistFilters = (): ControlFechasHistoryFilters => ({});

export interface ControlFechaRegistroPanelProps {
  /** Preselecciona vehículo en el alta y en el filtro del historial (p. ej. detalle de vehículo). */
  prefilledVehicleId?: number | null;
  /**
   * `documentacion`: búsqueda enriquecida y filas sin ID visible (solo módulo Documentación).
   * `default`: búsqueda genérica de historial.
   */
  historialSearchMode?: 'default' | 'documentacion';
  /** En módulo Documentación: formulario de registro visible al cargar. */
  formExpandedDefault?: boolean;
}

const ControlFechaRegistroPanel: React.FC<ControlFechaRegistroPanelProps> = ({
  prefilledVehicleId = null,
  historialSearchMode = 'default',
  formExpandedDefault = false,
}) => {
  const {
    vehicles,
    addControlFecha,
    deleteControlFecha,
    getVehicleLabel,
    controlFechasHistory,
    controlFechasHistoryTotal,
    controlFechasHistoryPage,
    controlFechasHistoryPageSize,
    controlFechasHistoryLoading,
    loadControlFechasHistory,
  } = useRegistrosContext();
  const { profile } = useAuth();
  const tenantEmpresaId = profile?.empresa_id;

  const docSearchMode = historialSearchMode === 'documentacion';

  const [documentacionScope, setDocumentacionScope] = useState<'quick' | 'full'>('quick');
  const [documentacionFullRows, setDocumentacionFullRows] = useState<ControlFecha[]>([]);
  const [documentacionFullLoaded, setDocumentacionFullLoaded] = useState(false);
  const [documentacionFullLoading, setDocumentacionFullLoading] = useState(false);
  const [documentacionFullError, setDocumentacionFullError] = useState<string | null>(null);
  const documentacionFullLoadedRef = useRef(false);
  const documentacionFullLoadingRef = useRef(false);
  const documentacionFullRequestIdRef = useRef(0);
  const documentacionFullAbortRef = useRef<AbortController | null>(null);
  const [documentacionFullRetryTick, setDocumentacionFullRetryTick] = useState(0);
  const [histYear, setHistYear] = useState('ALL');

  const active = useMemo(
    () => [...vehicles.filter((v) => v.activo)].sort((a, b) => a.id - b.id),
    [vehicles],
  );
  const vehicleOpts = [
    { value: '', label: 'Seleccionar vehículo' },
    ...active.map((v) => ({
      value: String(v.id),
      label: `#${v.id} — ${v.placa} — ${v.marca} ${v.modelo}`.trim(),
    })),
  ];

  const [vehicleId, setVehicleId] = useState('');
  const [tipo, setTipo] = useState(TIPOS_CONTROL_FECHA_OPTIONS[0].value);
  const [fechaVencimiento, setFechaVencimiento] = useState(todayStr());
  const [comentarios, setComentarios] = useState('');
  const [busquedaPagina, setBusquedaPagina] = useState('');

  const [histVehicleId, setHistVehicleId] = useState('');
  const [histTipo, setHistTipo] = useState('');
  const [histDesde, setHistDesde] = useState('');
  const [histHasta, setHistHasta] = useState('');
  const [openRegistroCard, setOpenRegistroCard] = useState(formExpandedDefault || historialSearchMode === 'documentacion');
  const [openHistFilters, setOpenHistFilters] = useState(false);
  const [savingRegistro, setSavingRegistro] = useState(false);
  const [deletingControlId, setDeletingControlId] = useState<number | null>(null);
  const [editingControl, setEditingControl] = useState<ControlFecha | null>(null);

  useEffect(() => {
    void loadControlFechasHistory(emptyHistFilters(), 0);
  }, [loadControlFechasHistory]);

  useEffect(() => {
    if (prefilledVehicleId == null) return;
    const ok = vehicles.some((v) => v.activo && v.id === prefilledVehicleId);
    if (!ok) return;
    setVehicleId(String(prefilledVehicleId));
    setHistVehicleId(String(prefilledVehicleId));
    void loadControlFechasHistory({ vehicleId: prefilledVehicleId }, 0);
  }, [prefilledVehicleId, vehicles, loadControlFechasHistory]);

  const aplicarFiltrosHistorial = useCallback(() => {
    if (docSearchMode && documentacionScope === 'full') return;
    const f: ControlFechasHistoryFilters = {};
    if (histVehicleId) f.vehicleId = Number(histVehicleId);
    if (histTipo) f.tipo = histTipo;
    if (histDesde) f.fechaVencimientoDesde = histDesde;
    if (histHasta) f.fechaVencimientoHasta = histHasta;
    void loadControlFechasHistory(f, 0);
  }, [histVehicleId, histTipo, histDesde, histHasta, loadControlFechasHistory, docSearchMode, documentacionScope]);

  useEffect(() => {
    if (!docSearchMode || documentacionScope !== 'full' || !tenantEmpresaId) return;
    if (documentacionFullLoadedRef.current || documentacionFullLoadingRef.current) return;

    const requestId = ++documentacionFullRequestIdRef.current;
    documentacionFullAbortRef.current?.abort();
    const ac = new AbortController();
    documentacionFullAbortRef.current = ac;

    documentacionFullLoadingRef.current = true;
    setDocumentacionFullLoading(true);
    setDocumentacionFullError(null);

    void fetchDocumentacionFullAll(tenantEmpresaId, { signal: ac.signal })
      .then(({ rows, error }) => {
        if (requestId !== documentacionFullRequestIdRef.current) return;
        setDocumentacionFullRows(rows);
        if (error && error !== 'Cancelado') {
          setDocumentacionFullError(error);
          documentacionFullLoadedRef.current = false;
          setDocumentacionFullLoaded(false);
          return;
        }
        if (ac.signal.aborted || error === 'Cancelado') return;
        documentacionFullLoadedRef.current = true;
        setDocumentacionFullLoaded(true);
      })
      .catch((err: unknown) => {
        if (requestId !== documentacionFullRequestIdRef.current) return;
        const message = err instanceof Error ? err.message : String(err);
        setDocumentacionFullError(message);
        documentacionFullLoadedRef.current = false;
        setDocumentacionFullLoaded(false);
      })
      .finally(() => {
        if (requestId !== documentacionFullRequestIdRef.current) return;
        documentacionFullLoadingRef.current = false;
        setDocumentacionFullLoading(false);
      });

    return () => {
      ac.abort();
    };
  }, [docSearchMode, documentacionScope, tenantEmpresaId, documentacionFullRetryTick]);

  const loadHistorialCompleto = useCallback(() => {
    setDocumentacionFullError(null);
    setDocumentacionScope('full');
    setHistYear('ALL');
  }, []);

  const volverHistorialVistaRapida = useCallback(() => {
    documentacionFullAbortRef.current?.abort();
    documentacionFullAbortRef.current = null;
    documentacionFullRequestIdRef.current += 1;
    documentacionFullLoadingRef.current = false;
    setDocumentacionFullLoading(false);
    setDocumentacionScope('quick');
    const f: ControlFechasHistoryFilters = {};
    if (histVehicleId) f.vehicleId = Number(histVehicleId);
    if (histTipo) f.tipo = histTipo;
    if (histDesde) f.fechaVencimientoDesde = histDesde;
    if (histHasta) f.fechaVencimientoHasta = histHasta;
    void loadControlFechasHistory(f, controlFechasHistoryPage);
  }, [histVehicleId, histTipo, histDesde, histHasta, loadControlFechasHistory, controlFechasHistoryPage]);

  const retryHistorialCompleto = useCallback(() => {
    documentacionFullLoadedRef.current = false;
    documentacionFullLoadingRef.current = false;
    setDocumentacionFullLoaded(false);
    setDocumentacionFullLoading(false);
    setDocumentacionFullError(null);
    documentacionFullAbortRef.current?.abort();
    documentacionFullAbortRef.current = null;
    documentacionFullRequestIdRef.current += 1;
    setDocumentacionFullRetryTick((n) => n + 1);
  }, []);

  const sortHistorialRows = useCallback((rows: ControlFecha[]) => {
    return [...rows].sort((a, b) => {
      const vr = vehicleIdSortRank(a.vehicleId) - vehicleIdSortRank(b.vehicleId);
      if (vr !== 0) return vr;
      const fd = b.fechaVencimiento.localeCompare(a.fechaVencimiento);
      if (fd !== 0) return fd;
      return b.id - a.id;
    });
  }, []);

  const applyHistorialClientFilters = useCallback(
    (rows: ControlFecha[]) => {
      let out = rows;
      if (histVehicleId) out = out.filter((c) => Number(c.vehicleId) === Number(histVehicleId));
      if (histTipo) out = out.filter((c) => c.tipo === histTipo);
      if (histDesde) out = out.filter((c) => c.fechaVencimiento >= histDesde);
      if (histHasta) out = out.filter((c) => c.fechaVencimiento <= histHasta);
      if (histYear !== 'ALL') {
        out = out.filter((c) => c.fechaVencimiento.slice(0, 4) === histYear);
      }
      return out;
    },
    [histVehicleId, histTipo, histDesde, histHasta, histYear],
  );

  const historialSourceRows = useMemo(() => {
    if (docSearchMode && documentacionScope === 'full') {
      return applyHistorialClientFilters(documentacionFullRows);
    }
    return controlFechasHistory;
  }, [
    docSearchMode,
    documentacionScope,
    documentacionFullRows,
    controlFechasHistory,
    applyHistorialClientFilters,
  ]);

  const documentacionAvailableYears = useMemo(() => {
    if (!docSearchMode || documentacionScope !== 'full' || !documentacionFullLoaded) return [];
    const ys = new Set<number>();
    for (const c of documentacionFullRows) {
      const y = Number(c.fechaVencimiento.slice(0, 4));
      if (Number.isFinite(y) && y >= 1900 && y <= 2100) ys.add(y);
    }
    return [...ys].sort((a, b) => b - a);
  }, [docSearchMode, documentacionScope, documentacionFullLoaded, documentacionFullRows]);

  const histYearOptions = useMemo(
    () => [
      { value: 'ALL', label: 'Todos los años' },
      ...documentacionAvailableYears.map((y) => ({ value: String(y), label: String(y) })),
    ],
    [documentacionAvailableYears],
  );

  const docSearchContextFor = useCallback(
    (vehicleId: number | null): DocumentacionSearchContext => {
      const v = vehicleId != null ? vehicles.find((x) => x.id === vehicleId) : undefined;
      return {
        vehicleLabel: getVehicleLabel(vehicleId),
        placa: v?.placa ?? null,
        marca: v?.marca ?? null,
        modelo: v?.modelo ?? null,
        vehicleId,
      };
    },
    [vehicles, getVehicleLabel],
  );

  const filasPaginaFiltradas = useMemo(() => {
    const q = busquedaPagina.trim();
    const base = historialSourceRows;
    const rows = !q
      ? base
      : docSearchMode
        ? base.filter((c) => matchesDocumentacionSearch(c, q, docSearchContextFor(c.vehicleId)))
        : base.filter((c) =>
            matchesHistorialRecordSearch(c, q, [
              c.id,
              c.tipo,
              c.comentarios,
              c.fechaVencimiento,
              getVehicleLabel(c.vehicleId),
            ]),
          );
    return sortHistorialRows(rows);
  }, [
    historialSourceRows,
    busquedaPagina,
    getVehicleLabel,
    docSearchMode,
    docSearchContextFor,
    sortHistorialRows,
  ]);

  const historialEnModoCompleto = docSearchMode && documentacionScope === 'full';
  const historialListLoading = historialEnModoCompleto
    ? documentacionFullLoading
    : controlFechasHistoryLoading && controlFechasHistory.length === 0;

  const totalPages =
    controlFechasHistoryTotal != null ? Math.max(1, Math.ceil(controlFechasHistoryTotal / controlFechasHistoryPageSize)) : 1;

  const guardar = async () => {
    if (!vehicleId) return;
    setSavingRegistro(true);
    try {
      const created = await addControlFecha({
        vehicleId: Number(vehicleId),
        tipo,
        fechaVencimiento,
        fechaRegistro: todayStr(),
        comentarios: comentarios.trim(),
      });
      if (!created) return;
      setComentarios('');
      if (docSearchMode && documentacionFullLoaded) {
        setDocumentacionFullRows((prev) => sortHistorialRows([created, ...prev]));
      }
      setBusquedaPagina(docSearchMode ? documentacionHistorialTipoLabel(created.tipo) : String(created.id));
    } finally {
      setSavingRegistro(false);
    }
  };

  const handleDeleteHistorial = useCallback(
    async (id: number) => {
      setDeletingControlId(id);
      try {
        await deleteControlFecha(id);
        if (docSearchMode && documentacionFullLoaded) {
          setDocumentacionFullRows((prev) => prev.filter((c) => c.id !== id));
        }
      } finally {
        setDeletingControlId((cur) => (cur === id ? null : cur));
      }
    },
    [deleteControlFecha, docSearchMode, documentacionFullLoaded],
  );

  const histTipoOpts = [{ value: '', label: 'Todos los tipos' }, ...TIPOS_CONTROL_FECHA_OPTIONS];

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpenRegistroCard((v) => !v)}
        className="w-full sm:w-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 transition-colors"
      >
        {openRegistroCard ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        Registrar vencimiento
      </button>

      {openRegistroCard && (
        <Card
          title="Registrar vencimiento"
          subtitle="Resumen en la grilla usa solo el vencimiento más lejano por tipo y vehículo (RPC en Supabase)."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Select label="Vehículo" options={vehicleOpts} value={vehicleId} onChange={setVehicleId} />
            <Select label="Tipo" options={TIPOS_CONTROL_FECHA_OPTIONS} value={tipo} onChange={(v) => setTipo(v as TipoControlFecha)} />
            <Input label="Fecha de vencimiento" type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
            <Input label="Comentario (opcional)" value={comentarios} onChange={(e) => setComentarios(e.target.value)} />
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={!vehicleId || savingRegistro}
              onClick={() => void guardar()}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 min-w-[11rem]"
            >
              {savingRegistro ? <Loader2 size={18} className="animate-spin shrink-0" aria-hidden /> : null}
              {savingRegistro ? 'Guardando…' : 'Guardar en Supabase'}
            </button>
          </div>
        </Card>
      )}

      <Card>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-700">
                {historialEnModoCompleto ? 'Historial completo (documentación)' : 'Historial (Supabase, paginado)'}
              </p>
              {historialEnModoCompleto && documentacionFullLoaded ? (
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {documentacionFullRows.length} documento{documentacionFullRows.length === 1 ? '' : 's'} cargados · viendo
                  historial completo
                  {filasPaginaFiltradas.length !== documentacionFullRows.length
                    ? ` · ${filasPaginaFiltradas.length} visibles con filtros`
                    : ''}
                </p>
              ) : null}
              {documentacionFullError ? (
                <p className="mt-0.5 text-[11px] text-amber-800">{documentacionFullError}</p>
              ) : historialEnModoCompleto && documentacionFullLoading ? (
                <p className="mt-0.5 text-[11px] text-slate-500">Cargando años históricos…</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setOpenHistFilters((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            >
              {openHistFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {openHistFilters ? 'Ocultar filtros' : 'Usar filtros'}
            </button>
          </div>
          {docSearchMode ? (
            <div className="flex flex-wrap items-center gap-2">
              {historialEnModoCompleto ? (
                <>
                  <Button type="button" variant="primary" className="!text-xs !py-2 !px-3 shrink-0" disabled>
                    {documentacionFullLoading
                      ? 'Cargando historial completo…'
                      : documentacionFullLoaded
                        ? 'Viendo historial completo'
                        : 'Preparando historial completo…'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!text-xs !py-2 !px-3 shrink-0"
                    onClick={volverHistorialVistaRapida}
                  >
                    Vista rápida
                  </Button>
                  {documentacionFullError && !documentacionFullLoading ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="!text-xs !py-2 !px-3 shrink-0"
                      onClick={retryHistorialCompleto}
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
                  disabled={historialListLoading || !tenantEmpresaId}
                >
                  Ver historial completo
                </Button>
              )}
            </div>
          ) : null}
          {openHistFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-end">
              <Select
                label="Filtrar vehículo"
                options={[{ value: '', label: 'Todos' }, ...active.map((v) => ({ value: String(v.id), label: v.placa }))]}
                value={histVehicleId}
                onChange={setHistVehicleId}
              />
              <Select label="Filtrar tipo" options={histTipoOpts} value={histTipo} onChange={setHistTipo} />
              <Input label="Vence desde" type="date" value={histDesde} onChange={(e) => setHistDesde(e.target.value)} />
              <Input label="Vence hasta" type="date" value={histHasta} onChange={(e) => setHistHasta(e.target.value)} />
              <button
                type="button"
                onClick={aplicarFiltrosHistorial}
                disabled={historialEnModoCompleto}
                title={historialEnModoCompleto ? 'En historial completo los filtros se aplican al instante' : undefined}
                className="h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {historialEnModoCompleto ? 'Filtros en vivo' : 'Aplicar filtros'}
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
            <div className="flex flex-wrap items-end gap-2 w-full sm:w-auto">
              <div className="w-full sm:w-64 shrink-0">
                <Input
                  label={historialEnModoCompleto ? 'Buscar en historial completo' : 'Filtrar solo en esta página'}
                  value={busquedaPagina}
                  onChange={(e) => setBusquedaPagina(e.target.value)}
                  placeholder={
                    docSearchMode
                      ? 'Buscar por documento, placa, vehículo, estado…'
                      : 'id, placa, tipo, comentario…'
                  }
                />
              </div>
              {docSearchMode && historialEnModoCompleto && documentacionFullLoaded ? (
                <div className="w-full sm:w-[7.5rem] shrink-0">
                  <Select label="Historial — año" options={histYearOptions} value={histYear} onChange={setHistYear} />
                </div>
              ) : null}
            </div>
            {!historialEnModoCompleto ? (
              <p className="text-[11px] text-gray-500 sm:text-right">
                Página {controlFechasHistoryPage + 1} de {totalPages}
                {controlFechasHistoryTotal != null && (
                  <>
                    {' '}
                    · {controlFechasHistoryTotal} fila{controlFechasHistoryTotal !== 1 ? 's' : ''} en total
                  </>
                )}
                {controlFechasHistoryLoading ? ' · cargando…' : ''}
              </p>
            ) : (
              <p className="text-[11px] text-gray-500 sm:text-right">
                Búsqueda sobre todos los documentos cargados
                {documentacionFullLoading ? ' · cargando…' : ''}
              </p>
            )}
          </div>

        <div className="relative max-h-72 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
          {historialListLoading ? (
            <div className="py-10 text-center">
              <Loader2 size={22} className="animate-spin text-slate-400 mx-auto mb-2" aria-hidden />
              <p className="text-sm text-gray-500">
                {historialEnModoCompleto ? 'Cargando historial completo…' : 'Cargando historial…'}
              </p>
            </div>
          ) : documentacionFullError && historialEnModoCompleto && !documentacionFullLoading ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-semibold text-amber-950">No se pudo cargar el historial completo</p>
              <p className="mt-1 text-xs text-amber-900">{documentacionFullError}</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button type="button" variant="primary" className="!text-xs !py-2 !px-3" onClick={retryHistorialCompleto}>
                  Reintentar
                </Button>
                <Button type="button" variant="secondary" className="!text-xs !py-2 !px-3" onClick={volverHistorialVistaRapida}>
                  Volver a vista rápida
                </Button>
              </div>
            </div>
          ) : historialSourceRows.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Sin registros con estos filtros</p>
          ) : filasPaginaFiltradas.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              {busquedaPagina.trim()
                ? 'Nada coincide con la búsqueda'
                : 'Nada coincide con los filtros actuales'}
            </p>
          ) : (
            filasPaginaFiltradas.map((c) => {
              const d = diffDaysFromToday(c.fechaVencimiento);
              const sinVenc = esControlFechaSinAlertaVencimiento(c.tipo);
              const cls = sinVenc
                ? 'text-slate-600'
                : d < 0
                  ? 'text-red-600'
                  : d <= 30
                    ? 'text-amber-700'
                    : 'text-emerald-700';
              const rightLabel = sinVenc ? 'Referencia' : d < 0 ? `${Math.abs(d)} d venc.` : `${d} d`;
              const estadoTitulo = sinVenc
                ? 'Fecha de referencia (no vencimiento)'
                : d < 0
                  ? 'Vencido'
                  : d <= 30
                    ? 'Por vencer (≤30 días)'
                    : 'Al día';
              const ctx = docSearchContextFor(c.vehicleId);
              const tipoLine = documentacionHistorialTipoLabel(c.tipo);
              const vehLine = documentacionHistorialVehiculoLine(ctx);
              return (
                <div key={c.id} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0" title={docSearchMode ? `Registro interno #${c.id}` : undefined}>
                    <p className="font-medium text-gray-900 truncate">
                      {docSearchMode ? (
                        <>
                          <span>{tipoLine}</span>
                          <span className="text-gray-500 font-normal"> · {vehLine}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-gray-400 font-normal">#{c.id}</span> · {c.tipo.replace(/_/g, ' ')} ·{' '}
                          {getVehicleLabel(c.vehicleId)}
                        </>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">{formatDate(c.fechaVencimiento)}</p>
                    {c.comentarios ? <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{c.comentarios}</p> : null}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[11px] font-semibold ${cls}`} title={estadoTitulo}>
                      {rightLabel}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        title="Editar documento"
                        disabled={deletingControlId === c.id || savingRegistro}
                        onClick={() => setEditingControl(c)}
                        className="text-gray-400 hover:text-indigo-600 p-1 disabled:opacity-40 inline-flex"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        title="Eliminar"
                        disabled={deletingControlId === c.id || savingRegistro}
                        onClick={() => {
                          void handleDeleteHistorial(c.id);
                        }}
                        className="text-gray-400 hover:text-red-600 p-1 disabled:opacity-40 inline-flex"
                      >
                        {deletingControlId === c.id ? (
                          <Loader2 size={14} className="animate-spin text-red-500" aria-hidden />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!historialEnModoCompleto ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={controlFechasHistoryLoading || controlFechasHistoryPage <= 0}
              onClick={() => {
                const f: ControlFechasHistoryFilters = {};
                if (histVehicleId) f.vehicleId = Number(histVehicleId);
                if (histTipo) f.tipo = histTipo;
                if (histDesde) f.fechaVencimientoDesde = histDesde;
                if (histHasta) f.fechaVencimientoHasta = histHasta;
                void loadControlFechasHistory(f, controlFechasHistoryPage - 1);
              }}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium disabled:opacity-40"
            >
              ← Anterior
            </button>
            <button
              type="button"
              disabled={controlFechasHistoryLoading || controlFechasHistoryPage + 1 >= totalPages}
              onClick={() => {
                const f: ControlFechasHistoryFilters = {};
                if (histVehicleId) f.vehicleId = Number(histVehicleId);
                if (histTipo) f.tipo = histTipo;
                if (histDesde) f.fechaVencimientoDesde = histDesde;
                if (histHasta) f.fechaVencimientoHasta = histHasta;
                void loadControlFechasHistory(f, controlFechasHistoryPage + 1);
              }}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        ) : null}
        </div>
      </Card>
      <EditarControlFechaModal
        record={editingControl}
        isOpen={editingControl != null}
        onClose={() => setEditingControl(null)}
        onSaved={(updated) => {
          if (docSearchMode && documentacionFullLoaded) {
            setDocumentacionFullRows((prev) =>
              sortHistorialRows(prev.map((r) => (r.id === updated.id ? updated : r))),
            );
          }
          setBusquedaPagina(updated.comentarios?.includes(' ') ? updated.comentarios.split(' ').slice(0, 3).join(' ') : String(updated.id));
        }}
      />
    </div>
  );
};

export default ControlFechaRegistroPanel;
