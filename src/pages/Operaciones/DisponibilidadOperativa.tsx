import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import Card from '../../components/Common/Card';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useAuth } from '../../context/AuthContext';
import { useAmountDisplay } from '../../hooks/useAmountDisplay';
import { fetchVehicleDowntimes } from '../../services/vehicleDowntimeService';
import type { VehicleDowntime } from '../../data/types';
import {
  alertasIndisponibilidad,
  buildDowntimeDashboardKpis,
  buildDowntimeFilasDashboard,
} from '../../utils/vehicleDowntimeImpact';
import { canMutateVehiculos } from '../../utils/permissions';

const DisponibilidadOperativa: React.FC = () => {
  const navigate = useNavigate();
  const { formatGlobalAmount } = useAmountDisplay();
  const { user, profile } = useAuth();
  const canEdit = canMutateVehiculos(user);
  const { vehicles, ingresos, cajaNegocioVehiculo } = useRegistrosContext();
  const [records, setRecords] = useState<VehicleDowntime[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const rows = await fetchVehicleDowntimes(profile?.empresa_id);
    if (rows.length === 0 && canEdit) {
      setLoadError(
        'Sin registros o tabla no disponible. Ejecuta supabase/migration_vehicle_downtime.sql en el proyecto.',
      );
    }
    setRecords(rows);
    setLoading(false);
  }, [profile?.empresa_id, canEdit]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filas = useMemo(
    () => buildDowntimeFilasDashboard(records, vehicles, ingresos, cajaNegocioVehiculo),
    [records, vehicles, ingresos, cajaNegocioVehiculo],
  );

  const kpis = useMemo(() => buildDowntimeDashboardKpis(filas, vehicles), [filas, vehicles]);
  const alertas = useMemo(() => alertasIndisponibilidad(filas), [filas]);

  const topDetenidos = useMemo(
    () => filas.filter((f) => f.downtime.estado === 'activo').slice(0, 15),
    [filas],
  );

  const fmtPct = (n: number | null) =>
    n != null && Number.isFinite(n) ? `${n.toFixed(1)}%` : '—';

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-10 animate-fade-in">
      <header className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate('/operaciones')}
          className="mt-0.5 shrink-0 rounded-xl p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Volver a Operaciones"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700/90">Operaciones</p>
          <h1 className="text-2xl font-bold text-slate-900">Disponibilidad operativa</h1>
          <p className="mt-1 text-sm text-slate-600">
            Mide el ingreso que deja de generar un vehículo cuando no está disponible. No modifica utilidad,
            gastos ni ingresos registrados.
          </p>
        </div>
      </header>

      {loadError && records.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {loadError}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="text-[10px] font-bold uppercase text-emerald-800">Disponibilidad</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-950">
            {loading ? '…' : fmtPct(kpis.disponibilidadPct)}
          </p>
          <p className="mt-1 text-[10px] text-emerald-800/80">Estimado flota activa (30 d)</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-bold uppercase text-slate-500">Días fuera servicio</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{loading ? '…' : kpis.diasFueraServicio}</p>
          <p className="mt-1 text-[10px] text-slate-500">Indisponibilidades activas</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-bold uppercase text-slate-500">Ingreso diario promedio</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {loading ? '…' : formatGlobalAmount(kpis.ingresoDiarioPromedio)}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">Unidades detenidas (90 d)</p>
        </div>
        <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
          <p className="text-[10px] font-bold uppercase text-orange-800">Ingreso potencial perdido</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-orange-950">
            {loading ? '…' : formatGlobalAmount(kpis.ingresoPotencialPerdido)}
          </p>
          <p className="mt-1 text-[10px] text-orange-800/80">Σ días × ingreso/día</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Detenidos más de 3 días" compact>
          {alertas.mas3Dias.length === 0 ? (
            <p className="text-sm text-slate-500">Ninguno.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {alertas.mas3Dias.slice(0, 8).map((f) => (
                <li key={f.downtime.id}>
                  <Link to={`/vehiculos/${f.vehicleId}`} className="font-medium text-violet-800 hover:underline">
                    {f.placa}
                  </Link>
                  <span className="text-slate-600"> · {f.diasFuera} d · {formatGlobalAmount(f.perdidaOportunidad)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Detenidos más de 7 días" compact>
          {alertas.mas7Dias.length === 0 ? (
            <p className="text-sm text-slate-500">Ninguno.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {alertas.mas7Dias.slice(0, 8).map((f) => (
                <li key={f.downtime.id}>
                  <Link to={`/vehiculos/${f.vehicleId}`} className="font-medium text-violet-800 hover:underline">
                    {f.placa}
                  </Link>
                  <span className="text-slate-600"> · {f.diasFuera} d</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Top pérdida económica" compact>
          {alertas.topPerdida.length === 0 ? (
            <p className="text-sm text-slate-500">Sin datos.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {alertas.topPerdida.map((f) => (
                <li key={f.downtime.id}>
                  <Link to={`/vehiculos/${f.vehicleId}`} className="font-medium text-violet-800 hover:underline">
                    {f.placa}
                  </Link>
                  <span className="text-slate-600"> · {formatGlobalAmount(f.perdidaOportunidad)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Top vehículos detenidos" subtitle="Indisponibilidades activas" compact>
        {loading ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : topDetenidos.length === 0 ? (
          <p className="text-sm text-slate-500">No hay vehículos detenidos actualmente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Vehículo</th>
                  <th className="py-2 pr-3">Placa</th>
                  <th className="py-2 pr-3">Motivo</th>
                  <th className="py-2 text-right">Días</th>
                  <th className="py-2 text-right">Ingreso perdido</th>
                </tr>
              </thead>
              <tbody>
                {topDetenidos.map((f) => (
                  <tr key={f.downtime.id} className="border-b border-slate-50">
                    <td className="py-2 pr-3">
                      <Link
                        to={`/vehiculos/${f.vehicleId}`}
                        className="font-medium text-violet-800 hover:underline"
                      >
                        #{f.vehicleId}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{f.placa}</td>
                    <td className="py-2 pr-3 text-slate-700">{f.motivoLabel}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{f.diasFuera}</td>
                    <td className="py-2 text-right tabular-nums font-semibold text-orange-800">
                      {formatGlobalAmount(f.perdidaOportunidad)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-500">
        Registra indisponibilidades desde el detalle de cada vehículo. Fórmula: días fuera × ingreso promedio
        diario (últimos 90 días o histórico).
      </p>
    </div>
  );
};

export default DisponibilidadOperativa;
