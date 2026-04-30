import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import { ingresoMontoPEN } from '../../utils/moneda';
import { formatCurrency, todayStr } from '../../utils/formatting';
import { computeTodayReview, DIAS_ALERTA_SIN_INGRESO } from '../../utils/fleetPanel';

const WorkBlock: React.FC<{
  title: string;
  count: number;
  subtitle?: string;
  lines: string[];
  onVer: () => void;
  borderClass?: string;
}> = ({ title, count, subtitle, lines, onVer, borderClass = 'border-gray-200' }) => (
  <section className={`rounded-xl border ${borderClass} bg-white p-4 shadow-sm`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        {subtitle ? <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p> : null}
        <p className="mt-1.5 text-2xl font-bold tabular-nums text-gray-900">{count}</p>
        {lines.length > 0 ? (
          <ul className="mt-2 space-y-0.5 text-xs text-gray-600">
            {lines.map((line, i) => (
              <li key={i} className="truncate" title={line}>
                {line}
              </li>
            ))}
          </ul>
        ) : count === 0 ? (
          <p className="mt-2 text-xs text-gray-400">Nada pendiente en este bloque.</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onVer}
        className="shrink-0 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800 hover:bg-primary-100"
      >
        Ver
      </button>
    </div>
  </section>
);

const Inicio: React.FC = () => {
  const navigate = useNavigate();
  const { ingresos, gastos, vehicles, controlFechas, pendientes, getVehicleLabel } = useRegistrosContext();
  const { open } = useDrawer();

  const todayIngresos = ingresos.filter((i) => i.fecha === todayStr()).reduce((s, i) => s + ingresoMontoPEN(i), 0);
  const todayGastos = gastos.filter((g) => g.fecha === todayStr()).reduce((s, g) => s + g.monto, 0);
  const todayMargen = todayIngresos - todayGastos;

  const cobrosPendientes = useMemo(
    () => ingresos.filter((i) => (i.estadoPago ?? '').toUpperCase() === 'PENDIENTE'),
    [ingresos],
  );

  const cobrosLines = useMemo(
    () =>
      cobrosPendientes.slice(0, 3).map((i) => {
        const u = getVehicleLabel(i.vehicleId);
        return `${u} · ${formatCurrency(ingresoMontoPEN(i))} · ${i.fecha}`;
      }),
    [cobrosPendientes, getVehicleLabel],
  );

  const queRevisar = useMemo(
    () => computeTodayReview(vehicles, controlFechas, ingresos, pendientes),
    [vehicles, controlFechas, ingresos, pendientes],
  );

  const vencidosLines = useMemo(
    () => queRevisar.muestraVencidos.slice(0, 3).map((it) => `${it.placa} · ${it.detail}`),
    [queRevisar.muestraVencidos],
  );
  const porVencerLines = useMemo(
    () => queRevisar.muestraPorVencer.slice(0, 3).map((it) => `${it.placa} · ${it.detail}`),
    [queRevisar.muestraPorVencer],
  );
  const sinIngresoLines = useMemo(
    () => queRevisar.muestraSinIngreso.slice(0, 3).map((it) => `${it.placa} · ${it.detail}`),
    [queRevisar.muestraSinIngreso],
  );
  const pendientesAltaLines = useMemo(
    () =>
      queRevisar.muestraPendientesAlta.slice(0, 3).map((p) => {
        const v = p.vehicleId != null ? vehicles.find((x) => x.id === p.vehicleId) : null;
        const unit = v ? v.placa : p.vehicleId != null ? `#${p.vehicleId}` : 'General';
        const short = p.descripcion.length > 72 ? `${p.descripcion.slice(0, 72)}…` : p.descripcion;
        return `${unit} · ${short}`;
      }),
    [queRevisar.muestraPendientesAlta, vehicles],
  );

  const hoyLabel = useMemo(
    () =>
      new Date().toLocaleDateString('es-PE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [],
  );

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl mx-auto">
      <header className="border-b border-gray-100 pb-4">
        <p className="text-xs font-medium text-gray-500 capitalize">{hoyLabel}</p>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Inicio · qué hacer hoy</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-700">
          <span>
            Hoy: ingresos <span className="font-semibold tabular-nums">{formatCurrency(todayIngresos)}</span>
            {' · '}
            gastos <span className="font-semibold tabular-nums">{formatCurrency(todayGastos)}</span>
            {' · '}
            margen <span className="font-semibold tabular-nums">{formatCurrency(todayMargen)}</span>
          </span>
          <span className="hidden sm:inline text-gray-300">|</span>
          <button type="button" onClick={() => open('income')} className="text-emerald-700 font-semibold hover:underline text-sm">
            + Ingreso
          </button>
          <button type="button" onClick={() => open('expense')} className="text-red-700 font-semibold hover:underline text-sm">
            + Gasto
          </button>
        </div>
        <nav className="mt-3 flex flex-wrap gap-2 text-xs">
          {[
            ['Finanzas', '/finanzas'],
            ['Operaciones', '/operaciones'],
            ['Vehículos', '/vehiculos'],
            ['Reportes', '/reportes'],
          ].map(([label, path]) => (
            <button
              key={path}
              type="button"
              onClick={() => navigate(path)}
              className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium text-gray-700 hover:bg-gray-100"
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="space-y-3">
        <WorkBlock
          title="1. Cobros pendientes"
          count={cobrosPendientes.length}
          subtitle="Ingresos con estado de pago pendiente"
          lines={cobrosLines}
          onVer={() => navigate('/finanzas/ingresos?cobro=pendiente')}
          borderClass="border-amber-200"
        />
        <WorkBlock
          title="2. Documentos vencidos"
          count={queRevisar.vencidosCount}
          subtitle="Registros de control de fechas ya vencidos"
          lines={vencidosLines}
          onVer={() => navigate('/operaciones/docs?doc=vencidos')}
          borderClass="border-red-200"
        />
        <WorkBlock
          title="3. Documentos por vencer"
          count={queRevisar.porVencerCount}
          subtitle="Vencen en los próximos 30 días"
          lines={porVencerLines}
          onVer={() => navigate('/operaciones/docs?doc=porvencer')}
          borderClass="border-amber-200"
        />
        <WorkBlock
          title="4. Vehículos sin ingresos recientes"
          count={queRevisar.sinIngresoCount}
          subtitle={`Sin ingreso registrado hace más de ${queRevisar.sinIngresoUmbralDias} días (mismo umbral que flota)`}
          lines={sinIngresoLines}
          onVer={() => navigate('/operaciones?flota=sinIngreso')}
          borderClass="border-orange-200"
        />
        <WorkBlock
          title="5. Pendientes de alta prioridad"
          count={queRevisar.pendientesAltaActivosCount}
          subtitle="Prioridad alta y estado abierto o en curso"
          lines={pendientesAltaLines}
          onVer={() => navigate('/operaciones/pendientes?prioridad=ALTA&activos=1')}
          borderClass="border-violet-200"
        />
      </div>

      <p className="text-[11px] text-gray-400 pb-2">
        Umbrales alineados con operaciones: sin ingreso &gt;{DIAS_ALERTA_SIN_INGRESO} días; documentos próximos ≤30 días.
      </p>
    </div>
  );
};

export default Inicio;
