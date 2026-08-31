import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import Modal from '../Common/Modal';
import { useAuth } from '../../context/AuthContext';
import {
  insertInversionGeneralVehiculo,
  updateInversionGeneralVehiculo,
  computeInversionMontoTotal,
  type InversionGeneralVehiculoInsertPayload,
} from '../../services/inversionesGeneralesVehiculoService';
import { fetchVehiculos } from '../../services/vehiculosService';
import type { InversionGeneralVehiculo, Vehicle } from '../../data/types';
import { formatVehicleSelectLabel, formatVehicleLabelFull } from '../../utils/vehicleDisplayNumber';

// ---------------------------------------------------------------------------
// Tipos y helpers locales
// ---------------------------------------------------------------------------

type Mode = 'create' | 'edit';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Fila existente → modo edición; null → modo alta. */
  existing: InversionGeneralVehiculo | null;
  onSaved: () => void;
}

type FormField =
  | 'placa'
  | 'modelo'
  | 'fechaCompra'
  | 'valorCompraUsd'
  | 'gastoGnvUsd'
  | 'gastoNotarialUsd'
  | 'legFirmasUsd'
  | 'seguroUsd'
  | 'gpsUsd'
  | 'fundasAccesoriosUsd'
  | 'totalInversionPen'
  | 'moneda'
  | 'observaciones';

interface FormState {
  vehiculoNumero: number | null;
  vehiculoReferencia: string;
  placa: string;
  modelo: string;
  fechaCompra: string;
  valorCompraUsd: string;
  gastoGnvUsd: string;
  gastoNotarialUsd: string;
  legFirmasUsd: string;
  seguroUsd: string;
  gpsUsd: string;
  fundasAccesoriosUsd: string;
  totalInversionPen: string;
  moneda: 'USD' | 'PEN';
  observaciones: string;
}

function emptyForm(): FormState {
  return {
    vehiculoNumero: null,
    vehiculoReferencia: '',
    placa: '',
    modelo: '',
    fechaCompra: '',
    valorCompraUsd: '',
    gastoGnvUsd: '',
    gastoNotarialUsd: '',
    legFirmasUsd: '',
    seguroUsd: '',
    gpsUsd: '',
    fundasAccesoriosUsd: '',
    totalInversionPen: '',
    moneda: 'USD',
    observaciones: '',
  };
}

function formFromExisting(row: InversionGeneralVehiculo): FormState {
  const num = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? String(v) : '');
  return {
    vehiculoNumero: row.vehiculoNumero,
    vehiculoReferencia: row.vehiculoReferencia,
    placa: row.placa ?? '',
    modelo: row.modelo ?? '',
    fechaCompra: row.fechaCompra?.slice(0, 10) ?? '',
    valorCompraUsd: num(row.valorCompraUsd),
    gastoGnvUsd: num(row.gastoGnvUsd),
    gastoNotarialUsd: num(row.gastoNotarialUsd),
    legFirmasUsd: num(row.legFirmasUsd),
    seguroUsd: num(row.seguroUsd),
    gpsUsd: num(row.gpsUsd),
    fundasAccesoriosUsd: num(row.fundasAccesoriosUsd),
    totalInversionPen: num(row.totalInversionPen),
    moneda: row.moneda,
    observaciones: row.observaciones ?? '',
  };
}

