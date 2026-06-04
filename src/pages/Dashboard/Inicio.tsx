import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X, ChevronLeft, ArrowRight, Zap, Command } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { ingresoMontoPEN } from '../../utils/moneda';
import { formatDate, todayStr } from '../../utils/formatting';
import { useAmountDisplay } from '../../hooks/useAmountDisplay';
import { gastosOperativosSolamente } from '../../utils/cajaNegocio';
import { computeTodayReview, DIAS_ALERTA_SIN_INGRESO } from '../../utils/fleetPanel';
import { KM_ALERTA_VARIACION_DESDE_MANT } from '../../utils/kmMantenimientoControl';
import SmartClock from '../../components/Common/SmartClock';
import HomeRecentRecordsModal, {
  type HomeRecentModalKind,
} from '../../components/Dashboard/HomeRecentRecordsModal';
import { REGISTROS_ACCESOS, filterRegistrosAccesos } from '../../config/registrosAccesos';
import { useAuth } from '../../context/AuthContext';
import { permissionUserFromAuth } from '../../utils/permissions';
import PendientesEquipoHoyBlock from '../../components/pendientes/PendientesEquipoHoyBlock';
import { countPendientesEquipoActivos } from '../../utils/pendienteModel';

/* ─── Módulos (buscador + accesos) ──────────────────────────────────────── */
const MODULE_ITEMS = [
  { label: 'Finanzas',      emoji: '💰', path: '/finanzas',                 type: 'module' as const },
  { label: 'Operaciones',   emoji: '⚙️', path: '/operaciones',              type: 'module' as const },
  { label: 'Vehículos',     emoji: '🚗', path: '/vehiculos',                type: 'module' as const },
  { label: 'Reportes',      emoji: '📊', path: '/reportes',                 type: 'module' as const },
  { label: 'Ingresos',      emoji: '💵', path: '/finanzas/ingresos',        type: 'module' as const },
  { label: 'Gastos',        emoji: '💸', path: '/finanzas/gastos',          type: 'module' as const },
  { label: 'Pendientes',    emoji: '📌', path: '/operaciones/pendientes',   type: 'module' as const },
  { label: 'Documentación', emoji: '📋', path: '/operaciones/docs',         type: 'module' as const },
  { label: 'Conductores',   emoji: '👤', path: '/operaciones/conductores',  type: 'module' as const },
  { label: 'Mantenimiento', emoji: '🔧', path: '/operaciones/mantenimiento',type: 'module' as const },
  { label: 'Resumen',       emoji: '📈', path: '/finanzas/resumen',         type: 'module' as const },
  { label: 'Configuración', emoji: '⚙️', path: '/configuracion',            type: 'module' as const },
];

/* ─── Módulos principales ────────────────────────────────────────────────── */
const MODULES = [
  {
    emoji: '💰', label: 'Finanzas', hint: 'Ingresos · gastos · reportes',
    path: '/finanzas', accent: 'border-l-emerald-500',
    glow: 'hover:shadow-[0_4px_20px_rgba(16,185,129,0.15)]',
  },
  {
    emoji: '⚙️', label: 'Operaciones', hint: 'Flota · docs · pendientes',
    path: '/operaciones', accent: 'border-l-amber-500',
    glow: 'hover:shadow-[0_4px_20px_rgba(245,158,11,0.15)]',
  },
  {
    emoji: '🚗', label: 'Vehículos', hint: 'Inventario · detalle · km',
    path: '/vehiculos', accent: 'border-l-sky-500',
    glow: 'hover:shadow-[0_4px_20px_rgba(14,165,233,0.15)]',
  },
  {
    emoji: '📊', label: 'Reportes', hint: 'Análisis · exportar',
    path: '/reportes', accent: 'border-l-violet-500',
    glow: 'hover:shadow-[0_4px_20px_rgba(139,92,246,0.15)]',
  },
];

/* ─── WorkBlock (vista alertas) ──────────────────────────────────────────── */
const ACCENT_COLORS: Record<string, string> = {
  amber:  'bg-amber-500',
  red:    'bg-red-500',
  orange: 'bg-orange-500',
  violet: 'bg-violet-500',
};

