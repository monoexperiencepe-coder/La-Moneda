import React, { useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatCurrency, formatDate, formatUSD } from '../../utils/formatting';
import { ingresoMontoPEN } from '../../utils/moneda';
import { conductorAsignadoLabel, formatConductorDisplayLabel, ultimoKmPorVehiculo } from '../../utils/fleetPanel';
import { buildControlFechasPivotMapByTipos } from '../../utils/controlFechasPivot';
import { docColumnTone, docRowWorstTone } from '../../utils/documentacionDocTone';
import { DOC_MODULE_COLUMNS } from '../../data/controlFechaCatalog';
import type { Conductor, InversionVehiculo, Pendiente, TipoControlFecha, CajaNegocioVehiculo } from '../../data/types';
import { gastosOperativosSolamente } from '../../utils/cajaNegocio';
import {
  rollupInteligentePorVehiculoTodoPeriodo,
  computeFinancialFleetAlerts,
} from '../../utils/financialFleetAnalytics';
import type { FinancialKPIData } from '../../utils/calculations';

const EMPTY_INTEL_KPI: FinancialKPIData = {
  gastos_operativos: 0,
  gastos_financieros: 0,
  gastos_administrativos: 0,
  utilidad_operativa: 0,
  utilidad_neta_simple: 0,
};
import Badge from '../../components/Common/Badge';
import RegistrosTable from '../../components/Tables/RegistrosTable';
import ControlFechaRegistroPanel from '../../components/operaciones/ControlFechaRegistroPanel';
import KilometrajeMantenimientoPanel from '../../components/operaciones/KilometrajeMantenimientoPanel';
import ValorTiempoSection from '../../components/operaciones/ValorTiempoSection';

