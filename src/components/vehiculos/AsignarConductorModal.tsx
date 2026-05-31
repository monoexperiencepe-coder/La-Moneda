import React, { useCallback, useMemo, useState } from 'react';
import { Loader2, UserCog } from 'lucide-react';
import Modal from '../Common/Modal';
import { useRegistrosContext } from '../../context/RegistrosContext';
import {
  conductorVigentePorVehiculo,
  formatConductorDisplayLabel,
} from '../../utils/fleetPanel';
import type { Conductor, Vehicle } from '../../data/types';

const SIN_CONDUCTOR = '';

type Props = {
  vehicle: Vehicle | null;
  isOpen: boolean;
  onClose: () => void;
};

function licenciaLabel(c: Conductor): string {
  const doc = c.numeroDocumento?.trim();
  if (!doc) return 'Sin documento';
  return `${c.tipoDocumento} ${doc}`;
}

const AsignarConductorModal: React.FC<Props> = ({ vehicle, isOpen, onClose }) => {
  const { vehicles, conductores, assignConductorToVehicle, clearVehicleConductor } = useRegistrosContext();
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  const conductorActual = useMemo(
    () => (vehicle ? conductorVigentePorVehiculo(conductores, vehicle.id) : null),
    [conductores, vehicle],
  );

  const opcionesVigentes = useMemo(
    () =>
      conductores
        .filter((c) => c.estado === 'VIGENTE')
        .sort((a, b) => formatConductorDisplayLabel(a).localeCompare(formatConductorDisplayLabel(b), 'es')),
    [conductores],
  );

  const resetOnOpen = useCallback(() => {
    setSelectedId(conductorActual?.id ?? SIN_CONDUCTOR);
    setError('');
  }, [conductorActual?.id]);

  React.useEffect(() => {
    if (isOpen) resetOnOpen();
  }, [isOpen, resetOnOpen]);

  const handleSubmit = useCallback(async () => {
    if (!vehicle || busy) return;
    setError('');
    setBusy(true);
    try {
      if (selectedId === SIN_CONDUCTOR) {
        await clearVehicleConductor(vehicle.id);
      } else {
        await assignConductorToVehicle(selectedId, vehicle.id);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la asignación.');
    } finally {
      setBusy(false);
    }
  }, [assignConductorToVehicle, busy, clearVehicleConductor, onClose, selectedId, vehicle]);

  if (!vehicle) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={conductorActual ? 'Reasignar conductor' : 'Asignar conductor'}
      size="lg"
      closeLocked={busy}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <UserCog size={16} />}
            Guardar asignación
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-sm">
          <p className="font-semibold text-gray-900">
            {vehicle.marca} {vehicle.modelo}
          </p>
          <p className="text-gray-600 font-mono text-xs mt-0.5">{vehicle.placa}</p>
          <p className="text-xs text-gray-500 mt-2">
            Conductor actual:{' '}
            <span className="font-medium text-gray-800">
              {conductorActual ? formatConductorDisplayLabel(conductorActual) : 'Sin asignar'}
            </span>
          </p>
        </div>

        {error ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        ) : null}

        <label className="block">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
            Conductor vigente
          </span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
          >
            <option value={SIN_CONDUCTOR}>Sin conductor (dejar libre)</option>
            {opcionesVigentes.map((c) => {
              const v = c.vehicleId != null ? vehicleMap.get(Number(c.vehicleId)) : undefined;
              const enOtro =
                c.vehicleId != null &&
                Number(c.vehicleId) !== Number(vehicle.id) &&
                v != null;
              return (
                <option key={c.id} value={c.id}>
                  {formatConductorDisplayLabel(c)} · {licenciaLabel(c)}
                  {enOtro ? ` · actual: ${v.placa}` : ''}
                  {c.vehicleId != null && Number(c.vehicleId) === Number(vehicle.id) ? ' · asignado aquí' : ''}
                </option>
              );
            })}
          </select>
        </label>

        <p className="text-xs text-gray-500">
          Al guardar, se desasignan automáticamente otros conductores vigentes en este vehículo y, si el
          conductor elegido tenía otra unidad, esa unidad queda libre.
        </p>
      </div>
    </Modal>
  );
};

export default AsignarConductorModal;
