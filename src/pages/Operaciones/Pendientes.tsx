import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import PendienteCard from '../../components/pendientes/PendienteCard';
import PendienteFormPanel from '../../components/pendientes/PendienteFormPanel';
import PendientesVirtualList from '../../components/pendientes/PendientesVirtualList';
import { useRegistrosContext } from '../../context/RegistrosContext';
import type { Pendiente } from '../../data/types';
import { useAuth } from '../../context/AuthContext';
import {
  canEditPendiente,
  countPendientesEquipoActivos,
  emptyPendienteForm,
  estadoFromV2,
  filterPendientesTab,
  formValuesToPendientePayload,
  pendienteToFormValues,
  type PendienteFormValues,
  type PendienteTabId,
} from '../../utils/pendienteModel';
import SearchField from '../../components/Common/SearchField';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';
import { buildSearchHaystack, matchesSearchHaystack } from '../../utils/recordSearch';

const TABS: { id: PendienteTabId; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'proximas', label: 'Próximas' },
  { id: 'backlog', label: 'Sin fecha' },
  { id: 'completadas', label: 'Completadas' },
];

const PendientesPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAdmin, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as PendienteTabId) || 'hoy';
  const [tab, setTab] = useState<PendienteTabId>(
    TABS.some((t) => t.id === initialTab) ? initialTab : 'hoy',
  );

  const {
    vehicles,
    conductores,
    pendientes,
    addPendiente,
    updatePendiente,
    getVehicleLabel,
  } = useRegistrosContext();

  const [formOpen, setFormOpen] = useState(searchParams.get('nuevo') === '1');
  const [formValues, setFormValues] = useState<PendienteFormValues>(emptyPendienteForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const {
    inputValue: busqueda,
    setInputValue: setBusqueda,
    appliedValue: busquedaApplied,
    isDebouncing: busquedaDebouncing,
    clear: clearBusqueda,
  } = useDebouncedSearch('', 300);

  useEffect(() => {
    const v = searchParams.get('vehicle');
    if (!v) return;
    const n = Number(v);
    if (Number.isNaN(n)) return;
    setFormValues((p) => ({
      ...p,
      relacionadoTipo: 'vehiculo',
      relacionadoId: String(n),
      vehicleId: String(n),
    }));
    setFormOpen(true);
  }, [searchParams]);

  const setTabAndUrl = (next: PendienteTabId) => {
    setTab(next);
    const sp = new URLSearchParams(searchParams);
    sp.set('tab', next);
    setSearchParams(sp, { replace: true });
  };

  const listaTab = useMemo(() => {
    const base = filterPendientesTab(pendientes, tab);
    const q = busquedaApplied.trim();
    if (!q) return base;
    return base.filter((p) => {
      const vLabel =
        p.vehicleId != null ? getVehicleLabel(Number(p.vehicleId)) : '';
      return matchesSearchHaystack(
        buildSearchHaystack(
          p.id,
          p.titulo,
          p.descripcion,
          p.estado,
          p.prioridad,
          p.relacionadoTipo,
          p.relacionadoId,
          vLabel,
        ),
        q,
      );
    });
  }, [pendientes, tab, busquedaApplied, getVehicleLabel]);
  const activasHoy = useMemo(() => countPendientesEquipoActivos(pendientes), [pendientes]);

  const startCreate = () => {
    setEditingId(null);
    setFormValues(emptyPendienteForm());
    setFormOpen(true);
  };

  const startEdit = (p: Pendiente) => {
    setEditingId(p.id);
    setFormValues(pendienteToFormValues(p));
    setFormOpen(true);
  };

  const saveForm = async () => {
    if (saving || !formValues.titulo.trim()) return;
    setSaving(true);
    try {
      const payload = formValuesToPendientePayload(formValues);
      if (editingId != null) {
        await updatePendiente(editingId, payload);
      } else {
        const res = await addPendiente(payload);
        if (!res) return;
      }
      setFormOpen(false);
      setEditingId(null);
      setFormValues(emptyPendienteForm());
    } finally {
      setSaving(false);
    }
  };

  const completar = async (p: Pendiente) => {
    setBusyId(p.id);
    try {
      const now = new Date().toISOString();
      await updatePendiente(p.id, {
        estado: estadoFromV2('completado'),
        resolvedAt: now,
        resolvedBy: profile?.id ?? user?.id ?? null,
      });
    } finally {
      setBusyId(null);
    }
  };

  const canEdit = (p: Pendiente) => canEditPendiente(p, profile?.id ?? user?.id, isAdmin);

  return (
    <div className="flex flex-col min-h-[calc(100dvh-8rem)] max-w-3xl mx-auto pb-8 animate-fade-in">
      <header className="sticky top-0 z-20 -mx-4 px-4 py-3 mb-2 bg-gray-50/95 backdrop-blur border-b border-gray-100 sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/operaciones')}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 shrink-0 min-h-11 min-w-11 flex items-center justify-center"
            aria-label="Volver"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-gray-900 truncate">Pendientes</h1>
            <p className="text-xs text-gray-500">
              {activasHoy} activa{activasHoy !== 1 ? 's' : ''} en Qué hacer hoy · capa manual del equipo
            </p>
          </div>
          <button
            type="button"
            onClick={startCreate}
            className="shrink-0 min-h-11 rounded-xl bg-violet-700 px-4 text-sm font-bold text-white hover:bg-violet-800"
          >
            + Nuevo
          </button>
        </div>

        <div
          className="mt-3 flex gap-1 overflow-x-auto overscroll-x-contain pb-0.5 -mx-1 px-1"
          role="tablist"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTabAndUrl(t.id)}
              className={`shrink-0 min-h-11 px-4 rounded-xl text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-violet-700 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <SearchField
            value={busqueda}
            onChange={setBusqueda}
            debouncing={busquedaDebouncing}
            onClear={clearBusqueda}
            placeholder="Buscar título, descripción, vehículo…"
            inputClassName="input-field text-sm"
          />
        </div>
      </header>

      {formOpen ? (
        <div className="mb-4">
          <PendienteFormPanel
            title={editingId != null ? 'Editar pendiente' : 'Nuevo pendiente'}
            values={formValues}
            onChange={(patch) => setFormValues((v) => ({ ...v, ...patch }))}
            onSubmit={() => void saveForm()}
            onCancel={() => {
              setFormOpen(false);
              setEditingId(null);
            }}
            saving={saving}
            vehicles={vehicles}
          />
        </div>
      ) : null}

      <p className="text-xs text-gray-500 mb-2 px-0.5">
        {tab === 'hoy' && 'Vencidas, vence hoy y prioridad crítica.'}
        {tab === 'proximas' && 'Con fecha objetivo en los próximos 30 días.'}
        {tab === 'backlog' && 'Tareas sin fecha límite definida.'}
        {tab === 'completadas' && 'Solo lectura · tareas cerradas.'}
        {' '}
        <span className="font-semibold tabular-nums">{listaTab.length}</span> en esta vista.
      </p>

      <PendientesVirtualList
        items={listaTab}
        className="flex-1 min-h-[240px] max-h-[min(70vh,640px)]"
        empty={
          <p className="text-center text-sm text-gray-400 py-12 px-4 rounded-xl border border-dashed border-gray-200 bg-white">
            No hay pendientes en esta vista.
          </p>
        }
        renderRow={(p) => (
          <PendienteCard
            pendiente={p}
            vehicles={vehicles}
            conductores={conductores}
            getVehicleLabel={(id) => getVehicleLabel(id == null ? null : Number(id))}
            onNavigate={navigate}
            onCompletar={tab === 'completadas' ? undefined : completar}
            onEditar={tab === 'completadas' || !canEdit(p) ? undefined : startEdit}
            readonly={tab === 'completadas'}
            busy={busyId === p.id}
          />
        )}
      />
    </div>
  );
};

export default PendientesPage;
