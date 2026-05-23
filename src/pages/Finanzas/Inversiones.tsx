import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useAuth } from '../../context/AuthContext';
import { gastoMatchesTipoGasto } from '../../utils/gastosTipoGasto';
import { formatCurrency, formatUSD } from '../../utils/formatting';
import {
  financialKpiSourceLabel,
  formatInversionCompraDisplay,
  resolveInversionCompraKpi,
} from '../../utils/financialGlobalKpis';
import { fetchInversionesGeneralesVehiculo } from '../../services/inversionesGeneralesVehiculoService';
import { EMPRESA_ID } from '../../config/app';
import { canUseInversiones, permissionUserFromAuth } from '../../utils/permissions';

type HubSubCard = {
  title: string;
  desc: string;
  emoji: string;
  path: string;
  gradient: string;
  border: string;
  statContent: React.ReactNode;
};

const Inversiones: React.FC = () => {
  const navigate = useNavigate();
  const { gastos, gastosFinancialSummary, gastosLoadScope, isLoadingGastosSummary } =
    useRegistrosContext();
  const { profile, user } = useAuth();
  const canLoadInversiones = useMemo(
    () => canUseInversiones(permissionUserFromAuth(user, profile?.email ?? null)),
    [user, profile?.email],
  );
  const tenantEmpresaId = profile?.empresa_id;

  const inversionCompraKpi = useMemo(() => {
    const localRows = gastos.filter((g) => gastoMatchesTipoGasto(g, 'inversion_compra'));
    const local = {
      monto: localRows.reduce((s, g) => s + g.monto, 0),
      count: localRows.length,
    };
    return resolveInversionCompraKpi(
      gastosFinancialSummary,
      local,
      gastosLoadScope,
      isLoadingGastosSummary,
    );
  }, [gastos, gastosFinancialSummary, gastosLoadScope, isLoadingGastosSummary]);

  const [genPen, setGenPen] = useState(0);
  const [genUsd, setGenUsd] = useState(0);
  const [genLoading, setGenLoading] = useState(true);

  useEffect(() => {
    if (!canLoadInversiones) {
      setGenPen(0);
      setGenUsd(0);
      setGenLoading(false);
      return;
    }
    if (!tenantEmpresaId?.trim() && !EMPRESA_ID) {
      setGenPen(0);
      setGenUsd(0);
      setGenLoading(false);
      return;
    }
    let cancelled = false;
    setGenLoading(true);
    void fetchInversionesGeneralesVehiculo(tenantEmpresaId)
      .then((rows) => {
        if (cancelled) return;
        let pen = 0;
        let usd = 0;
        for (const r of rows) {
          if (r.moneda === 'USD') usd += r.montoTotal;
          else pen += r.montoTotal;
        }
        setGenPen(pen);
        setGenUsd(usd);
      })
      .catch(() => {
        if (!cancelled) {
          setGenPen(0);
          setGenUsd(0);
        }
      })
      .finally(() => {
        if (!cancelled) setGenLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canLoadInversiones, tenantEmpresaId]);

  const inversionSourceLabel = financialKpiSourceLabel(inversionCompraKpi.source);
  const statUtilidad = (
    <span className="text-sm sm:text-base font-bold text-violet-800 leading-snug tabular-nums">
      {formatInversionCompraDisplay(inversionCompraKpi)}
    </span>
  );

  const statGenerales =
    genLoading ? (
      <span className="text-sm font-semibold text-slate-400">…</span>
    ) : genUsd <= 0 && genPen <= 0 ? (
      <span className="text-sm font-semibold text-slate-400">—</span>
    ) : (
      <div className="flex flex-col items-end gap-0.5 text-right">
        {genUsd > 0 ? (
          <span className="text-sm sm:text-base font-bold text-violet-800 leading-snug tabular-nums">{formatUSD(genUsd)}</span>
        ) : null}
        {genPen > 0 ? (
          <span className="text-sm sm:text-base font-bold text-violet-700 leading-snug tabular-nums">{formatCurrency(genPen)}</span>
        ) : null}
      </div>
    );

  const options: HubSubCard[] = [
    {
      title: 'Inversión con utilidad',
      desc: inversionSourceLabel
        ? `inversion_compra · ${inversionSourceLabel}`
        : 'Inversiones clasificadas desde gastos (inversion_compra)',
      emoji: '🚗',
      path: '/finanzas/inversiones/utilidad',
      gradient: 'from-purple-500/10 to-violet-500/10',
      border: 'border-purple-200 hover:border-purple-400',
      statContent: statUtilidad,
    },
    {
      title: 'Inversiones generales',
      desc: 'Costo total inicial por vehículo (hoja VALOR DE INVERSION)',
      emoji: '📦',
      path: '/finanzas/inversiones/generales',
      gradient: 'from-violet-500/10 to-fuchsia-500/10',
      border: 'border-violet-200 hover:border-violet-400',
      statContent: statGenerales,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/finanzas')}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
          aria-label="Volver a Finanzas"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🚗 Inversiones</h1>
          <p className="text-sm text-gray-500">Elige la sección a revisar</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {options.map((o) => (
          <button
            key={o.path}
            type="button"
            onClick={() => navigate(o.path)}
            className={`mission-btn bg-gradient-to-br ${o.gradient} border-2 ${o.border} group text-left`}
          >
            <div className="flex items-start gap-2 mb-3 justify-between">
              <span className="text-4xl group-hover:scale-110 transition-transform shrink-0">{o.emoji}</span>
              <div className="min-w-0 max-w-[min(100%,14rem)] break-words">{o.statContent}</div>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">{o.title}</h3>
            <p className="text-sm text-gray-500">{o.desc}</p>
            <div className="mt-4 flex items-center gap-1 text-xs text-gray-400 group-hover:text-primary-500 font-semibold transition-colors">
              Entrar a {o.title} <ChevronRight size={14} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Inversiones;
