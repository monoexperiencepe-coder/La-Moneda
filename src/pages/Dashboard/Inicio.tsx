import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, X, ChevronLeft, ArrowRight, Zap, Command } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import { ingresoMontoPEN } from '../../utils/moneda';
import { formatCurrency, todayStr } from '../../utils/formatting';
import { computeTodayReview, DIAS_ALERTA_SIN_INGRESO } from '../../utils/fleetPanel';

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

/* ─── Acciones rápidas ───────────────────────────────────────────────────── */
const buildQuickActions = (open: (t: 'income' | 'expense') => void, navigate: (p: string) => void) => [
  {
    emoji: '💵', label: '+ Ingreso', hint: 'Registrar cobro',
    cls: 'border-emerald-200 bg-gradient-to-br from-white to-emerald-50/80 text-emerald-950',
    glow: 'hover:shadow-[0_4px_20px_rgba(16,185,129,0.18)]',
    action: () => open('income'),
  },
  {
    emoji: '💸', label: '+ Gasto', hint: 'Registrar salida',
    cls: 'border-rose-200 bg-gradient-to-br from-white to-rose-50/80 text-rose-950',
    glow: 'hover:shadow-[0_4px_20px_rgba(244,63,94,0.18)]',
    action: () => open('expense'),
  },
  {
    emoji: '🛠️', label: '+ Kilometraje', hint: 'Control de km',
    cls: 'border-slate-200 bg-gradient-to-br from-white to-slate-50/80 text-slate-900',
    glow: 'hover:shadow-[0_4px_20px_rgba(100,116,139,0.18)]',
    action: () => navigate('/operaciones/mantenimiento'),
  },
  {
    emoji: '📋', label: '+ Vencimiento', hint: 'Documento / fecha',
    cls: 'border-amber-200 bg-gradient-to-br from-white to-amber-50/80 text-amber-950',
    glow: 'hover:shadow-[0_4px_20px_rgba(245,158,11,0.18)]',
    action: () => navigate('/operaciones/docs'),
  },
  {
    emoji: '📌', label: '+ Pendiente', hint: 'Tarea operativa',
    cls: 'border-violet-200 bg-gradient-to-br from-white to-violet-50/80 text-violet-950',
    glow: 'hover:shadow-[0_4px_20px_rgba(139,92,246,0.18)]',
    action: () => navigate('/operaciones/pendientes'),
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
  const [searchParams, setSearchParams] = useSearchParams();
  const viewAlertas = searchParams.get('view') === 'alertas';

  const { ingresos, gastos, vehicles, controlFechas, pendientes, getVehicleLabel } = useRegistrosContext();
  const { open } = useDrawer();

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
    () => gastos.filter((g) => g.fecha === todayStr()).reduce((s, g) => s + g.monto, 0),
    [gastos],
  );

  /* Alertas */
  const cobrosPendientes = useMemo(
    () => ingresos.filter((i) => (i.estadoPago ?? '').toUpperCase() === 'PENDIENTE'),
    [ingresos],
  );
  const queRevisar = useMemo(
    () => computeTodayReview(vehicles, controlFechas, ingresos, pendientes),
    [vehicles, controlFechas, ingresos, pendientes],
  );
  const totalAlertas = useMemo(
    () =>
      cobrosPendientes.length +
      queRevisar.vencidosCount +
      queRevisar.porVencerCount +
      queRevisar.sinIngresoCount +
      queRevisar.pendientesAltaActivosCount,
    [cobrosPendientes, queRevisar],
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

  const hoyLabel = useMemo(
    () => new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }),
    [],
  );

  /* Datos para vista alertas */
  const cobrosLines = useMemo(
    () => cobrosPendientes.slice(0, 3).map((i) =>
      `${getVehicleLabel(i.vehicleId)} · ${formatCurrency(ingresoMontoPEN(i))} · ${i.fecha}`),
    [cobrosPendientes, getVehicleLabel],
  );
  const vencidosLines  = useMemo(() => queRevisar.muestraVencidos.slice(0, 3).map((it) => `${it.placa} · ${it.detail}`), [queRevisar]);
  const porVencerLines = useMemo(() => queRevisar.muestraPorVencer.slice(0, 3).map((it) => `${it.placa} · ${it.detail}`), [queRevisar]);
  const sinIngresoLines = useMemo(() => queRevisar.muestraSinIngreso.slice(0, 3).map((it) => `${it.placa} · ${it.detail}`), [queRevisar]);
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

  const quickActions = useMemo(() => buildQuickActions(open, navigate), [open, navigate]);

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
              {totalAlertas > 0
                ? `${totalAlertas} alerta${totalAlertas !== 1 ? 's' : ''} activa${totalAlertas !== 1 ? 's' : ''}`
                : 'Sin alertas — todo al día'}
            </p>
          </div>
        </div>

        <WorkBlock title="Cobros pendientes" count={cobrosPendientes.length}
          subtitle="Ingresos con estado de pago pendiente" lines={cobrosLines}
          onVer={() => navigate('/finanzas/ingresos?cobro=pendiente')} accent="amber" />
        <WorkBlock title="Documentos vencidos" count={queRevisar.vencidosCount}
          subtitle="Control de fechas ya vencidos" lines={vencidosLines}
          onVer={() => navigate('/operaciones/docs?doc=vencidos')} accent="red" />
        <WorkBlock title="Documentos por vencer" count={queRevisar.porVencerCount}
          subtitle="Vencen en los próximos 30 días" lines={porVencerLines}
          onVer={() => navigate('/operaciones/docs?doc=porvencer')} accent="amber" />
        <WorkBlock title="Sin ingresos recientes" count={queRevisar.sinIngresoCount}
          subtitle={`Sin ingreso hace más de ${queRevisar.sinIngresoUmbralDias} días`} lines={sinIngresoLines}
          onVer={() => navigate('/operaciones?flota=sinIngreso')} accent="orange" />
        <WorkBlock title="Pendientes · alta prioridad" count={queRevisar.pendientesAltaActivosCount}
          subtitle="Abierto o en curso · prioridad alta" lines={pendientesAltaLines}
          onVer={() => navigate('/operaciones/pendientes?prioridad=ALTA&activos=1')} accent="violet" />

        <p className="text-[10px] text-gray-400 pb-2 pt-1">
          Umbrales: sin ingreso &gt;{DIAS_ALERTA_SIN_INGRESO} d · docs próximos ≤30 d
        </p>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════
     VISTA PRINCIPAL
  ════════════════════════════════════════════════════════════════════ */
  return (
    <div className="animate-fade-in max-w-lg mx-auto pb-12 space-y-4">

      {/* ── STATUS BAR ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 capitalize">
          {hoyLabel}
        </p>
        <p className="text-[11px] font-mono text-gray-500 tabular-nums">
          <span className="text-emerald-600 font-bold">{formatCurrency(todayIngresos)}</span>
          <span className="mx-1.5 text-gray-300">·</span>
          <span className="text-rose-500 font-bold">{formatCurrency(todayGastos)}</span>
          <span className="ml-1.5 text-gray-400">hoy</span>
        </p>
      </div>

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

      {/* ── QUÉ HACER HOY ──────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => {
          const next = new URLSearchParams(searchParams);
          next.set('view', 'alertas');
          setSearchParams(next, { replace: true });
        }}
        className={`w-full rounded-2xl border px-5 py-4 text-left transition-all duration-150
          hover:-translate-y-0.5 active:translate-y-0
          ${totalAlertas > 0
            ? 'bg-gradient-to-r from-rose-50 via-orange-50/60 to-amber-50/40 border-rose-200 hover:shadow-[0_4px_20px_rgba(244,63,94,0.12)]'
            : 'bg-gradient-to-r from-emerald-50 via-teal-50/60 to-green-50/40 border-emerald-200 hover:shadow-[0_4px_20px_rgba(16,185,129,0.12)]'
          }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Dot de estado */}
            <span className="relative flex h-3 w-3 shrink-0">
              {totalAlertas > 0 && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
              )}
              <span className={`relative inline-flex h-3 w-3 rounded-full ${
                totalAlertas > 0 ? 'bg-rose-500' : 'bg-emerald-500'
              }`} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black text-gray-900 tracking-tight">Qué hacer hoy</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {totalAlertas > 0
                  ? `${totalAlertas} alerta${totalAlertas !== 1 ? 's' : ''} activa${totalAlertas !== 1 ? 's' : ''}`
                  : 'Cobros · docs · pendientes'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {totalAlertas > 0 ? (
              <span className="rounded-full bg-rose-100 border border-rose-200 px-2.5 py-1 text-xs font-black text-rose-700 tabular-nums">
                {totalAlertas}
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700">
                OK
              </span>
            )}
            <ArrowRight size={14} className="text-gray-400" />
          </div>
        </div>
      </button>

      {/* ── ACCIONES RÁPIDAS ───────────────────────────────────────────── */}
      <div>
        <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 pl-0.5">
          <Zap size={10} className="text-gray-400" />
          Acciones rápidas
        </p>
        <div className="grid grid-cols-2 gap-2.5">
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
