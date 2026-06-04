import { useAmountDisplay } from '../../hooks/useAmountDisplay';
import { useUtilidadRealCalculos } from '../../hooks/useUtilidadRealCalculos';
import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Info } from 'lucide-react';
import Card from '../../components/Common/Card';
import Select from '../../components/Common/Select';
import { useRegistrosContext } from '../../context/RegistrosContext';
import {
  buildUtilidadHistoricaMensual,
  buildUtilidadHistoricaPorVehiculo,
  sumUtilidadHistoricaTotal,
  UTILIDAD_HISTORICA_REFERENCIAL_LABEL,
  UTILIDAD_HISTORICA_TOOLTIP,
} from '../../utils/utilidadOperativa';
import { UTILIDAD_REAL_TOOLTIP } from '../../utils/utilidadReal';
import { vehicleIdSortRank } from '../../utils/sortByVehicle';

const UtilidadOperativa: React.FC = () => {
  const { formatGlobalAmount } = useAmountDisplay();
  const navigate = useNavigate();
  const { cajaNegocioVehiculo, vehicles } = useRegistrosContext();
  const [filterYear, setFilterYear] = useState<string>('ALL');

  const {
    porVehiculo,
    totalFlota,
    porMes,
    gastosReadyForUtilidad,
    isLoadingGastosFull,
    gastosLoadScope,
    gastosEnMemoria,
  } = useUtilidadRealCalculos({
    pantalla: 'UtilidadOperativa.buildUtilidadRealPorVehiculo',
    auditSampleVehicleIds: [1],
  });

  const totalHistoricoRef = useMemo(
    () => sumUtilidadHistoricaTotal(cajaNegocioVehiculo),
    [cajaNegocioVehiculo],
  );

  const porMesHistorico = useMemo(
    () => buildUtilidadHistoricaMensual(cajaNegocioVehiculo),
    [cajaNegocioVehiculo],
  );

  const porVehiculoHistorico = useMemo(
    () => buildUtilidadHistoricaPorVehiculo(cajaNegocioVehiculo),
    [cajaNegocioVehiculo],
  );

  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const m of porMes) {
      const y = Number(m.mes.slice(0, 4));
      if (Number.isFinite(y)) ys.add(y);
    }
    return [...ys].sort((a, b) => b - a);
  }, [porMes]);

  const mesesFiltrados = useMemo(() => {
    if (filterYear === 'ALL') return porMes;
    return porMes.filter((m) => m.mes.startsWith(`${filterYear}-`));
  }, [porMes, filterYear]);

  const vehicleLabel = (id: number) => {
    const v = vehicles.find((x) => x.id === id);
    return v ? `#${v.id} ${v.marca} ${v.modelo} (${v.placa})` : `Unidad #${id}`;
  };

  const porVehiculoRealSorted = useMemo(
    () =>
      [...porVehiculo].sort(
        (a, b) =>
          b.utilidadReal - a.utilidadReal
          || vehicleIdSortRank(a.vehicleId) - vehicleIdSortRank(b.vehicleId),
      ),
    [porVehiculo],
  );

  const loadingBanner = isLoadingGastosFull || !gastosReadyForUtilidad;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-10 animate-fade-in">
      <header className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate('/finanzas')}
          className="mt-0.5 shrink-0 rounded-xl p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Volver a Finanzas"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600/90">Finanzas</p>
          <h1 className="text-2xl font-bold text-slate-900">Utilidad por vehículo</h1>
          <p className="mt-1 text-sm text-slate-600">{UTILIDAD_REAL_TOOLTIP}</p>
        </div>
      </header>

      {loadingBanner ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
          {isLoadingGastosFull
            ? `Cargando histórico completo de gastos (${gastosEnMemoria} en memoria, scope=${gastosLoadScope})…`
            : 'Preparando histórico completo de gastos…'}
        </p>
      ) : (
        <p className="rounded-lg border border-emerald-200/80 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-900">
          Gastos completos en memoria ({gastosEnMemoria} registros). Utilidad calculada con todos los gastos por
          vehicle_id.
        </p>
      )}

      <div
        className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm"
        title={UTILIDAD_REAL_TOOLTIP}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/80">
          Utilidad real (flota activa)
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-950">
          {loadingBanner ? '…' : formatGlobalAmount(totalFlota)}
        </p>
        <p className="mt-2 text-xs text-emerald-900/80 flex items-start gap-1.5">
          <Info size={14} className="shrink-0 mt-0.5" />
          {UTILIDAD_REAL_TOOLTIP}
        </p>
      </div>

      <Card title="Utilidad real por mes" subtitle="Ingresos − gastos registrados (todos con vehicle_id)." compact>
        <div className="mb-3 max-w-xs">
          <Select
            label="Año"
            value={filterYear}
            onChange={(value) => setFilterYear(value)}
            options={[
              { value: 'ALL', label: 'Todos los años' },
              ...availableYears.map((y) => ({ value: String(y), label: String(y) })),
            ]}
          />
        </div>
        {loadingBanner ? (
          <p className="text-sm text-slate-500">Cargando datos…</p>
        ) : mesesFiltrados.length === 0 ? (
          <p className="text-sm text-slate-500">Sin movimientos con vehículo en el período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Mes</th>
                  <th className="py-2 text-right">Ingresos</th>
                  <th className="py-2 text-right">Gastos</th>
                  <th className="py-2 text-right">Utilidad</th>
                </tr>
              </thead>
              <tbody>
                {[...mesesFiltrados].reverse().map((m) => (
                  <tr key={m.mes} className="border-b border-slate-50">
                    <td className="py-2 pr-3 font-medium text-slate-800">{m.mesLabel}</td>
                    <td className="py-2 text-right tabular-nums text-emerald-800">{formatGlobalAmount(m.ingresos)}</td>
                    <td className="py-2 text-right tabular-nums text-red-700">{formatGlobalAmount(m.gastos)}</td>
                    <td className="py-2 text-right font-semibold tabular-nums text-slate-900">
                      {formatGlobalAmount(m.utilidadReal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Utilidad real por vehículo" subtitle={UTILIDAD_REAL_TOOLTIP} compact>
        {loadingBanner ? (
          <p className="text-sm text-slate-500 py-6 text-center">Cargando histórico de gastos…</p>
        ) : porVehiculoRealSorted.length === 0 ? (
          <p className="text-sm text-slate-500">Sin vehículos activos con movimientos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Vehículo</th>
                  <th className="py-2 text-right">Ingresos</th>
                  <th className="py-2 text-right">Gastos</th>
                  <th className="py-2 text-right">Utilidad</th>
                </tr>
              </thead>
              <tbody>
                {porVehiculoRealSorted.map((row) => (
                  <tr key={row.vehicleId} className="border-b border-slate-50">
                    <td className="py-2 pr-3">
                      <Link
                        to={`/vehiculos/${row.vehicleId}`}
                        className="font-medium text-violet-800 hover:underline"
                      >
                        {vehicleLabel(row.vehicleId)}
                      </Link>
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatGlobalAmount(row.ingresosTotal)}</td>
                    <td className="py-2 text-right tabular-nums">{formatGlobalAmount(row.gastosTotal)}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {formatGlobalAmount(row.utilidadReal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <section className="pt-4 border-t border-slate-200 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{UTILIDAD_HISTORICA_REFERENCIAL_LABEL}</h2>
          <p className="mt-1 text-sm text-slate-600">{UTILIDAD_HISTORICA_TOOLTIP}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total importado Excel</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-800">{formatGlobalAmount(totalHistoricoRef)}</p>
          <p className="mt-2 text-xs text-slate-500">
            {cajaNegocioVehiculo.length} registros ·{' '}
            <Link to="/finanzas/caja-negocio" className="font-medium text-violet-700 underline">
              Ver caja negocio
            </Link>
          </p>
        </div>
        {porMesHistorico.length > 0 ? (
          <Card title="Histórico importado por mes" compact>
            <div className="overflow-x-auto max-h-48">
              <table className="w-full text-sm">
                <tbody>
                  {[...porMesHistorico].reverse().slice(0, 24).map((m) => (
                    <tr key={m.mes} className="border-b border-slate-50">
                      <td className="py-1.5 text-slate-600">{m.mesLabel}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-700">{formatGlobalAmount(m.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
        {porVehiculoHistorico.length > 0 ? (
          <Card title="Histórico importado por vehículo" compact>
            <div className="overflow-x-auto max-h-48">
              <table className="w-full text-sm">
                <tbody>
                  {porVehiculoHistorico.slice(0, 20).map((row) => (
                    <tr key={row.vehicleId} className="border-b border-slate-50">
                      <td className="py-1.5">{vehicleLabel(row.vehicleId)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatGlobalAmount(row.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
      </section>
    </div>
  );
};

export default UtilidadOperativa;
