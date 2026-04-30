import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import { calculateKPIs, calculateVehicleRentability } from '../../utils/calculations';
import { ingresoMontoPEN } from '../../utils/moneda';
import { formatCurrency, todayStr, isExpiringSoon, isExpired } from '../../utils/formatting';
import { TrendingUp, TrendingDown, AlertTriangle, ChevronRight } from 'lucide-react';
import OperativeAlertsPanel from '../../components/Dashboard/OperativeAlertsPanel';
import { buildOperativeAlerts } from '../../utils/buildOperativeAlerts';

interface MissionCard {
  title: string;
  description: string;
  emoji: string;
  gradient: string;
  border: string;
  ring: string;
  path: string;
  tag?: string;
}

const missions: MissionCard[] = [
  {
    title: 'Finanzas',
    description: 'Ingresos, Gastos, Reportes',
    emoji: '💰',
    gradient: 'from-emerald-500/10 to-teal-500/10',
    border: 'border-emerald-200 hover:border-emerald-400',
    ring: 'focus:ring-emerald-300',
    path: '/finanzas',
  },
  {
    title: 'Vehículos',
    description: 'Inventario, Rentabilidad',
    emoji: '🚗',
    gradient: 'from-blue-500/10 to-indigo-500/10',
    border: 'border-blue-200 hover:border-blue-400',
    ring: 'focus:ring-blue-300',
    path: '/vehiculos',
  },
  {
    title: 'Operaciones',
    description: 'Mantenimiento, Docs, Conductores',
    emoji: '🔧',
    gradient: 'from-amber-500/10 to-orange-500/10',
    border: 'border-amber-200 hover:border-amber-400',
    ring: 'focus:ring-amber-300',
    path: '/operaciones',
  },
  {
    title: 'Reportes',
    description: 'Análisis, Exportar',
    emoji: '📊',
    gradient: 'from-purple-500/10 to-pink-500/10',
    border: 'border-purple-200 hover:border-purple-400',
    ring: 'focus:ring-purple-300',
    path: '/reportes',
  },
  {
    title: 'Logros',
    description: 'Desbloqueos, Estadísticas',
    emoji: '⭐',
    gradient: 'from-yellow-400/10 to-amber-500/10',
    border: 'border-yellow-200 hover:border-yellow-400',
    ring: 'focus:ring-yellow-300',
    path: '/logros',
    tag: 'Nuevo',
  },
  {
    title: 'Configuración',
    description: 'Perfil, Empresa, Notificaciones',
    emoji: '⚙️',
    gradient: 'from-gray-400/10 to-gray-500/10',
    border: 'border-gray-200 hover:border-gray-400',
    ring: 'focus:ring-gray-300',
    path: '/configuracion',
  },
];

