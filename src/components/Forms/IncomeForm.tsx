import React, { useMemo, useState } from 'react';
import { PlusCircle, CalendarRange } from 'lucide-react';
import Button from '../Common/Button';
import Input from '../Common/Input';
import Select from '../Common/Select';
import Card from '../Common/Card';
import PeriodoPagoModal from '../Ingreso/PeriodoPagoModal';
import PagoRapidoIngreso from '../Ingreso/PagoRapidoIngreso';
import { Ingreso, Vehicle, Moneda } from '../../data/types';
import {
  TIPOS_INGRESO_FACT,
  getSubtiposIngreso,
  getDetalleMetodoByLabel,
  getDetallesMetodoPago,
} from '../../data/factCatalog';
import { todayStr } from '../../utils/formatting';

interface IncomeFormProps {
  vehicles: Vehicle[];
  ingresos?: Ingreso[];
  onSubmit: (ingreso: Omit<Ingreso, 'id' | 'createdAt'>) => void;
}

interface FormState {
  fecha: string;
  vehicleId: string;
  tipo: string;
  subTipo: string;
  fechaDesde: string;
  fechaHasta: string;
  metodoPago: string;
  metodoPagoDetalle: string;
  moneda: Moneda;
  tipoCambio: string;
  monto: string;
  comentarios: string;
}

function emptyForm(): FormState {
  const t = TIPOS_INGRESO_FACT.includes('ALQUILER') ? 'ALQUILER' : (TIPOS_INGRESO_FACT[0] ?? '');
  const y = getDetallesMetodoPago('Yape')[0];
  return {
    fecha: todayStr(),
    vehicleId: '',
    tipo: t,
    subTipo: getSubtiposIngreso(t)[0] ?? '',
    fechaDesde: '',
    fechaHasta: '',
    metodoPago: 'Yape',
    metodoPagoDetalle: y?.detalle ?? '',
    moneda: 'PEN',
    tipoCambio: '',
    monto: '',
    comentarios: '',
  };
}

