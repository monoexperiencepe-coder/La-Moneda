import React, { useEffect, useMemo, useRef, useState } from 'react';
import Card from '../Common/Card';
import Input from '../Common/Input';
import Select from '../Common/Select';
import { formatDate, registroFechaInputBounds, todayStr } from '../../utils/formatting';
import { vehicleIdSortRank } from '../../utils/sortByVehicle';
import type { KilometrajeRegistro, Vehicle } from '../../data/types';
import {
  buildKmControlRows,
  KM_ALERTA_VARIACION_DESDE_MANT,
  tipoMantenimientoDesdeRegistro,
  tipoMantenimientoEtiqueta,
  variacionSuperaUmbralAlerta,
} from '../../utils/kmMantenimientoControl';
import {
  buildKilometrajePayload,
  TIPO_MANTENIMIENTO_OPTIONS,
  type TipoMantenimientoForm,
} from '../../utils/kilometrajeForm';
import { Trash2, Loader2 } from 'lucide-react';

interface Props {
  vehicles: Vehicle[];
  kilometrajes: KilometrajeRegistro[];
  addKilometraje: (row: Omit<KilometrajeRegistro, 'id' | 'createdAt'>) => Promise<KilometrajeRegistro | null>;
  deleteKilometraje: (id: number) => Promise<boolean>;
  getVehicleLabel: (vehicleId: number | null) => string;
  restrictVehicleId?: number;
}

const fechaBounds = registroFechaInputBounds();

/**
 * Cabecera fija al bajar la página (debajo del header h-16).
 * En móvil: scroll interno con sticky top-0 (overflow rompe sticky respecto al viewport).
 */
const KM_CONTROL_TABLE_WRAP =
  'overflow-x-auto max-h-[min(70vh,520px)] overflow-y-auto overscroll-y-contain lg:max-h-none lg:overflow-visible border border-gray-100 rounded-xl';
const KM_TABLE_HEAD =
  'sticky top-0 lg:top-16 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-[0_1px_0_0_rgb(229_231_235)]';
const KM_TABLE_TH = 'py-2.5 px-1 bg-inherit first:pl-0 last:pr-0';

