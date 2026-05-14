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
  ChevronRight,
  MessageCircle,
  MapPin,
  AlertCircle,
  FileCheck,
  CalendarClock,
  Filter,
  X,
  Save,
  Loader2,
} from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatDate, todayStr } from '../../utils/formatting';
import { conductorDisplayInitials, formatConductorDisplayLabel } from '../../utils/fleetPanel';
import type { Conductor, TipoDocumento, TipoDomicilio } from '../../data/types';

/* ─── types ─────────────────────────────────────────────────────────────── */
type EstadoFilter = 'TODOS' | 'VIGENTE' | 'SUSPENDIDO';
type SortKey = 'apellidos' | 'vehicleId' | 'estado' | 'cochera' | 'celular';
type SortDir = 'asc' | 'desc';

type ConductorEditDraft = {
  nombres: string;
  apellidos: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  domicilio: TipoDomicilio;
  vehicleId: string;
  estadoContrato: 'ABIERTO' | 'CERRADO';
  celular: string;
  cochera: string;
  direccion: string;
  numeroEmergencia: string;
  fechaVencimientoContrato: string;
  documentoFirmado: 'unset' | 'true' | 'false';
  comentarios: string;
  estado: 'VIGENTE' | 'SUSPENDIDO';
  statusOriginal: string;
};

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

function conductorToDraft(c: Conductor): ConductorEditDraft {
  return {
    nombres: c.nombres ?? '',
    apellidos: c.apellidos ?? '',
    tipoDocumento: c.tipoDocumento,
    numeroDocumento: c.numeroDocumento ?? '',
    domicilio: c.domicilio,
    vehicleId: c.vehicleId != null ? String(c.vehicleId) : '',
    estadoContrato: c.estadoContrato,
    celular: c.celular ?? '',
    cochera: c.cochera ?? '',
    direccion: c.direccion ?? '',
    numeroEmergencia: c.numeroEmergencia ?? '',
    fechaVencimientoContrato: c.fechaVencimientoContrato ?? '',
    documentoFirmado:
      c.documentoFirmado === true ? 'true' : c.documentoFirmado === false ? 'false' : 'unset',
    comentarios: c.comentarios ?? '',
    estado: c.estado,
    statusOriginal: c.statusOriginal ?? '',
  };
}

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

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const PALETTE = [
  'bg-violet-600', 'bg-sky-600', 'bg-emerald-600', 'bg-amber-500',
  'bg-rose-600',   'bg-indigo-600', 'bg-teal-600',   'bg-pink-600',
];
const avatarBg = (id: number | string) => {
  const n = typeof id === 'number' && Number.isFinite(id) ? id : parseInt(String(id).replace(/\D/g, '').slice(-9), 10) || 0;
  return PALETTE[Math.abs(n) % PALETTE.length];
};

function whatsappHref(phone: string) {
  const digits = phone.replace(/\D/g, '');
  const num = digits.startsWith('51') ? digits : `51${digits}`;
  return `https://wa.me/${num}`;
}

/* ─── sort header ─────────────────────────────────────────────────────────── */
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

