import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Search,
  UserPlus,
  Trash2,
  Phone,
  ChevronUp,
  ChevronDown,
  MessageCircle,
  Filter,
  X,
  Save,
  Loader2,
  Pencil,
} from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatDate, todayStr } from '../../utils/formatting';
import { conductorDisplayInitials, formatConductorDisplayLabel } from '../../utils/fleetPanel';
import ConductorEditPanel from '../../components/operaciones/ConductorEditPanel';
import {
  conductorToDraft,
  conductorDraftsEqual,
  draftToConductorPatch,
  validateConductorDraft,
  whatsappHref,
  telHref,
  type ConductorEditDraft,
} from '../../utils/conductorForm';
import { cleanMojibakeText, displayConductorField } from '../../utils/cleanMojibakeText';
import { isValidConductorId, logConductorIdDiagnostics } from '../../utils/conductorId';
import { RegistroCountLabel, SkeletonTableRows, UpdatingChrome } from '../../components/Loading';
import { useDeferredRecalc } from '../../hooks/useDeferredRecalc';

type ConductorEditState = {
  driverId: string;
  draft: ConductorEditDraft;
  baseline: ConductorEditDraft;
};
import type { Conductor, TipoDocumento, TipoDomicilio } from '../../data/types';

/* â”€â”€â”€ types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
type EstadoFilter = 'TODOS' | 'VIGENTE' | 'SUSPENDIDO';
type SortKey = 'apellidos' | 'vehicleId' | 'estado' | 'cochera' | 'celular';
type SortDir = 'asc' | 'desc';

const TIPO_DOC_OPTS: { value: TipoDocumento; label: string }[] = [
  { value: 'DNI', label: 'DNI' },
  { value: 'CE', label: 'Carné de extranjería' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
];

const DOMICILIO_OPTS: { value: TipoDomicilio; label: string }[] = [
  { value: 'PROPIO', label: 'Propio' },
  { value: 'ALQUILADO', label: 'Alquilado' },
  { value: 'CASA DE FAMILIA', label: 'Casa de familia' },
];

function emptyNuevoConductorForm() {
  return {
    vehicleId: '',
    tipoDocumento: 'DNI' as TipoDocumento,
    numeroDocumento: '',
    nombres: '',
    apellidos: '',
    celular: '',
    domicilio: 'PROPIO' as TipoDomicilio,
    estadoContrato: 'ABIERTO' as 'ABIERTO' | 'CERRADO',
    estado: 'VIGENTE' as 'VIGENTE' | 'SUSPENDIDO',
    cochera: '',
    numeroEmergencia: '',
    direccion: '',
    fechaVencimientoContrato: '',
    documentoFirmado: 'unset' as 'unset' | 'true' | 'false',
    comentarios: '',
    statusOriginal: '',
  };
}

/* â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const PALETTE = [
  'bg-violet-600', 'bg-sky-600', 'bg-emerald-600', 'bg-amber-500',
  'bg-rose-600',   'bg-indigo-600', 'bg-teal-600',   'bg-pink-600',
];
const avatarBg = (id: number | string) => {
  const n = typeof id === 'number' && Number.isFinite(id) ? id : parseInt(String(id).replace(/\D/g, '').slice(-9), 10) || 0;
  return PALETTE[Math.abs(n) % PALETTE.length];
};

/* â”€â”€â”€ sort header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const SortTh: React.FC<{
  col: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  children: React.ReactNode;
  className?: string;
}> = ({ col, current, dir, onSort, children, className }) => {
  const active = current === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`sticky top-0 bg-gray-50 py-3 px-3 border-b border-gray-200 select-none cursor-pointer group ${className ?? ''}`}
    >
      <div className="flex items-center gap-1">
        <span className={`text-[11px] font-semibold uppercase tracking-widest transition-colors ${active ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-600'}`}>
          {children}
        </span>
        <span className="text-gray-300 group-hover:text-gray-400 transition-colors">
          {active
            ? (dir === 'asc' ? <ChevronUp size={12} className="text-primary-500" /> : <ChevronDown size={12} className="text-primary-500" />)
            : <ChevronUp size={12} className="opacity-30" />}
        </span>
      </div>
    </th>
  );
};

/* â”€â”€â”€ component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const Conductores: React.FC = () => {
  const navigate = useNavigate();
  const {
    conductores,
    vehicles,
    deleteConductor,
    updateConductor,
    addConductor,
    registrosBootstrapLoading,
    registrosBootstrapComplete,
  } = useRegistrosContext();
  const listBootstrapping = registrosBootstrapLoading && !registrosBootstrapComplete;

  const [q, setQ] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('TODOS');
  const [sortKey, setSortKey] = useState<SortKey>('vehicleId');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [editState, setEditState] = useState<ConductorEditState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [mesFiltro, setMesFiltro] = useState('');
  const [anioFiltro, setAnioFiltro] = useState('');
  const [showNuevoForm, setShowNuevoForm] = useState(false);
  const [nuevoForm, setNuevoForm] = useState(emptyNuevoConductorForm);
  const [nuevoError, setNuevoError] = useState('');
  const [nuevoBusy, setNuevoBusy] = useState(false);
  const [editSaveBusyId, setEditSaveBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);

  const filterInputs = useMemo(
    () => ({ q, estadoFilter, fechaDesde, fechaHasta, mesFiltro, anioFiltro }),
    [q, estadoFilter, fechaDesde, fechaHasta, mesFiltro, anioFiltro],
  );
  const { deferred: deferredFilters, isRecalculating } = useDeferredRecalc(filterInputs);

  const hasActiveFilters = estadoFilter !== 'TODOS' || fechaDesde || fechaHasta || mesFiltro || anioFiltro || q;

  const clearFilters = useCallback(() => {
    setEstadoFilter('TODOS');
    setFechaDesde('');
    setFechaHasta('');
    setMesFiltro('');
    setAnioFiltro('');
    setQ('');
  }, []);

  const vehicleMap = useMemo(() => {
    const m = new Map<number, (typeof vehicles)[0]>();
    vehicles.forEach((v) => m.set(v.id, v));
    return m;
  }, [vehicles]);

  const vehiclesSorted = useMemo(
    () => [...vehicles].sort((a, b) => a.id - b.id),
    [vehicles],
  );

  const toggleNuevoForm = useCallback(() => {
    setShowNuevoForm((was) => !was);
    setNuevoForm(emptyNuevoConductorForm());
    setNuevoError('');
  }, []);

  const handleNuevoSubmit = useCallback(async () => {
    if (nuevoBusy) return;
    setNuevoError('');
    const f = nuevoForm;
    if (!f.nombres.trim() || !f.apellidos.trim() || !f.numeroDocumento.trim() || !f.celular.trim()) {
      setNuevoError('Completa nombres, apellidos, número de documento y celular.');
      return;
    }
    const docFirm: boolean | null =
      f.documentoFirmado === 'unset' ? null : f.documentoFirmado === 'true';
    setNuevoBusy(true);
    try {
      const result = await addConductor({
        vehicleId: f.vehicleId.trim() === '' ? null : Number(f.vehicleId),
        tipoDocumento: f.tipoDocumento,
        numeroDocumento: f.numeroDocumento.trim(),
        nombres: f.nombres.trim(),
        apellidos: f.apellidos.trim(),
        celular: f.celular.trim(),
        domicilio: f.domicilio,
        estadoContrato: f.estadoContrato,
        estado: f.estado,
        statusOriginal: f.statusOriginal.trim() || null,
        cochera: f.cochera.trim() || null,
        numeroEmergencia: f.numeroEmergencia.trim() || null,
        direccion: f.direccion.trim() || null,
        documentoFirmado: docFirm,
        fechaVencimientoContrato: f.fechaVencimientoContrato.trim() || null,
        comentarios: f.comentarios.trim(),
      });
      if (!result) {
        setNuevoError('No se pudo guardar. Revisa los datos o la conexión con Supabase.');
        return;
      }
      setShowNuevoForm(false);
      setNuevoForm(emptyNuevoConductorForm());
      const d = conductorToDraft(result);
      setEditingDriverId(result.id);
      setEditState({ driverId: result.id, draft: d, baseline: d });
      setShowAdvanced(false);
      setEditError(null);
    } finally {
      setNuevoBusy(false);
    }
  }, [nuevoForm, addConductor]);

  const handleSort = useCallback((key: SortKey) => {
    setSortDir((prev) => (sortKey === key ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
    setSortKey(key);
  }, [sortKey]);

  const closeEdit = useCallback(() => {
    setEditingDriverId(null);
    setEditState(null);
    setEditError(null);
    setShowAdvanced(false);
  }, []);

  const openEdit = useCallback((c: Conductor) => {
    if (!isValidConductorId(c.id)) {
      setEditError('Este conductor no tiene un ID válido. No se puede editar en Supabase.');
      console.error('[conductores update] openEdit id inválido', {
        id: c.id,
        type: typeof c.id,
        conductor: c,
      });
      return;
    }
    const d = conductorToDraft(c);
    setEditingDriverId(c.id);
    setEditState({ driverId: c.id, draft: d, baseline: d });
    setEditError(null);
    setShowAdvanced(false);
  }, []);

  const handleEditClick = useCallback(
    (c: Conductor) => {
      if (editingDriverId === c.id) {
        closeEdit();
        return;
      }
      openEdit(c);
    },
    [editingDriverId, closeEdit, openEdit],
  );

  useEffect(() => {
    if (conductores.length > 0) logConductorIdDiagnostics(conductores);
  }, [conductores]);

  const handleSaveConductor = useCallback(
    async (id: string, d: ConductorEditDraft) => {
      if (editSaveBusyId === id) return;
      if (!isValidConductorId(id)) {
        console.error('[conductores update] UI guardó con id inválido', { id, type: typeof id });
        setEditError('Este conductor no tiene un ID válido. Recarga la página o revisa el registro en Supabase.');
        return;
      }
      const validationError = validateConductorDraft(d);
      if (validationError) {
        setEditError(validationError);
        return;
      }
      setEditSaveBusyId(id);
      setEditError(null);
      console.log('[conductores update]', { id, type: typeof id });
      try {
        const result = await updateConductor(id, draftToConductorPatch(d));
        if (result) {
          closeEdit();
        } else {
          console.error('[Conductores] updateConductor returned null', { id });
          setEditError('No se pudo guardar el conductor. Revisa la conexión o los datos.');
        }
      } catch (e) {
        console.error('[Conductores] updateConductor failed', { id, error: e });
        setEditError(e instanceof Error ? e.message : 'No se pudo guardar el conductor.');
      } finally {
        setEditSaveBusyId((cur) => (cur === id ? null : cur));
      }
    },
    [updateConductor, closeEdit],
  );

  const filtered = useMemo(() => {
    const s = deferredFilters.q.trim().toLowerCase();
    const list = conductores.filter((c) => {
      if (deferredFilters.estadoFilter !== 'TODOS' && c.estado !== deferredFilters.estadoFilter) return false;
      // fecha de registro (createdAt)
      if (deferredFilters.fechaDesde) {
        const d = c.createdAt.slice(0, 10);
        if (d < deferredFilters.fechaDesde) return false;
      }
      if (deferredFilters.fechaHasta) {
        const d = c.createdAt.slice(0, 10);
        if (d > deferredFilters.fechaHasta) return false;
      }
      if (deferredFilters.mesFiltro) {
        const m = c.createdAt.slice(5, 7);
        if (m !== deferredFilters.mesFiltro) return false;
      }
      if (deferredFilters.anioFiltro) {
        const y = c.createdAt.slice(0, 4);
        if (y !== deferredFilters.anioFiltro) return false;
      }
      if (!s) return true;
      const v = vehicleMap.get(c.vehicleId ?? -1);
      const haystack = [
        c.nombres,
        c.apellidos,
        c.numeroDocumento,
        c.celular,
        c.domicilio,
        c.estado,
        c.cochera,
        c.numeroEmergencia,
        c.direccion,
        String(c.vehicleId ?? ''),
        v ? `${v.marca} ${v.modelo} ${v.placa}` : '',
      ]
        .map((part) => cleanMojibakeText(part, { emptyAs: null }).toLowerCase())
        .filter(Boolean)
        .join(' ');
      return haystack.includes(s);
    });

    list.sort((a, b) => {
      let av = '', bv = '';
      if (sortKey === 'apellidos') { av = a.apellidos; bv = b.apellidos; }
      else if (sortKey === 'vehicleId') { av = String(a.vehicleId ?? 9999); bv = String(b.vehicleId ?? 9999); }
      else if (sortKey === 'estado') { av = a.estado; bv = b.estado; }
      else if (sortKey === 'cochera') { av = a.cochera ?? ''; bv = b.cochera ?? ''; }
      else if (sortKey === 'celular') { av = a.celular; bv = b.celular; }
      const cmp = av.localeCompare(bv, 'es', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [conductores, deferredFilters, sortKey, sortDir, vehicleMap]);

  const canShowEmpty = !listBootstrapping && !isRecalculating;

  const editingPanelRowIndex = useMemo(() => {
    if (editState == null) return -1;
    return filtered.findIndex((row) => row.id === editState.driverId);
  }, [filtered, editState]);

  const years = useMemo(() => {
    const ys = new Set<string>();
    conductores.forEach((c) => ys.add(c.createdAt.slice(0, 4)));
    return Array.from(ys).sort((a, b) => Number(b) - Number(a));
  }, [conductores]);

  const vigentes = useMemo(() => conductores.filter((c) => c.estado === 'VIGENTE').length, [conductores]);

  const chips: { label: string; value: number; color: string; filter: EstadoFilter }[] = [
    { label: 'Todos',       value: conductores.length,           color: 'bg-gray-100 text-gray-700',                             filter: 'TODOS' },
    { label: 'Vigentes',    value: vigentes,                      color: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', filter: 'VIGENTE' },
    { label: 'Suspendidos', value: conductores.length - vigentes, color: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',       filter: 'SUSPENDIDO' },
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-50 animate-fade-in overflow-hidden">

      {/* â”€â”€ HEADER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="shrink-0 bg-white border-b border-gray-100 shadow-soft px-4 sm:px-6 pt-4 pb-3 flex flex-col gap-3">
        {/* row 1 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => navigate('/operaciones')}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronLeft size={20} />
            </button>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">Conductores</h1>
              <p className="text-[11px] text-gray-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <RegistroCountLabel
                  count={conductores.length}
                  pending={listBootstrapping}
                  updating={isRecalculating}
                />
                <span>· Editar en cada fila · clic en columna para ordenar</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleNuevoForm}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors shadow-soft ${
              showNuevoForm
                ? 'bg-gray-700 hover:bg-gray-800 text-white'
                : 'bg-primary-500 hover:bg-primary-600 text-white'
            }`}
          >
            <UserPlus size={13} />
            <span className="hidden sm:inline">{showNuevoForm ? 'Cerrar' : 'Nuevo conductor'}</span>
            <span className="sm:hidden">{showNuevoForm ? '×' : '+'}</span>
          </button>
        </div>

        {/* row 2: chips + search */}
        <div className="flex items-center gap-2 flex-wrap">
          {chips.map((chip) => (
            <button key={chip.filter} type="button" onClick={() => setEstadoFilter(chip.filter)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${chip.color} ${estadoFilter === chip.filter ? 'ring-2 ring-primary-500 ring-offset-1' : ''}`}>
              {chip.label}
              <span className="font-bold tabular-nums">{chip.value}</span>
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            {/* filter toggle */}
            <button type="button" onClick={() => setShowFilters((p) => !p)}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                showFilters || fechaDesde || fechaHasta
                  ? 'bg-primary-50 text-primary-600 border-primary-200'
                  : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
              }`}>
              <Filter size={12} />
              Filtros
              {(fechaDesde || fechaHasta) && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
              )}
            </button>
            {/* clear all */}
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters}
                className="flex items-center gap-1 px-2 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 border border-gray-200 transition-all">
                <X size={12} /> Limpiar
              </button>
            )}
            {/* search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={13} />
              <input type="search" placeholder="Nombre, documento o carro" value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-8 pr-3 py-2 w-44 sm:w-60 rounded-xl border border-gray-200 bg-gray-50 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all" />
            </div>
          </div>
        </div>

        {/* â”€â”€ fecha filter panel â”€â”€ */}
        {showFilters && (
          <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-gray-100 animate-fade-in">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Registrado desde
              </label>
              <input type="date" value={fechaDesde} max={fechaHasta || todayStr()}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Registrado hasta
              </label>
              <input type="date" value={fechaHasta} min={fechaDesde} max={todayStr()}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Mes
              </label>
              <select
                value={mesFiltro}
                onChange={(e) => setMesFiltro(e.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
              >
                <option value="">Todos</option>
                {[
                  ['01', 'Enero'], ['02', 'Febrero'], ['03', 'Marzo'], ['04', 'Abril'],
                  ['05', 'Mayo'], ['06', 'Junio'], ['07', 'Julio'], ['08', 'Agosto'],
                  ['09', 'Septiembre'], ['10', 'Octubre'], ['11', 'Noviembre'], ['12', 'Diciembre'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Año
              </label>
              <select
                value={anioFiltro}
                onChange={(e) => setAnioFiltro(e.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
              >
                <option value="">Todos</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="text-[11px] text-gray-400 self-end pb-2">
              {fechaDesde || fechaHasta || mesFiltro || anioFiltro
                ? `Mostrando registros ${fechaDesde ? `desde ${formatDate(fechaDesde)}` : ''} ${fechaHasta ? `hasta ${formatDate(fechaHasta)}` : ''}${mesFiltro ? ` · mes ${mesFiltro}` : ''}${anioFiltro ? ` · año ${anioFiltro}` : ''}`
                : 'Sin filtro de fecha activo'}
            </div>
          </div>
        )}
      </div>

      {showNuevoForm && (
        <div className="shrink-0 mx-4 sm:mx-6 mt-2 mb-1 rounded-2xl border border-primary-100 bg-white shadow-soft px-4 py-4 animate-fade-in">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary-600 mb-3 flex items-center gap-2">
            <UserPlus size={12} /> Registrar conductor
          </p>
          {nuevoError && (
            <p className="text-xs text-red-600 mb-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2">{nuevoError}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Nombres</span>
              <input
                type="text"
                value={nuevoForm.nombres}
                onChange={(e) => setNuevoForm((p) => ({ ...p, nombres: e.target.value }))}
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Apellidos</span>
              <input
                type="text"
                value={nuevoForm.apellidos}
                onChange={(e) => setNuevoForm((p) => ({ ...p, apellidos: e.target.value }))}
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Tipo documento</span>
              <select
                value={nuevoForm.tipoDocumento}
                onChange={(e) =>
                  setNuevoForm((p) => ({ ...p, tipoDocumento: e.target.value as TipoDocumento }))
                }
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
              >
                {TIPO_DOC_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Número documento</span>
              <input
                type="text"
                value={nuevoForm.numeroDocumento}
                onChange={(e) => setNuevoForm((p) => ({ ...p, numeroDocumento: e.target.value }))}
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Celular</span>
              <input
                type="tel"
                value={nuevoForm.celular}
                onChange={(e) => setNuevoForm((p) => ({ ...p, celular: e.target.value }))}
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Domicilio</span>
              <select
                value={nuevoForm.domicilio}
                onChange={(e) =>
                  setNuevoForm((p) => ({ ...p, domicilio: e.target.value as TipoDomicilio }))
                }
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
              >
                {DOMICILIO_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Vehículo</span>
              <select
                value={nuevoForm.vehicleId}
                onChange={(e) => setNuevoForm((p) => ({ ...p, vehicleId: e.target.value }))}
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
              >
                <option value="">Sin vehículo asignado</option>
                {vehiclesSorted.map((v) => (
                  <option key={v.id} value={String(v.id)}>
                    #{v.id} · {v.placa} · {v.marca} {v.modelo}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Estado contrato</span>
              <select
                value={nuevoForm.estadoContrato}
                onChange={(e) =>
                  setNuevoForm((p) => ({
                    ...p,
                    estadoContrato: e.target.value as 'ABIERTO' | 'CERRADO',
                  }))
                }
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
              >
                <option value="ABIERTO">Abierto</option>
                <option value="CERRADO">Cerrado</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Estado conductor</span>
              <select
                value={nuevoForm.estado}
                onChange={(e) =>
                  setNuevoForm((p) => ({
                    ...p,
                    estado: e.target.value as 'VIGENTE' | 'SUSPENDIDO',
                  }))
                }
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
              >
                <option value="VIGENTE">Vigente</option>
                <option value="SUSPENDIDO">Suspendido</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Cochera</span>
              <input
                type="text"
                placeholder="Ej. Abierta / Cerrada"
                value={nuevoForm.cochera}
                onChange={(e) => setNuevoForm((p) => ({ ...p, cochera: e.target.value }))}
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Número de emergencia</span>
              <input
                type="text"
                value={nuevoForm.numeroEmergencia}
                onChange={(e) => setNuevoForm((p) => ({ ...p, numeroEmergencia: e.target.value }))}
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </label>
            <label className="block sm:col-span-2 lg:col-span-3">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Dirección</span>
              <input
                type="text"
                value={nuevoForm.direccion}
                onChange={(e) => setNuevoForm((p) => ({ ...p, direccion: e.target.value }))}
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Vencimiento contrato</span>
              <input
                type="date"
                value={nuevoForm.fechaVencimientoContrato}
                onChange={(e) => setNuevoForm((p) => ({ ...p, fechaVencimientoContrato: e.target.value }))}
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Doc. firmado</span>
              <select
                value={nuevoForm.documentoFirmado}
                onChange={(e) =>
                  setNuevoForm((p) => ({
                    ...p,
                    documentoFirmado: e.target.value as 'unset' | 'true' | 'false',
                  }))
                }
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
              >
                <option value="unset">Sin registrar</option>
                <option value="true">Sí, firmado</option>
                <option value="false">No firmado</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Status original (Excel)</span>
              <input
                type="text"
                value={nuevoForm.statusOriginal}
                onChange={(e) => setNuevoForm((p) => ({ ...p, statusOriginal: e.target.value }))}
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </label>
            <label className="block sm:col-span-2 lg:col-span-3">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Comentarios</span>
              <textarea
                rows={2}
                value={nuevoForm.comentarios}
                onChange={(e) => setNuevoForm((p) => ({ ...p, comentarios: e.target.value }))}
                className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none resize-y min-h-[2.5rem]"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-gray-100">
            <button
              type="button"
              disabled={nuevoBusy}
              onClick={() => void handleNuevoSubmit()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-500 text-white text-xs font-semibold hover:bg-primary-600 transition-colors shadow-soft disabled:opacity-50"
            >
              <Save size={14} /> {nuevoBusy ? 'Guardando…' : 'Guardar conductor'}
            </button>
            <button
              type="button"
              disabled={nuevoBusy}
              onClick={toggleNuevoForm}
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* â”€â”€ TABLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="relative flex-1 overflow-auto px-2 sm:px-4 py-2 min-h-[20rem]">
        <UpdatingChrome active={isRecalculating} />
        <table className="w-full min-w-[720px] text-xs border-separate border-spacing-0 content-enter transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
          <thead>
            <tr>
              <th className="sticky top-0 bg-gray-50 py-2 px-2 border-b border-gray-200 w-7 rounded-tl-xl" />
              <SortTh col="apellidos" current={sortKey} dir={sortDir} onSort={handleSort}>Conductor</SortTh>
              <th className="sticky top-0 bg-gray-50 py-2 px-2 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-left">Documento</th>
              <SortTh col="vehicleId" current={sortKey} dir={sortDir} onSort={handleSort}>Carro</SortTh>
              <SortTh col="celular"   current={sortKey} dir={sortDir} onSort={handleSort}>Contacto</SortTh>
              <SortTh col="cochera"   current={sortKey} dir={sortDir} onSort={handleSort}>Cochera</SortTh>
              <th className="sticky top-0 bg-gray-50 py-2 px-2 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-left">Registro</th>
              <SortTh col="estado" current={sortKey} dir={sortDir} onSort={handleSort}>
                Estado
              </SortTh>
              <th className="sticky top-0 bg-gray-50 py-2 px-2 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right rounded-tr-xl">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {listBootstrapping ? (
              <tr>
                <td colSpan={9} className="p-3">
                  <SkeletonTableRows rows={8} cols={5} />
                </td>
              </tr>
            ) : canShowEmpty && filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-gray-400">
                  <Search size={28} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">Sin resultados</p>
                  <p className="text-xs mt-1">Prueba con otro nombre, documento o número de carro</p>
                </td>
              </tr>
            ) : (
            filtered.map((c, idx) => {
              const v = vehicleMap.get(c.vehicleId ?? -1);
              const isVigente = c.estado === 'VIGENTE';
              const isEditingThisRow = editState?.driverId === c.id;
              const showEditPanel = isEditingThisRow && idx === editingPanelRowIndex;
              const hasChanges =
                showEditPanel && editState
                  ? !conductorDraftsEqual(editState.draft, editState.baseline)
                  : false;

              return (
                <React.Fragment key={`conductor-${c.id}`}>
                  <tr
                    className={`group transition-colors ${isEditingThisRow ? 'bg-primary-50/50' : 'hover:bg-white'}`}
                  >
                    {/* index */}
                    <td className={`py-2 px-2 text-[10px] text-gray-400 tabular-nums border-b ${isEditingThisRow ? 'border-transparent' : 'border-gray-100'}`}>
                      {idx + 1}
                    </td>

                    {/* avatar + name */}
                    <td className={`py-2 px-2 border-b ${isEditingThisRow ? 'border-transparent' : 'border-gray-100'}`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`shrink-0 w-8 h-8 rounded-full ${avatarBg(c.id)} flex items-center justify-center text-white text-[11px] font-bold`}>
                          {conductorDisplayInitials(c)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate max-w-[10rem] text-[13px]" title={formatConductorDisplayLabel(c)}>
                            {formatConductorDisplayLabel(c)}
                          </p>
                          <p className="text-[10px] text-gray-400">{displayConductorField(c.domicilio)}</p>
                        </div>
                      </div>
                    </td>

                    {/* documento */}
                    <td className={`py-2 px-2 border-b ${isEditingThisRow ? 'border-transparent' : 'border-gray-100'} whitespace-nowrap`}>
                      <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 mr-1">
                        {c.tipoDocumento}
                      </span>
                      <span className="font-mono text-xs text-gray-700">{displayConductorField(c.numeroDocumento)}</span>
                    </td>

                    {/* carro */}
                    <td className={`py-2 px-2 border-b ${isEditingThisRow ? 'border-transparent' : 'border-gray-100'} whitespace-nowrap`}>
                      {v ? (
                        <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
                          <span className="text-[11px] font-bold text-slate-700">#{v.id}</span>
                          <span className="text-[11px] text-slate-500 hidden sm:inline">{v.marca} {v.modelo}</span>
                          <span className="text-[10px] font-mono text-slate-400">{v.placa}</span>
                        </div>
                      ) : <span className="text-xs text-gray-300">{'\u2014'}</span>}
                    </td>

                    <td className={`py-2 px-2 border-b ${isEditingThisRow ? 'border-transparent' : 'border-gray-100'} whitespace-nowrap`}>
                      <span className="text-[11px] font-mono text-gray-700">{displayConductorField(c.celular)}</span>
                    </td>

                    <td className={`py-2 px-2 border-b ${isEditingThisRow ? 'border-transparent' : 'border-gray-100'}`}>
                      {c.cochera && displayConductorField(c.cochera) !== '\u2014' && displayConductorField(c.cochera) !== '-' ? (
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
                            cleanMojibakeText(c.cochera, { emptyAs: null }).toLowerCase().includes('abierta')
                              ? 'bg-sky-50 text-sky-700'
                              : 'bg-slate-50 text-slate-600'
                          }`}
                        >
                          {displayConductorField(c.cochera)}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">{'\u2014'}</span>
                      )}
                    </td>
                    <td className={`py-2 px-2 border-b ${isEditingThisRow ? 'border-transparent' : 'border-gray-100'} whitespace-nowrap text-[11px] text-gray-600`}>
                      {formatDate(c.createdAt.slice(0, 10))}
                    </td>

                    {/* estado */}
                    <td className={`py-2 px-2 border-b ${isEditingThisRow ? 'border-transparent' : 'border-gray-100'} whitespace-nowrap`}>
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full ${
                        isVigente ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isVigente ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                        {isVigente ? 'VIGENTE' : 'SUSPENDIDO'}
                      </span>
                    </td>

                    <td className={`py-2 px-2 border-b ${isEditingThisRow ? 'border-transparent' : 'border-gray-100'} text-right`}>
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          title="Editar"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditClick(c);
                          }}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isEditingThisRow
                              ? 'bg-primary-100 text-primary-700'
                              : 'text-gray-500 hover:bg-gray-100 hover:text-primary-600'
                          }`}
                        >
                          <Pencil size={13} />
                        </button>
                        <a
                          href={whatsappHref(c.celular)}
                          target="_blank"
                          rel="noreferrer"
                          title="WhatsApp"
                          className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                        >
                          <MessageCircle size={13} />
                        </a>
                        <a
                          href={telHref(c.celular)}
                          title="Llamar"
                          className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-50 transition-colors"
                        >
                          <Phone size={13} />
                        </a>
                        <button
                          type="button"
                          title="Eliminar"
                          disabled={deleteBusyId === c.id || editSaveBusyId === c.id}
                          onClick={() => {
                            void (async () => {
                              setDeleteBusyId(c.id);
                              try {
                                const ok = await deleteConductor(c.id);
                                if (ok) closeEdit();
                              } finally {
                                setDeleteBusyId((cur) => (cur === c.id ? null : cur));
                              }
                            })();
                          }}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                        >
                          {deleteBusyId === c.id ? (
                            <Loader2 size={13} className="animate-spin" aria-hidden />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {showEditPanel && editState && (
                    <tr className="bg-primary-50/30">
                      <td />
                      <td colSpan={8} className="px-3 pb-3 pt-1 border-b border-primary-100">
                        <ConductorEditPanel
                          draft={editState.draft}
                          vehiclesSorted={vehiclesSorted}
                          saving={editSaveBusyId === c.id}
                          hasChanges={hasChanges}
                          error={editError}
                          showAdvanced={showAdvanced}
                          onToggleAdvanced={() => setShowAdvanced((p) => !p)}
                          onChange={(patch) =>
                            setEditState((prev) =>
                              prev ? { ...prev, draft: { ...prev.draft, ...patch } } : prev,
                            )
                          }
                          onCancel={closeEdit}
                          onSave={() => void handleSaveConductor(c.id, editState.draft)}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })
            )}
          </tbody>
        </table>
      </div>

      {/* â”€â”€ FOOTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="shrink-0 bg-white border-t border-gray-100 px-6 py-2 flex items-center justify-between text-[11px] text-gray-400">
        <span className="flex flex-wrap items-center gap-1">
          {listBootstrapping ? (
            <span className="inline-block h-3.5 w-48 rounded-md shimmer-bg" aria-hidden />
          ) : (
            <>
              Mostrando <strong className="text-gray-700">{filtered.length}</strong> de {conductores.length} conductores
              {q && <span className="ml-1">{'\u00b7'} filtrado por "<span className="text-primary-500">{q}</span>"</span>}
              {isRecalculating ? <span className="text-indigo-500/80 font-medium">· actualizando</span> : null}
            </>
          )}
        </span>
        <span className="hidden sm:block">SYSTEM Excel {'\u00b7'} CONDUCTORES</span>
      </div>
    </div>
  );
};

export default Conductores;
