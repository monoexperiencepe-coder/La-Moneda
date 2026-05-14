import React, { useEffect, useMemo, useState } from 'react';
import Card from '../Common/Card';
import Input from '../Common/Input';
import Select from '../Common/Select';
import { formatDate, todayStr } from '../../utils/formatting';
import { vehicleIdSortRank } from '../../utils/sortByVehicle';
import type { KilometrajeRegistro, Vehicle } from '../../data/types';
import {
  buildKmControlRows,
  KM_ALERTA_VARIACION_DESDE_MANT,
  tipoMantenimientoDesdeRegistro,
  variacionSuperaUmbralAlerta,
} from '../../utils/kmMantenimientoControl';
import { Trash2, Loader2 } from 'lucide-react';

interface Props {
  vehicles: Vehicle[];
  kilometrajes: KilometrajeRegistro[];
  addKilometraje: (row: Omit<KilometrajeRegistro, 'id' | 'createdAt'>) => Promise<KilometrajeRegistro | null>;
  deleteKilometraje: (id: number) => Promise<boolean>;
  getVehicleLabel: (vehicleId: number | null) => string;
  /** Si se pasa, el formulario y las tablas solo muestran esta unidad (detalle vehículo). */
  restrictVehicleId?: number;
}

const KilometrajeMantenimientoPanel: React.FC<Props> = ({
  vehicles,
  kilometrajes,
  addKilometraje,
  deleteKilometraje,
  getVehicleLabel,
  restrictVehicleId,
}) => {
  const active = useMemo(
    () => [...vehicles.filter((v) => v.activo)].sort((a, b) => a.id - b.id),
    [vehicles],
  );
  const [km, setKm] = useState({
    vehicleId: '',
    fecha: todayStr(),
    kmMantenimiento: '',
    kilometraje: '',
    descripcion: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (restrictVehicleId == null) return;
    const ok = vehicles.some((v) => v.activo && v.id === restrictVehicleId);
    if (!ok) return;
    setKm((p) => ({ ...p, vehicleId: String(restrictVehicleId) }));
  }, [restrictVehicleId, vehicles]);

  const controlKm = useMemo(
    () => buildKmControlRows(kilometrajes, restrictVehicleId ?? null),
    [kilometrajes, restrictVehicleId],
  );

  const ultimos = useMemo(() => {
    const base = restrictVehicleId != null ? kilometrajes.filter((r) => r.vehicleId === restrictVehicleId) : kilometrajes;
    return [...base]
      .sort((a, b) => {
        const vr = vehicleIdSortRank(a.vehicleId) - vehicleIdSortRank(b.vehicleId);
        if (vr !== 0) return vr;
        const fd = b.fecha.localeCompare(a.fecha);
        if (fd !== 0) return fd;
        return b.id - a.id;
      })
      .slice(0, restrictVehicleId != null ? 40 : 60);
  }, [kilometrajes, restrictVehicleId]);

  const guardar = async () => {
    setFormError(null);
    if (!km.vehicleId) {
      setFormError('Elige un vehículo.');
      return;
    }
    const kmActRaw = km.kilometraje.trim();
    const kmMantRaw = km.kmMantenimiento.trim();
    const kmAct = kmActRaw === '' ? null : Number(kmActRaw.replace(',', '.'));
    const kmMant = kmMantRaw === '' ? null : Number(kmMantRaw.replace(',', '.'));

    if (kmMantRaw !== '' && (!Number.isFinite(kmMant) || (kmMant as number) < 0)) {
      setFormError('KM mantenimiento no es válido.');
      return;
    }
    if (kmActRaw !== '' && (!Number.isFinite(kmAct) || (kmAct as number) < 0)) {
      setFormError('Kilometraje actual no es válido.');
      return;
    }
    if (kmMant == null && kmAct == null) {
      setFormError('Indica al menos KM de mantenimiento o kilometraje actual.');
      return;
    }

    setSaving(true);
    try {
      const created = await addKilometraje({
        vehicleId: Number(km.vehicleId),
        fecha: km.fecha,
        fechaRegistro: todayStr(),
        kmMantenimiento: kmMant,
        kilometraje: kmAct,
        descripcion: km.descripcion.trim(),
        costo: null,
      });

      if (created) {
        setKm((p) => ({
          ...p,
          kmMantenimiento: '',
          kilometraje: '',
          descripcion: '',
          fecha: todayStr(),
        }));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card
        title="Registrar kilometraje"
        subtitle="Indica al menos uno: KM de mantenimiento (taller) o kilometraje actual (odómetro). Pueden ir los dos. La descripción es opcional."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Select
            label="Vehículo"
            options={active.map((v) => ({ value: String(v.id), label: `#${v.id} · ${v.placa} · ${v.marca}` }))}
            value={km.vehicleId}
            placeholder="Elegir"
            onChange={(v) => setKm((p) => ({ ...p, vehicleId: v }))}
            disabled={restrictVehicleId != null}
          />
          <Input label="Fecha" type="date" value={km.fecha} onChange={(e) => setKm((p) => ({ ...p, fecha: e.target.value }))} />
          <Input
            label="KM mantenimiento"
            type="number"
            value={km.kmMantenimiento}
            onChange={(e) => setKm((p) => ({ ...p, kmMantenimiento: e.target.value }))}
            placeholder="Opcional si ya pones km actual"
          />
          <Input
            label="Kilometraje actual"
            type="number"
            value={km.kilometraje}
            onChange={(e) => setKm((p) => ({ ...p, kilometraje: e.target.value }))}
            placeholder="Opcional si ya pones km mant."
          />
          <div className="sm:col-span-2">
            <Input
              label="Descripción (opcional)"
              value={km.descripcion}
              onChange={(e) => setKm((p) => ({ ...p, descripcion: e.target.value }))}
              placeholder="Ej. MANT.SIMPLE, taller, observaciones…"
            />
          </div>
        </div>
        {formError ? <p className="mt-2 text-sm text-red-600">{formError}</p> : null}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!km.vehicleId || saving}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 min-w-[10rem]"
            onClick={() => void guardar()}
          >
            {saving ? <Loader2 size={18} className="animate-spin shrink-0" aria-hidden /> : null}
            {saving ? 'Guardando…' : 'Guardar kilometraje'}
          </button>
        </div>
      </Card>

      <Card
        title="Control KMS (referencia rápida)"
        subtitle={`Variación = km actuales − km del último mantenimiento registrado. Alerta si ≥ ${KM_ALERTA_VARIACION_DESDE_MANT.toLocaleString('es-PE')} km.`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b">
                <th className="text-left py-2">Unidad</th>
                <th className="text-right py-2">Km mant.</th>
                <th className="text-right py-2">Km actual</th>
                <th className="text-right py-2">Variación</th>
                <th className="text-right py-2">Δ días</th>
                <th className="text-right py-2">Tipo mant.</th>
              </tr>
            </thead>
            <tbody>
              {controlKm.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 text-sm">
                    Sin registros de kilometraje
                  </td>
                </tr>
              ) : (
                controlKm.map((r) => {
                  const alerta = variacionSuperaUmbralAlerta(r.variacion);
                  return (
                    <tr key={r.vehicleId} className={`border-b border-gray-50 ${alerta ? 'bg-red-50/50' : ''}`}>
                      <td className="py-2">{getVehicleLabel(r.vehicleId)}</td>
                      <td className="py-2 text-right tabular-nums">{r.kmMant ?? '—'}</td>
                      <td className="py-2 text-right tabular-nums">{r.kmUlt ?? '—'}</td>
                      <td
                        className={`py-2 text-right tabular-nums font-semibold ${
                          alerta ? 'text-red-700' : 'text-gray-900'
                        }`}
                      >
                        {r.variacion ?? '—'}
                        {alerta ? (
                          <span className="ml-1 text-[10px] font-bold uppercase text-red-600">¡Alerta!</span>
                        ) : null}
                      </td>
                      <td className="py-2 text-right">{r.dias ?? '—'}</td>
                      <td className="py-2 text-right text-xs font-semibold text-gray-800">{r.tipoMant}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Últimos registros de kilometraje" subtitle="Al borrar una fila, el control KMS se recalcula con los datos anteriores.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b">
                <th className="text-left py-2">Fecha</th>
                <th className="text-left py-2">Unidad</th>
                <th className="text-right py-2">KM mant.</th>
                <th className="text-right py-2">KM</th>
                <th className="text-right py-2">Tipo mant.</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {ultimos.map((r) => {
                const tipo = tipoMantenimientoDesdeRegistro(r);
                const tieneMant = r.kmMantenimiento != null || (r.descripcion ?? '').trim().length > 0;
                return (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="py-2">{formatDate(r.fecha)}</td>
                    <td className="py-2 text-xs">{getVehicleLabel(r.vehicleId)}</td>
                    <td className="py-2 text-right">{r.kmMantenimiento ?? '—'}</td>
                    <td className="py-2 text-right">{r.kilometraje ?? '—'}</td>
                    <td className="py-2 text-right text-xs align-top">
                      <div className="font-medium text-gray-900">{tipo ?? '—'}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {tieneMant ? 'Incluye mantenimiento' : 'Solo km semanal'}
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        disabled={deletingId === r.id || saving}
                        onClick={() => {
                          void (async () => {
                            setDeletingId(r.id);
                            try {
                              await deleteKilometraje(r.id);
                            } finally {
                              setDeletingId((cur) => (cur === r.id ? null : cur));
                            }
                          })();
                        }}
                        className="text-gray-400 hover:text-red-500 disabled:opacity-40 inline-flex"
                        title="Eliminar registro"
                      >
                        {deletingId === r.id ? (
                          <Loader2 size={14} className="animate-spin text-red-500" aria-hidden />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default KilometrajeMantenimientoPanel;