const Inicio: React.FC = () => {
  const navigate = useNavigate();
  const { ingresos, gastos, descuentos, vehicles, documentaciones, controlFechas } = useRegistrosContext();
  const { open } = useDrawer();

  const todayIngresos = ingresos.filter(i => i.fecha === todayStr()).reduce((s, i) => s + ingresoMontoPEN(i), 0);
  const todayGastos = gastos.filter(g => g.fecha === todayStr()).reduce((s, g) => s + g.monto, 0);
  const todayDescuentos = descuentos.filter(d => d.fecha === todayStr()).reduce((s, d) => s + d.monto, 0);
  const todayMargen = todayIngresos - todayGastos + todayDescuentos;

  const kpis = useMemo(() => calculateKPIs(ingresos, gastos, descuentos), [ingresos, gastos, descuentos]);
  const topVehicles = useMemo(
    () => calculateVehicleRentability(vehicles, ingresos, gastos, descuentos).slice(0, 3),
    [vehicles, ingresos, gastos, descuentos],
  );

  const alerts = useMemo(() => {
    const count: string[] = [];
    documentaciones.forEach(d => {
      ['soat', 'rtParticular', 'rtDetaxi', 'afocatTaxi'].forEach(key => {
        const date = d[key as keyof typeof d] as string;
        if (date && (isExpired(date) || isExpiringSoon(date, 30))) {
          const v = vehicles.find(v => v.id === d.vehicleId);
          count.push(`${v?.marca ?? ''} ${v?.modelo ?? ''} — ${key.toUpperCase()}`);
        }
      });
    });
    return count;
  }, [documentaciones, vehicles]);

  const operativeAlerts = useMemo(
    () => buildOperativeAlerts(ingresos, controlFechas, vehicles),
    [ingresos, controlFechas, vehicles],
  );

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero — centrado, tono “cerebro / sistema inteligente” */}
      <header className="flex flex-col items-center text-center gap-3 px-1">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-primary-50/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-primary-600 sm:text-[11px]">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
          </span>
          Sistema inteligente · Hub central
        </span>
        <h1 className="max-w-xl text-3xl font-extrabold tracking-tight text-gray-900 sm:max-w-2xl sm:text-4xl">
          <span className="text-gradient">LA MONEDA</span>
          <span className="mt-1 block text-xl font-bold text-gray-800 sm:mt-2 sm:text-2xl">
            Cerebro de tu flota
          </span>
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-gray-500 sm:text-base">
          Finanzas, vehículos y documentos en un solo tablero. Menos Excel, más control en tiempo real.
        </p>
        <time
          className="inline-flex items-center rounded-full border border-gray-100 bg-white px-4 py-2 text-xs font-medium text-gray-500 shadow-soft sm:text-sm"
          dateTime={new Date().toISOString().slice(0, 10)}
        >
          {new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </time>
      </header>

      {/* Daily summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white shadow-soft-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-emerald-100 text-sm font-medium">Ingresos HOY</span>
            <TrendingUp size={18} className="text-emerald-200" />
          </div>
          <p className="text-3xl font-bold">{formatCurrency(todayIngresos)}</p>
          <button onClick={() => open('income')} className="mt-3 text-xs text-emerald-100 hover:text-white flex items-center gap-1 transition-colors">
            + Registrar ingreso <ChevronRight size={12} />
          </button>
        </div>

        <div className="bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl p-5 text-white shadow-soft-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-red-100 text-sm font-medium">Gastos HOY</span>
            <TrendingDown size={18} className="text-red-200" />
          </div>
          <p className="text-3xl font-bold">{formatCurrency(todayGastos)}</p>
          <button onClick={() => open('expense')} className="mt-3 text-xs text-red-100 hover:text-white flex items-center gap-1 transition-colors">
            + Registrar gasto <ChevronRight size={12} />
          </button>
        </div>

        <div className={`bg-gradient-to-br rounded-2xl p-5 text-white shadow-soft-md
          ${todayMargen >= 0 ? 'from-primary-500 to-secondary-500' : 'from-gray-600 to-gray-700'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-indigo-100 text-sm font-medium">Margen HOY</span>
            <span className="text-xl">{todayMargen >= 0 ? '✨' : '📉'}</span>
          </div>
          <p className="text-3xl font-bold">{formatCurrency(todayMargen)}</p>
          <p className="mt-3 text-xs text-indigo-200">
            {kpis.totalIngresos > 0
              ? `${((todayMargen / Math.max(todayIngresos, 1)) * 100).toFixed(0)}% de rentabilidad hoy`
              : 'Sin movimientos hoy'}
          </p>
        </div>
      </div>

      <OperativeAlertsPanel alerts={operativeAlerts} className="animate-fade-in" />

      {/* Alert banner */}
      {alerts.length > 0 && (
        <div
          className="flex items-start gap-3 bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 cursor-pointer hover:border-amber-400 transition-colors animate-bounce-in"
          onClick={() => navigate('/operaciones/docs')}
        >
          <AlertTriangle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">
              ⚠️ {alerts.length} documento{alerts.length > 1 ? 's' : ''} por vencer o vencido{alerts.length > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">Haz click aquí para revisar</p>
          </div>
          <ChevronRight size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
        </div>
      )}

      {/* 6 Mission buttons */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">Accesos principales</h2>
          <p className="mt-1 text-sm text-gray-500">Selecciona el módulo que deseas gestionar.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {missions.map((mission) => (
            <button
              key={mission.path}
              onClick={() => navigate(mission.path)}
              className={`
                mission-btn bg-gradient-to-br ${mission.gradient}
                border-2 ${mission.border} focus:ring-4 ${mission.ring}
                group text-left
              `}
            >
              {mission.tag && (
                <span className="absolute top-3 right-3 bg-primary-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {mission.tag}
                </span>
              )}
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform duration-300 inline-block">
                {mission.emoji}
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">{mission.title}</h3>
              <p className="text-sm text-gray-500">{mission.description}</p>
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-gray-400 group-hover:text-primary-500 transition-colors">
                Ir a {mission.title} <ChevronRight size={14} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom info: Monthly summary + Top vehicles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Monthly summary */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
            <span>📈</span> Resumen del Mes
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Ingresos</span>
              <span className="text-sm font-bold text-emerald-600">{formatCurrency(kpis.totalIngresos)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Gastos</span>
              <span className="text-sm font-bold text-red-500">{formatCurrency(kpis.totalGastos)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Rebajes (descuentos)</span>
              <span className="text-sm font-bold text-amber-700">{formatCurrency(kpis.totalDescuentos)}</span>
            </div>
            <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-gray-700">Margen Neto</span>
              <span className={`text-base font-bold ${kpis.margenNeto >= 0 ? 'text-primary-600' : 'text-red-600'}`}>
                {formatCurrency(kpis.margenNeto)}
                <span className="text-xs ml-1 font-normal text-gray-400">
                  ({kpis.totalIngresos > 0 ? ((kpis.margenNeto / kpis.totalIngresos) * 100).toFixed(1) : 0}%)
                </span>
              </span>
            </div>
          </div>
          <button
            onClick={() => navigate('/reportes')}
            className="mt-4 w-full text-center text-xs font-medium text-primary-500 hover:text-primary-700 transition-colors"
          >
            Ver análisis completo →
          </button>
        </div>

        {/* Top 3 vehicles */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
            <span>🏆</span> Top 3 Vehículos
          </h3>
          {topVehicles.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin datos disponibles</p>
          ) : (
            <div className="space-y-3">
              {topVehicles.map((v, i) => (
                <div
                  key={v.vehicle.id}
                  className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded-xl p-2 -mx-2 transition-colors"
                  onClick={() => navigate(`/vehiculos/${v.vehicle.id}`)}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0
                    ${i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-gray-400' : 'bg-amber-600'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {v.vehicle.marca} {v.vehicle.modelo}
                    </p>
                    <p className="text-xs text-gray-400">{v.vehicle.placa}</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 flex-shrink-0">
                    {formatCurrency(v.margen)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => navigate('/vehiculos')}
            className="mt-4 w-full text-center text-xs font-medium text-primary-500 hover:text-primary-700 transition-colors"
          >
            Ver todos los vehículos →
          </button>
        </div>
      </div>
    </div>
  );
};

export default Inicio;
