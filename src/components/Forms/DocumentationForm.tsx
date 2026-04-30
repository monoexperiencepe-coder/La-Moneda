import React, { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import Button from '../Common/Button';
import Input from '../Common/Input';
import Select from '../Common/Select';
import Card from '../Common/Card';
import { Documentacion, Vehicle } from '../../data/types';
import { todayStr } from '../../utils/formatting';

interface DocumentationFormProps {
  vehicles: Vehicle[];
  onSubmit: (doc: Omit<Documentacion, 'id' | 'createdAt'>) => void;
}

const initialState = {
  fecha: todayStr(),
  vehicleId: '',
  motivo: '',
  descripcion: '',
  valorTiempo: '',
  soat: '',
  rtParticular: '',
  rtDetaxi: '',
  afocatTaxi: '',
  notas: '',
};

const DocumentationForm: React.FC<DocumentationFormProps> = ({ vehicles, onSubmit }) => {
  const [form, setForm] = useState(initialState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.vehicleId) e.vehicleId = 'Selecciona un vehículo';
    if (!form.motivo) e.motivo = 'El motivo es requerido';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 400));
    onSubmit({
      fecha: form.fecha,
      vehicleId: Number(form.vehicleId),
      motivo: form.motivo,
      descripcion: form.descripcion,
      valorTiempo: form.valorTiempo,
      soat: form.soat,
      rtParticular: form.rtParticular,
      rtDetaxi: form.rtDetaxi,
      afocatTaxi: form.afocatTaxi,
      notas: form.notas,
    });
    setForm({ ...initialState, fecha: todayStr() });
    setErrors({});
    setLoading(false);
  };

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  return (
    <Card title="Registrar Documentación" subtitle="Vencimientos y estado de documentos del vehículo">
      <form onSubmit={handleSubmit} className="space-y-6 mt-2">
        {/* General info */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
            📋 Información General
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Fecha" type="date" value={form.fecha}
              onChange={e => set('fecha', e.target.value)} required />
            <Select
              label="N° Vehículo"
              options={vehicles.filter(v => v.activo).map(v => ({
                value: v.id, label: `#${v.id} — ${v.marca} ${v.modelo} (${v.placa})`,
              }))}
              value={form.vehicleId}
              placeholder="Seleccionar vehículo..."
              onChange={v => { set('vehicleId', v); setErrors(p => ({ ...p, vehicleId: '' })); }}
              error={errors.vehicleId}
              required
            />
            <Input label="Motivo" type="text" value={form.motivo}
              onChange={e => { set('motivo', e.target.value); setErrors(p => ({ ...p, motivo: '' })); }}
              error={errors.motivo} placeholder="Renovación, control, etc." required />
            <Input label="Valor / Tiempo" type="text" value={form.valorTiempo}
              onChange={e => set('valorTiempo', e.target.value)} placeholder="Inmediato, 30 días, etc." />
          </div>
          <div className="mt-4">
            <Input label="Descripción" type="text" value={form.descripcion}
              onChange={e => set('descripcion', e.target.value)} placeholder="Descripción detallada del registro..." />
          </div>
        </div>

        {/* Document expiries */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
            📅 Fechas de Vencimiento de Documentos
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="SOAT — Vencimiento" type="date" value={form.soat}
              onChange={e => set('soat', e.target.value)} />
            <Input label="R.T. Particular — Vencimiento" type="date" value={form.rtParticular}
              onChange={e => set('rtParticular', e.target.value)} />
            <Input label="R.T. Detaxi — Vencimiento" type="date" value={form.rtDetaxi}
              onChange={e => set('rtDetaxi', e.target.value)} />
            <Input label="AFOCAT Taxi — Vencimiento" type="date" value={form.afocatTaxi}
              onChange={e => set('afocatTaxi', e.target.value)} />
          </div>
        </div>

        {/* Notes */}
        <div>
          <Input label="Notas adicionales" type="text" value={form.notas}
            onChange={e => set('notas', e.target.value)} placeholder="Observaciones, alertas, recordatorios..." />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={() => { setForm({ ...initialState, fecha: todayStr() }); setErrors({}); }}>
            Limpiar
          </Button>
          <Button type="submit" loading={loading} icon={<PlusCircle size={16} />}>
            Registrar Documentación
          </Button>
        </div>
      </form>
    </Card>
  );
};

export default DocumentationForm;