const WorkBlock: React.FC<{
  title: string;
  count: number;
  subtitle?: string;
  lines: string[];
  onVer: () => void;
  accent?: keyof typeof ACCENT_COLORS;
}> = ({ title, count, subtitle, lines, onVer, accent = 'amber' }) => (
  <section className="rounded-2xl border border-gray-100 bg-white shadow-soft overflow-hidden">
    <div className={`h-[3px] ${ACCENT_COLORS[accent]}`} />
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">{title}</p>
          <p className="mt-1 text-3xl font-black tabular-nums leading-none text-gray-900">{count}</p>
          {subtitle && <p className="mt-1 text-[11px] text-gray-400">{subtitle}</p>}
          {count === 0 && (
            <p className="mt-2 text-xs font-semibold text-emerald-600">✓ Todo al día</p>
          )}
          {lines.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {lines.map((line, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600 truncate">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                  <span className="truncate">{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={onVer}
          className="shrink-0 flex items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-gray-700 transition-colors"
        >
          Ver <ArrowRight size={11} />
        </button>
      </div>
    </div>
  </section>
);

/* ══════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════════════════════════════════ */
const Inicio: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewAlertas = searchParams.get('view') === 'alertas';

  const {
    ingresos,
    gastos,
    vehicles,
    conductores,
    controlFechas,
    pendientes,
    getVehicleLabel,
    kilometrajes,
  } = useRegistrosContext();
  const { formatGlobalAmount, formatRecordAmount, canViewGlobal, canViewRecordAmount } =
    useAmountDisplay();

  const [recentModal, setRecentModal] = useState<HomeRecentModalKind | null>(null);

  const openRecentModal = (kind: HomeRecentModalKind) => {
    if (import.meta.env.DEV) {
      console.warn('[home:recent-modal:open]', { kind });
    }
    setRecentModal(kind);
  };

  /* Búsqueda */
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current  && !inputRef.current.contains(e.target as Node)
      ) setFocused(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* Totales del día */
  const todayIngresos = useMemo(
    () => ingresos.filter((i) => i.fecha === todayStr()).reduce((s, i) => s + ingresoMontoPEN(i), 0),
    [ingresos],
  );
  const todayGastos = useMemo(
    () =>
      gastosOperativosSolamente(gastos)
        .filter((g) => g.fecha === todayStr())
        .reduce((s, g) => s + g.monto, 0),
    [gastos],
  );

  /* Alertas */
  const queRevisar = useMemo(
    () => computeTodayReview(vehicles, controlFechas, ingresos, pendientes, DIAS_ALERTA_SIN_INGRESO, kilometrajes),
    [vehicles, controlFechas, ingresos, pendientes, kilometrajes],
  );
  /** Solo alertas automáticas (sin pendientes manuales del equipo). */
  const totalAlertasAutomaticas = useMemo(
    () =>
      queRevisar.vencidosCount +
      queRevisar.porVencerCount +
      queRevisar.sinIngresoCount +
      queRevisar.kmMantVariacionAlertCount,
    [queRevisar],
  );
  const pendientesEquipoActivas = useMemo(
    () => countPendientesEquipoActivos(pendientes),
    [pendientes],
  );

  /* Sugerencias del buscador */
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MODULE_ITEMS;
    const mods = MODULE_ITEMS.filter((m) => m.label.toLowerCase().includes(q));
    const vehs = vehicles
      .filter(
        (v) =>
          v.placa.toLowerCase().includes(q) ||
          v.marca.toLowerCase().includes(q) ||
          v.modelo.toLowerCase().includes(q),
      )
      .slice(0, 6)
      .map((v) => ({
        label: `${v.placa} — ${v.marca} ${v.modelo}`,
        emoji: '🚗',
        path: `/vehiculos/${v.id}`,
        type: 'vehicle' as const,
      }));
    return [...vehs, ...mods.slice(0, 4)];
  }, [query, vehicles]);

  const handleSelect = (path: string) => {
    setQuery('');
    setFocused(false);
    navigate(path);
  };

  /* Datos para vista alertas */
  const vencidosLines  = useMemo(() => queRevisar.muestraVencidos.slice(0, 3).map((it) => `${it.placa} · ${it.detail}`), [queRevisar]);
  const porVencerLines = useMemo(() => queRevisar.muestraPorVencer.slice(0, 3).map((it) => `${it.placa} · ${it.detail}`), [queRevisar]);
  const sinIngresoLines = useMemo(() => queRevisar.muestraSinIngreso.slice(0, 3).map((it) => `${it.placa} · ${it.detail}`), [queRevisar]);
  const kmVariacionLines = useMemo(
    () => queRevisar.muestraKmMantVariacion.slice(0, 3).map((it) => `${it.placa} · ${it.detail}`),
    [queRevisar],
  );
  const pendientesAltaLines = useMemo(
    () => queRevisar.muestraPendientesAlta.slice(0, 3).map((p) => {
      const v = p.vehicleId != null ? vehicles.find((x) => x.id === p.vehicleId) : null;
      const unit = v ? v.placa : p.vehicleId != null ? `#${p.vehicleId}` : 'General';
      const short = p.descripcion.length > 72 ? `${p.descripcion.slice(0, 72)}…` : p.descripcion;
      return `${unit} · ${short}`;
    }),
    [queRevisar, vehicles],
  );

  const goBack = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('view');
    setSearchParams(next, { replace: true });
  };

  const quickActions = useMemo(() => {
    const items = filterRegistrosAccesos(REGISTROS_ACCESOS, permissionUserFromAuth(user, profile?.email));
    return items.map((item) => ({
      emoji: item.emoji,
      label: item.quickLabel,
      hint: item.hint,
      cls: item.quickCls,
      glow: item.quickGlow,
      action: () => navigate(item.path),
    }));
  }, [navigate, user, profile?.email]);

  /* ════════════════════════════════════════════════════════════════════
     VISTA: QUÉ HACER HOY
  ════════════════════════════════════════════════════════════════════ */
  if (viewAlertas) {
    return (
      <div className="animate-fade-in max-w-2xl mx-auto pb-10 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={goBack}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="Volver"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-black text-gray-900 tracking-tight">Qué hacer hoy</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {totalAlertasAutomaticas} alerta{totalAlertasAutomaticas !== 1 ? 's' : ''} automática
              {totalAlertasAutomaticas !== 1 ? 's' : ''}
              {pendientesEquipoActivas > 0
                ? ` · ${pendientesEquipoActivas} pendiente${pendientesEquipoActivas !== 1 ? 's' : ''} activa${pendientesEquipoActivas !== 1 ? 's' : ''}`
                : ''}
            </p>
          </div>
        </div>

        <PendientesEquipoHoyBlock
          pendientes={pendientes}
          vehicles={vehicles}
          conductores={conductores}
          getVehicleLabel={(id) => getVehicleLabel(id == null ? null : Number(id))}
          compact
          className="max-h-[260px]"
          onVer={() => navigate('/operaciones/pendientes?tab=hoy')}
        />

        <WorkBlock title="Documentos vencidos" count={queRevisar.vencidosCount}
          subtitle="Control de fechas ya vencidos" lines={vencidosLines}
          onVer={() => navigate('/operaciones/docs?doc=vencidos')} accent="red" />
        <WorkBlock title="Documentos por vencer" count={queRevisar.porVencerCount}
          subtitle="Vencen en los próximos 30 días" lines={porVencerLines}
          onVer={() => navigate('/operaciones/docs?doc=porvencer')} accent="amber" />
        <WorkBlock title="Sin ingresos recientes" count={queRevisar.sinIngresoCount}
          subtitle={`Sin ingreso hace más de ${queRevisar.sinIngresoUmbralDias} días`} lines={sinIngresoLines}
          onVer={() => navigate('/operaciones?flota=sinIngreso')} accent="orange" />
        <WorkBlock
          title="Km sin mantenimiento"
          count={queRevisar.kmMantVariacionAlertCount}
          subtitle={`Variación ≥ ${KM_ALERTA_VARIACION_DESDE_MANT.toLocaleString('es-PE')} km desde el último mantenimiento registrado`}
          lines={kmVariacionLines}
          onVer={() => navigate('/operaciones/mantenimiento')}
          accent="red"
        />
        <WorkBlock title="Pendientes · alta prioridad" count={queRevisar.pendientesAltaActivosCount}
          subtitle="Abierto o en curso · prioridad alta" lines={pendientesAltaLines}
          onVer={() => navigate('/operaciones/pendientes?prioridad=ALTA&activos=1')} accent="violet" />

        <p className="text-[10px] text-gray-400 pb-2 pt-1">
          Umbrales: sin ingreso &gt;{DIAS_ALERTA_SIN_INGRESO} d · docs próximos ≤30 d · km mant. ≥
          {KM_ALERTA_VARIACION_DESDE_MANT.toLocaleString('es-PE')} km
        </p>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════
     VISTA PRINCIPAL
  ════════════════════════════════════════════════════════════════════ */
  return (
    <div className="animate-fade-in max-w-lg mx-auto pb-12 space-y-4">

      {/* ── RELOJ ──────────────────────────────────────────────────────── */}
      <div className="pt-1">
        <SmartClock variant="hero" className="w-full" />
      </div>

      {/* ── RESUMEN DEL DÍA (montos) ───────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => openRecentModal('ingreso')}
          className="flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-100 px-2.5 py-1.5 shadow-sm cursor-pointer transition-colors hover:bg-emerald-100/80 hover:border-emerald-200 active:scale-[0.98]"
          aria-label="Ver ingresos recientes"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">Hoy · Ing.</span>
          <span className="text-xs font-bold text-emerald-900 tabular-nums">{formatGlobalAmount(todayIngresos)}</span>
        </button>
        <button
          type="button"
          onClick={() => openRecentModal('gasto')}
          className="flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-100 px-2.5 py-1.5 shadow-sm cursor-pointer transition-colors hover:bg-rose-100/80 hover:border-rose-200 active:scale-[0.98]"
          aria-label="Ver gastos recientes"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
          <span className="text-[10px] font-semibold text-rose-700 uppercase tracking-wide">Hoy · Gas.</span>
          <span className="text-xs font-bold text-rose-900 tabular-nums">{formatGlobalAmount(todayGastos)}</span>
        </button>
      </div>

      <HomeRecentRecordsModal
        isOpen={recentModal != null}
        kind={recentModal ?? 'ingreso'}
        onClose={() => setRecentModal(null)}
        ingresos={ingresos}
        gastos={gastos}
        conductores={conductores}
        getVehicleLabel={(id) => getVehicleLabel(id == null ? null : Number(id))}
        formatGlobalAmount={formatGlobalAmount}
        formatRecordAmount={formatRecordAmount}
        canViewGlobal={canViewGlobal}
        canViewRecordAmount={canViewRecordAmount}
      />

      {/* ── COMMAND BAR ────────────────────────────────────────────────── */}
      <div className="relative">
        <div
          className={`relative flex items-center rounded-2xl transition-all duration-200 ${
            focused
              ? 'shadow-[0_0_0_3px_rgba(79,70,229,0.12),0_4px_16px_rgba(79,70,229,0.1)]'
              : 'shadow-soft hover:shadow-soft-md'
          }`}
        >
          <Search
            size={15}
            className={`absolute left-4 transition-colors duration-150 ${focused ? 'text-primary-500' : 'text-gray-400'}`}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder="Buscar placa, módulo, conductor…"
            className={`w-full rounded-2xl border bg-white py-3.5 pl-10 pr-12 text-sm font-medium transition-all duration-200 focus:outline-none placeholder-gray-400
              ${focused ? 'border-primary-400' : 'border-gray-200 hover:border-gray-300'}`}
            autoComplete="off"
            spellCheck={false}
          />
          {query ? (
            <button
              type="button"
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="absolute right-4 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Borrar"
            >
              <X size={14} />
            </button>
          ) : (
            <span className="absolute right-4 flex items-center gap-0.5 text-[10px] text-gray-300 select-none pointer-events-none">
              <Command size={9} />K
            </span>
          )}
        </div>

        {/* ── Dropdown palette ── */}
        {focused && suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-50 mt-2 w-full rounded-2xl border border-gray-100 bg-white shadow-soft-lg overflow-hidden animate-scale-in"
          >
            {/* Header del dropdown */}
            <div className="px-4 pt-3 pb-2 border-b border-gray-50">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">
                {query ? 'Resultados' : 'Accesos directos'}
              </p>
            </div>
            <ul className="py-1 max-h-72 overflow-y-auto">
              {(() => {
                let lastType: string | null = null;
                return suggestions.map((s, i) => {
                  const showSection = s.type !== lastType && i > 0 && query;
                  lastType = s.type;
                  return (
                    <React.Fragment key={`${s.path}-${i}`}>
                      {showSection && (
                        <li className="px-4 pt-2 pb-1">
                          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">
                            {s.type === 'vehicle' ? 'Vehículos' : 'Módulos'}
                          </span>
                        </li>
                      )}
                      <li>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSelect(s.path)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-primary-50/70 transition-colors group"
                        >
                          <span className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-base shrink-0 group-hover:bg-white">
                            {s.emoji}
                          </span>
                          <span className="flex-1 font-medium text-gray-800 truncate">{s.label}</span>
                          <ArrowRight size={12} className="text-gray-300 group-hover:text-primary-400 transition-colors shrink-0" />
                        </button>
                      </li>
                    </React.Fragment>
                  );
                });
              })()}
            </ul>
          </div>
        )}
      </div>

      {/* ── MÓDULOS 2×2 ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {MODULES.map((m) => (
          <button
            key={m.path}
            type="button"
            onClick={() => navigate(m.path)}
            className={`group relative overflow-hidden rounded-2xl border border-gray-100 bg-white
              border-l-4 ${m.accent} px-4 py-4 text-left
              shadow-soft transition-all duration-150
              hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]
              ${m.glow}`}
          >
            <span className="text-[26px] leading-none">{m.emoji}</span>
            <p className="mt-2 text-[14px] font-bold text-gray-900 leading-tight">{m.label}</p>
            <p className="mt-0.5 text-[11px] text-gray-400 leading-snug">{m.hint}</p>
            <ArrowRight
              size={12}
              className="absolute right-3 bottom-3 text-gray-300 transition-all duration-150 group-hover:text-gray-500 group-hover:translate-x-0.5"
            />
          </button>
        ))}
      </div>

      {/* ── QUÉ HACER HOY ─────────────────────────────────────────────── */}
      <div className="space-y-4 w-full">
        <button
          type="button"
          onClick={() => {
            const next = new URLSearchParams(searchParams);
            next.set('view', 'alertas');
            setSearchParams(next, { replace: true });
          }}
          className="w-full min-h-[110px] rounded-[24px] border border-[rgba(244,63,94,0.12)] p-6 text-left shadow-soft
            transition-shadow hover:shadow-[0_4px_20px_rgba(244,63,94,0.08)] active:scale-[0.995]"
          style={{
            background: 'linear-gradient(180deg, rgba(255,248,248,1) 0%, rgba(255,252,250,1) 100%)',
          }}
          aria-label="Qué hacer hoy"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="relative flex h-3 w-3 shrink-0">
                {totalAlertasAutomaticas > 0 && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
                )}
                <span
                  className={`relative inline-flex h-3 w-3 rounded-full ${
                    totalAlertasAutomaticas > 0 ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-gray-900 tracking-tight">Qué hacer hoy</p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  {totalAlertasAutomaticas > 0
                    ? `${totalAlertasAutomaticas} alerta${totalAlertasAutomaticas !== 1 ? 's' : ''} automática${totalAlertasAutomaticas !== 1 ? 's' : ''}`
                    : 'Alertas automáticas al día'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {totalAlertasAutomaticas > 0 ? (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 tabular-nums">
                  {totalAlertasAutomaticas} auto
                </span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  OK
                </span>
              )}
              <ArrowRight size={14} className="text-slate-400" />
            </div>
          </div>
        </button>

        {/* ── PENDIENTES DEL EQUIPO ─────────────────────────────────────── */}
        <PendientesEquipoHoyBlock
          pendientes={pendientes}
          vehicles={vehicles}
          conductores={conductores}
          getVehicleLabel={(id) => getVehicleLabel(id == null ? null : Number(id))}
          onVer={() => navigate('/operaciones/pendientes')}
        />
      </div>

      {/* ── ACCIONES RÁPIDAS ───────────────────────────────────────────── */}
      <div className="mt-6">
        <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 pl-0.5">
          <Zap size={10} className="text-gray-400" />
          Acciones rápidas
        </p>
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2.5">
          {quickActions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.action}
              className={`group rounded-2xl border px-3.5 py-3.5 text-left
                shadow-soft transition-all duration-150
                hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]
                ${a.cls} ${a.glow}`}
            >
              <span className="text-[22px] leading-none">{a.emoji}</span>
              <p className="mt-2 text-[14px] font-black leading-tight">{a.label}</p>
              <p className="mt-0.5 text-[11px] opacity-55 leading-snug">{a.hint}</p>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
};

export default Inicio;
