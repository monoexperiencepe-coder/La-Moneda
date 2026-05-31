import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import {
  formatGlobalGastosDisplay,
  formatGlobalIngresosDisplay,
} from '../../utils/financialGlobalKpis';
import { resolveGastosGlobalTotalState } from '../../utils/gastosFinancialSummary';
import {
  sumUtilidadHistoricaTotal,
  UTILIDAD_HISTORICA_TOOLTIP,
} from '../../utils/utilidadOperativa';
import SmartClock from '../../components/Common/SmartClock';
import { useAmountDisplay } from '../../hooks/useAmountDisplay';

/** Ocultar resultado neto en hub hasta que la data operativa esté ordenada. */
const SHOW_RESULTADO_NETO_EN_HUB = false;

type HubCardOption = {
  id: string;
  title: string;
  desc: string;
  emoji: string;
  path: string;
  gradient: string;
  border: string;
  stat?: string;
  statColor?: string;
  statTitle?: string;
};

const FinanzasHub: React.FC = () => {
  const navigate = useNavigate();
  const { formatGlobalAmount, canViewGlobal } = useAmountDisplay();
  const {
    ingresos,
    gastos,
    gastosFinancialSummary,
    gastosLoadScope,
    isLoadingGastosSummary,
    cajaNegocioVehiculo,
  } = useRegistrosContext();
  const localGastosTotal = useMemo(() => gastos.reduce((s, g) => s + g.monto, 0), [gastos]);
  const gastosGlobalState = useMemo(
    () =>
      resolveGastosGlobalTotalState(
        gastosFinancialSummary,
        localGastosTotal,
        gastos.length,
        gastosLoadScope,
        isLoadingGastosSummary,
      ),
    [gastosFinancialSummary, localGastosTotal, gastos.length, gastosLoadScope, isLoadingGastosSummary],
  );
  const totalGastosTabla = canViewGlobal
    ? formatGlobalGastosDisplay(gastosGlobalState, formatGlobalAmount)
    : formatGlobalAmount(0);
  const totalIngresosTabla = canViewGlobal
    ? formatGlobalIngresosDisplay(ingresos, formatGlobalAmount)
    : formatGlobalAmount(0);
  const utilidadHistoricaDisplay = formatGlobalAmount(sumUtilidadHistoricaTotal(cajaNegocioVehiculo));
  const gastosSourceLabel =
    gastosGlobalState.source === 'rpc' ? 'BD' : gastosGlobalState.source === 'loading' ? '' : 'Vista rápida';

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('[FinanzasHub] gastos source', {
      source: gastosGlobalState.source,
      total: gastosGlobalState.total,
      local: localGastosTotal,
      summary: gastosFinancialSummary?.totalGastos ?? null,
      utilidadHistorica: sumUtilidadHistoricaTotal(cajaNegocioVehiculo),
    });
  }, [gastosGlobalState, localGastosTotal, gastosFinancialSummary, cajaNegocioVehiculo]);

  const options: HubCardOption[] = [
    {
      id: 'ingresos',
      title: 'Ingresos',
      desc: 'Histórico completo en memoria (ingresos)',
      emoji: '💰',
      path: '/finanzas/ingresos',
      gradient: 'from-emerald-500/10 to-teal-500/10',
      border: 'border-emerald-200 hover:border-emerald-400',
      stat: totalIngresosTabla,
      statColor: 'text-emerald-600',
    },
    {
      id: 'gastos',
      title: 'Gastos',
      desc: gastosSourceLabel ? `Totales globales · ${gastosSourceLabel}` : 'Gastos clasificados por categoría',
      emoji: '💸',
      path: '/finanzas/gastos',
      gradient: 'from-red-500/10 to-orange-500/10',
      border: 'border-red-200 hover:border-red-400',
      stat: totalGastosTabla,
      statColor: 'text-red-500',
    },
    {
      id: 'utilidad-historica',
      title: 'Utilidad histórica',
      desc: 'Importada desde Excel (caja negocio por vehículo)',
      emoji: '📈',
      path: '/finanzas/utilidad-operativa',
      gradient: 'from-emerald-500/10 to-green-500/10',
      border: 'border-emerald-200 hover:border-emerald-400',
      stat: utilidadHistoricaDisplay,
      statColor: 'text-emerald-800',
      statTitle: UTILIDAD_HISTORICA_TOOLTIP,
    },
    {
      id: 'inversiones',
      title: 'Inversiones',
      desc: 'Inversión inicial por vehículo (Excel). Inversión con utilidad: Finanzas → Gastos.',
      emoji: '🚗',
      path: '/finanzas/inversiones',
      gradient: 'from-purple-500/10 to-violet-500/10',
      border: 'border-purple-200 hover:border-violet-400',
    },
    {
      id: 'resumen',
      title: 'Resumen',
      desc: '¿Cómo va el negocio este mes?',
      emoji: '📋',
      path: '/finanzas/resumen',
      gradient: 'from-violet-500/10 to-fuchsia-500/10',
      border: 'border-violet-200 hover:border-violet-400',
    },
    {
      id: 'financiamiento',
      title: 'Financiamiento',
      desc: 'Préstamos y aportes de capital',
      emoji: '🏦',
      path: '/finanzas/financiamiento',
      gradient: 'from-indigo-500/10 to-blue-500/10',
      border: 'border-indigo-200 hover:border-indigo-400',
    },
    {
      id: 'reportes',
      title: 'Reportes',
      desc: 'Centro de análisis e histórico',
      emoji: '📊',
      path: '/finanzas/reportes',
      gradient: 'from-purple-500/10 to-pink-500/10',
      border: 'border-purple-200 hover:border-purple-400',
    },
  ];

  const visibleOptions = SHOW_RESULTADO_NETO_EN_HUB
    ? options
    : options.filter((o) => o.id !== 'resultado-neto');

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💰 Finanzas</h1>
          <p className="text-sm text-gray-500">Gestión financiera completa</p>
        </div>
      </div>

      <div className="max-w-xs mx-auto w-full">
        <SmartClock variant="hub" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleOptions.map((o) => {
          const showStat = o.stat != null && String(o.stat).trim() !== '';
          return (
            <button
              key={o.id}
              type="button"
              title={o.statTitle}
              onClick={() => navigate(o.path)}
              className={`mission-btn bg-gradient-to-br ${o.gradient} border-2 ${o.border} group text-left`}
            >
              <div
                className={[
                  'flex items-start gap-2 mb-3',
                  showStat ? 'justify-between' : 'justify-start',
                ].join(' ')}
              >
                <span className="text-4xl group-hover:scale-110 transition-transform shrink-0">{o.emoji}</span>
                {showStat ? (
                  <span
                    title={o.statTitle}
                    className={`text-sm sm:text-base font-bold ${o.statColor ?? 'text-gray-800'} text-right leading-snug break-words max-w-[min(100%,14rem)]`}
                  >
                    {o.stat}
                  </span>
                ) : null}
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">{o.title}</h3>
              <p className="text-sm text-gray-500">{o.desc}</p>
              <div className="mt-4 flex items-center gap-1 text-xs text-gray-400 group-hover:text-primary-500 font-semibold transition-colors">
                Ver {o.title} <ChevronRight size={14} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default FinanzasHub;