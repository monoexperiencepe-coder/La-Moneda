import React, { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import Button from '../Common/Button';
import Input from '../Common/Input';
import Select from '../Common/Select';
import Card from '../Common/Card';
import { Prestamo, Vehicle, Moneda } from '../../data/types';
import { todayStr } from '../../utils/formatting';

interface PrestamoFormProps {
  vehicles: Vehicle[];
  onSubmit: (row: Omit<Prestamo, 'id' | 'createdAt'>) => void;
}

interface FormState {
  fecha: string;
  fechaRegistro: string;
  vehicleId: string;
  moneda: Moneda;
  monto: string;
  tasaInteresAnualPct: string;
  tipoCambio: string;
  acreedor: string;
  comentarios: string;
}

function emptyForm(): FormState {
  return {
    fecha: todayStr(),
    fechaRegistro: todayStr(),
    vehicleId: '',
    moneda: 'PEN',
    monto: '',
    tasaInteresAnualPct: '',
    tipoCambio: '',
    acreedor: '',
    comentarios: '',
  };
}

const PrestamoForm: React.FC<PrestamoFormProps> = ({ vehicles, onSubmit }) => {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = useState(false);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.fecha) newErrors.fecha = 'Fecha de solicitud requerida';
    if (!form.fechaRegistro) newErrors.fechaRegistro = 'Fecha de registro requerida';
    const m = Number(form.monto);
    if (!form.monto?.trim() || Number.isNaN(m) || m <= 0) newErrors.monto = 'Monto capital inválido';
    const t = Number(form.tasaInteresAnualPct);
    if (form.tasaInteresAnualPct.trim() === '' || Number.isNaN(t) || t < 0) {
      newErrors.tasaInteresAnualPct = 'Indica la tasa anual (%)';
    }
    if (form.moneda === 'USD') {
      const tc = Number(form.tipoCambio);
      if (!form.tipoCambio?.trim() || Number.isNaN(tc) || tc <= 0) {
        newErrors.tipoCambio = 'Tipo de cambio (S/ por US$) requerido para préstamo en dólares';
      }
    }
    if (!form.acreedor.trim()) newErrors.acreedor = 'Indica acreedor o entidad';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 400));
    const monto = Number(Number(form.monto).toFixed(2));
    const tasa = Number(Number(form.tasaInteresAnualPct).toFixed(2));
    const tipoCambio =
      form.moneda === 'USD'
        ? Number(Number(form.tipoCambio).toFixed(4))
        : form.tipoCambio.trim()
          ? Number(Number(form.tipoCambio).toFixed(4))
          : null;
    onSubmit({
      fecha: form.fecha,
      fechaRegistro: form.fechaRegistro,
      vehicleId: form.vehicleId ? Number(form.vehicleId) : null,
      moneda: form.moneda,
      monto,
      tasaInteresAnualPct: tasa,
      tipoCambio,
      acreedor: form.acreedor.trim(),
      saldoPendiente: monto,
      estado: 'ACTIVO',
      comentarios: form.comentarios.trim(),
    });
    setForm(emptyForm());
    setErrors({});
    setLoading(false);
  };

  return (
    <Card
      title="Nuevo préstamo"
      subtitle="Capital en soles o dólares, tasa anual % y tipo de cambio (S/ por US$) cuando aplique"
    >
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Fecha solicitud / inicio"
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

        <Select
          label="Vehículo (opcional)"
          options={vehicles.filter(v => v.activo).map(v => ({
            value: v.id,
            label: `#${v.id} — ${v.marca} ${v.modelo} (${v.placa})`,
          }))}
          value={form.vehicleId}
          placeholder="General / sin vehículo"
          onChange={v => setForm(p => ({ ...p, vehicleId: v }))}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Moneda del capital"
            options={[
              { value: 'PEN', label: 'Soles (PEN)' },
              { value: 'USD', label: 'Dólares (USD)' },
            ]}
            value={form.moneda}
            onChange={v => {
              setForm(p => ({
                ...p,
                moneda: v as Moneda,
                tipoCambio: v === 'PEN' ? '' : p.tipoCambio,
              }));
              setErrors(e => ({ ...e, tipoCambio: '' }));
            }}
            required
          />
          <Input
            label="Capital prestado"
            type="number"
            min="0"
            step="0.01"
            value={form.monto}
            onChange={e => {
              setForm(p => ({ ...p, monto: e.target.value }));
              setErrors(p => ({ ...p, monto: '' }));
            }}
            error={errors.monto}
            placeholder={form.moneda === 'USD' ? '2000.00' : '10000.00'}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Tasa de interés anual (%)"
            type="number"
            min="0"
            step="0.01"
            value={form.tasaInteresAnualPct}
            onChange={e => {
              setForm(p => ({ ...p, tasaInteresAnualPct: e.target.value }));
              setErrors(p => ({ ...p, tasaInteresAnualPct: '' }));
            }}
            error={errors.tasaInteresAnualPct}
            placeholder="18"
            required
          />
          <Input
            label={`Tipo de cambio (S/ por US$)${form.moneda === 'PEN' ? ' — opcional' : ''}`}
            type="number"
            min="0"
            step="0.0001"
            value={form.tipoCambio}
            onChange={e => {
              setForm(p => ({ ...p, tipoCambio: e.target.value }));
              setErrors(p => ({ ...p, tipoCambio: '' }));
            }}
            error={errors.tipoCambio}
            placeholder="3.75"
            helper={form.moneda === 'USD' ? 'Obligatorio para ver saldo referido en soles.' : 'Si quieres dejar referencia del día (opcional).'}
          />
        </div>

        <Input
          label="Acreedor / entidad"
          type="text"
          value={form.acreedor}
          onChange={e => {
            setForm(p => ({ ...p, acreedor: e.target.value }));
            setErrors(p => ({ ...p, acreedor: '' }));
          }}
          error={errors.acreedor}
          placeholder="Banco, persona, financiera…"
          required
        />

        <Input
          label="Comentarios (opcional)"
          type="text"
          value={form.comentarios}
          onChange={e => setForm(p => ({ ...p, comentarios: e.target.value }))}
        />

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={() => { setForm(emptyForm()); setErrors({}); }}>
            Limpiar
          </Button>
          <Button type="submit" loading={loading} icon={<PlusCircle size={16} />} variant="primary">
            Registrar préstamo
          </Button>
        </div>
      </form>
    </Card>
  );
};

export default PrestamoForm;
