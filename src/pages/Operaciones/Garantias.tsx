import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useAmountDisplay } from '../../hooks/useAmountDisplay';
import { isGuaranteesModuleEnabled } from '../../config/featureFlags';
import { GUARANTEE_STATUS_LABELS } from '../../data/garantiasTypes';
import type { GuaranteeStatus } from '../../data/garantiasTypes';
import { GUARANTEE_VEHICLE_TYPE_LABELS } from '../../config/guaranteeAmounts';
import { canCreateGarantia, canViewGarantias } from '../../utils/garantiasPermissions';
import { permissionUserFromAuth } from '../../utils/permissions';
import { formatConductorDisplayLabel } from '../../utils/fleetPanel';
import { formatVehicleSelectLabel, getVehicleDisplayNumber } from '../../utils/vehicleDisplayNumber';
import CrearGarantiaModal from '../../components/garantias/CrearGarantiaModal';
import { useGarantiasListData } from '../../hooks/garantias/useGarantiasListData';

const Garantias: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const permissionUser = user ? permissionUserFromAuth(user, profile?.email ?? null) : null;
  const { formatGlobalAmount } = useAmountDisplay();
  const { conductores, vehicles } = useRegistrosContext();
  const canView = canViewGarantias(permissionUser);
  const moduleEnabled = isGuaranteesModuleEnabled();
  const { rows, initialLoading, refreshing, error, load, refreshAfterMutation } = useGarantiasListData(
    profile?.empresa_id,
    moduleEnabled && canView,
  );
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<GuaranteeStatus | ''>('');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const conductorById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of conductores) m.set(c.id, formatConductorDisplayLabel(c));
    return m;
  }, [conductores]);

  const vehicleById = useMemo(() => {
    const m = new Map<number, string>();
    for (const v of vehicles) m.set(v.id, formatVehicleSelectLabel(v));
    return m;
  }, [vehicles]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (vehicleFilter && String(r.currentVehicleId ?? '') !== vehicleFilter) return false;
      if (!needle) return true;
      const name = (conductorById.get(r.driverId) ?? '').toLowerCase();
      const placa = r.currentVehicleId != null ? (vehicleById.get(r.currentVehicleId) ?? '').toLowerCase() : '';
      return name.includes(needle) || placa.includes(needle) || String(r.id).includes(needle);
    });
  }, [rows, q, statusFilter, vehicleFilter, conductorById, vehicleById]);

  const summary = useMemo(() => {
    const active = rows.filter((r) => !r.closedAt && r.status !== 'cerrada' && r.status !== 'devuelta');
    const completa = active.filter((r) => r.status === 'completa').length;
    const incompleta = active.filter((r) =>
      ['pendiente', 'incompleta', 'con_descuentos_pendientes', 'sin_garantia'].includes(r.status),
    ).length;
    const saldo = active.reduce((s, r) => s + r.currentBalance, 0);
    return { total: active.length, completa, incompleta, saldo };
  }, [rows]);

  const showTableLoading = initialLoading && rows.length === 0;
  const showEmptyState = !initialLoading && !refreshing && filtered.length === 0;

  if (!moduleEnabled) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p className="font-semibold">Módulo Garantías desactivado</p>
        <p className="text-sm mt-1">Activa VITE_GUARANTEES_MODULE=1 para usarlo.</p>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p className="font-semibold">Sin permiso para ver garantías</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/operaciones')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Garantías</h1>
            <p className="text-sm text-gray-500">Dinero del conductor · independiente de ingresos operativos</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load({ background: rows.length > 0 })}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : undefined} /> Actualizar
          </button>
          {canCreateGarantia(permissionUser) ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700"
            >
              <Plus size={16} /> Registrar garantía
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Activas', value: String(summary.total) },
          { label: 'Completas', value: String(summary.completa) },
          { label: 'Pendientes / incompletas', value: String(summary.incompleta) },
          { label: 'Saldo total retenido', value: formatGlobalAmount(summary.saldo) },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <label className="block flex-1 min-w-[12rem]">
          <span className="text-[10px] font-semibold text-gray-500 uppercase">Buscar conductor</span>
          <div className="relative mt-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 text-sm"
              placeholder="Nombre, placa, ID…"
            />
          </div>
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold text-gray-500 uppercase">Estado</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as GuaranteeStatus | '')}
            className="mt-1 block px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
          >
            <option value="">Todos</option>
            {Object.entries(GUARANTEE_STATUS_LABELS).map(([k, lab]) => (
              <option key={k} value={k}>
                {lab}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[10rem]">
          <span className="text-[10px] font-semibold text-gray-500 uppercase">Vehículo</span>
          <select
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            className="mt-1 block w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
          >
            <option value="">Todos</option>
            {vehicles
              .filter((v) => v.activo)
              .map((v) => (
                <option key={v.id} value={String(v.id)}>
                  #{getVehicleDisplayNumber(v)} · {v.placa}
                </option>
              ))}
          </select>
        </label>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2">Conductor</th>
                <th className="px-3 py-2">Vehículo</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Requerida</th>
                <th className="px-3 py-2">Saldo</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {showTableLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                    Cargando…
                  </td>
                </tr>
              ) : showEmptyState ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                    No hay garantías
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/80">
                    <td className="px-3 py-2.5 font-medium text-gray-900">
                      {conductorById.get(r.driverId) ?? r.driverId}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">
                      {r.currentVehicleId != null
                        ? vehicleById.get(r.currentVehicleId) ?? `#${r.currentVehicleId}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5">{GUARANTEE_VEHICLE_TYPE_LABELS[r.vehicleType]}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatGlobalAmount(r.requiredAmount)}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold">{formatGlobalAmount(r.currentBalance)}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                        {GUARANTEE_STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => navigate(`/operaciones/garantias/${r.id}`)}
                        className="text-xs font-semibold text-primary-600 hover:underline"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CrearGarantiaModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        conductores={conductores}
        vehicles={vehicles}
        empresaId={profile?.empresa_id}
        userId={user?.id}
        onCreated={refreshAfterMutation}
      />
    </div>
  );
};

export default Garantias;
