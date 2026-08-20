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
import { formatDate } from '../../utils/formatting';
import CrearGarantiaModal from '../../components/garantias/CrearGarantiaModal';
import { useGarantiasListData, type GarantiasListMode } from '../../hooks/garantias/useGarantiasListData';

const HISTORY_STATUSES: readonly GuaranteeStatus[] = ['cerrada', 'devuelta'];

const Garantias: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const permissionUser = user ? permissionUserFromAuth(user, profile?.email ?? null) : null;
  const { formatGlobalAmount } = useAmountDisplay();
  const { conductores, vehicles } = useRegistrosContext();
  const canView = canViewGarantias(permissionUser);
  const moduleEnabled = isGuaranteesModuleEnabled();

  const [tab, setTab] = useState<GarantiasListMode>('active');
  const { rows, initialLoading, refreshing, error, load, refreshAfterMutation } = useGarantiasListData(
    profile?.empresa_id,
    moduleEnabled && canView,
    tab,
  );
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<GuaranteeStatus | ''>('');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const handleTabChange = (next: GarantiasListMode) => {
    setTab(next);
    setQ('');
    setStatusFilter('');
    setVehicleFilter('');
  };

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

  // ── Vista Actuales = padrón por vehículo ───────────────────────────────────
  // Parte de vehículos activos ordenados por numeroUnidad ASC.
  // Join con garantías activas (closed_at IS NULL) ya filtradas en DB.
  const padronRows = useMemo(() => {
    if (tab !== 'active') return null;
    const guaranteeByVehicle = new Map<number, (typeof rows)[number]>();
    for (const r of rows) {
      if (r.currentVehicleId != null) guaranteeByVehicle.set(r.currentVehicleId, r);
    }
    const activeVehicles = vehicles
      .filter((v) => v.activo)
      .slice()
      .sort((a, b) => {
        const na = a.numeroUnidad ?? Infinity;
        const nb = b.numeroUnidad ?? Infinity;
        return na !== nb ? na - nb : a.id - b.id;
      });
    return activeVehicles.map((v) => ({
      vehicle: v,
      guarantee: guaranteeByVehicle.get(v.id) ?? null,
    }));
  }, [tab, vehicles, rows]);

  // Búsqueda dentro del padrón: placa, unidad o conductor.
  const filteredPadron = useMemo(() => {
    if (!padronRows) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return padronRows;
    return padronRows.filter(({ vehicle, guarantee }) => {
      const placa = vehicle.placa.toLowerCase();
      const unidad = vehicle.numeroUnidad != null ? String(vehicle.numeroUnidad) : '';
      const conductor = guarantee != null ? (conductorById.get(guarantee.driverId) ?? '').toLowerCase() : '';
      return placa.includes(needle) || unidad.includes(needle) || conductor.includes(needle);
    });
  }, [padronRows, q, conductorById]);

  // ── Vista Historial = garantías cerradas/devueltas ─────────────────────────
  const filtered = useMemo(() => {
    if (tab !== 'history') return [];
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (vehicleFilter && String(r.currentVehicleId ?? '') !== vehicleFilter) return false;
      if (!needle) return true;
      const name = (conductorById.get(r.driverId) ?? '').toLowerCase();
      const placa = r.currentVehicleId != null ? (vehicleById.get(r.currentVehicleId) ?? '').toLowerCase() : '';
      return name.includes(needle) || placa.includes(needle) || String(r.id).includes(needle);
    });
  }, [rows, tab, q, statusFilter, vehicleFilter, conductorById, vehicleById]);

  // KPIs desde padrón (solo en tab Actuales).
  const summary = useMemo(() => {
    if (tab !== 'active' || !padronRows) return null;
    const total = padronRows.length;
    const conGarantia = padronRows.filter((r) => r.guarantee != null).length;
    const sinOIncompleta = padronRows.filter(
      (r) =>
        !r.guarantee ||
        ['pendiente', 'incompleta', 'con_descuentos_pendientes', 'sin_garantia'].includes(r.guarantee.status),
    ).length;
    const saldo = padronRows.reduce((s, r) => s + (r.guarantee?.currentBalance ?? 0), 0);
    return { total, conGarantia, sinOIncompleta, saldo };
  }, [tab, padronRows]);

  const showTableLoading = initialLoading && rows.length === 0;
  const showHistoryEmpty = tab === 'history' && !initialLoading && !refreshing && filtered.length === 0;

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
          {canCreateGarantia(permissionUser) && tab === 'active' ? (
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

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          type="button"
          onClick={() => handleTabChange('active')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            tab === 'active'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Actuales
          {summary != null ? (
            <span className="ml-1.5 text-[11px] font-bold bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full tabular-nums">
              {summary.total}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('history')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            tab === 'history'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Historial
        </button>
      </div>

      {/* ── KPIs (solo en Actuales) ───────────────────────────────────────── */}
      {summary != null ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Unidades activas', value: String(summary.total) },
            { label: 'Con garantía', value: String(summary.conGarantia) },
            { label: 'Sin garantía / incompleta', value: String(summary.sinOIncompleta) },
            { label: 'Saldo total retenido', value: formatGlobalAmount(summary.saldo) },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{c.label}</p>
              <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{c.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* ── Filtros ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-end">
        <label className="block flex-1 min-w-[12rem]">
          <span className="text-[10px] font-semibold text-gray-500 uppercase">
            {tab === 'active' ? 'Buscar unidad / conductor' : 'Buscar conductor'}
          </span>
          <div className="relative mt-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 text-sm"
              placeholder={tab === 'active' ? '#unidad, placa, conductor…' : 'Nombre, placa, ID…'}
            />
          </div>
        </label>
        {tab === 'history' ? (
          <>
            <label className="block">
              <span className="text-[10px] font-semibold text-gray-500 uppercase">Estado</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as GuaranteeStatus | '')}
                className="mt-1 block px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
              >
                <option value="">Todos</option>
                {HISTORY_STATUSES.map((k) => (
                  <option key={k} value={k}>
                    {GUARANTEE_STATUS_LABELS[k]}
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
          </>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {tab === 'history' ? (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          El historial muestra garantías cerradas o devueltas. Los movimientos se conservan y pueden consultarse
          entrando en cada ficha.
        </p>
      ) : null}

      {/* ── Tabla Actuales = padrón por vehículo ──────────────────────────── */}
      {tab === 'active' && filteredPadron != null ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2">Unidad</th>
                  <th className="px-3 py-2">Placa</th>
                  <th className="px-3 py-2">Conductor</th>
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
                    <td colSpan={8} className="px-3 py-8 text-center text-gray-400">Cargando…</td>
                  </tr>
                ) : filteredPadron.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                      {q ? 'Sin resultados para esa búsqueda' : 'Sin vehículos activos'}
                    </td>
                  </tr>
                ) : (
                  filteredPadron.map(({ vehicle, guarantee }) => (
                    <tr key={vehicle.id} className="hover:bg-gray-50/80">
                      <td className="px-3 py-2.5 font-bold text-gray-900 tabular-nums">
                        {vehicle.numeroUnidad != null ? `#${vehicle.numeroUnidad}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-700 font-medium">{vehicle.placa}</td>
                      <td className="px-3 py-2.5 text-gray-800">
                        {guarantee != null
                          ? (conductorById.get(guarantee.driverId) ?? guarantee.driverId)
                          : <span className="text-gray-400 text-xs">Sin conductor</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">
                        {guarantee != null ? GUARANTEE_VEHICLE_TYPE_LABELS[guarantee.vehicleType] : '—'}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {guarantee != null ? formatGlobalAmount(guarantee.requiredAmount) : '—'}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold">
                        {guarantee != null ? formatGlobalAmount(guarantee.currentBalance) : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        {guarantee != null ? (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            {GUARANTEE_STATUS_LABELS[guarantee.status]}
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            Sin garantía
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {guarantee != null ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/operaciones/garantias/${guarantee.id}`)}
                            className="text-xs font-semibold text-primary-600 hover:underline"
                          >
                            Ver
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ── Tabla Historial = garantías cerradas / devueltas ──────────────── */}
      {tab === 'history' ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2">Conductor</th>
                  <th className="px-3 py-2">Vehículo</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Requerida</th>
                  <th className="px-3 py-2">Saldo final</th>
                  <th className="px-3 py-2">Fecha cierre</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {showTableLoading ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-gray-400">Cargando…</td>
                  </tr>
                ) : showHistoryEmpty ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                      Sin historial de garantías cerradas
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
                      <td className="px-3 py-2.5 tabular-nums">{formatGlobalAmount(r.currentBalance)}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {r.closedAt ? formatDate(r.closedAt.slice(0, 10)) : '—'}
                      </td>
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
      ) : null}

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
