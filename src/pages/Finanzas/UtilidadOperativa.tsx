import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Info } from 'lucide-react';
import Card from '../../components/Common/Card';
import Select from '../../components/Common/Select';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatCurrency } from '../../utils/formatting';
import {
  buildUtilidadHistoricaMensual,
  buildUtilidadHistoricaPorVehiculo,
  sumUtilidadHistoricaTotal,
  UTILIDAD_CALCULO_AUTOMATICO_ACTIVO,
  UTILIDAD_HISTORICA_PENDIENTE_NOTA,
  UTILIDAD_HISTORICA_TOOLTIP,
} from '../../utils/utilidadOperativa';
import { vehicleIdSortRank } from '../../utils/sortByVehicle';

/**
 * Modo histórico solamente.
 * Modo cálculo automático desactivado temporalmente hasta definir corte operativo.
 * Ver UTILIDAD_CALCULO_AUTOMATICO_ACTIVO en utilidadOperativa.ts
 */
const UtilidadOperativa: React.FC = () => {
  const navigate = useNavigate();
  const { cajaNegocioVehiculo, vehicles } = useRegistrosContext();
  const [filterYear, setFilterYear] = useState<string>('ALL');

  const totalHistorico = useMemo(
    () => sumUtilidadHistoricaTotal(cajaNegocioVehiculo),
    [cajaNegocioVehiculo],
  );

  const porMes = useMemo(
    () => buildUtilidadHistoricaMensual(cajaNegocioVehiculo),
    [cajaNegocioVehiculo],
  );

  const porVehiculo = useMemo(
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

  const porVehiculoSorted = useMemo(
    () =>
      [...porVehiculo].sort(
        (a, b) => b.monto - a.monto || vehicleIdSortRank(a.vehicleId) - vehicleIdSortRank(b.vehicleId),
      ),
    [porVehiculo],
  );

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
          <h1 className="text-2xl font-bold text-slate-900">Utilidad histórica</h1>
          <p className="mt-1 text-sm text-slate-600">
            Rentabilidad operativa importada desde Excel, por vehículo y mes.
          </p>
        </div>
      </header>

      <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
        <p className="flex items-start gap-2">
          <Info size={16} className="mt-0.5 shrink-0" />
          <span>
            <strong>{UTILIDAD_HISTORICA_PENDIENTE_NOTA}</strong>
            {!UTILIDAD_CALCULO_AUTOMATICO_ACTIVO ? (
              <> Modo cálculo automático desactivado temporalmente hasta definir corte operativo.</>
            ) : null}
          </span>
        </p>
      </div>

      <div
        className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm"
        title={UTILIDAD_HISTORICA_TOOLTIP}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/80">
          Utilidad histórica importada
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-950">{formatCurrency(totalHistorico)}</p>
        <p className="mt-2 text-xs text-emerald-900/80">{UTILIDAD_HISTORICA_TOOLTIP}</p>
        <p className="mt-2 text-xs text-slate-600">
          {cajaNegocioVehiculo.length} registros ·{' '}
          <Link to="/finanzas/caja-negocio" className="font-medium text-violet-700 underline">
            Ver detalle en Caja negocio
          </Link>
        </p>
      </div>

      <Card title="Utilidad histórica por mes" subtitle="Solo datos importados (caja_negocio_vehiculo)." compact>
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
        {mesesFiltrados.length === 0 ? (
          <p className="text-sm text-slate-500">Sin datos mensuales importados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Mes</th>
                  <th className="py-2 text-right">Importada</th>
                </tr>
              </thead>
              <tbody>
                {[...mesesFiltrados].reverse().map((m) => (
                  <tr key={m.mes} className="border-b border-slate-50">
                    <td className="py-2 pr-3 font-medium text-slate-800">{m.mesLabel}</td>
                    <td className="py-2 text-right font-semibold tabular-nums text-slate-900">
                      {formatCurrency(m.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Utilidad histórica por vehículo" subtitle="Suma importada por unidad." compact>
        {porVehiculoSorted.length === 0 ? (
          <p className="text-sm text-slate-500">Sin registros importados por vehículo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Vehículo</th>
                  <th className="py-2 text-right">Importada</th>
                </tr>
              </thead>
              <tbody>
                {porVehiculoSorted.map((row) => (
                  <tr key={row.vehicleId} className="border-b border-slate-50">
                    <td className="py-2 pr-3">
                      <Link
                        to={`/vehiculos/${row.vehicleId}`}
                        className="font-medium text-violet-800 hover:underline"
                      >
                        {vehicleLabel(row.vehicleId)}
                      </Link>
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatCurrency(row.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default UtilidadOperativa;