const DOC_TIPOS = DOC_MODULE_COLUMNS.map((c) => c.tipo);
type DocPivot = Partial<Record<TipoControlFecha, string>>;

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'finanzas', label: 'Finanzas' },
  { id: 'documentacion', label: 'Documentación' },
  { id: 'mantenimiento', label: 'Mantenimiento' },
  { id: 'conductor', label: 'Conductor' },
  { id: 'pendientes', label: 'Pendientes' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function parseTab(t: string | null): TabId {
  if (t && TABS.some((x) => x.id === t)) return t as TabId;
  return 'resumen';
}

const VehiculoDetalle: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));

  const vid = Number(id);
  const {
    vehicles,
    ingresos,
    gastos,
    descuentos,
    controlFechas,
    kilometrajes,
    conductores,
    pendientes,
    getVehicleById,
    getVehicleLabel,
    deleteIngreso,
    deleteGasto,
    addKilometraje,
    deleteKilometraje,
    inversionesVehiculo,
    cajaNegocioVehiculo,
  } = useRegistrosContext();

  const vehicle = getVehicleById(vid);

  const setTab = (next: TabId) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'resumen') nextParams.delete('tab');
    else nextParams.set('tab', next);
    setSearchParams(nextParams, { replace: true });
  };

  const vehicleIngresos = useMemo(() => ingresos.filter((i) => Number(i.vehicleId) === vid), [ingresos, vid]);
  const vehicleGastos = useMemo(() => gastos.filter((g) => Number(g.vehicleId) === vid), [gastos, vid]);
  const vehicleGastosOperativos = useMemo(
    () => gastosOperativosSolamente(vehicleGastos),
    [vehicleGastos],
  );
  const vehicleCajaNegocio = useMemo(
    () => cajaNegocioVehiculo.filter((c) => Number(c.vehicleId) === vid),
    [cajaNegocioVehiculo, vid],
  );
  const vehicleDescuentos = useMemo(() => descuentos.filter((d) => Number(d.vehicleId) === vid), [descuentos, vid]);
  const vehicleInversiones = useMemo(
    () => inversionesVehiculo.filter((inv) => inv.vehicleId != null && Number(inv.vehicleId) === vid),
    [inversionesVehiculo, vid],
  );
  const inversionTotalUsd = useMemo(
    () =>
      vehicleInversiones.length === 0
        ? null
        : vehicleInversiones.reduce((s, inv) => s + (inv.totalInversionUsd ?? 0), 0),
    [vehicleInversiones],
  );

  const totalIngresos = vehicleIngresos.reduce((s, i) => s + ingresoMontoPEN(i), 0);
  const totalGastosOperativos = vehicleGastosOperativos.reduce((s, g) => s + g.monto, 0);
  const totalCajaNegocio = vehicleCajaNegocio.reduce((s, c) => s + c.monto, 0);
  const totalDescuentos = vehicleDescuentos.reduce((s, d) => s + d.monto, 0);
  const utilidad = totalIngresos - totalGastosOperativos + totalDescuentos;

  const rollupIntelVehiculo = useMemo(() => {
    if (!vehicle) return null;
    return rollupInteligentePorVehiculoTodoPeriodo(vehicle, ingresos, gastos);
  }, [vehicle, ingresos, gastos]);
  const intelKpi = rollupIntelVehiculo?.kpi ?? EMPTY_INTEL_KPI;
  const alertasFinanzasVeh = useMemo(
    () => (rollupIntelVehiculo ? computeFinancialFleetAlerts([rollupIntelVehiculo]) : []),
    [rollupIntelVehiculo],
  );

  const pivot = useMemo(() => buildControlFechasPivotMapByTipos(controlFechas, DOC_TIPOS), [controlFechas]);
  const docForVehicle = vehicle ? pivot.get(vehicle.id) : undefined;
  const docWorst = docRowWorstTone(docForVehicle, DOC_MODULE_COLUMNS);

  const ultimoKm = vehicle ? ultimoKmPorVehiculo(kilometrajes, vehicle.id) : null;
  const conductorActual = vehicle ? conductorAsignadoLabel(conductores, vehicle.id) : '—';

  const pendientesVehiculo = useMemo(
    () => pendientes.filter((p) => p.vehicleId != null && Number(p.vehicleId) === vid),
    [pendientes, vid],
  );
  const pendientesActivos = useMemo(
    () => pendientesVehiculo.filter((p) => p.estado === 'ABIERTO' || p.estado === 'EN_CURSO'),
    [pendientesVehiculo],
  );

  const conductoresVehiculo = useMemo(
    () =>
      conductores
        .filter((c) => c.vehicleId != null && Number(c.vehicleId) === vid)
        .sort((a, b) => {
          const ra = a.estado === 'VIGENTE' ? 0 : 1;
          const rb = b.estado === 'VIGENTE' ? 0 : 1;
          if (ra !== rb) return ra - rb;
          return b.id - a.id;
        }),
    [conductores, vid],
  );

  if (!vehicle || !Number.isFinite(vid)) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Vehículo no encontrado</p>
        <button type="button" onClick={() => navigate('/vehiculos/inventario')} className="mt-4 text-primary-600 hover:underline text-sm">
          Volver al inventario
        </button>
      </div>
    );
  }

  const qaBtn =
    'rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50 text-left';

  const openIncome = () => {
    navigate(`/finanzas/ingresos?registrar=1&vehicleId=${encodeURIComponent(String(vid))}`);
  };
  const openExpense = () => {
    navigate(`/finanzas/gastos?registrar=1&vehicleId=${encodeURIComponent(String(vid))}`);
  };

  return (
    <div className="space-y-4 animate-fade-in max-w-6xl mx-auto pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/vehiculos/inventario')}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 shrink-0"
            aria-label="Volver"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
              {vehicle.marca} {vehicle.modelo}
            </h1>
            <p className="text-gray-600 font-mono text-sm">{vehicle.placa}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={vehicle.activo ? 'success' : 'neutral'} dot>
                {vehicle.activo ? 'Activo' : 'Inactivo'}
              </Badge>
              <span className="text-xs text-gray-500">Centro de control · unidad #{vehicle.id}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3">
        <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-2">Acciones rápidas</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={qaBtn} onClick={openIncome}>
            Registrar ingreso
          </button>
          <button type="button" className={qaBtn} onClick={openExpense}>
            Registrar gasto
          </button>
          <button type="button" className={qaBtn} onClick={() => setTab('mantenimiento')}>
            Registrar km
          </button>
          <button type="button" className={qaBtn} onClick={() => setTab('documentacion')}>
            Registrar vencimiento
          </button>
          <button type="button" className={qaBtn} onClick={() => navigate(`/operaciones/pendientes?vehicle=${vid}`)}>
            Registrar pendiente
          </button>
        </div>
      </div>

      <div
        className="flex gap-1 overflow-x-auto pb-1 border-b border-gray-200 -mx-1 px-1"
        role="tablist"
        aria-label="Secciones del vehículo"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-t-lg px-3 py-2 text-sm font-semibold transition-colors ${
              tab === t.id ? 'bg-white text-primary-700 border border-b-0 border-gray-200 -mb-px' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="pt-1" role="tabpanel">
        {tab === 'resumen' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-4">
                <p className="text-[11px] font-medium text-emerald-800">Ingresos (total)</p>
                <p className="text-lg font-bold text-emerald-900 tabular-nums">{formatCurrency(totalIngresos)}</p>
              </div>
              <div className="rounded-xl border border-red-100 bg-red-50/80 p-4">
                <p className="text-[11px] font-medium text-red-800">Gastos operativos</p>
                <p className="text-lg font-bold text-red-900 tabular-nums">{formatCurrency(totalGastosOperativos)}</p>
              </div>
              <div className="rounded-xl border border-teal-100 bg-teal-50/80 p-4">
                <p className="text-[11px] font-medium text-teal-900">Caja negocio / utilidad</p>
                <p className="text-lg font-bold text-teal-950 tabular-nums">{formatCurrency(totalCajaNegocio)}</p>
                <p className="text-[10px] text-teal-800 mt-1">No suma a gastos ni a ingresos de arriendo</p>
              </div>
              <div className="rounded-xl border border-violet-100 bg-violet-50/80 p-4">
                <p className="text-[11px] font-medium text-violet-800">Utilidad operativa</p>
                <p className={`text-lg font-bold tabular-nums ${utilidad >= 0 ? 'text-violet-900' : 'text-red-800'}`}>
                  {formatCurrency(utilidad)}
                </p>
                <p className="text-[10px] text-violet-700 mt-1">Ingresos − gastos operativos + rebajes</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-[11px] font-medium text-gray-600">Último km registrado</p>
                <p className="text-lg font-bold text-gray-900 tabular-nums">{ultimoKm != null ? ultimoKm.toLocaleString('es-PE') : '—'}</p>
              </div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3 space-y-2">
              <p className="text-[11px] font-semibold text-sky-950 uppercase tracking-wide">
                Clasificación financiera (tipo_gasto) — histórico unidad
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                <div className="rounded-lg border border-emerald-100 bg-white/90 p-2.5">
                  <p className="text-[10px] font-medium text-emerald-800">Ingresos</p>
                  <p className="text-sm font-bold text-emerald-900 tabular-nums">
                    {formatCurrency(intelKpi.utilidad_operativa + intelKpi.gastos_operativos)}
                  </p>
                </div>
                <div className="rounded-lg border border-red-100 bg-white/90 p-2.5">
                  <p className="text-[10px] font-medium text-red-800">Gastos operativos</p>
                  <p className="text-sm font-bold text-red-900 tabular-nums">{formatCurrency(intelKpi.gastos_operativos)}</p>
                </div>
                <div className="rounded-lg border border-amber-100 bg-white/90 p-2.5">
                  <p className="text-[10px] font-medium text-amber-900">Gastos financieros</p>
                  <p className="text-sm font-bold text-amber-950 tabular-nums">{formatCurrency(intelKpi.gastos_financieros)}</p>
                </div>
                <div className="rounded-lg border border-violet-100 bg-white/90 p-2.5">
                  <p className="text-[10px] font-medium text-violet-800">Utilidad operativa</p>
                  <p
                    className={`text-sm font-bold tabular-nums ${intelKpi.utilidad_operativa >= 0 ? 'text-violet-900' : 'text-red-800'}`}
                  >
                    {formatCurrency(intelKpi.utilidad_operativa)}
                  </p>
                </div>
                <div className="rounded-lg border border-indigo-100 bg-white/90 p-2.5">
                  <p className="text-[10px] font-medium text-indigo-800">Utilidad neta simple</p>
                  <p
                    className={`text-sm font-bold tabular-nums ${intelKpi.utilidad_neta_simple >= 0 ? 'text-indigo-900' : 'text-red-800'}`}
                  >
                    {formatCurrency(intelKpi.utilidad_neta_simple)}
                  </p>
                </div>
              </div>
              {alertasFinanzasVeh.length > 0 && (
                <ul className="space-y-1.5 pt-1">
                  {alertasFinanzasVeh.map((a) => (
                    <li
                      key={a.id}
                      className={`text-xs rounded-md border px-2 py-1.5 ${
                        a.severity === 'danger'
                          ? 'border-red-200 bg-red-50 text-red-900'
                          : 'border-amber-200 bg-amber-50 text-amber-950'
                      }`}
                    >
                      {a.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {inversionTotalUsd != null && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <p className="text-[11px] font-semibold text-amber-900 uppercase tracking-wide">Inversión histórica (adquisición)</p>
                <p className="text-lg font-bold text-amber-950 tabular-nums mt-1">{formatUSD(inversionTotalUsd)}</p>
                <p className="text-[10px] text-amber-900/90 mt-1 max-w-xl">
                  Costo total de inversión cargado en el Excel de adquisición. No suma al total de gastos operativos ni al margen de arriba.
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase">Documentación</p>
                <p className="mt-1 text-sm text-gray-800">
                  Estado global:{' '}
                  <span className="font-semibold">
                    {docWorst === 'late' && 'Hay vencidos'}
                    {docWorst === 'soon' && 'Próximos vencimientos (≤30 d)'}
                    {docWorst === 'ok' && 'Al día en columnas con dato'}
                    {docWorst === 'empty' && 'Sin fechas cargadas'}
                  </span>
                </p>
                <button type="button" className="mt-2 text-sm font-semibold text-primary-600 hover:underline" onClick={() => setTab('documentacion')}>
                  Ver documentación →
                </button>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase">Conductor actual</p>
                <p className="mt-1 text-sm font-medium text-gray-900">{conductorActual}</p>
                <button type="button" className="mt-2 text-sm font-semibold text-primary-600 hover:underline" onClick={() => setTab('conductor')}>
                  Ver conductores →
                </button>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 md:col-span-2">
                <p className="text-xs font-semibold text-gray-500 uppercase">Pendientes (esta unidad)</p>
                <p className="mt-1 text-sm text-gray-800">
                  <span className="font-bold tabular-nums">{pendientesActivos.length}</span> abiertos o en curso
                  {pendientesVehiculo.length !== pendientesActivos.length && (
                    <span className="text-gray-500"> · {pendientesVehiculo.length} en total</span>
                  )}
                </p>
                <button type="button" className="mt-2 text-sm font-semibold text-primary-600 hover:underline" onClick={() => setTab('pendientes')}>
                  Ver pendientes →
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'finanzas' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg border p-3 bg-emerald-50/50 border-emerald-100">
                <span className="text-gray-600">Ingresos</span>
                <p className="font-bold text-emerald-800 tabular-nums">{formatCurrency(totalIngresos)}</p>
              </div>
              <div className="rounded-lg border p-3 bg-red-50/50 border-red-100">
                <span className="text-gray-600">Gastos operativos</span>
                <p className="font-bold text-red-800 tabular-nums">{formatCurrency(totalGastosOperativos)}</p>
              </div>
              <div className="rounded-lg border p-3 bg-teal-50/50 border-teal-100">
                <span className="text-gray-600">Caja negocio</span>
                <p className="font-bold text-teal-900 tabular-nums">{formatCurrency(totalCajaNegocio)}</p>
              </div>
              <div className="rounded-lg border p-3 bg-white border-gray-200">
                <span className="text-gray-600">Utilidad operativa</span>
                <p className={`font-bold tabular-nums ${utilidad >= 0 ? 'text-primary-700' : 'text-red-700'}`}>{formatCurrency(utilidad)}</p>
              </div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-3 space-y-2">
              <p className="text-[11px] font-semibold text-sky-950 uppercase tracking-wide">
                Por tipo_gasto (no reemplaza cifras legacy de arriba)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-sm">
                <div className="rounded-lg border border-emerald-100 bg-white/90 p-2.5">
                  <span className="text-gray-600 text-xs">Ingresos</span>
                  <p className="font-bold text-emerald-800 tabular-nums">
                    {formatCurrency(intelKpi.utilidad_operativa + intelKpi.gastos_operativos)}
                  </p>
                </div>
                <div className="rounded-lg border border-red-100 bg-white/90 p-2.5">
                  <span className="text-gray-600 text-xs">Gastos operativos</span>
                  <p className="font-bold text-red-800 tabular-nums">{formatCurrency(intelKpi.gastos_operativos)}</p>
                </div>
                <div className="rounded-lg border border-amber-100 bg-white/90 p-2.5">
                  <span className="text-gray-600 text-xs">Gastos financieros</span>
                  <p className="font-bold text-amber-950 tabular-nums">{formatCurrency(intelKpi.gastos_financieros)}</p>
                </div>
                <div className="rounded-lg border border-violet-100 bg-white/90 p-2.5">
                  <span className="text-gray-600 text-xs">Utilidad operativa</span>
                  <p className={`font-bold tabular-nums ${intelKpi.utilidad_operativa >= 0 ? 'text-violet-900' : 'text-red-700'}`}>
                    {formatCurrency(intelKpi.utilidad_operativa)}
                  </p>
                </div>
                <div className="rounded-lg border border-indigo-100 bg-white/90 p-2.5">
                  <span className="text-gray-600 text-xs">Utilidad neta simple</span>
                  <p className={`font-bold tabular-nums ${intelKpi.utilidad_neta_simple >= 0 ? 'text-indigo-900' : 'text-red-700'}`}>
                    {formatCurrency(intelKpi.utilidad_neta_simple)}
                  </p>
                </div>
              </div>
              {alertasFinanzasVeh.length > 0 && (
                <ul className="space-y-1">
                  {alertasFinanzasVeh.map((a) => (
                    <li
                      key={`fin-${a.id}`}
                      className={`text-xs rounded-md border px-2 py-1 ${
                        a.severity === 'danger'
                          ? 'border-red-200 bg-red-50 text-red-900'
                          : 'border-amber-200 bg-amber-50 text-amber-950'
                      }`}
                    >
                      {a.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {vehicleInversiones.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 overflow-hidden">
                <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/80">
                  <h3 className="text-sm font-bold text-amber-950">Inversión de adquisición (histórica)</h3>
                  <p className="text-xs text-amber-900/85 mt-0.5">
                    Referencia de compra e inversión inicial (USD/PEN en tabla). No es gasto operativo mensual.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead className="bg-white/80 text-left text-[10px] uppercase text-amber-900/80 border-b border-amber-100">
                      <tr>
                        <th className="py-2 px-3">Descripción</th>
                        <th className="py-2 px-3 whitespace-nowrap">F. compra</th>
                        <th className="py-2 px-3 text-right">Total USD</th>
                        <th className="py-2 px-3 text-right">Total PEN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100/80 bg-white/60">
                      {vehicleInversiones.map((inv: InversionVehiculo) => (
                        <tr key={inv.id}>
                          <td className="py-2 px-3 text-gray-900">{inv.descripcionExcel}</td>
                          <td className="py-2 px-3 text-gray-600 whitespace-nowrap">
                            {inv.fechaCompra ? formatDate(inv.fechaCompra) : '—'}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold text-amber-950">
                            {inv.totalInversionUsd != null ? formatUSD(inv.totalInversionUsd) : '—'}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-gray-700">
                            {inv.totalInversionPen != null ? formatCurrency(inv.totalInversionPen) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-gray-800 mb-2">Ingresos de esta unidad</h3>
              <RegistrosTable mode="ingresos" ingresos={vehicleIngresos} vehicles={vehicles} onDeleteIngreso={deleteIngreso} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-800 mb-2">Gastos operativos de esta unidad</h3>
              <RegistrosTable
                mode="gastos"
                gastos={vehicleGastosOperativos}
                vehicles={vehicles}
                onDeleteGasto={deleteGasto}
                showClasificacionFinanciera
              />
            </div>
            <div className="rounded-xl border border-teal-100 bg-teal-50/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-teal-100 bg-teal-50/80">
                <h3 className="text-sm font-bold text-teal-950">Caja negocio / utilidad registrada</h3>
                <p className="text-xs text-teal-900/85 mt-0.5">
                  Movimientos separados de gastos operativos. No editar desde esta tabla (gestión vía base o script).
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead className="bg-white/80 text-left text-[10px] uppercase text-teal-900/80 border-b border-teal-100">
                    <tr>
                      <th className="py-2 px-3">Fecha</th>
                      <th className="py-2 px-3">Concepto</th>
                      <th className="py-2 px-3 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-teal-100/80 bg-white/60">
                    {vehicleCajaNegocio.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-6 px-3 text-center text-gray-500 text-xs">
                          Sin registros de caja negocio para esta unidad.
                        </td>
                      </tr>
                    ) : (
                      vehicleCajaNegocio
                        .slice()
                        .sort((a, b) => b.fecha.localeCompare(a.fecha))
                        .map((row: CajaNegocioVehiculo) => (
                          <tr key={row.id}>
                            <td className="py-2 px-3 text-gray-700 whitespace-nowrap">{formatDate(row.fecha)}</td>
                            <td className="py-2 px-3 text-gray-900">{row.concepto}</td>
                            <td className="py-2 px-3 text-right tabular-nums font-semibold text-teal-950">{formatCurrency(row.monto)}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'documentacion' && (
          <div className="space-y-4">
            <ControlFechaRegistroPanel prefilledVehicleId={vehicle.id} />
            <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-gray-500 border-b bg-gray-50">
                    <th className="py-2 pl-3 pr-2">Concepto</th>
                    <th className="py-2 pr-3">Vencimiento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {DOC_MODULE_COLUMNS.map(({ tipo, label }) => {
                    const d = docForVehicle?.[tipo];
                    const tn = docColumnTone(d, tipo);
                    const cellCls =
                      tn === 'late'
                        ? 'text-red-700 font-semibold'
                        : tn === 'soon'
                          ? 'text-amber-800 font-semibold'
                          : tn === 'neutral'
                            ? 'text-slate-600'
                            : 'text-gray-800';
                    return (
                      <tr key={tipo}>
                        <td className="py-2 pl-3 pr-2 text-gray-700">{label}</td>
                        <td className={`py-2 pr-3 tabular-nums ${cellCls}`}>{d ? formatDate(d) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'mantenimiento' && (
          <div className="space-y-6">
            <KilometrajeMantenimientoPanel
              vehicles={vehicles}
              kilometrajes={kilometrajes}
              addKilometraje={addKilometraje}
              deleteKilometraje={deleteKilometraje}
              getVehicleLabel={getVehicleLabel}
              restrictVehicleId={vehicle.id}
            />
            <ValorTiempoSection scopeVehicleId={vehicle.id} subtitle="Valor tiempo filtrado a esta unidad (Supabase)." />
          </div>
        )}

        {tab === 'conductor' && (
          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
              <p className="text-sm font-semibold text-gray-900">Asignado hoy (vigente)</p>
              <p className="text-base font-bold text-primary-800 mt-1">{conductorActual}</p>
            </div>
            {conductoresVehiculo.length === 0 ? (
              <p className="p-6 text-sm text-gray-500">No hay conductores vinculados a esta unidad en el contexto.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {conductoresVehiculo.map((c: Conductor) => (
                  <li key={c.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-gray-900">{formatConductorDisplayLabel(c)}</span>
                      <span className="text-xs">
                        <span
                          className={`rounded-full px-2 py-0.5 font-semibold ${
                            c.estado === 'VIGENTE' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {c.estado}
                        </span>
                        <span className="ml-2 text-gray-500">Contrato {c.estadoContrato}</span>
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      {c.tipoDocumento} {c.numeroDocumento}
                      {c.celular ? ` · ${c.celular}` : ''}
                    </p>
                    {c.comentarios?.trim() ? <p className="text-xs text-gray-500 mt-1 line-clamp-2">{c.comentarios}</p> : null}
                  </li>
                ))}
              </ul>
            )}
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
              <button
                type="button"
                className="text-sm font-semibold text-primary-600 hover:underline"
                onClick={() => navigate('/operaciones/conductores')}
              >
                Ir a conductores (lista completa) →
              </button>
            </div>
          </div>
        )}

        {tab === 'pendientes' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-gray-600">
                {pendientesVehiculo.length} pendiente{pendientesVehiculo.length !== 1 ? 's' : ''} asociados a {vehicle.placa}
              </p>
              <button
                type="button"
                className="text-sm font-semibold text-primary-600 hover:underline"
                onClick={() => navigate(`/operaciones/pendientes?vehicle=${vid}`)}
              >
                Abrir en Pendientes →
              </button>
            </div>
            {pendientesVehiculo.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 rounded-xl">Sin pendientes para esta unidad.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="bg-gray-50 border-b text-left text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="py-2 px-3">Prioridad</th>
                      <th className="py-2 px-3">Estado</th>
                      <th className="py-2 px-3">Fecha</th>
                      <th className="py-2 px-3">Descripción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pendientesVehiculo.map((p: Pendiente) => (
                      <tr key={p.id} className="hover:bg-gray-50/80 align-top">
                        <td className="py-2 px-3 font-medium">{p.prioridad}</td>
                        <td className="py-2 px-3">{p.estado}</td>
                        <td className="py-2 px-3 whitespace-nowrap text-gray-600">{formatDate(p.fecha)}</td>
                        <td className="py-2 px-3 text-gray-800 max-w-md">
                          <span className="line-clamp-3" title={p.descripcion}>
                            {p.descripcion}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VehiculoDetalle;