const IncomeForm: React.FC<IncomeFormProps> = ({ vehicles, ingresos = [], onSubmit }) => {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = useState(false);
  const [periodoOpen, setPeriodoOpen] = useState(false);

  const activeVehicles = vehicles.filter(v => v.activo);

  const subtipos = useMemo(() => getSubtiposIngreso(form.tipo), [form.tipo]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.fecha) newErrors.fecha = 'La fecha de movimiento es requerida';
    if (!form.vehicleId) newErrors.vehicleId = 'Selecciona un vehículo';
    if (!form.tipo) newErrors.tipo = 'Selecciona un tipo de ingreso';
    if (subtipos.length > 0 && !form.subTipo) newErrors.subTipo = 'Selecciona sub tipo';
    if (!form.monto || Number(form.monto) <= 0) newErrors.monto = 'Ingresa un monto válido';
    if (form.moneda === 'USD') {
      const tc = Number(form.tipoCambio);
      if (!form.tipoCambio.trim() || Number.isNaN(tc) || tc <= 0) {
        newErrors.tipoCambio = 'Tipo de cambio (S/ por US$) requerido para ingreso en dólares';
      }
    }
    if (!form.metodoPagoDetalle.trim()) newErrors.metodoPagoDetalle = 'Selecciona la cuenta de pago';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 400));
    const row = getDetalleMetodoByLabel(form.metodoPago, form.metodoPagoDetalle);
    const moneda = form.moneda;
    const rawM = Number(Number(form.monto).toFixed(2));
    const tipoCambio =
      moneda === 'USD'
        ? Number(Number(form.tipoCambio).toFixed(4))
        : form.tipoCambio.trim()
          ? Number(Number(form.tipoCambio).toFixed(4))
          : null;
    const montoPENReferencia =
      moneda === 'USD' && tipoCambio != null && tipoCambio > 0
        ? Number((rawM * tipoCambio).toFixed(2))
        : rawM;
    onSubmit({
      fecha: form.fecha,
      fechaRegistro: todayStr(),
      vehicleId: Number(form.vehicleId),
      tipo: form.tipo,
      subTipo: form.subTipo || null,
      fechaDesde: form.fechaDesde.trim() || null,
      fechaHasta: form.fechaHasta.trim() || null,
      metodoPago: form.metodoPago,
      metodoPagoDetalle: form.metodoPagoDetalle.trim(),
      celularMetodo: row?.celular?.trim() ? row.celular.trim() : null,
      signo: '+',
      monto: rawM,
      moneda,
      tipoCambio,
      montoPENReferencia,
      comentarios: form.comentarios,
    });
    setForm(emptyForm());
    setErrors({});
    setLoading(false);
  };

  const getVehicleDetail = (vehicleId: string) => {
    if (!vehicleId) return '';
    const v = vehicles.find(v => v.id === Number(vehicleId));
    return v ? `${v.marca} ${v.modelo} — ${v.placa}` : '';
  };

  const periodoLabel =
    form.fechaDesde && form.fechaHasta
      ? `${form.fechaDesde} → ${form.fechaHasta}`
      : form.fechaDesde || form.fechaHasta
        ? `${form.fechaDesde || '…'} → ${form.fechaHasta || '…'}`
        : null;

  return (
    <Card title="Registrar Ingreso" subtitle="Fecha de movimiento, pago por cuenta/celular, período opcional">
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
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-3 flex flex-col justify-center">
            <p className="text-xs font-medium text-gray-600">Fecha de registro</p>
            <p className="text-sm text-gray-800 mt-0.5">
              Automática al guardar: <strong>{todayStr()}</strong> (fecha del sistema)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="N° Vehículo"
            options={activeVehicles.map(v => ({
              value: v.id,
              label: `#${v.id} — ${v.marca} ${v.modelo} (${v.placa})`,
            }))}
            value={form.vehicleId}
            placeholder="Seleccionar vehículo..."
            onChange={v => {
              setForm(p => ({ ...p, vehicleId: v }));
              setErrors(p => ({ ...p, vehicleId: '' }));
            }}
            error={errors.vehicleId}
            required
          />
          <div className="flex flex-col justify-end">
            <button
              type="button"
              onClick={() => setPeriodoOpen(true)}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-xl border-2 border-gray-200 text-sm font-medium text-gray-700 hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors"
            >
              <CalendarRange size={18} className="text-emerald-600 shrink-0" />
              <span className="truncate">
                {periodoLabel ? `Período: ${periodoLabel}` : 'Período del pago (opcional)'}
              </span>
            </button>
          </div>
        </div>

        <PeriodoPagoModal
          isOpen={periodoOpen}
          onClose={() => setPeriodoOpen(false)}
          fechaDesde={form.fechaDesde}
          fechaHasta={form.fechaHasta}
          onGuardar={(desde, hasta) => {
            setForm(p => ({ ...p, fechaDesde: desde, fechaHasta: hasta }));
          }}
        />

        {form.vehicleId && (
          <div className="bg-primary-50 rounded-lg px-4 py-2.5">
            <p className="text-xs text-primary-600 font-medium">
              📋 Detalle: {getVehicleDetail(form.vehicleId)}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Tipo (Fact)"
            options={TIPOS_INGRESO_FACT.map(t => ({ value: t, label: t }))}
            value={form.tipo}
            placeholder="Seleccionar tipo..."
            onChange={v => {
              const subs = getSubtiposIngreso(v);
              setForm(p => ({
                ...p,
                tipo: v,
                subTipo: subs[0] ?? '',
              }));
              setErrors(p => ({ ...p, tipo: '', subTipo: '' }));
            }}
            error={errors.tipo}
            required
          />
          <Select
            label="Sub tipo"
            options={subtipos.map(s => ({ value: s, label: s }))}
            value={form.subTipo}
            placeholder={subtipos.length ? 'Seleccionar...' : '—'}
            onChange={v => {
              setForm(p => ({ ...p, subTipo: v }));
              setErrors(p => ({ ...p, subTipo: '' }));
            }}
            error={errors.subTipo}
            disabled={subtipos.length === 0}
            required={subtipos.length > 0}
          />
        </div>

        <PagoRapidoIngreso
          metodoPago={form.metodoPago}
          metodoPagoDetalle={form.metodoPagoDetalle}
          ingresos={ingresos}
          onChange={({ metodoPago, metodoPagoDetalle }) => {
            setForm(p => ({
              ...p,
              metodoPago,
              metodoPagoDetalle,
            }));
            setErrors(e => ({ ...e, metodoPagoDetalle: '' }));
          }}
        />
        {errors.metodoPagoDetalle && (
          <p className="text-xs text-red-500">{errors.metodoPagoDetalle}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            label="Moneda del ingreso"
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
              setErrors(e => ({ ...e, tipoCambio: '', monto: '' }));
            }}
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
            helper={form.moneda === 'USD' ? 'Obligatorio para reflejar el ingreso en KPIs (soles).' : 'Referencia del día si aplica.'}
          />
          <Input
            label={form.moneda === 'USD' ? 'Monto (US$)' : 'Monto (S/)'}
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
            required
          />
        </div>

        <Input
          label="Comentarios (OBS)"
          type="text"
          value={form.comentarios}
          onChange={e => setForm(p => ({ ...p, comentarios: e.target.value }))}
          placeholder="Observaciones adicionales..."
        />

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setForm(emptyForm());
              setErrors({});
            }}
          >
            Limpiar
          </Button>
          <Button
            type="submit"
            loading={loading}
            icon={<PlusCircle size={16} />}
          >
            Registrar Ingreso
          </Button>
        </div>
      </form>
    </Card>
  );
};

export default IncomeForm;
