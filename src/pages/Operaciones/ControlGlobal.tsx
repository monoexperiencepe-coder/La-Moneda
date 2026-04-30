import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Trash2, AlertTriangle, Filter, CheckCircle2, Clock, XCircle } from 'lucide-react';
import Card from '../../components/Common/Card';
import Input from '../../components/Common/Input';
import Select from '../../components/Common/Select';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatDate, formatCurrency, todayStr } from '../../utils/formatting';
import type { EstadoPendiente, Pendiente, PrioridadPendiente } from '../../data/types';
import { buildOperativeAlerts, countAlertsByKind } from '../../utils/buildOperativeAlerts';

const ID_TIPOS_INGRESO = ['ALQUILER', 'GARANTIA', 'PAPELETAS', 'CHOQUES / DANOS', 'INTERESES', 'PRESTAMOS'];
const ID_G_MECANICOS = ['AIRE A/C', 'AUTOPARTES', 'BATERIA', 'DIRECCION Y SUSPENSION', 'GNV', 'GPS'];
const ID_G_TRIBUT = ['ASESORIA', 'MULTAS', 'PAPELETA', 'REVISION TECNICA', 'SAT', 'SUNARP', 'SUNAT'];

const TIPOS_FECHA = [
  { value: 'BAT_MANT_REALIZADO', label: 'BAT-MANT. REALIZADO' },
  { value: 'BAT_COMPRA_NUEVA', label: 'BAT-COMPRA. NUEVA' },
  { value: 'SOAT', label: 'SOAT' },
  { value: 'RT_PARTICULAR', label: 'RT Particular' },
  { value: 'RT_TAXI', label: 'RT Taxi' },
  { value: 'AFOCAT_TAXI', label: 'AFOCAT Taxi' },
  { value: 'INSTALACION_GNV', label: 'Instalacion GNV' },
  { value: 'PERMISO_ATU', label: 'Permiso ATU' },
  { value: 'CERT_GNV_ANUAL', label: 'Certificado GNV Anual' },
  { value: 'QUINQUENAL_GNV', label: 'Quinquenal GNV' },
  { value: 'VENC_BREVETE', label: 'Venc. Brevete' },
  { value: 'CREDENCIAL_ATU_BREVETE', label: 'Credencial ATU Brevete' },
  { value: 'GPS', label: 'GPS' },
  { value: 'IMPUESTO', label: 'Impuesto Vehicular' },
  { value: 'OTRO_VENCIMIENTO', label: 'Otro vencimiento (Excel)' },
];