function parseNum(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Estilos reutilizables (siguen la guía del proyecto)
// ---------------------------------------------------------------------------

const labelCls = 'text-[10px] font-semibold text-gray-500 uppercase tracking-wide';
const inputCls =
  'mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-violet-400 focus:outline-none';
const inputSmCls =
  'mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm tabular-nums focus:ring-2 focus:ring-violet-400 focus:outline-none';

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

const InversionGeneralVehiculoModal: React.FC<Props> = ({ isOpen, onClose, existing, onSaved }) => {
  const { profile } = useAuth();
  const mode: Mode = existing ? 'edit' : 'create';

  const [form, setForm] = useState<FormState>(emptyForm);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Carga vehículos (solo en modo crear o al abrir)
  useEffect(() => {
    if (!isOpen) return;
    setVehiclesLoading(true);
    void fetchVehiculos(profile?.empresa_id)
      .then((vs) => setVehicles(vs))
      .catch(() => setVehicles([]))
      .finally(() => setVehiclesLoading(false));
  }, [isOpen, profile?.empresa_id]);

  // Inicializa form al abrir
  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setBusy(false);
    setForm(existing ? formFromExisting(existing) : emptyForm());
  }, [isOpen, existing]);

  const setField = useCallback((field: FormField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Cuando el usuario selecciona un vehículo en modo crear, autocompleta campos
  const handleVehicleSelect = useCallback(
    (vehicleId: string) => {
      const v = vehicles.find((v) => String(v.id) === vehicleId);
      if (!v) {
        setForm((prev) => ({ ...prev, vehiculoNumero: null, vehiculoReferencia: '', placa: '', modelo: '' }));
        return;
      }
      setForm((prev) => ({
        ...prev,
        vehiculoNumero: v.id,
        vehiculoReferencia: formatVehicleLabelFull(v).slice(0, 240),
        placa: prev.placa || v.placa,
        modelo: prev.modelo || `${v.marca} ${v.modelo}`.trim(),
      }));
    },
    [vehicles],
  );

  // Total calculado en tiempo real desde el desglose
  const computedTotal = useMemo(
    () =>
      computeInversionMontoTotal(
        {
          valorCompraUsd: parseNum(form.valorCompraUsd),
          gastoGnvUsd: parseNum(form.gastoGnvUsd),
          gastoNotarialUsd: parseNum(form.gastoNotarialUsd),
          legFirmasUsd: parseNum(form.legFirmasUsd),
          seguroUsd: parseNum(form.seguroUsd),
          gpsUsd: parseNum(form.gpsUsd),
          fundasAccesoriosUsd: parseNum(form.fundasAccesoriosUsd),
        },
        existing?.montoTotal,
      ),
    [form, existing?.montoTotal],
  );

  const handleSave = useCallback(async () => {
    if (busy) return;
    setError('');

    // Validaciones mínimas
    if (mode === 'create' && !form.vehiculoNumero) {
      setError('Selecciona un vehículo.');
      return;
    }
    if (!form.vehiculoReferencia.trim()) {
      setError('Falta referencia del vehículo.');
      return;
    }
    if (computedTotal <= 0) {
      setError('Ingresa al menos un monto de desglose mayor a cero.');
      return;
    }

    const payload: InversionGeneralVehiculoInsertPayload = {
      vehiculoReferencia: form.vehiculoReferencia.trim(),
      vehiculoNumero: form.vehiculoNumero,
      placa: form.placa.trim() || null,
      modelo: form.modelo.trim() || null,
      fechaCompra: form.fechaCompra || null,
      valorCompraUsd: parseNum(form.valorCompraUsd),
      gastoGnvUsd: parseNum(form.gastoGnvUsd),
      gastoNotarialUsd: parseNum(form.gastoNotarialUsd),
      legFirmasUsd: parseNum(form.legFirmasUsd),
      seguroUsd: parseNum(form.seguroUsd),
      gpsUsd: parseNum(form.gpsUsd),
      fundasAccesoriosUsd: parseNum(form.fundasAccesoriosUsd),
      totalInversionPen: parseNum(form.totalInversionPen),
      moneda: form.moneda,
      observaciones: form.observaciones.trim() || null,
    };

    setBusy(true);
    try {
      if (mode === 'create') {
        await insertInversionGeneralVehiculo(payload, profile?.empresa_id);
      } else if (existing) {
        await updateInversionGeneralVehiculo(existing.id, payload, profile?.empresa_id);
      }
      onSaved();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al guardar.';
      // Mensaje amigable para constraint de unicidad
      if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('already exists')) {
        setError('Ya existe una inversión para ese vehículo. Edita el registro existente.');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, computedTotal, existing, form, mode, onClose, onSaved, profile?.empresa_id]);

  const title = mode === 'create' ? 'Nueva inversión general' : 'Editar inversión general';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="xl"
      closeLocked={busy}
      footer={
        <div className="flex gap-2 w-full justify-end">
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
            onClick={() => void handleSave()}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {mode === 'create' ? 'Crear registro' : 'Guardar cambios'}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Error */}
        {error ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        ) : null}

        {/* Vehículo */}
        <section className="space-y-3">
          <h4 className="text-xs font-semibold text-violet-700 uppercase tracking-widest">Vehículo</h4>

          {mode === 'create' ? (
            <label className="block">
              <span className={labelCls}>Vehículo *</span>
              {vehiclesLoading ? (
                <p className="mt-1 text-sm text-slate-400">Cargando vehículos…</p>
              ) : (
                <select
                  value={form.vehiculoNumero != null ? String(form.vehiculoNumero) : ''}
                  onChange={(e) => handleVehicleSelect(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Selecciona un vehículo —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={String(v.id)}>
                      {formatVehicleSelectLabel(v)}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ) : (
            <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2 text-sm">
              <p className="font-semibold text-violet-900">{existing?.vehiculoReferencia}</p>
              {existing?.placa ? (
                <p className="text-xs text-violet-700 mt-0.5">Placa: {existing.placa}</p>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>Placa</span>
              <input
                type="text"
                value={form.placa}
                onChange={(e) => setField('placa', e.target.value.toUpperCase())}
                className={inputCls}
                placeholder="Ej. ABC-123"
              />
            </label>
            <label className="block">
              <span className={labelCls}>Modelo</span>
              <input
                type="text"
                value={form.modelo}
                onChange={(e) => setField('modelo', e.target.value)}
                className={inputCls}
                placeholder="Ej. Toyota Yaris"
              />
            </label>
            <label className="block">
              <span className={labelCls}>Fecha de compra</span>
              <input
                type="date"
                value={form.fechaCompra}
                onChange={(e) => setField('fechaCompra', e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Moneda principal</span>
              <select
                value={form.moneda}
                onChange={(e) => setField('moneda', e.target.value as 'USD' | 'PEN')}
                className={inputCls}
              >
                <option value="USD">USD</option>
                <option value="PEN">PEN</option>
              </select>
            </label>
          </div>
        </section>

        {/* Desglose USD */}
        <section className="space-y-3">
          <h4 className="text-xs font-semibold text-violet-700 uppercase tracking-widest">Desglose (USD)</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(
              [
                ['valorCompraUsd', 'Valor vehículo'],
                ['gastoGnvUsd', 'GNV'],
                ['gastoNotarialUsd', 'Notarial'],
                ['legFirmasUsd', 'Legalización/Firmas'],
                ['seguroUsd', 'Seguro'],
                ['gpsUsd', 'GPS'],
                ['fundasAccesoriosUsd', 'Fundas/Accesorios'],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="block">
                <span className={labelCls}>{label}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form[field]}
                  onChange={(e) => setField(field, e.target.value)}
                  className={inputSmCls}
                  placeholder="0.00"
                />
              </label>
            ))}
          </div>

          {/* Total calculado — solo lectura */}
          <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-violet-700 uppercase tracking-wide">
              Total calculado (monto_total)
            </span>
            <span className="text-sm font-bold tabular-nums text-violet-900">
              {computedTotal > 0 ? `$ ${computedTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </span>
          </div>
        </section>

        {/* Totales adicionales */}
        <section className="space-y-3">
          <h4 className="text-xs font-semibold text-violet-700 uppercase tracking-widest">Referencia adicional</h4>
          <label className="block sm:w-1/2">
            <span className={labelCls}>Equivalente S/ (referencial)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.totalInversionPen}
              onChange={(e) => setField('totalInversionPen', e.target.value)}
              className={inputSmCls}
              placeholder="0.00"
            />
          </label>
        </section>

        {/* Observaciones */}
        <section>
          <label className="block">
            <span className={labelCls}>Observaciones</span>
            <textarea
              value={form.observaciones}
              onChange={(e) => setField('observaciones', e.target.value)}
              rows={2}
              className={`${inputCls} resize-y min-h-[56px]`}
              placeholder="Notas sobre esta inversión"
            />
          </label>
        </section>
      </div>
    </Modal>
  );
};

export default InversionGeneralVehiculoModal;
