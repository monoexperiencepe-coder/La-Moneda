import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Card from '../Common/Card';
import Input from '../Common/Input';
import Select from '../Common/Select';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatDate, todayStr } from '../../utils/formatting';
import type { RegistroTiempo as RT } from '../../data/types';
import { Trash2, Pencil } from 'lucide-react';

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function nowDatetimeLocal(): string {
  return isoToDatetimeLocal(new Date().toISOString());
}

const emptyForm = () => ({
  fechaRegistroLocal: nowDatetimeLocal(),
  fecha: todayStr(),
  vehicleId: '',
  detalleAuto: '',
  tipo: '',
  descripcion: '',
  valorTiempo: '',
});

/** Formulario y listado de valor tiempo (Supabase `registros_tiempo`). Reutilizable en Mantenimiento y en la ruta dedicada. */
const ValorTiempoSection: React.FC<{ subtitle?: string; scopeVehicleId?: number | null }> = ({
  subtitle,
  scopeVehicleId = null,
}) => {
  const { vehicles, registrosTiempo, getVehicleLabel, addRegistroTiempo, updateRegistroTiempo, deleteRegistroTiempo } =
    useRegistrosContext();

  const [filterVehicleId, setFilterVehicleId] = useState('');
  const [filterDesde, setFilterDesde] = useState('');
  const [filterHasta, setFilterHasta] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const activeVehicles = vehicles.filter((v) => v.activo);

  const filtered = useMemo(() => {
    return registrosTiempo.filter((r) => {
      if (filterVehicleId && String(r.vehicleId ?? '') !== filterVehicleId) return false;
      if (filterDesde && r.fecha < filterDesde) return false;
      if (filterHasta && r.fecha > filterHasta) return false;
      return true;
    });
  }, [registrosTiempo, filterVehicleId, filterDesde, filterHasta]);

  const fillDetalleFromVehicle = useCallback(
    (vid: string) => {
      if (!vid) return '';
      const v = vehicles.find((x) => x.id === Number(vid));
      return v ? `${v.marca} ${v.modelo} — ${v.placa}` : '';
    },
    [vehicles],
  );

  useEffect(() => {
    if (scopeVehicleId == null) return;
    const ok = vehicles.some((v) => v.activo && v.id === scopeVehicleId);
    if (!ok) return;
    const sid = String(scopeVehicleId);
    setFilterVehicleId(sid);
    setForm((f) => ({
      ...f,
      vehicleId: f.vehicleId || sid,
      detalleAuto: f.detalleAuto.trim() ? f.detalleAuto : fillDetalleFromVehicle(sid),
    }));
  }, [scopeVehicleId, vehicles, fillDetalleFromVehicle]);

  const startEdit = (r: RT) => {
    setEditingId(r.id);
    setForm({
      fechaRegistroLocal: isoToDatetimeLocal(r.fechaRegistro),
      fecha: r.fecha,
      vehicleId: r.vehicleId != null ? String(r.vehicleId) : '',
      detalleAuto: r.detalleAuto ?? '',
      tipo: r.tipo ?? '',
      descripcion: r.descripcion ?? '',
      valorTiempo: r.valorTiempo != null ? String(r.valorTiempo) : '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fechaRegistro = datetimeLocalToIso(form.fechaRegistroLocal);
    const vid = form.vehicleId ? Number(form.vehicleId) : null;
    const vt =
      form.valorTiempo.trim() === '' ? null : Number(Number(form.valorTiempo.replace(',', '.')).toFixed(4));
    if (vt != null && Number.isNaN(vt)) return;

    const payload: Omit<RT, 'id' | 'createdAt'> = {
      fechaRegistro,
      fecha: form.fecha,
      vehicleId: vid,
      detalleAuto: form.detalleAuto.trim() || null,
      tipo: form.tipo.trim() || null,
      descripcion: form.descripcion.trim() || null,
      valorTiempo: vt,
    };

    if (editingId != null) {
      const ok = await updateRegistroTiempo(editingId, payload);
      if (ok) cancelEdit();
      return;
    }
    const ok = await addRegistroTiempo(payload);
    if (ok) {
      if (scopeVehicleId != null) {
        const sid = String(scopeVehicleId);
        setForm({
          ...emptyForm(),
          vehicleId: sid,
          detalleAuto: fillDetalleFromVehicle(sid),
        });
      } else {
        setForm(emptyForm());
      }
    }
  };

  const vehicleOptions = [
    { value: '', label: 'Todos (filtro)' },
    ...activeVehicles.map((v) => ({
      value: String(v.id),
      label: `#${v.id} ${v.marca} ${v.modelo} (${v.placa})`,
    })),
  ];

  const formVehicleOptions = [
    { value: '', label: 'Sin vehículo / general' },
    ...activeVehicles.map((v) => ({
      value: String(v.id),
      label: `#${v.id} ${v.marca} ${v.modelo}`,
    })),
  ];

  return (
    <div className="space-y-5">
      <Card
        title={editingId ? 'Editar valor tiempo' : 'Nuevo valor tiempo'}
        subtitle={subtitle ?? 'F. registro = cuándo cargaste; fecha = día del hecho (Supabase registros_tiempo)'}
      >
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Input
            label="F. registro (carga)"
            type="datetime-local"
            value={form.fechaRegistroLocal}
            onChange={(e) => setForm((f) => ({ ...f, fechaRegistroLocal: e.target.value }))}
          />
          <Input label="Fecha del hecho" type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} required />
          <Select
            label="Vehículo"
            options={formVehicleOptions}
            value={form.vehicleId}
            placeholder="Opcional"
            disabled={scopeVehicleId != null}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                vehicleId: v,
                detalleAuto: v && !f.detalleAuto.trim() ? fillDetalleFromVehicle(v) : f.detalleAuto,
              }))
            }
          />
          <div className="sm:col-span-2">
            <label className="label">Detalle del auto</label>
            <input
              type="text"
              value={form.detalleAuto}
              onChange={(e) => setForm((f) => ({ ...f, detalleAuto: e.target.value }))}
              className="input-field"
              placeholder="Ej. KIA RIO 2016 ARD-444"
            />
          </div>
          <Input label="Tipo" value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))} placeholder="Ej. TALLER MOTOR" />
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="label">Descripción</label>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              rows={2}
              className="input-field text-sm min-h-[72px]"
              placeholder="Ej. MANGUERA DE AGUA"
            />
          </div>
          <Input
            label="Valor tiempo"
            type="number"
            step="any"
            value={form.valorTiempo}
            onChange={(e) => setForm((f) => ({ ...f, valorTiempo: e.target.value }))}
            placeholder="Horas, índice o monto según tu criterio"
          />
          <div className="flex items-end gap-2 sm:col-span-2">
            <button type="submit" className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold">
              {editingId ? 'Guardar cambios' : 'Crear registro'}
            </button>
            {editingId != null && (
              <button type="button" onClick={cancelEdit} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600">
                Cancelar edición
              </button>
            )}
          </div>
        </form>
      </Card>

      <Card title="Listado" subtitle={`${filtered.length} registro${filtered.length !== 1 ? 's' : ''}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {scopeVehicleId != null ? (
            <p className="text-sm text-gray-600 py-2">
              Unidad: <span className="font-semibold">{getVehicleLabel(scopeVehicleId)}</span>
            </p>
          ) : (
            <Select label="Filtrar por vehículo" options={vehicleOptions} value={filterVehicleId} onChange={setFilterVehicleId} />
          )}
          <Input label="Desde" type="date" value={filterDesde} onChange={(e) => setFilterDesde(e.target.value)} />
          <Input label="Hasta" type="date" value={filterHasta} onChange={(e) => setFilterHasta(e.target.value)} />
          <div className="flex items-end">
            <button
              type="button"
              className="text-sm font-semibold text-gray-500 hover:text-gray-800 underline"
              onClick={() => {
                if (scopeVehicleId == null) setFilterVehicleId('');
                setFilterDesde('');
                setFilterHasta('');
              }}
            >
              Limpiar filtros
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-gray-100 rounded-xl">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10 px-4">No hay registros con estos filtros.</p>
          ) : (
            <table className="w-full text-sm min-w-[880px]">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                <tr className="text-xs text-gray-500 uppercase text-left">
                  <th className="py-2 px-3">F. registro</th>
                  <th className="py-2 px-3">Fecha</th>
                  <th className="py-2 px-3">Unidad</th>
                  <th className="py-2 px-3">Tipo</th>
                  <th className="py-2 px-3 max-w-[200px]">Descripción</th>
                  <th className="py-2 px-3 text-right">Valor</th>
                  <th className="py-2 px-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/80 align-top">
                    <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-600">{new Date(r.fechaRegistro).toLocaleString()}</td>
                    <td className="py-2 px-3 whitespace-nowrap">{formatDate(r.fecha)}</td>
                    <td className="py-2 px-3 text-xs">{getVehicleLabel(r.vehicleId)}</td>
                    <td className="py-2 px-3 text-xs">{r.tipo ?? '—'}</td>
                    <td className="py-2 px-3 text-xs text-gray-700 max-w-[220px]">
                      <span className="line-clamp-2" title={r.descripcion ?? ''}>
                        {r.descripcion ?? '—'}
                      </span>
                      {r.detalleAuto ? (
                        <span className="block text-[10px] text-gray-400 mt-0.5 line-clamp-1" title={r.detalleAuto}>
                          {r.detalleAuto}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 px-3 text-right font-medium tabular-nums">{r.valorTiempo != null ? r.valorTiempo : '—'}</td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(r)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 inline-flex"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm('¿Eliminar este registro de tiempo?')) return;
                          void deleteRegistroTiempo(r.id);
                        }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 inline-flex"
                        title="Eliminar"
                      >
                        <Trash2 size={15} />
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

export default ValorTiempoSection;
