import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, AlertTriangle, Filter, CheckCircle2, Clock, XCircle } from 'lucide-react';
import Card from '../../components/Common/Card';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatDate, formatCurrency, todayStr } from '../../utils/formatting';
import { buildOperativeAlerts, countAlertsByKind } from '../../utils/buildOperativeAlerts';

const ID_TIPOS_INGRESO = ['ALQUILER', 'GARANTIA', 'PAPELETAS', 'CHOQUES / DANOS', 'INTERESES', 'PRESTAMOS'];
const ID_G_MECANICOS = ['AIRE A/C', 'AUTOPARTES', 'BATERIA', 'DIRECCION Y SUSPENSION', 'GNV', 'GPS'];
const ID_G_TRIBUT = ['ASESORIA', 'MULTAS', 'PAPELETA', 'REVISION TECNICA', 'SAT', 'SUNARP', 'SUNAT'];

function diffDays(dateStr: string): number {
  const today = new Date(todayStr() + 'T00:00:00').getTime();
  const target = new Date(dateStr + 'T00:00:00').getTime();
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

const ControlGlobal: React.FC = () => {
  const navigate = useNavigate();
  const { vehicles, unidades, conductores, controlFechas, kilometrajes, pendientes, ingresos, gastos } =
    useRegistrosContext();

  const [soloConProblemas, setSoloConProblemas] = useState(false);

  const vehicleStatus = useMemo(() => {
    return vehicles
      .filter((v) => v.activo)
      .map((v) => {
        const fechasV = controlFechas.filter((c) => c.vehicleId === v.id);
        const vencidos = fechasV
          .filter((c) => diffDays(c.fechaVencimiento) < 0)
          .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
        const proximos = fechasV
          .filter((c) => {
            const d = diffDays(c.fechaVencimiento);
            return d >= 0 && d <= 30;
          })
          .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
        const ok = fechasV
          .filter((c) => diffDays(c.fechaVencimiento) > 30)
          .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));

        const ingresosV = ingresos.filter((i) => i.vehicleId === v.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
        const ultimoIngreso = ingresosV[0] ?? null;

        const gastosV = gastos.filter((g) => g.vehicleId === v.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
        const ultimoGasto = gastosV[0] ?? null;

        const diasSinIngreso = ultimoIngreso ? Math.abs(diffDays(ultimoIngreso.fecha)) : null;

        const estadoGeneral: 'CRITICO' | 'ALERTA' | 'OK' =
          vencidos.length > 0
            ? 'CRITICO'
            : proximos.length > 0 || (diasSinIngreso != null && diasSinIngreso > 14)
              ? 'ALERTA'
              : 'OK';

        return {
          vehicle: v,
          vencidos,
          proximos,
          ok,
          ultimoIngreso,
          ultimoGasto,
          diasSinIngreso,
          estadoGeneral,
        };
      })
      .sort((a, b) => {
        const rank = { CRITICO: 0, ALERTA: 1, OK: 2 };
        const r = rank[a.estadoGeneral] - rank[b.estadoGeneral];
        if (r !== 0) return r;
        return a.vehicle.id - b.vehicle.id;
      });
  }, [vehicles, controlFechas, ingresos, gastos]);

  const vehicleStatusFiltered = useMemo(
    () => (soloConProblemas ? vehicleStatus.filter((s) => s.estadoGeneral !== 'OK') : vehicleStatus),
    [vehicleStatus, soloConProblemas],
  );

  const alertas = useMemo(() => controlFechas.filter((c) => diffDays(c.fechaVencimiento) <= 30).length, [controlFechas]);

  const pendientesActivos = useMemo(
    () => pendientes.filter((p) => p.estado === 'ABIERTO' || p.estado === 'EN_CURSO').length,
    [pendientes],
  );

  const unidadesConKm = useMemo(() => new Set(kilometrajes.map((k) => k.vehicleId)).size, [kilometrajes]);

  const operativeAlerts = useMemo(() => buildOperativeAlerts(ingresos, controlFechas, vehicles), [ingresos, controlFechas, vehicles]);
  const operativeAlertCounts = useMemo(() => countAlertsByKind(operativeAlerts), [operativeAlerts]);

  const quickLinks = [
    { label: 'Documentación', path: '/operaciones/docs', hint: 'Vencimientos y SOAT' },
    { label: 'Mantenimiento', path: '/operaciones/mantenimiento', hint: 'KM y valor tiempo' },
    { label: 'Valor tiempo', path: '/operaciones/tiempo', hint: 'Hoja TIEMPO' },
    { label: 'Conductores', path: '/operaciones/conductores', hint: 'Listado y altas' },
    { label: 'Pendientes', path: '/operaciones/pendientes', hint: 'Tareas abiertas' },
    { label: 'Inventario', path: '/vehiculos/inventario', hint: 'Flota' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/operaciones')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🧭 Control Global</h1>
          <p className="text-sm text-gray-500">
            Resumen operativo, alertas y accesos. Los registros largos están en Documentación y Mantenimiento.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="p-4" padding={false}>
          <p className="text-xs text-gray-500">Unidades</p>
          <p className="text-2xl font-bold">{unidades.length}</p>
        </Card>
        <Card className="p-4" padding={false}>
          <p className="text-xs text-gray-500">Conductores vigentes</p>
          <p className="text-2xl font-bold">{conductores.filter((c) => c.estado === 'VIGENTE').length}</p>
        </Card>
        <Card className="p-4" padding={false}>
          <p className="text-xs text-gray-500">Alertas fechas (30 días)</p>
          <p className="text-2xl font-bold text-amber-700">{alertas}</p>
        </Card>
        <Card className="p-4" padding={false}>
          <p className="text-xs text-gray-500">Unidades con registro KM</p>
          <p className="text-2xl font-bold text-sky-700">{unidadesConKm}</p>
        </Card>
        <button
          type="button"
          onClick={() => navigate('/operaciones/pendientes')}
          className="text-left rounded-xl border border-gray-100 bg-white shadow-soft p-4 col-span-2 sm:col-span-1 lg:col-span-1 hover:border-violet-200 hover:bg-violet-50/30 transition-colors"
        >
          <p className="text-xs text-gray-500">Pendientes activos</p>
          <p className="text-2xl font-bold text-violet-700">{pendientesActivos}</p>
          <p className="text-[10px] text-violet-600 font-semibold mt-1">Ver lista →</p>
        </button>
      </div>

      <button
        type="button"
        onClick={() => navigate('/operaciones/tiempo')}
        className="w-full text-left rounded-2xl border border-indigo-100 bg-indigo-50/90 px-4 py-3 text-sm hover:bg-indigo-50 transition-colors"
      >
        <span className="font-semibold text-indigo-900">⏱️ Valor tiempo (hoja TIEMPO del Excel)</span>
        <span className="block text-xs text-indigo-700 mt-0.5">Registros por vehículo — también en Mantenimiento</span>
      </button>

      {operativeAlerts.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50/90 px-4 py-3 text-sm">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" aria-hidden />
          <div className="flex-1 min-w-[200px]">
            <p className="font-semibold text-amber-900">
              {operativeAlerts.length} alerta{operativeAlerts.length !== 1 ? 's' : ''} automática
              {operativeAlerts.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              {operativeAlertCounts.INGRESO_PENDIENTE} cobro(s) pendiente(s) · {operativeAlertCounts.VENCIMIENTO} vencimiento(s) ·{' '}
              {operativeAlertCounts.SIN_INGRESOS} vehículo(s) sin ingresos recientes
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950 shrink-0"
          >
            Ver panel en Inicio
          </button>
        </div>
      )}

      <Card title="Accesos rápidos" subtitle="Registrar o revisar en detalle en cada módulo">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {quickLinks.map((q) => (
            <button
              key={q.path}
              type="button"
              onClick={() => navigate(q.path)}
              className="text-left rounded-xl border border-gray-100 bg-gray-50/80 hover:bg-white hover:border-violet-200 px-4 py-3 transition-colors"
            >
              <span className="font-semibold text-gray-900 text-sm">{q.label}</span>
              <span className="block text-xs text-gray-500 mt-0.5">{q.hint}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Estado por vehículo" subtitle="Vencimientos, último ingreso y gasto por unidad activa">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="font-medium">
              {vehicleStatusFiltered.length} unidad{vehicleStatusFiltered.length !== 1 ? 'es' : ''}
            </span>
            {soloConProblemas && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">con problemas</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSoloConProblemas((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              soloConProblemas
                ? 'bg-red-500 border-red-500 text-white'
                : 'border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600'
            }`}
          >
            <Filter size={12} />
            Solo con problemas
          </button>
        </div>

        {vehicleStatusFiltered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <CheckCircle2 size={40} className="text-emerald-300 mb-2" />
            <p className="font-semibold">Todos los vehículos están al día</p>
            <p className="text-xs mt-1">Sin vencimientos ni alertas pendientes</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {vehicleStatusFiltered.map((s) => {
              const { vehicle: v, vencidos, proximos, ok, ultimoIngreso, ultimoGasto, diasSinIngreso, estadoGeneral } = s;

              const borderColor =
                estadoGeneral === 'CRITICO'
                  ? 'border-red-300 bg-red-50/40'
                  : estadoGeneral === 'ALERTA'
                    ? 'border-amber-300 bg-amber-50/40'
                    : 'border-emerald-200 bg-emerald-50/20';

              const badgeCls =
                estadoGeneral === 'CRITICO'
                  ? 'bg-red-100 text-red-700'
                  : estadoGeneral === 'ALERTA'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700';

              const BadgeIcon = estadoGeneral === 'CRITICO' ? XCircle : estadoGeneral === 'ALERTA' ? Clock : CheckCircle2;

              return (
                <div key={v.id} className={`rounded-2xl border-2 p-4 space-y-3 transition-all ${borderColor}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-gray-900 text-sm leading-tight">
                        #{v.id} — {v.marca} {v.modelo}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{v.placa}</p>
                    </div>
                    <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full shrink-0 ${badgeCls}`}>
                      <BadgeIcon size={11} />
                      {estadoGeneral === 'CRITICO' ? 'Crítico' : estadoGeneral === 'ALERTA' ? 'Alerta' : 'OK'}
                    </span>
                  </div>

                  {vencidos.length > 0 || proximos.length > 0 ? (
                    <div className="space-y-1">
                      {vencidos.slice(0, 3).map((c) => (
                        <div key={c.id} className="flex items-center justify-between text-xs">
                          <span className="text-red-700 font-medium truncate mr-1">{c.tipo.replace(/_/g, ' ')}</span>
                          <span className="text-red-600 whitespace-nowrap font-bold">{Math.abs(diffDays(c.fechaVencimiento))}d vencido</span>
                        </div>
                      ))}
                      {vencidos.length > 3 && (
                        <p className="text-xs text-red-500 font-semibold">+{vencidos.length - 3} más vencidos</p>
                      )}
                      {proximos.slice(0, 2).map((c) => (
                        <div key={c.id} className="flex items-center justify-between text-xs">
                          <span className="text-amber-700 font-medium truncate mr-1">{c.tipo.replace(/_/g, ' ')}</span>
                          <span className="text-amber-600 whitespace-nowrap">{diffDays(c.fechaVencimiento)}d</span>
                        </div>
                      ))}
                      {proximos.length > 2 && <p className="text-xs text-amber-600">+{proximos.length - 2} próximos</p>}
                    </div>
                  ) : ok.length > 0 ? (
                    <p className="text-xs text-emerald-600 font-medium">
                      {ok.length} fecha{ok.length !== 1 ? 's' : ''} al día
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 italic">Sin fechas registradas</p>
                  )}

                  <div className="border-t border-gray-200/70" />

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-gray-400 font-medium mb-0.5">Último ingreso</p>
                      {ultimoIngreso ? (
                        <>
                          <p className="font-bold text-emerald-700">{formatCurrency(ultimoIngreso.monto)}</p>
                          <p className="text-gray-500">{formatDate(ultimoIngreso.fecha)}</p>
                          {diasSinIngreso != null && diasSinIngreso > 14 && (
                            <p className="text-amber-600 font-semibold mt-0.5">{diasSinIngreso}d sin cobro</p>
                          )}
                        </>
                      ) : (
                        <p className="text-gray-400 italic">Sin ingresos</p>
                      )}
                    </div>
                    <div>
                      <p className="text-gray-400 font-medium mb-0.5">Último gasto</p>
                      {ultimoGasto ? (
                        <>
                          <p className="font-bold text-red-600">{formatCurrency(ultimoGasto.monto)}</p>
                          <p className="text-gray-500">{formatDate(ultimoGasto.fecha)}</p>
                          <p className="text-gray-400 truncate">{ultimoGasto.tipo}</p>
                        </>
                      ) : (
                        <p className="text-gray-400 italic">Sin gastos</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Pendientes" subtitle="Alta, filtros y edición en la página dedicada">
        <p className="text-sm text-gray-600 mb-3">
          {pendientesActivos} pendiente{pendientesActivos !== 1 ? 's' : ''} abierto{pendientesActivos !== 1 ? 's' : ''} o en curso.
        </p>
        <button
          type="button"
          onClick={() => navigate('/operaciones/pendientes')}
          className="px-4 py-2.5 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-sm font-semibold"
        >
          Ir a Pendientes →
        </button>
      </Card>

      <Card title="Cuadro ID (referencia rápida)" subtitle="Catálogo operativo para reducir pasos">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <p className="font-semibold text-gray-700 mb-2">Tipo ingreso</p>
            <div className="flex flex-wrap gap-1">
              {ID_TIPOS_INGRESO.map((t) => (
                <span key={t} className="px-2 py-1 bg-emerald-50 rounded">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="font-semibold text-gray-700 mb-2">G. mecánicos</p>
            <div className="flex flex-wrap gap-1">
              {ID_G_MECANICOS.map((t) => (
                <span key={t} className="px-2 py-1 bg-blue-50 rounded">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="font-semibold text-gray-700 mb-2">G. tributarios</p>
            <div className="flex flex-wrap gap-1">
              {ID_G_TRIBUT.map((t) => (
                <span key={t} className="px-2 py-1 bg-purple-50 rounded">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ControlGlobal;