/* ─── component ─────────────────────────────────────────────────────────── */
const Conductores: React.FC = () => {
  const navigate = useNavigate();
  const { conductores, vehicles, deleteConductor, updateConductor, addConductor } = useRegistrosContext();

  const [q, setQ] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('TODOS');
  const [sortKey, setSortKey] = useState<SortKey>('vehicleId');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ConductorEditDraft | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [mesFiltro, setMesFiltro] = useState('');
  const [anioFiltro, setAnioFiltro] = useState('');
  const [showNuevoForm, setShowNuevoForm] = useState(false);
  const [nuevoForm, setNuevoForm] = useState(emptyNuevoConductorForm);
  const [nuevoError, setNuevoError] = useState('');
  const [nuevoBusy, setNuevoBusy] = useState(false);
  const [editSaveBusyId, setEditSaveBusyId] = useState<number | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);

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
      setExpandedId(result.id);
    } finally {
      setNuevoBusy(false);
    }
  }, [nuevoForm, addConductor]);

  const handleSort = useCallback((key: SortKey) => {
    setSortDir((prev) => (sortKey === key ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
    setSortKey(key);
  }, [sortKey]);

  const toggleExpand = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  useEffect(() => {
    if (expandedId == null) {
      setDraft(null);
      return;
    }
    const c = conductores.find((x) => x.id === expandedId);
    if (!c) {
      setExpandedId(null);
      setDraft(null);
      return;
    }
    setDraft(conductorToDraft(c));
  }, [expandedId, conductores]);

  const handleSaveConductor = useCallback(
    async (id: number, d: ConductorEditDraft) => {
      setEditSaveBusyId(id);
      try {
        const docFirm: boolean | null =
          d.documentoFirmado === 'unset' ? null : d.documentoFirmado === 'true';
        await updateConductor(id, {
          nombres: d.nombres.trim(),
          apellidos: d.apellidos.trim(),
          tipoDocumento: d.tipoDocumento,
          numeroDocumento: d.numeroDocumento.trim(),
          domicilio: d.domicilio,
          vehicleId: d.vehicleId.trim() === '' ? null : Number(d.vehicleId),
          estadoContrato: d.estadoContrato,
          celular: d.celular.trim(),
          cochera: d.cochera.trim() || null,
          direccion: d.direccion.trim() || null,
          numeroEmergencia: d.numeroEmergencia.trim() || null,
          fechaVencimientoContrato: d.fechaVencimientoContrato.trim() || null,
          documentoFirmado: docFirm,
          comentarios: d.comentarios.trim(),
          estado: d.estado,
          statusOriginal: d.statusOriginal.trim() || null,
        });
      } finally {
        setEditSaveBusyId((cur) => (cur === id ? null : cur));
      }
    },
    [updateConductor],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = conductores.filter((c) => {
      if (estadoFilter !== 'TODOS' && c.estado !== estadoFilter) return false;
      // fecha de registro (createdAt)
      if (fechaDesde) {
        const d = c.createdAt.slice(0, 10);
        if (d < fechaDesde) return false;
      }
      if (fechaHasta) {
        const d = c.createdAt.slice(0, 10);
        if (d > fechaHasta) return false;
      }
      if (mesFiltro) {
        const m = c.createdAt.slice(5, 7);
        if (m !== mesFiltro) return false;
      }
      if (anioFiltro) {
        const y = c.createdAt.slice(0, 4);
        if (y !== anioFiltro) return false;
      }
      if (!s) return true;
      const v = vehicleMap.get(c.vehicleId ?? -1);
      return [c.nombres, c.apellidos, c.numeroDocumento, c.celular, c.domicilio,
              c.estado, c.cochera, c.numeroEmergencia, c.direccion,
              String(c.vehicleId ?? ''), v ? `${v.marca} ${v.modelo} ${v.placa}` : '']
        .filter(Boolean).join(' ').toLowerCase().includes(s);
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
  }, [conductores, q, estadoFilter, fechaDesde, fechaHasta, mesFiltro, anioFiltro, sortKey, sortDir, vehicleMap]);

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

      {/* ── HEADER ─────────────────────────────────────────────────── */}
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
              <p className="text-[11px] text-gray-400">{conductores.length} registros · clic en fila para detalles · clic en columna para ordenar</p>
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
              <input type="search" placeholder="Nombre, doc, carro…" value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-8 pr-3 py-2 w-44 sm:w-60 rounded-xl border border-gray-200 bg-gray-50 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all" />
            </div>
          </div>
        </div>

        {/* ── fecha filter panel ── */}
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

      {/* ── TABLE ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-2 sm:px-4 py-2">
        <table className="w-full min-w-[720px] text-xs border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky top-0 bg-gray-50 py-2 px-2 border-b border-gray-200 w-7 rounded-tl-xl" />
              <SortTh col="apellidos" current={sortKey} dir={sortDir} onSort={handleSort}>Conductor</SortTh>
              <th className="sticky top-0 bg-gray-50 py-2 px-2 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-left">Documento</th>
              <SortTh col="vehicleId" current={sortKey} dir={sortDir} onSort={handleSort}>Carro</SortTh>
              <SortTh col="celular"   current={sortKey} dir={sortDir} onSort={handleSort}>Contacto</SortTh>
              <SortTh col="cochera"   current={sortKey} dir={sortDir} onSort={handleSort}>Cochera</SortTh>
              <th className="sticky top-0 bg-gray-50 py-2 px-2 border-b border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-left">Registro</th>
              <SortTh col="estado"    current={sortKey} dir={sortDir} onSort={handleSort} className="rounded-tr-xl">Estado</SortTh>
              <th className="sticky top-0 bg-gray-50 py-2 px-2 border-b border-gray-200 w-7 rounded-tr-xl" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, idx) => {
              const v = vehicleMap.get(c.vehicleId ?? -1);
              const isVigente = c.estado === 'VIGENTE';
              const isExpanded = expandedId === c.id;

              return (
                <React.Fragment key={c.id}>
                  {/* ── main row ── */}
                  <tr
                    onClick={() => toggleExpand(c.id)}
                    className={`group cursor-pointer transition-colors ${isExpanded ? 'bg-primary-50/60' : 'hover:bg-white'}`}
                  >
                    {/* index */}
                    <td className={`py-2 px-2 text-[10px] text-gray-400 tabular-nums border-b ${isExpanded ? 'border-transparent' : 'border-gray-100'}`}>
                      {idx + 1}
                    </td>

                    {/* avatar + name */}
                    <td className={`py-2 px-2 border-b ${isExpanded ? 'border-transparent' : 'border-gray-100'}`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`shrink-0 w-8 h-8 rounded-full ${avatarBg(c.id)} flex items-center justify-center text-white text-[11px] font-bold`}>
                          {conductorDisplayInitials(c)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate max-w-[10rem] text-[13px]" title={formatConductorDisplayLabel(c)}>
                            {formatConductorDisplayLabel(c)}
                          </p>
                          <p className="text-[10px] text-gray-400">{c.domicilio}</p>
                        </div>
                      </div>
                    </td>

                    {/* documento */}
                    <td className={`py-2 px-2 border-b ${isExpanded ? 'border-transparent' : 'border-gray-100'} whitespace-nowrap`}>
                      <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 mr-1">
                        {c.tipoDocumento}
                      </span>
                      <span className="font-mono text-xs text-gray-700">{c.numeroDocumento}</span>
                    </td>

                    {/* carro */}
                    <td className={`py-2 px-2 border-b ${isExpanded ? 'border-transparent' : 'border-gray-100'} whitespace-nowrap`}>
                      {v ? (
                        <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
                          <span className="text-[11px] font-bold text-slate-700">#{v.id}</span>
                          <span className="text-[11px] text-slate-500 hidden sm:inline">{v.marca} {v.modelo}</span>
                          <span className="text-[10px] font-mono text-slate-400">{v.placa}</span>
                        </div>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>

                    {/* contacto: phone + whatsapp */}
                    <td className={`py-2 px-2 border-b ${isExpanded ? 'border-transparent' : 'border-gray-100'} whitespace-nowrap`}>
                      <div className="flex items-center gap-2">
                        <a href={`tel:${c.celular}`} onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-[11px] font-mono text-sky-600 hover:text-sky-800 hover:underline">
                          <Phone size={10} />{c.celular}
                        </a>
                        <a href={whatsappHref(c.celular)} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                          title="WhatsApp">
                          <MessageCircle size={12} />
                        </a>
                      </div>
                    </td>

                    {/* cochera */}
                    <td className={`py-2 px-2 border-b ${isExpanded ? 'border-transparent' : 'border-gray-100'}`}>
                      {c.cochera
                        ? <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
                            c.cochera.toLowerCase().includes('abierta')
                              ? 'bg-sky-50 text-sky-700'
                              : 'bg-slate-50 text-slate-600'
                          }`}>{c.cochera}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className={`py-2 px-2 border-b ${isExpanded ? 'border-transparent' : 'border-gray-100'} whitespace-nowrap text-[11px] text-gray-600`}>
                      {formatDate(c.createdAt.slice(0, 10))}
                    </td>

                    {/* estado */}
                    <td className={`py-2 px-2 border-b ${isExpanded ? 'border-transparent' : 'border-gray-100'} whitespace-nowrap`}>
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full ${
                        isVigente ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isVigente ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                        {isVigente ? 'VIGENTE' : 'SUSPENDIDO'}
                      </span>
                    </td>

                    {/* expand chevron */}
                    <td className={`py-2 px-2 border-b ${isExpanded ? 'border-transparent' : 'border-gray-100'} text-right`}>
                      <span className={`text-gray-400 transition-transform duration-200 inline-block ${isExpanded ? 'rotate-90' : ''}`}>
                        <ChevronRight size={14} />
                      </span>
                    </td>
                  </tr>

                  {/* ── expanded: edición + acciones ── */}
                  {isExpanded && draft && (
                    <tr className="bg-primary-50/40" onClick={(e) => e.stopPropagation()}>
                      <td />
                      <td colSpan={8} className="px-4 pb-4 pt-3 border-b border-primary-100">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-primary-600 mb-3 flex items-center gap-2">
                          <FileCheck size={12} /> Editar conductor
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          <label className="block">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Nombres</span>
                            <input
                              type="text"
                              value={draft.nombres}
                              onChange={(e) => setDraft((p) => (p ? { ...p, nombres: e.target.value } : p))}
                              className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Apellidos</span>
                            <input
                              type="text"
                              value={draft.apellidos}
                              onChange={(e) => setDraft((p) => (p ? { ...p, apellidos: e.target.value } : p))}
                              className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Tipo documento</span>
                            <select
                              value={draft.tipoDocumento}
                              onChange={(e) =>
                                setDraft((p) =>
                                  p ? { ...p, tipoDocumento: e.target.value as TipoDocumento } : p,
                                )
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
                              value={draft.numeroDocumento}
                              onChange={(e) => setDraft((p) => (p ? { ...p, numeroDocumento: e.target.value } : p))}
                              className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Domicilio</span>
                            <select
                              value={draft.domicilio}
                              onChange={(e) =>
                                setDraft((p) =>
                                  p ? { ...p, domicilio: e.target.value as TipoDomicilio } : p,
                                )
                              }
                              className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            >
                              {DOMICILIO_OPTS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </label>
                          <label className="block sm:col-span-2 lg:col-span-1">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Vehículo</span>
                            <select
                              value={draft.vehicleId}
                              onChange={(e) => setDraft((p) => (p ? { ...p, vehicleId: e.target.value } : p))}
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
                              value={draft.estadoContrato}
                              onChange={(e) =>
                                setDraft((p) =>
                                  p
                                    ? {
                                        ...p,
                                        estadoContrato: e.target.value as 'ABIERTO' | 'CERRADO',
                                      }
                                    : p,
                                )
                              }
                              className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            >
                              <option value="ABIERTO">Abierto</option>
                              <option value="CERRADO">Cerrado</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Celular</span>
                            <input
                              type="tel"
                              value={draft.celular}
                              onChange={(e) => setDraft((p) => (p ? { ...p, celular: e.target.value } : p))}
                              className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                          </label>
                          <label className="block sm:col-span-2 lg:col-span-1">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                              <AlertCircle size={10} /> Número de emergencia
                            </span>
                            <input
                              type="text"
                              placeholder="Nombre y teléfono de contacto"
                              value={draft.numeroEmergencia}
                              onChange={(e) => setDraft((p) => (p ? { ...p, numeroEmergencia: e.target.value } : p))}
                              className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                          </label>
                          <label className="block sm:col-span-2">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                              <MapPin size={10} /> Dirección
                            </span>
                            <input
                              type="text"
                              value={draft.direccion}
                              onChange={(e) => setDraft((p) => (p ? { ...p, direccion: e.target.value } : p))}
                              className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Cochera</span>
                            <input
                              type="text"
                              placeholder="Ej. Abierta / Cerrada"
                              value={draft.cochera}
                              onChange={(e) => setDraft((p) => (p ? { ...p, cochera: e.target.value } : p))}
                              className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                              <CalendarClock size={10} /> Vencimiento contrato
                            </span>
                            <input
                              type="date"
                              value={draft.fechaVencimientoContrato}
                              onChange={(e) => setDraft((p) => (p ? { ...p, fechaVencimientoContrato: e.target.value } : p))}
                              className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Doc. firmado</span>
                            <select
                              value={draft.documentoFirmado}
                              onChange={(e) =>
                                setDraft((p) =>
                                  p
                                    ? {
                                        ...p,
                                        documentoFirmado: e.target.value as ConductorEditDraft['documentoFirmado'],
                                      }
                                    : p,
                                )
                              }
                              className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            >
                              <option value="unset">Sin registrar</option>
                              <option value="true">Sí, firmado</option>
                              <option value="false">No firmado</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Estado conductor</span>
                            <select
                              value={draft.estado}
                              onChange={(e) =>
                                setDraft((p) =>
                                  p ? { ...p, estado: e.target.value as 'VIGENTE' | 'SUSPENDIDO' } : p,
                                )
                              }
                              className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            >
                              <option value="VIGENTE">Vigente</option>
                              <option value="SUSPENDIDO">Suspendido</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Status original (Excel)</span>
                            <input
                              type="text"
                              value={draft.statusOriginal}
                              onChange={(e) => setDraft((p) => (p ? { ...p, statusOriginal: e.target.value } : p))}
                              className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none"
                            />
                          </label>
                          <label className="block sm:col-span-2 lg:col-span-3">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Comentarios</span>
                            <textarea
                              rows={2}
                              value={draft.comentarios}
                              onChange={(e) => setDraft((p) => (p ? { ...p, comentarios: e.target.value } : p))}
                              className="mt-1 w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none resize-y min-h-[2.5rem]"
                            />
                          </label>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-primary-100/60">
                          <button
                            type="button"
                            disabled={editSaveBusyId === c.id || deleteBusyId === c.id}
                            onClick={() => void handleSaveConductor(c.id, draft)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-500 text-white text-xs font-semibold hover:bg-primary-600 transition-colors shadow-soft disabled:opacity-50"
                          >
                            {editSaveBusyId === c.id ? (
                              <Loader2 size={14} className="animate-spin shrink-0" aria-hidden />
                            ) : (
                              <Save size={14} />
                            )}
                            {editSaveBusyId === c.id ? 'Guardando…' : 'Guardar cambios'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDraft(conductorToDraft(c))}
                            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            Deshacer edición
                          </button>
                          <a
                            href={whatsappHref(draft.celular || c.celular)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium text-emerald-600 hover:bg-emerald-50 border border-emerald-100 transition-colors"
                          >
                            <MessageCircle size={12} /> WhatsApp
                          </a>
                          <a
                            href={`tel:${draft.celular || c.celular}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium text-sky-600 hover:bg-sky-50 border border-sky-100 transition-colors"
                          >
                            <Phone size={12} /> Llamar
                          </a>
                          <button
                            type="button"
                            disabled={deleteBusyId === c.id || editSaveBusyId === c.id}
                            onClick={() => {
                              void (async () => {
                                setDeleteBusyId(c.id);
                                try {
                                  const ok = await deleteConductor(c.id);
                                  if (ok) setExpandedId(null);
                                } finally {
                                  setDeleteBusyId((cur) => (cur === c.id ? null : cur));
                                }
                              })();
                            }}
                            className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium text-red-500 hover:bg-red-50 border border-red-100 transition-colors disabled:opacity-50"
                          >
                            {deleteBusyId === c.id ? (
                              <Loader2 size={12} className="animate-spin shrink-0" aria-hidden />
                            ) : (
                              <Trash2 size={12} />
                            )}
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Search size={28} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">Sin resultados</p>
            <p className="text-xs mt-1">Prueba con otro nombre, documento o número de carro</p>
          </div>
        )}
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-t border-gray-100 px-6 py-2 flex items-center justify-between text-[11px] text-gray-400">
        <span>
          Mostrando <strong className="text-gray-700">{filtered.length}</strong> de {conductores.length} conductores
          {q && <span className="ml-1">· filtrado por "<span className="text-primary-500">{q}</span>"</span>}
        </span>
        <span className="hidden sm:block">SYSTEM Excel · CONDUCTORES</span>
      </div>
    </div>
  );
};

export default Conductores;