function TipoMantBadge({ tipo }: { tipo: ReturnType<typeof tipoMantenimientoDesdeRegistro> }) {
  const label = tipoMantenimientoEtiqueta(tipo);
  const styles =
    tipo === 'Simple'
      ? 'bg-amber-50 text-amber-800 ring-amber-200/80'
      : tipo === 'Completo'
        ? 'bg-violet-50 text-violet-800 ring-violet-200/80'
        : 'bg-slate-100 text-slate-700 ring-slate-200/80';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${styles}`}>
      {label}
    </span>
  );
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
    tipoMant: 'solo_km' as TipoMantenimientoForm,
    kmMantenimiento: '',
    kilometraje: '',
    descripcion: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const submitLockRef = useRef(false);
  const lastSubmitRef = useRef<{ key: string; at: number } | null>(null);

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
    const base =
      restrictVehicleId != null ? kilometrajes.filter((r) => r.vehicleId === restrictVehicleId) : kilometrajes;
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

  const tipoHint = TIPO_MANTENIMIENTO_OPTIONS.find((o) => o.value === km.tipoMant)?.hint ?? '';
  const esMantenimiento = km.tipoMant === 'simple' || km.tipoMant === 'completo';

  const guardar = async () => {
    setFormError(null);
    if (!km.vehicleId) {
      setFormError('Elige un vehículo.');
      return;
    }
    if (submitLockRef.current) return;

    const payload = buildKilometrajePayload({
      vehicleId: Number(km.vehicleId),
      fecha: km.fecha,
      tipo: km.tipoMant,
      kilometrajeRaw: km.kilometraje,
      kmMantenimientoRaw: km.kmMantenimiento,
      descripcionExtra: km.descripcion,
    });
    if (!payload.ok) {
      setFormError(payload.error);
      return;
    }

    const fingerprint = [
      payload.row.vehicleId,
      payload.row.fecha,
      km.tipoMant,
      payload.row.kilometraje,
      payload.row.kmMantenimiento,
      payload.row.descripcion,
    ].join('|');
    const prev = lastSubmitRef.current;
    if (prev && prev.key === fingerprint && Date.now() - prev.at < 4000) {
      setFormError('Este registro ya se envió hace un momento.');
      return;
    }

    submitLockRef.current = true;
    setSaving(true);
    try {
      const created = await addKilometraje(payload.row);
      if (created) {
        lastSubmitRef.current = { key: fingerprint, at: Date.now() };
        setKm((p) => ({
          ...p,
          kmMantenimiento: '',
          kilometraje: '',
          descripcion: '',
          fecha: todayStr(),
        }));
      }
    } finally {
      submitLockRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card
        title="Registrar kilometraje"
        subtitle="Por defecto es solo lectura semanal de km. Elige Simple o Completo solo cuando hubo mantenimiento en taller."
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
          <Input
            label="Fecha"
            type="date"
            value={km.fecha}
            min={fechaBounds.min}
            max={fechaBounds.max}
            onChange={(e) => setKm((p) => ({ ...p, fecha: e.target.value }))}
          />
          <fieldset className="sm:col-span-2 lg:col-span-3 rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-3">
            <legend className="text-xs font-semibold text-slate-600 px-1">Tipo mantenimiento</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {TIPO_MANTENIMIENTO_OPTIONS.map((opt) => {
                const activeOpt = km.tipoMant === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`cursor-pointer rounded-xl border px-3 py-2 text-sm transition-colors ${
                      activeOpt
                        ? 'border-slate-800 bg-white text-slate-900 shadow-sm'
                        : 'border-transparent bg-white/60 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="tipoMant"
                      className="sr-only"
                      checked={activeOpt}
                      onChange={() => setKm((p) => ({ ...p, tipoMant: opt.value }))}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500">{tipoHint}</p>
          </fieldset>
          {esMantenimiento ? (
            <Input
              label="KM al mantenimiento"
              type="number"
              value={km.kmMantenimiento}
              onChange={(e) => setKm((p) => ({ ...p, kmMantenimiento: e.target.value }))}
              placeholder="Opcional: si vacío, usa el km actual"
            />
          ) : null}
          <Input
            label={esMantenimiento ? 'Kilometraje actual (odómetro)' : 'Kilometraje semanal (odómetro)'}
            type="number"
            value={km.kilometraje}
            onChange={(e) => setKm((p) => ({ ...p, kilometraje: e.target.value }))}
            placeholder="Requerido"
          />
          <div className={esMantenimiento ? 'sm:col-span-2' : 'sm:col-span-2 lg:col-span-2'}>
            <Input
              label="Notas (opcional)"
              value={km.descripcion}
              onChange={(e) => setKm((p) => ({ ...p, descripcion: e.target.value }))}
              placeholder={esMantenimiento ? 'Taller, observaciones…' : 'Ej. lectura semanal, ruta…'}
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
            {saving ? 'Guardando…' : 'Guardar registro'}
          </button>
        </div>
      </Card>

      <Card
        title="Control KMS (referencia rápida)"
        subtitle={`Variación = km actual − km del último mantenimiento (Simple o Completo). Alerta si ≥ ${KM_ALERTA_VARIACION_DESDE_MANT.toLocaleString('es-PE')} km.`}
      >
        <div className={KM_CONTROL_TABLE_WRAP}>
          <table className="w-full text-sm min-w-[640px] border-separate border-spacing-0">
            <thead className={KM_TABLE_HEAD}>
              <tr className="text-xs text-gray-500 uppercase">
                <th className={`text-left ${KM_TABLE_TH}`}>Unidad</th>
                <th className={`text-right ${KM_TABLE_TH}`}>Km mant.</th>
                <th className={`text-right ${KM_TABLE_TH}`}>Km actual</th>
                <th className={`text-right ${KM_TABLE_TH}`}>Variación</th>
                <th className={`text-right ${KM_TABLE_TH}`}>Δ días</th>
                <th className={`text-right ${KM_TABLE_TH}`}>Último mant.</th>
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
                      <td className="py-2 text-right">
                        <TipoMantBadge tipo={r.tipoMant} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Últimos registros de kilometraje" subtitle="Al borrar una fila, el control KMS se recalcula al instante.">
        <div className={KM_CONTROL_TABLE_WRAP}>
          <table className="w-full text-sm min-w-[560px] border-separate border-spacing-0">
            <thead className={KM_TABLE_HEAD}>
              <tr className="text-xs text-gray-500 uppercase">
                <th className={`text-left ${KM_TABLE_TH}`}>Fecha</th>
                <th className={`text-left ${KM_TABLE_TH}`}>Unidad</th>
                <th className={`text-right ${KM_TABLE_TH}`}>KM mant.</th>
                <th className={`text-right ${KM_TABLE_TH}`}>KM</th>
                <th className={`text-right ${KM_TABLE_TH}`}>Tipo</th>
                <th className={`w-10 ${KM_TABLE_TH}`} />
              </tr>
            </thead>
            <tbody>
              {ultimos.map((r) => {
                const tipo = tipoMantenimientoDesdeRegistro(r);
                return (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="py-2">{formatDate(r.fecha)}</td>
                    <td className="py-2 text-xs">{getVehicleLabel(r.vehicleId)}</td>
                    <td className="py-2 text-right tabular-nums">{r.kmMantenimiento ?? '—'}</td>
                    <td className="py-2 text-right tabular-nums">{r.kilometraje ?? '—'}</td>
                    <td className="py-2 text-right">
                      <TipoMantBadge tipo={tipo} />
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
