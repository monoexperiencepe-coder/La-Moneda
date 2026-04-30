import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Trash2 } from 'lucide-react';
import Card from '../../components/Common/Card';
import Input from '../../components/Common/Input';
import Select from '../../components/Common/Select';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatDate, todayStr } from '../../utils/formatting';
import type { EstadoPendiente, Pendiente, PrioridadPendiente } from '../../data/types';

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

const PendientesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterPrioridadLista = ((): PrioridadPendiente | '' => {
    const p = searchParams.get('prioridad');
    return p === 'ALTA' || p === 'MEDIA' || p === 'BAJA' ? p : '';
  })();
  const activosSolo = searchParams.get('activos') === '1';

  const clearListaFilters = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('prioridad');
    next.delete('activos');
    setSearchParams(next, { replace: true });
  };

  const {
    vehicles,
    pendientes,
    addPendiente,
    updatePendiente,
    deletePendiente,
    getVehicleLabel,
  } = useRegistrosContext();

  const [filterVehicleId, setFilterVehicleId] = useState('');
  const [pendienteForm, setPendienteForm] = useState({
    vehicleId: '',
    descripcion: '',
    estado: 'ABIERTO' as EstadoPendiente,
    fecha: todayStr(),
    prioridad: 'MEDIA' as PrioridadPendiente,
  });

  useEffect(() => {
    const v = searchParams.get('vehicle');
    if (!v) return;
    const n = Number(v);
    if (Number.isNaN(n) || !vehicles.some((x) => x.id === n)) return;
    setFilterVehicleId(String(n));
    setPendienteForm((p) => ({ ...p, vehicleId: String(n) }));
  }, [searchParams, vehicles]);

  const pendientesFiltrados = useMemo(() => {
    let list = pendientes;
    if (filterVehicleId) {
      const vid = Number(filterVehicleId);
      list = list.filter((p) => p.vehicleId != null && Number(p.vehicleId) === vid);
    }
    if (activosSolo) {
      list = list.filter((p) => p.estado === 'ABIERTO' || p.estado === 'EN_CURSO');
    }
    if (filterPrioridadLista) {
      list = list.filter((p) => p.prioridad === filterPrioridadLista);
    }
    const rank: Record<PrioridadPendiente, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };
    return [...list].sort((a, b) => {
      const rp = rank[a.prioridad] - rank[b.prioridad];
      if (rp !== 0) return rp;
      const fd = b.fecha.localeCompare(a.fecha);
      if (fd !== 0) return fd;
      return b.id - a.id;
    });
  }, [pendientes, filterVehicleId, activosSolo, filterPrioridadLista]);

  const vehicleOptions = [
    { value: '', label: 'Todos los vehículos' },
    ...vehicles.map((v) => ({
      value: String(v.id),
      label: `#${v.id} ${v.marca} ${v.modelo} (${v.placa})`,
    })),
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/operaciones')}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pendientes</h1>
          <p className="text-sm text-gray-500">Lista de trabajo por prioridad (alta primero) y vehículo</p>
          {(filterPrioridadLista || activosSolo) && (
            <p className="mt-1.5 text-xs text-amber-900">
              Filtro de lista activo
              {filterPrioridadLista && ` · prioridad ${filterPrioridadLista}`}
              {activosSolo && ' · solo abierto / en curso'}
              {'. '}
              <button type="button" className="font-semibold text-primary-600 hover:underline" onClick={clearListaFilters}>
                Quitar filtros
              </button>
            </p>
          )}
        </div>
      </div>

      <Card title="Nuevo pendiente" subtitle="Opcional: asignar a un vehículo">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <Select
            label="Vehículo (opcional)"
            options={vehicles.map((v) => ({ value: String(v.id), label: `#${v.id} ${v.marca} ${v.modelo}` }))}
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
            <label className="label">Descripción</label>
            <textarea
              value={pendienteForm.descripcion}
              onChange={(e) => setPendienteForm((p) => ({ ...p, descripcion: e.target.value }))}
              rows={2}
              className="input-field text-sm min-h-[72px] resize-y"
              placeholder="Qué falta hacer, observaciones…"
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
      </Card>

      <Card title="Lista" subtitle={`${pendientesFiltrados.length} registro${pendientesFiltrados.length !== 1 ? 's' : ''}`}>
        <div className="mb-4 max-w-md">
          <Select
            label="Filtrar por vehículo"
            options={vehicleOptions}
            value={filterVehicleId}
            placeholder="Todos"
            onChange={setFilterVehicleId}
          />
        </div>
        <div className="overflow-x-auto max-h-[min(70vh,520px)] overflow-y-auto border border-gray-100 rounded-xl">
          {pendientesFiltrados.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10 px-4">No hay pendientes que coincidan.</p>
          ) : (
            <table className="w-full text-sm min-w-[720px]">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="text-left py-2 px-3">Prioridad</th>
                  <th className="text-left py-2 px-3">Fecha</th>
                  <th className="text-left py-2 px-3">Unidad</th>
                  <th className="text-left py-2 px-3">Descripción</th>
                  <th className="text-left py-2 px-3 w-36">Estado</th>
                  <th className="text-right py-2 px-3 w-12" />
                </tr>
              </thead>
              <tbody>
                {pendientesFiltrados.map((p: Pendiente) => (
                  <tr
                    key={p.id}
                    className={`border-b border-gray-50 hover:bg-gray-50/80 align-top ${
                      p.prioridad === 'ALTA' && (p.estado === 'ABIERTO' || p.estado === 'EN_CURSO')
                        ? 'bg-red-50/40'
                        : ''
                    }`}
                  >
                    <td className="py-2 px-3">
                      <select
                        value={p.prioridad}
                        onChange={(e) =>
                          void updatePendiente(p.id, { prioridad: e.target.value as PrioridadPendiente })
                        }
                        className="input-field text-xs py-1.5 w-full font-semibold"
                      >
                        {PRIORIDADES_PENDIENTE.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap text-gray-600">{formatDate(p.fecha)}</td>
                    <td className="py-2 px-3 text-xs">{getVehicleLabel(p.vehicleId)}</td>
                    <td className="py-2 px-3 text-xs text-gray-700 max-w-[280px]">
                      <span className="line-clamp-3" title={p.descripcion}>
                        {p.descripcion}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={p.estado}
                        onChange={(e) => void updatePendiente(p.id, { estado: e.target.value as EstadoPendiente })}
                        className="input-field text-xs py-1.5 w-full"
                      >
                        {ESTADOS_PENDIENTE.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
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
    </div>
  );
};

export default PendientesPage;
