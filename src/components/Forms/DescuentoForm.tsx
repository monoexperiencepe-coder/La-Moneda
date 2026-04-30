import React, { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import Button from '../Common/Button';
import Input from '../Common/Input';
import Select from '../Common/Select';
import Card from '../Common/Card';
import { Descuento, Vehicle } from '../../data/types';
import { CATEGORIAS_DESCUENTO, LABEL_CATEGORIA_DESCUENTO } from '../../data/descuentosCatalog';
import { todayStr } from '../../utils/formatting';

interface DescuentoFormProps {
  vehicles: Vehicle[];
  onSubmit: (row: Omit<Descuento, 'id' | 'createdAt'>) => void;
}

interface FormState {
  fecha: string;
  fechaRegistro: string;
  vehicleId: string;
  categoria: Descuento['categoria'];
  monto: string;
  comentarios: string;
}

function emptyForm(): FormState {
  const c0 = CATEGORIAS_DESCUENTO[0] ?? 'OTROS';
  return {
    fecha: todayStr(),
    fechaRegistro: todayStr(),
    vehicleId: '',
    categoria: c0,
    monto: '',
    comentarios: '',
  };
}

const DescuentoForm: React.FC<DescuentoFormProps> = ({ vehicles, onSubmit }) => {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = useState(false);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.fecha) newErrors.fecha = 'La fecha de movimiento es requerida';
    if (!form.fechaRegistro) newErrors.fechaRegistro = 'La fecha de registro es requerida';
    const m = Number(form.monto);
    if (!form.monto?.trim() || Number.isNaN(m) || m <= 0) {
      newErrors.monto = 'Ingresa el importe de la rebaja (valor positivo)';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 400));
    const rawM = Number(Number(form.monto).toFixed(2));
    onSubmit({
      fecha: form.fecha,
      fechaRegistro: form.fechaRegistro,
      vehicleId: form.vehicleId ? Number(form.vehicleId) : null,
      categoria: form.categoria,
      monto: -Math.abs(rawM),
      comentarios: form.comentarios.trim(),
    });
    setForm(emptyForm());
    setErrors({});
    setLoading(false);
  };

  return (
    <Card
      title="Registrar descuento"
      subtitle="Fechas de movimiento y de registro, categoría e importe (apartado de gastos)"
    >
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Fecha de movimiento"
            type="date"
            value={form.fecha}
            onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))}
            error={errors.fecha}
            required
          />
          <Input
            label="Fecha de registro"
            type="date"
            value={form.fechaRegistro}
            onChange={e => setForm(p => ({ ...p, fechaRegistro: e.target.value }))}
            error={errors.fechaRegistro}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="N° Vehículo (opcional)"
            options={vehicles.filter(v => v.activo).map(v => ({
              value: v.id,
              label: `#${v.id} — ${v.marca} ${v.modelo} (${v.placa})`,
            }))}
            value={form.vehicleId}
            placeholder="General / sin vehículo"
            onChange={v => setForm(p => ({ ...p, vehicleId: v }))}
            helper="Dejar vacío si aplica a toda la operación"
          />
          <Select
            label="Categoría"
            options={CATEGORIAS_DESCUENTO.map(c => ({
              value: c,
              label: LABEL_CATEGORIA_DESCUENTO[c],
            }))}
            value={form.categoria}
            placeholder="Seleccionar…"
            onChange={v => setForm(p => ({ ...p, categoria: v as Descuento['categoria'] }))}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Importe de la rebaja (S/)"
            type="number"
            min="0"
            step="0.01"
            value={form.monto}
            onChange={e => {
              setForm(p => ({ ...p, monto: e.target.value }));
              setErrors(p => ({ ...p, monto: '' }));
            }}
            error={errors.monto}
            placeholder="0.00"
            helper="Se guarda como monto negativo para reflejar menos dinero efectivo o costo adicional."
            required
          />
        </div>

        <Input
          label="Comentarios (opcional)"
          type="text"
          value={form.comentarios}
          onChange={e => setForm(p => ({ ...p, comentarios: e.target.value }))}
          placeholder="Detalle del motivo…"
        />

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={() => { setForm(emptyForm()); setErrors({}); }}>
            Limpiar
          </Button>
          <Button type="submit" loading={loading} icon={<PlusCircle size={16} />} variant="primary">
            Registrar descuento
          </Button>
        </div>
      </form>
    </Card>
  );
};

export default DescuentoForm;
