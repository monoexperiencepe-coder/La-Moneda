import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '../Common/Modal';
import Select from '../Common/Select';
import Input from '../Common/Input';
import type { Vehicle, VehicleDowntimeMotivo } from '../../data/types';
import { todayStr } from '../../utils/formatting';
import { VEHICLE_DOWNTIME_MOTIVO_LABELS } from '../../utils/vehicleDowntimeImpact';
import {
  cerrarVehicleDowntime,
  insertVehicleDowntime,
} from '../../services/vehicleDowntimeService';

const MOTIVO_OPTIONS = (Object.keys(VEHICLE_DOWNTIME_MOTIVO_LABELS) as VehicleDowntimeMotivo[]).map(
  (k) => ({ value: k, label: VEHICLE_DOWNTIME_MOTIVO_LABELS[k] }),
);

type Props = {
  vehicle: Vehicle | null;
  /** Lista para selector cuando no hay vehículo preseleccionado */
  vehicles?: readonly Vehicle[];
  empresaId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Cerrar registro activo existente */
  cerrarId?: number | null;
};

const RegistrarIndisponibilidadModal: React.FC<Props> = ({
  vehicle,
  vehicles = [],
  empresaId,
  isOpen,
  onClose,
  onSaved,
  cerrarId,
}) => {
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [fechaInicio, setFechaInicio] = useState(todayStr());
  const [fechaFin, setFechaFin] = useState('');
  const [motivo, setMotivo] = useState<VehicleDowntimeMotivo>('taller');
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const modoCerrar = cerrarId != null && cerrarId > 0;

  const activeVehicle = useMemo(() => {
    if (vehicle) return vehicle;
    const id = Number(selectedVehicleId);
    if (!Number.isFinite(id)) return null;
    return vehicles.find((v) => v.id === id) ?? null;
  }, [vehicle, selectedVehicleId, vehicles]);

  const vehicleOptions = useMemo(
    () =>
      [...vehicles]
        .filter((v) => v.activo !== false)
        .sort((a, b) => a.id - b.id)
        .map((v) => ({
          value: String(v.id),
          label: `#${v.id} — ${v.marca} ${v.modelo} — ${v.placa}`.trim(),
        })),
    [vehicles],
  );

  useEffect(() => {
    if (!isOpen) return;
    setSelectedVehicleId(vehicle ? String(vehicle.id) : '');
    setFechaInicio(todayStr());
    setFechaFin(modoCerrar ? todayStr() : '');
    setMotivo('taller');
    setComentario('');
    setError('');
  }, [isOpen, modoCerrar, vehicle]);

  const handleSubmit = useCallback(async () => {
    if (busy) return;
    if (!modoCerrar && !activeVehicle) {
      setError('Selecciona un vehículo.');
      return;
    }
    if (!activeVehicle) return;
    setError('');
    setBusy(true);
    try {
      if (modoCerrar && cerrarId) {
        const fin = fechaFin.trim() || todayStr();
        const updated = await cerrarVehicleDowntime(cerrarId, fin, empresaId);
        if (!updated) {
          setError('No se pudo cerrar la indisponibilidad.');
          return;
        }
      } else {
        if (!fechaInicio.trim()) {
          setError('Indica la fecha de inicio.');
          return;
        }
        if (fechaFin.trim() && fechaFin < fechaInicio) {
          setError('La fecha fin no puede ser anterior al inicio.');
          return;
        }
        const created = await insertVehicleDowntime(
          {
            vehicleId: activeVehicle.id,
            fechaInicio: fechaInicio.trim(),
            fechaFin: fechaFin.trim() || null,
            motivo,
            comentario: comentario.trim(),
            estado: fechaFin.trim() ? 'cerrado' : 'activo',
          },
          empresaId,
        );
        if (!created) {
          setError('No se pudo registrar. Verifica permisos o ejecuta la migración vehicle_downtime.');
          return;
        }
      }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    cerrarId,
    comentario,
    empresaId,
    fechaFin,
    fechaInicio,
    modoCerrar,
    motivo,
    onClose,
    onSaved,
    activeVehicle,
  ]);

  if (!isOpen) return null;
  if (!modoCerrar && !activeVehicle && vehicleOptions.length === 0) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modoCerrar ? 'Cerrar indisponibilidad' : 'Registrar indisponibilidad'}
      size="lg"
    >
      {activeVehicle ? (
        <p className="mb-4 text-sm text-slate-600">
          Unidad #{activeVehicle.id} · {activeVehicle.placa}. El impacto económico se calcula al vuelo (no crea gastos
          ni ingresos).
        </p>
      ) : (
        <p className="mb-4 text-sm text-slate-600">
          Selecciona la unidad. El impacto económico se calcula al vuelo (no crea gastos ni ingresos).
        </p>
      )}
      <div className="space-y-4">
        {!modoCerrar ? (
          <>
            {!vehicle ? (
              <Select
                label="Vehículo"
                value={selectedVehicleId}
                onChange={setSelectedVehicleId}
                options={vehicleOptions}
                placeholder="Seleccionar unidad…"
              />
            ) : null}
            <Input
              label="Fecha inicio"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
            <Input
              label="Fecha fin (opcional)"
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
            />
            <Select
              label="Motivo"
              value={motivo}
              onChange={(v) => setMotivo(v as VehicleDowntimeMotivo)}
              options={MOTIVO_OPTIONS}
            />
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Comentario</label>
              <textarea
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                rows={3}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Detalle opcional"
              />
            </div>
          </>
        ) : (
          <Input
            label="Fecha fin"
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
          />
        )}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSubmit()}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            {modoCerrar ? 'Cerrar' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default RegistrarIndisponibilidadModal;