const ESTADOS_PENDIENTE: { value: EstadoPendiente; label: string }[] = [
  { value: 'ABIERTO', label: 'Abierto' },
  { value: 'EN_CURSO', label: 'En curso' },
  { value: 'RESUELTO', label: 'Resuelto' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

const PRIORIDADES_PENDIENTE: { value: PrioridadPendiente; label: string }[] = [
  { value: 'ALTA', label: 'Alta' },
  { value: 'MEDIA', label: 'Media' },
  { value: 'BAJA', label: 'Baja' },
];

function diffDays(dateStr: string): number {
  const today = new Date(todayStr() + 'T00:00:00').getTime();
  const target = new Date(dateStr + 'T00:00:00').getTime();
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

const ControlGlobal: React.FC = () => {
  const navigate = useNavigate();
  const {
    vehicles,
    unidades,
    conductores,
    controlFechas,
    kilometrajes,
    pendientes,
    ingresos,
    gastos,
    addUnidad,
    addConductor,
    addControlFecha,
    addKilometraje,
    addPendiente,
    updatePendiente,
    deletePendiente,
    deleteUnidad,
    deleteConductor,
    deleteControlFecha,
    deleteKilometraje,
    getVehicleLabel,
  } = useRegistrosContext();

  const [unidad, setUnidad] = useState({
    vehicleId: '',
    numeroInterno: '',
    marca: '',
    modelo: '',
    anio: '',
    placa: '',
    detalleAuto: '',
    combustible: '',
    color: '',
    gpsInstalado: true,
    gpsProveedor: '',
    impuestoVehicularVence: '',
    comentarios: '',
  });
  const [conductor, setConductor] = useState({
    vehicleId: '',
    tipoDocumento: 'DNI',
    numeroDocumento: '',
    nombres: '',
    apellidos: '',
    celular: '',
    domicilio: 'ALQUILADO',
    estadoContrato: 'CERRADO',
    estado: 'VIGENTE',
    comentarios: '',
  });
  const [control, setControl] = useState({
    vehicleId: '',
    tipo: 'SOAT',
    fechaVencimiento: todayStr(),
    comentarios: '',
  });
  const [km, setKm] = useState({
    vehicleId: '',
    fecha: todayStr(),
    kmMantenimiento: '',
    kilometraje: '',
    descripcion: '',
    costo: '',
  });
  const [pendienteForm, setPendienteForm] = useState({
    vehicleId: '',
    descripcion: '',
    estado: 'ABIERTO' as EstadoPendiente,
    fecha: todayStr(),
    prioridad: 'MEDIA' as PrioridadPendiente,
  });

  const [soloConProblemas, setSoloConProblemas] = useState(false);

  /* ── Estado por vehículo ── */
  const vehicleStatus = useMemo(() => {
    return vehicles
      .filter((v) => v.activo)
      .map((v) => {
        /* Vencimientos para este vehículo */
        const fechasV = controlFechas.filter((c) => c.vehicleId === v.id);
        const vencidos = fechasV
          .filter((c) => diffDays(c.fechaVencimiento) < 0)
          .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
        const proximos = fechasV
          .filter((c) => { const d = diffDays(c.fechaVencimiento); return d >= 0 && d <= 30; })
          .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
        const ok = fechasV
          .filter((c) => diffDays(c.fechaVencimiento) > 30)
          .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));

        /* Último ingreso */
        const ingresosV = ingresos
          .filter((i) => i.vehicleId === v.id)
          .sort((a, b) => b.fecha.localeCompare(a.fecha));
        const ultimoIngreso = ingresosV[0] ?? null;

        /* Último gasto */
        const gastosV = gastos
          .filter((g) => g.vehicleId === v.id)
          .sort((a, b) => b.fecha.localeCompare(a.fecha));
        const ultimoGasto = gastosV[0] ?? null;

        /* Días sin ingreso */
        const diasSinIngreso =
          ultimoIngreso ? Math.abs(diffDays(ultimoIngreso.fecha)) : null;

        /* Estado general */
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
          tieneFechas: fechasV.length > 0,
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
    () =>
      soloConProblemas
        ? vehicleStatus.filter((s) => s.estadoGeneral !== 'OK')
        : vehicleStatus,
    [vehicleStatus, soloConProblemas],
  );

  const alertas = useMemo(
    () => controlFechas.filter((c) => diffDays(c.fechaVencimiento) <= 30).length,
    [controlFechas],
  );

  const pendientesActivos = useMemo(
    () => pendientes.filter((p) => p.estado === 'ABIERTO' || p.estado === 'EN_CURSO').length,
    [pendientes],
  );

  const pendientesSorted = useMemo(() => {
    const rank: Record<PrioridadPendiente, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };
    return [...pendientes].sort((a, b) => {
      const rp = rank[a.prioridad] - rank[b.prioridad];
      if (rp !== 0) return rp;
      const fd = b.fecha.localeCompare(a.fecha);
      if (fd !== 0) return fd;
      return b.id - a.id;
    });
  }, [pendientes]);

  const controlKm = useMemo(() => {
    const byVehicle = new Map<number, typeof kilometrajes>();
    kilometrajes.forEach((r) => {
      const arr = byVehicle.get(r.vehicleId) ?? [];
      arr.push(r);
      byVehicle.set(r.vehicleId, arr);
    });

    return Array.from(byVehicle.entries()).map(([vehicleId, rows]) => {
      const maxKmMant = rows.reduce<number | null>((acc, r) => {
        if (r.kmMantenimiento == null) return acc;
        return acc == null ? r.kmMantenimiento : Math.max(acc, r.kmMantenimiento);
      }, null);
      const maxKm = rows.reduce<number | null>((acc, r) => {
        if (r.kilometraje == null) return acc;
        return acc == null ? r.kilometraje : Math.max(acc, r.kilometraje);
      }, null);
      const fMant = maxKmMant == null
        ? null
        : rows
            .filter((r) => r.kmMantenimiento === maxKmMant)
            .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.fecha ?? null;
      const fUlt = maxKm == null
        ? null
        : rows
            .filter((r) => r.kilometraje === maxKm)
            .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.fecha ?? null;
      const variacion = maxKm != null && maxKmMant != null ? maxKm - maxKmMant : null;
      const dias = fMant && fUlt ? Math.abs(diffDays(fMant) - diffDays(fUlt)) : null;
      const lastMantDesc =
        rows
          .filter((r) => r.descripcion?.trim())
          .sort((a, b) => (b.fecha + b.createdAt).localeCompare(a.fecha + a.createdAt))[0]
          ?.descripcion
          ?.trim()
          ?.toUpperCase() ?? '';

      return {
        vehicleId,
        kmMant: maxKmMant,
        kmUlt: maxKm,
        fMant,
        fUlt,
        variacion,
        dias,
        mantRealizado: lastMantDesc || (variacion != null && variacion >= 3500 ? 'MANT.COMPLETO' : 'MANT.SIMPLE'),
      };
    });
  }, [kilometrajes]);

  const controlFechasPivot = useMemo(() => {
    const order = [
      'BAT_MANT_REALIZADO',
      'BAT_COMPRA_NUEVA',
      'SOAT',
      'RT_PARTICULAR',
      'RT_TAXI',
      'AFOCAT_TAXI',
      'PERMISO_ATU',
      'INSTALACION_GNV',
      'CERT_GNV_ANUAL',
      'QUINQUENAL_GNV',
      'VENC_BREVETE',
      'CREDENCIAL_ATU_BREVETE',
      'GPS',
      'IMPUESTO',
      'OTRO_VENCIMIENTO',
    ];
    const map = new Map<number, Record<string, string | number | null>>();
    controlFechas.forEach((c) => {
      if (c.vehicleId == null) return;
      const row = map.get(c.vehicleId) ?? { vehicleId: c.vehicleId };
      const old = row[c.tipo] as string | undefined;
      if (!old || c.fechaVencimiento > old) row[c.tipo] = c.fechaVencimiento;
      map.set(c.vehicleId, row);
    });
    return Array.from(map.values())
      .sort((a, b) => Number(a.vehicleId) - Number(b.vehicleId))
      .map((r) => {
        const out: Record<string, string | number | null> = { vehicleId: r.vehicleId };
        order.forEach((k) => {
          out[k] = r[k] ?? null;
        });
        return out;
      });
  }, [controlFechas]);

  const operativeAlerts = useMemo(
    () => buildOperativeAlerts(ingresos, controlFechas, vehicles),
    [ingresos, controlFechas, vehicles],
  );
  const operativeAlertCounts = useMemo(() => countAlertsByKind(operativeAlerts), [operativeAlerts]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/operaciones')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🧭 Control Global</h1>
          <p className="text-sm text-gray-500">Vista rapida + registros de unidades, conductores, fechas, kilometraje y pendientes</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="p-4" padding={false}><p className="text-xs text-gray-500">Unidades</p><p className="text-2xl font-bold">{unidades.length}</p></Card>
        <Card className="p-4" padding={false}><p className="text-xs text-gray-500">Conductores vigentes</p><p className="text-2xl font-bold">{conductores.filter(c => c.estado === 'VIGENTE').length}</p></Card>
        <Card className="p-4" padding={false}><p className="text-xs text-gray-500">Alertas fechas (30 dias)</p><p className="text-2xl font-bold text-amber-700">{alertas}</p></Card>
        <Card className="p-4" padding={false}><p className="text-xs text-gray-500">Control KMS autos</p><p className="text-2xl font-bold text-sky-700">{controlKm.length}</p></Card>
        <Card className="p-4 col-span-2 sm:col-span-1 lg:col-span-1" padding={false}><p className="text-xs text-gray-500">Pendientes activos</p><p className="text-2xl font-bold text-violet-700">{pendientesActivos}</p></Card>
      </div>

      <button
        type="button"
        onClick={() => navigate('/operaciones/tiempo')}
        className="w-full text-left rounded-2xl border border-indigo-100 bg-indigo-50/90 px-4 py-3 text-sm hover:bg-indigo-50 transition-colors"
      >
        <span className="font-semibold text-indigo-900">⏱️ Valor tiempo (hoja TIEMPO del Excel)</span>
        <span className="block text-xs text-indigo-700 mt-0.5">
          Registros por vehículo — distinto de ingresos y gastos
        </span>
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
              {operativeAlertCounts.INGRESO_PENDIENTE} cobro(s) pendiente(s) · {operativeAlertCounts.VENCIMIENTO}{' '}
              vencimiento(s) · {operativeAlertCounts.SIN_INGRESOS} vehículo(s) sin ingresos recientes
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

      {/* ══════════════════════════════════════
          TABLERO DE ESTADO POR VEHÍCULO
      ══════════════════════════════════════ */}
      <Card
        title="Estado por vehículo"
        subtitle="Vencimientos, último ingreso y gasto por unidad activa"
      >
        {/* Filtro */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="font-medium">{vehicleStatusFiltered.length} unidad{vehicleStatusFiltered.length !== 1 ? 'es' : ''}</span>
            {soloConProblemas && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                con problemas
              </span>
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

              const BadgeIcon =
                estadoGeneral === 'CRITICO'
                  ? XCircle
                  : estadoGeneral === 'ALERTA'
                    ? Clock
                    : CheckCircle2;

              return (
                <div key={v.id} className={`rounded-2xl border-2 p-4 space-y-3 transition-all ${borderColor}`}>
                  {/* Cabecera */}
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

                  {/* Vencimientos */}
                  {(vencidos.length > 0 || proximos.length > 0) ? (
                    <div className="space-y-1">
                      {vencidos.slice(0, 3).map((c) => (
                        <div key={c.id} className="flex items-center justify-between text-xs">
                          <span className="text-red-700 font-medium truncate mr-1">{c.tipo.replace(/_/g, ' ')}</span>
                          <span className="text-red-600 whitespace-nowrap font-bold">
                            {Math.abs(diffDays(c.fechaVencimiento))}d vencido
                          </span>
                        </div>
                      ))}
                      {vencidos.length > 3 && (
                        <p className="text-xs text-red-500 font-semibold">+{vencidos.length - 3} más vencidos</p>
                      )}
                      {proximos.slice(0, 2).map((c) => (
                        <div key={c.id} className="flex items-center justify-between text-xs">
                          <span className="text-amber-700 font-medium truncate mr-1">{c.tipo.replace(/_/g, ' ')}</span>
                          <span className="text-amber-600 whitespace-nowrap">
                            {diffDays(c.fechaVencimiento)}d
                          </span>
                        </div>
                      ))}
                      {proximos.length > 2 && (
                        <p className="text-xs text-amber-600">+{proximos.length - 2} próximos</p>
                      )}
                    </div>
                  ) : ok.length > 0 ? (
                    <p className="text-xs text-emerald-600 font-medium">
                      {ok.length} fecha{ok.length !== 1 ? 's' : ''} al día
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 italic">Sin fechas registradas</p>
                  )}

                  {/* Separador */}
                  <div className="border-t border-gray-200/70" />

                  {/* Último ingreso y gasto */}
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

      <Card title="Pendientes (lista de trabajo)" subtitle="Similar a la hoja PENDIENTES del Excel — por vehiculo, fecha y prioridad">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <Select
            label="Vehiculo (opcional)"
            options={vehicles.map(v => ({ value: String(v.id), label: `#${v.id} ${v.marca} ${v.modelo}` }))}
            value={pendienteForm.vehicleId}
            placeholder="General"
            onChange={(v) => setPendienteForm((p) => ({ ...p, vehicleId: v }))}
          />
          <Input
            label="Fecha"
            type="date"
            value={pendienteForm.fecha}
            onChange={(e) => setPendienteForm((p) => ({ ...p, fecha: e.target.value }))}
          />
          <Select
            label="Estado inicial"
            options={ESTADOS_PENDIENTE}
            value={pendienteForm.estado}
            onChange={(v) => setPendienteForm((p) => ({ ...p, estado: v as EstadoPendiente }))}
          />
          <Select
            label="Prioridad"
            options={PRIORIDADES_PENDIENTE}
            value={pendienteForm.prioridad}
            onChange={(v) => setPendienteForm((p) => ({ ...p, prioridad: v as PrioridadPendiente }))}
          />
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="label">Descripcion</label>
            <textarea
              value={pendienteForm.descripcion}
              onChange={(e) => setPendienteForm((p) => ({ ...p, descripcion: e.target.value }))}
              rows={2}
              className="input-field text-sm min-h-[72px] resize-y"
              placeholder="Que falta hacer, observaciones..."
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-sm font-semibold"
            onClick={() => {
              const d = pendienteForm.descripcion.trim();
              if (!d) return;
              void addPendiente({
                vehicleId: pendienteForm.vehicleId ? Number(pendienteForm.vehicleId) : null,
                descripcion: d,
                estado: pendienteForm.estado,
                fecha: pendienteForm.fecha,
                prioridad: pendienteForm.prioridad,
              }).then((res) => {
                if (!res) return;
                setPendienteForm({
                  vehicleId: '',
                  descripcion: '',
                  estado: 'ABIERTO',
                  fecha: todayStr(),
                  prioridad: 'MEDIA',
                });
              });
            }}
          >
            Guardar pendiente
          </button>
        </div>
        <div className="mt-4 overflow-x-auto max-h-[320px] overflow-y-auto border border-gray-100 rounded-xl">
          {pendientesSorted.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8 px-4">No hay pendientes registrados.</p>
          ) : (
            <table className="w-full text-sm min-w-[720px]">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="text-left py-2 px-3">Fecha</th>
                  <th className="text-left py-2 px-3">Unidad</th>
                  <th className="text-left py-2 px-3">Descripcion</th>
                  <th className="text-left py-2 px-3 w-36">Prioridad</th>
                  <th className="text-left py-2 px-3 w-36">Estado</th>
                  <th className="text-right py-2 px-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {pendientesSorted.map((p: Pendiente) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/80 align-top">
                    <td className="py-2 px-3 whitespace-nowrap text-gray-600">{formatDate(p.fecha)}</td>
                    <td className="py-2 px-3 text-xs">{getVehicleLabel(p.vehicleId)}</td>
                    <td className="py-2 px-3 text-xs text-gray-700 max-w-[280px]">
                      <span className="line-clamp-3" title={p.descripcion}>{p.descripcion}</span>
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={p.prioridad}
                        onChange={(e) =>
                          void updatePendiente(p.id, { prioridad: e.target.value as PrioridadPendiente })
                        }
                        className="input-field text-xs py-1.5 w-full"
                      >
                        {PRIORIDADES_PENDIENTE.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={p.estado}
                        onChange={(e) =>
                          void updatePendiente(p.id, { estado: e.target.value as EstadoPendiente })
                        }
                        className="input-field text-xs py-1.5 w-full"
                      >
                        {ESTADOS_PENDIENTE.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => void deletePendiente(p.id)}
                        className="text-gray-400 hover:text-red-500 p-1"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Card title="Cuadro ID (referencia rapida)" subtitle="Catalogo operativo para reducir pasos">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div><p className="font-semibold text-gray-700 mb-2">Tipo ingreso</p><div className="flex flex-wrap gap-1">{ID_TIPOS_INGRESO.map(t => <span key={t} className="px-2 py-1 bg-emerald-50 rounded">{t}</span>)}</div></div>
          <div><p className="font-semibold text-gray-700 mb-2">G. mecanicos</p><div className="flex flex-wrap gap-1">{ID_G_MECANICOS.map(t => <span key={t} className="px-2 py-1 bg-blue-50 rounded">{t}</span>)}</div></div>
          <div><p className="font-semibold text-gray-700 mb-2">G. tributarios</p><div className="flex flex-wrap gap-1">{ID_G_TRIBUT.map(t => <span key={t} className="px-2 py-1 bg-purple-50 rounded">{t}</span>)}</div></div>
        </div>
      </Card>

      <Card title="Registro rapido de unidades">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select label="Vehiculo base (opcional)" options={vehicles.map(v => ({ value: v.id, label: `#${v.id} ${v.marca} ${v.modelo}` }))} value={unidad.vehicleId} placeholder="Sin vincular" onChange={(v) => setUnidad(p => ({ ...p, vehicleId: v }))} />
          <Input label="Numero interno" value={unidad.numeroInterno} onChange={(e) => setUnidad(p => ({ ...p, numeroInterno: e.target.value }))} />
          <Input label="Placa" value={unidad.placa} onChange={(e) => setUnidad(p => ({ ...p, placa: e.target.value }))} />
          <Input label="Marca" value={unidad.marca} onChange={(e) => setUnidad(p => ({ ...p, marca: e.target.value }))} />
          <Input label="Modelo" value={unidad.modelo} onChange={(e) => setUnidad(p => ({ ...p, modelo: e.target.value }))} />
          <Input label="Ano" type="number" value={unidad.anio} onChange={(e) => setUnidad(p => ({ ...p, anio: e.target.value }))} />
          <Input label="Detalle auto" value={unidad.detalleAuto} onChange={(e) => setUnidad(p => ({ ...p, detalleAuto: e.target.value }))} />
          <Input label="Combustible" value={unidad.combustible} onChange={(e) => setUnidad(p => ({ ...p, combustible: e.target.value }))} />
          <Input label="Color" value={unidad.color} onChange={(e) => setUnidad(p => ({ ...p, color: e.target.value }))} />
          <Input label="GPS proveedor" value={unidad.gpsProveedor} onChange={(e) => setUnidad(p => ({ ...p, gpsProveedor: e.target.value }))} />
          <Input label="Impuesto vence" type="date" value={unidad.impuestoVehicularVence} onChange={(e) => setUnidad(p => ({ ...p, impuestoVehicularVence: e.target.value }))} />
          <Input label="Comentarios" value={unidad.comentarios} onChange={(e) => setUnidad(p => ({ ...p, comentarios: e.target.value }))} />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-semibold"
            onClick={() => void addUnidad({
              vehicleId: unidad.vehicleId ? Number(unidad.vehicleId) : null,
              numeroInterno: unidad.numeroInterno.trim(),
              marca: unidad.marca.trim(),
              modelo: unidad.modelo.trim(),
              anio: Number(unidad.anio || 0),
              placa: unidad.placa.trim(),
              detalleAuto: unidad.detalleAuto.trim(),
              combustible: unidad.combustible.trim(),
              color: unidad.color.trim(),
              tipoCarroceria: '',
              numeroMotor: '',
              cantidadLlaves: null,
              gps1: '',
              gps2: '',
              impuestoEstado: '',
              kmInicial: null,
              tarjetaPropiedad: '',
              propietario: '',
              fechaCompraUSD: null,
              valorCompraUSD: null,
              tipoCambioCompra: null,
              gpsInstalado: true,
              gpsProveedor: unidad.gpsProveedor.trim(),
              impuestoVehicularVence: unidad.impuestoVehicularVence || null,
              comentarios: unidad.comentarios.trim(),
            })}
          >
            Guardar unidad
          </button>
        </div>
      </Card>

      <Card title="Registro rapido de conductores">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select label="Vehiculo" options={vehicles.map(v => ({ value: v.id, label: `#${v.id} ${v.marca}` }))} value={conductor.vehicleId} placeholder="General" onChange={(v) => setConductor(p => ({ ...p, vehicleId: v }))} />
          <Select label="Doc." options={[{ value: 'DNI', label: 'DNI' }, { value: 'CE', label: 'CE' }, { value: 'PASAPORTE', label: 'PASAPORTE' }]} value={conductor.tipoDocumento} onChange={(v) => setConductor(p => ({ ...p, tipoDocumento: v }))} />
          <Input label="Nro documento" value={conductor.numeroDocumento} onChange={(e) => setConductor(p => ({ ...p, numeroDocumento: e.target.value }))} />
          <Input label="Nombres" value={conductor.nombres} onChange={(e) => setConductor(p => ({ ...p, nombres: e.target.value }))} />
          <Input label="Apellidos" value={conductor.apellidos} onChange={(e) => setConductor(p => ({ ...p, apellidos: e.target.value }))} />
          <Input label="Celular" value={conductor.celular} onChange={(e) => setConductor(p => ({ ...p, celular: e.target.value }))} />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-semibold"
            onClick={() => void addConductor({
              vehicleId: conductor.vehicleId ? Number(conductor.vehicleId) : null,
              tipoDocumento: conductor.tipoDocumento as 'DNI' | 'CE' | 'PASAPORTE',
              numeroDocumento: conductor.numeroDocumento.trim(),
              nombres: conductor.nombres.trim(),
              apellidos: conductor.apellidos.trim(),
              celular: conductor.celular.trim(),
              domicilio: conductor.domicilio as 'PROPIO' | 'ALQUILADO' | 'CASA DE FAMILIA',
              estadoContrato: conductor.estadoContrato as 'ABIERTO' | 'CERRADO',
              estado: conductor.estado as 'VIGENTE' | 'SUSPENDIDO',
              comentarios: conductor.comentarios.trim(),
            })}
          >
            Guardar conductor
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Control de fechas">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Unidad" options={vehicles.map(v => ({ value: v.id, label: `#${v.id} ${v.marca}` }))} value={control.vehicleId} placeholder="General" onChange={(v) => setControl(p => ({ ...p, vehicleId: v }))} />
            <Select label="Tipo" options={TIPOS_FECHA} value={control.tipo} onChange={(v) => setControl(p => ({ ...p, tipo: v }))} />
            <Input label="Vence" type="date" value={control.fechaVencimiento} onChange={(e) => setControl(p => ({ ...p, fechaVencimiento: e.target.value }))} />
            <Input label="Comentario" value={control.comentarios} onChange={(e) => setControl(p => ({ ...p, comentarios: e.target.value }))} />
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-semibold" onClick={() => void addControlFecha({
              vehicleId: control.vehicleId ? Number(control.vehicleId) : null,
              tipo: control.tipo as any,
              fechaVencimiento: control.fechaVencimiento,
              fechaRegistro: todayStr(),
              comentarios: control.comentarios.trim(),
            })}>Guardar fecha</button>
          </div>
          <div className="mt-4 space-y-2 max-h-64 overflow-auto">
            {controlFechas.map(c => {
              const d = diffDays(c.fechaVencimiento);
              const cls = d < 0 ? 'text-red-600' : d <= 30 ? 'text-amber-700' : 'text-emerald-700';
              return (
                <div key={c.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{c.tipo} · {getVehicleLabel(c.vehicleId)}</p>
                    <p className="text-xs text-gray-500">{formatDate(c.fechaVencimiento)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-semibold ${cls}`}>{d < 0 ? `${Math.abs(d)} dias vencido` : `${d} dias`}</p>
                    <button type="button" onClick={() => void deleteControlFecha(c.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Registro de kilometraje">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Unidad" options={vehicles.map(v => ({ value: v.id, label: `#${v.id} ${v.marca}` }))} value={km.vehicleId} onChange={(v) => setKm(p => ({ ...p, vehicleId: v }))} />
            <Input label="Fecha" type="date" value={km.fecha} onChange={(e) => setKm(p => ({ ...p, fecha: e.target.value }))} />
            <Input label="KM mantenimiento" type="number" value={km.kmMantenimiento} onChange={(e) => setKm(p => ({ ...p, kmMantenimiento: e.target.value }))} />
            <Input label="Kilometraje actual" type="number" value={km.kilometraje} onChange={(e) => setKm(p => ({ ...p, kilometraje: e.target.value }))} />
            <Input label="Descripcion" value={km.descripcion} onChange={(e) => setKm(p => ({ ...p, descripcion: e.target.value }))} />
            <Input label="Costo (S/)" type="number" value={km.costo} onChange={(e) => setKm(p => ({ ...p, costo: e.target.value }))} />
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-semibold" onClick={() => {
              if (!km.vehicleId) return;
              void addKilometraje({
                vehicleId: Number(km.vehicleId),
                fecha: km.fecha,
                fechaRegistro: todayStr(),
                kmMantenimiento: km.kmMantenimiento ? Number(km.kmMantenimiento) : null,
                kilometraje: km.kilometraje ? Number(km.kilometraje) : null,
                descripcion: km.descripcion.trim(),
                costo: km.costo ? Number(km.costo) : null,
              });
            }}>Guardar kilometraje</button>
          </div>
        </Card>
      </div>

      <Card title="Control KMS interconectado (formula rapida)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b">
                <th className="text-left py-2">Unidad</th>
                <th className="text-right py-2">Ult. km mant.</th>
                <th className="text-right py-2">Ult. km</th>
                <th className="text-right py-2">Variacion</th>
                <th className="text-right py-2">Dif. dias</th>
                <th className="text-right py-2">Mant.</th>
              </tr>
            </thead>
            <tbody>
              {controlKm.map((r) => (
                <tr key={r.vehicleId} className="border-b border-gray-50">
                  <td className="py-2">{getVehicleLabel(r.vehicleId)}</td>
                  <td className="py-2 text-right">{r.kmMant ?? '—'}</td>
                  <td className="py-2 text-right">{r.kmUlt ?? '—'}</td>
                  <td className="py-2 text-right">{r.variacion ?? '—'}</td>
                  <td className="py-2 text-right">{r.dias ?? '—'}</td>
                  <td className="py-2 text-right font-semibold">{r.mantRealizado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Cuadro CONTROL.F (fechas maximas por unidad)" subtitle="Replica de lectura global por unidad (maximos por tipo)">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[1120px]">
            <thead>
              <tr className="text-gray-500 uppercase border-b">
                <th className="text-left py-2 pr-2">N Auto</th>
                <th className="text-left py-2 pr-2">BAT-MANT.</th>
                <th className="text-left py-2 pr-2">BAT-COMPRA</th>
                <th className="text-left py-2 pr-2">SOAT</th>
                <th className="text-left py-2 pr-2">RT PART.</th>
                <th className="text-left py-2 pr-2">RT TAXI</th>
                <th className="text-left py-2 pr-2">AFOCAT</th>
                <th className="text-left py-2 pr-2">PERMISO ATU</th>
                <th className="text-left py-2 pr-2">INST. GNV</th>
                <th className="text-left py-2 pr-2">CERT. ANUAL</th>
                <th className="text-left py-2 pr-2">QUINQ. GNV</th>
                <th className="text-left py-2 pr-2">VENC BREVETE</th>
                <th className="text-left py-2 pr-2">CRED. ATU BREVETE</th>
                <th className="text-left py-2 pr-2">GPS</th>
                <th className="text-left py-2 pr-2">IMP.</th>
                <th className="text-left py-2 pr-2">OTRO</th>
              </tr>
            </thead>
            <tbody>
              {controlFechasPivot.map((r) => (
                <tr key={String(r.vehicleId)} className="border-b border-gray-50">
                  <td className="py-2 pr-2 font-medium">{String(r.vehicleId)}</td>
                  <td className="py-2 pr-2">{r.BAT_MANT_REALIZADO ? formatDate(String(r.BAT_MANT_REALIZADO)) : '—'}</td>
                  <td className="py-2 pr-2">{r.BAT_COMPRA_NUEVA ? formatDate(String(r.BAT_COMPRA_NUEVA)) : '—'}</td>
                  <td className="py-2 pr-2">{r.SOAT ? formatDate(String(r.SOAT)) : '—'}</td>
                  <td className="py-2 pr-2">{r.RT_PARTICULAR ? formatDate(String(r.RT_PARTICULAR)) : '—'}</td>
                  <td className="py-2 pr-2">{r.RT_TAXI ? formatDate(String(r.RT_TAXI)) : '—'}</td>
                  <td className="py-2 pr-2">{r.AFOCAT_TAXI ? formatDate(String(r.AFOCAT_TAXI)) : '—'}</td>
                  <td className="py-2 pr-2">{r.PERMISO_ATU ? formatDate(String(r.PERMISO_ATU)) : '—'}</td>
                  <td className="py-2 pr-2">{r.INSTALACION_GNV ? formatDate(String(r.INSTALACION_GNV)) : '—'}</td>
                  <td className="py-2 pr-2">{r.CERT_GNV_ANUAL ? formatDate(String(r.CERT_GNV_ANUAL)) : '—'}</td>
                  <td className="py-2 pr-2">{r.QUINQUENAL_GNV ? formatDate(String(r.QUINQUENAL_GNV)) : '—'}</td>
                  <td className="py-2 pr-2">{r.VENC_BREVETE ? formatDate(String(r.VENC_BREVETE)) : '—'}</td>
                  <td className="py-2 pr-2">{r.CREDENCIAL_ATU_BREVETE ? formatDate(String(r.CREDENCIAL_ATU_BREVETE)) : '—'}</td>
                  <td className="py-2 pr-2">{r.GPS ? formatDate(String(r.GPS)) : '—'}</td>
                  <td className="py-2 pr-2">{r.IMPUESTO ? formatDate(String(r.IMPUESTO)) : '—'}</td>
                  <td className="py-2 pr-2">{r.OTRO_VENCIMIENTO ? formatDate(String(r.OTRO_VENCIMIENTO)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Unidades">
          <div className="space-y-2 max-h-72 overflow-auto">
            {unidades.map((u) => (
              <div key={u.id} className="border border-gray-100 rounded-lg px-3 py-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{u.numeroInterno || '—'} · {u.detalleAuto || `${u.marca} ${u.modelo}`}</p>
                  <p className="text-xs text-gray-500">
                    {u.placa} · GPS {u.gpsInstalado ? 'SI' : 'NO'}
                    {u.impuestoEstado ? ` · Imp. ${u.impuestoEstado}` : ''}
                    {u.impuestoVehicularVence ? ` · Vence ${formatDate(u.impuestoVehicularVence)}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => void deleteUnidad(u.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Conductores">
          <div className="space-y-2 max-h-72 overflow-auto">
            {conductores.map((c) => (
              <div key={c.id} className="border border-gray-100 rounded-lg px-3 py-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{c.nombres} {c.apellidos}</p>
                  <p className="text-xs text-gray-500">
                    {c.tipoDocumento} {c.numeroDocumento} · {c.celular} · {getVehicleLabel(c.vehicleId)}
                    {c.cochera ? ` · Cochera ${c.cochera}` : ''}
                    {c.numeroEmergencia ? ` · Emerg. ${c.numeroEmergencia}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => void deleteConductor(c.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Ultimos registros de kilometraje">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b">
                <th className="text-left py-2">Fecha</th>
                <th className="text-left py-2">Unidad</th>
                <th className="text-right py-2">KM mant.</th>
                <th className="text-right py-2">KM</th>
                <th className="text-right py-2">Costo</th>
                <th className="text-right py-2"></th>
              </tr>
            </thead>
            <tbody>
              {kilometrajes.slice(0, 50).map((r) => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="py-2">{formatDate(r.fecha)}</td>
                  <td className="py-2">{getVehicleLabel(r.vehicleId)}</td>
                  <td className="py-2 text-right">{r.kmMantenimiento ?? '—'}</td>
                  <td className="py-2 text-right">{r.kilometraje ?? '—'}</td>
                  <td className="py-2 text-right">{r.costo != null ? formatCurrency(r.costo) : '—'}</td>
                  <td className="py-2 text-right"><button type="button" onClick={() => void deleteKilometraje(r.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default ControlGlobal;

