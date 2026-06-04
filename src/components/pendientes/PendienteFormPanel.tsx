import React from 'react';
import { Loader2 } from 'lucide-react';
import Card from '../Common/Card';
import Input from '../Common/Input';
import Select from '../Common/Select';
import type { Vehicle } from '../../data/types';
import {
  PENDIENTE_PRIORIDADES_V2,
  PENDIENTE_RELACION_TIPOS,
  PENDIENTE_TIPOS,
  type PendienteFormValues,
} from '../../utils/pendienteModel';

export interface PendienteFormPanelProps {
  title: string;
  values: PendienteFormValues;
  onChange: (patch: Partial<PendienteFormValues>) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  saving: boolean;
  vehicles: Vehicle[];
  submitLabel?: string;
}

const PendienteFormPanel: React.FC<PendienteFormPanelProps> = ({
  title,
  values,
  onChange,
  onSubmit,
  onCancel,
  saving,
  vehicles,
  submitLabel = 'Guardar pendiente',
}) => {
  const showRelId = values.relacionadoTipo !== 'ninguno';
  const vehicleOpts = [
    { value: '', label: '— Elegir —' },
    ...[...vehicles].sort((a, b) => a.id - b.id).map((v) => ({
      value: String(v.id),
      label: `#${v.id} ${v.marca} ${v.modelo} (${v.placa})`,
    })),
  ];

  return (
    <Card title={title} subtitle="Capa manual del equipo · visible en Qué hacer hoy si está activado">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Título"
          value={values.titulo}
          onChange={(e) => onChange({ titulo: e.target.value })}
          placeholder="Ej. Revisar utilidad vehículo #63"
        />
        <Select
          label="Tipo"
          options={PENDIENTE_TIPOS.map((t) => ({ value: t.value, label: `${t.emoji} ${t.label}` }))}
          value={values.tipo}
          onChange={(v) => onChange({ tipo: v as PendienteFormValues['tipo'] })}
        />
        <div className="sm:col-span-2">
          <label className="label">Descripción</label>
          <textarea
            value={values.descripcion}
            onChange={(e) => onChange({ descripcion: e.target.value })}
            rows={2}
            className="input-field text-sm min-h-[72px] resize-y w-full"
            placeholder="Detalle opcional…"
          />
        </div>
        <Select
          label="Prioridad"
          options={PENDIENTE_PRIORIDADES_V2.map((p) => ({ value: p.value, label: p.label }))}
          value={values.prioridadV2}
          onChange={(v) => onChange({ prioridadV2: v as PendienteFormValues['prioridadV2'] })}
        />
        <Input
          label="Fecha objetivo"
          type="date"
          value={values.fechaObjetivo}
          onChange={(e) => onChange({ fechaObjetivo: e.target.value })}
        />
        <Input
          label="Fecha registro"
          type="date"
          value={values.fecha}
          onChange={(e) => onChange({ fecha: e.target.value })}
        />
        <Input
          label="Responsable"
          value={values.responsable}
          onChange={(e) => onChange({ responsable: e.target.value })}
          placeholder="Nombre o rol"
        />
        <Select
          label="Relacionar con"
          options={PENDIENTE_RELACION_TIPOS.map((r) => ({ value: r.value, label: r.label }))}
          value={values.relacionadoTipo}
          onChange={(v) =>
            onChange({
              relacionadoTipo: v as PendienteFormValues['relacionadoTipo'],
              relacionadoId: '',
            })
          }
        />
        {values.relacionadoTipo === 'vehiculo' ? (
          <Select
            label="Vehículo"
            options={vehicleOpts}
            value={values.relacionadoId || values.vehicleId}
            onChange={(v) => onChange({ relacionadoId: v, vehicleId: v })}
          />
        ) : showRelId ? (
          <Input
            label="ID relacionado"
            value={values.relacionadoId}
            onChange={(e) => onChange({ relacionadoId: e.target.value })}
            placeholder="ID del registro"
          />
        ) : (
          <Select
            label="Vehículo (opcional)"
            options={vehicleOpts}
            value={values.vehicleId}
            placeholder="General"
            onChange={(v) => onChange({ vehicleId: v })}
          />
        )}
        <label className="flex items-center gap-2 sm:col-span-2 min-h-11 cursor-pointer">
          <input
            type="checkbox"
            checked={values.mostrarEnHoy}
            onChange={(e) => onChange({ mostrarEnHoy: e.target.checked })}
            className="rounded border-gray-300 text-violet-600 focus:ring-violet-500 h-4 w-4"
          />
          <span className="text-sm font-medium text-gray-800">Mostrar en Qué hacer hoy</span>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 justify-end">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 px-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
        ) : null}
        <button
          type="button"
          disabled={saving || !values.titulo.trim()}
          onClick={onSubmit}
          className="min-h-11 px-5 rounded-xl bg-violet-700 hover:bg-violet-800 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : null}
          {saving ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </Card>
  );
};

export default PendienteFormPanel;
