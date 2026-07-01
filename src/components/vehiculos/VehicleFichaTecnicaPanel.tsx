import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Save } from 'lucide-react';
import type { Vehicle } from '../../data/types';
import {
  fichaDraftToVehiclePatch,
  formatFichaNumber,
  formatFichaText,
  formatFichaGps,
  vehicleToFichaDraft,
  type VehicleFichaTecnicaDraft,
} from '../../utils/vehicleFichaTecnica';
import { formatVehicleUnitLabel } from '../../utils/vehicleDisplayNumber';
import VehicleFichaTecnicaFields from './VehicleFichaTecnicaFields';

type Props = {
  vehicle: Vehicle;
  canEdit: boolean;
  onSave: (patch: Partial<Omit<Vehicle, 'id'>>) => Promise<Vehicle | null>;
};

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5 break-words">{value}</p>
    </div>
  );
}

const VehicleFichaTecnicaPanel: React.FC<Props> = ({ vehicle, canEdit, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<VehicleFichaTecnicaDraft>(() => vehicleToFichaDraft(vehicle));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(vehicleToFichaDraft(vehicle));
    setEditing(false);
    setError('');
  }, [vehicle]);

  const handleSave = useCallback(async () => {
    if (busy) return;
    setError('');
    const patch = fichaDraftToVehiclePatch(draft);
    if (!patch.placa?.trim() || !patch.marca?.trim() || !patch.modelo?.trim()) {
      setError('Placa, marca y modelo son obligatorios.');
      return;
    }
    setBusy(true);
    try {
      const updated = await onSave(patch);
      if (!updated) {
        setError('No se pudo guardar la ficha técnica.');
        return;
      }
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setBusy(false);
    }
  }, [busy, draft, onSave]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Ficha técnica</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatVehicleUnitLabel(vehicle)} · {vehicle.placa}
          </p>
        </div>
        {canEdit ? (
          editing ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDraft(vehicleToFichaDraft(vehicle));
                  setEditing(false);
                  setError('');
                }}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSave()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Guardar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
            >
              <Pencil size={14} />
              Editar ficha
            </button>
          )
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      ) : null}

      {editing ? (
        <VehicleFichaTecnicaFields draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <ReadRow label="Unidad" value={formatVehicleUnitLabel(vehicle)} />
          <ReadRow label="Placa" value={formatFichaText(vehicle.placa)} />
          <ReadRow label="Marca" value={formatFichaText(vehicle.marca)} />
          <ReadRow label="Modelo" value={formatFichaText(vehicle.modelo)} />
          <ReadRow
            label="Año"
            value={vehicle.anio != null && Number.isFinite(vehicle.anio) ? String(vehicle.anio) : 'Sin registrar'}
          />
          <ReadRow label="Combustible" value={formatFichaText(vehicle.combustible)} />
          <ReadRow label="Color" value={formatFichaText(vehicle.color)} />
          <ReadRow label="Tipo carrocería" value={formatFichaText(vehicle.tipoCarroceria)} />
          <ReadRow label="N° motor" value={formatFichaText(vehicle.numeroMotor)} />
          <ReadRow label="Llaves" value={formatFichaNumber(vehicle.cantidadLlaves)} />
          <ReadRow label="GPS 1" value={formatFichaGps(vehicle.gps1)} />
          <ReadRow label="GPS 2" value={formatFichaGps(vehicle.gps2)} />
          <ReadRow label="Impuesto" value={formatFichaText(vehicle.impuesto)} />
          <ReadRow label="KM inicial" value={formatFichaNumber(vehicle.kmInicial)} />
          <ReadRow label="Tarjeta propiedad" value={formatFichaText(vehicle.tarjetaPropiedad)} />
          <ReadRow label="Propietario" value={formatFichaText(vehicle.propietarioNombre)} />
        </div>
      )}
    </div>
  );
};

export default VehicleFichaTecnicaPanel;
