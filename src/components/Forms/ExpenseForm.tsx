import React, { useMemo, useState } from 'react';
import { PlusCircle, CalendarRange } from 'lucide-react';
import Button from '../Common/Button';
import Input from '../Common/Input';
import Select from '../Common/Select';
import Card from '../Common/Card';
import MetodoCuentaPicker from '../Common/MetodoCuentaPicker';
import PeriodoPagoModal from '../Ingreso/PeriodoPagoModal';
import { Gasto, Vehicle } from '../../data/types';
import {
  TIPOS_GASTO_FACT,
  getSubtiposGasto,
  getDetalleMetodoByLabel,
  getDetallesMetodoPago,
  METODOS_PAGO,
} from '../../data/factCatalog';
import { inferCategoriaFromTipoGasto } from '../../utils/factMappers';
import { todayStr } from '../../utils/formatting';

interface ExpenseFormProps {
  vehicles: Vehicle[];
  gastos?: Gasto[];
  onSubmit: (gasto: Omit<Gasto, 'id' | 'createdAt'>) => void;
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
  monto: string;
  pagadoA: string;
  comentarios: string;
}

function emptyForm(): FormState {
  const tipo0 = TIPOS_GASTO_FACT[0] ?? '';
  const y = getDetallesMetodoPago('Yape')[0];
  return {
    fecha: todayStr(),
    vehicleId: '',
    tipo: tipo0,
    subTipo: getSubtiposGasto(tipo0)[0] ?? '',
    fechaDesde: '',
    fechaHasta: '',
    metodoPago: 'Yape',
    metodoPagoDetalle: y?.detalle ?? '',
    monto: '',
    pagadoA: '',
    comentarios: '',
  };
}

const ExpenseForm: React.FC<ExpenseFormProps> = ({ vehicles, gastos = [], onSubmit }) => {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = useState(false);
  const [periodoOpen, setPeriodoOpen] = useState(false);

  const subtipos = useMemo(() => getSubtiposGasto(form.tipo), [form.tipo]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.fecha) newErrors.fecha = 'La fecha de movimiento es requerida';
    if (!form.tipo) newErrors.tipo = 'Selecciona el tipo de gasto';
    if (subtipos.length > 0 && !form.subTipo) newErrors.subTipo = 'Selecciona sub tipo';
    const m = Number(form.monto);
    if (!form.monto?.trim() || Number.isNaN(m) || m <= 0) {
      newErrors.monto = 'Ingresa un monto válido';
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
    const sub = form.subTipo || null;
    const rawM = Number(Number(form.monto).toFixed(2));
    onSubmit({
      fecha: form.fecha,
      fechaRegistro: todayStr(),
      vehicleId: form.vehicleId ? Number(form.vehicleId) : null,
      tipo: form.tipo,
      subTipo: sub,
      fechaDesde: form.fechaDesde.trim() || null,
      fechaHasta: form.fechaHasta.trim() || null,
      metodoPago: form.metodoPago,
      metodoPagoDetalle: form.metodoPagoDetalle.trim(),
      celularMetodo: row?.celular?.trim() ? row.celular.trim() : null,
      categoria: inferCategoriaFromTipoGasto(form.tipo),
      motivo: sub ?? form.tipo,
      signo: '-',
      monto: rawM,
      pagadoA: form.pagadoA.trim(),
      comentarios: form.comentarios,
    });
    setForm(emptyForm());
    setErrors({});
    setLoading(false);
  };

  const periodoLabel =
    form.fechaDesde && form.fechaHasta
      ? `${form.fechaDesde} → ${form.fechaHasta}`
      : form.fechaDesde || form.fechaHasta
        ? `${form.fechaDesde || '…'} → ${form.fechaHasta || '…'}`
        : null;

  return (
    <Card title="Registrar Gasto" subtitle="Movimiento, período opcional, método y cuenta">
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
            label="N° Vehículo (opcional)"
            options={vehicles.filter(v => v.activo).map(v => ({
              value: v.id,
              label: `#${v.id} — ${v.marca} ${v.modelo} (${v.placa})`,
            }))}
            value={form.vehicleId}
            placeholder="General / sin vehículo"
            onChange={v => setForm(p => ({ ...p, vehicleId: v }))}
            helper="Dejar vacío si es un gasto general"
          />
          <div className="flex flex-col justify-end">
            <button
              type="button"
              onClick={() => setPeriodoOpen(true)}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-xl border-2 border-gray-200 text-sm font-medium text-gray-700 hover:border-rose-300 hover:bg-rose-50/50 transition-colors"
            >
              <CalendarRange size={18} className="text-rose-600 shrink-0" />
              <span className="truncate">
                {periodoLabel ? `Período: ${periodoLabel}` : 'Período del gasto (opcional)'}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Tipo (Fact)"
            options={TIPOS_GASTO_FACT.map(t => ({ value: t, label: t }))}
            value={form.tipo}
            placeholder="Seleccionar tipo..."
            onChange={v => {
              const subs = getSubtiposGasto(v);
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

        <p className="text-xs text-gray-500">
          Categoría KPI: {inferCategoriaFromTipoGasto(form.tipo).replace(/_/g, ' ')}
        </p>

        <MetodoCuentaPicker
          metodosChips={METODOS_PAGO}
          metodoPago={form.metodoPago}
          metodoPagoDetalle={form.metodoPagoDetalle}
          registrosForCount={gastos}
          theme="rose"
          conteoEtiqueta="gastos"
          onChange={({ metodoPago, metodoPagoDetalle }) => {
            setForm(p => ({ ...p, metodoPago, metodoPagoDetalle }));
            setErrors(e => ({ ...e, metodoPagoDetalle: '' }));
          }}
        />
        {errors.metodoPagoDetalle && (
          <p className="text-xs text-red-500">{errors.metodoPagoDetalle}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Monto (S/)"
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
          <Input
            label="Pagado a"
            type="text"
            value={form.pagadoA}
            onChange={e => setForm(p => ({ ...p, pagadoA: e.target.value }))}
            placeholder="Ej. Taller San José, mecánico Juan…"
            helper="Quién recibe el pago (aparte del tipo de gasto y la cuenta de salida)"
          />
        </div>

        <Input
          label="Comentarios u observaciones (opcional)"
          type="text"
          value={form.comentarios}
          onChange={e => setForm(p => ({ ...p, comentarios: e.target.value }))}
          placeholder="Notas adicionales sobre el gasto…"
        />

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={() => { setForm(emptyForm()); setErrors({}); }}>
            Limpiar
          </Button>
          <Button type="submit" loading={loading} icon={<PlusCircle size={16} />} variant="danger">
            Registrar Gasto
          </Button>
        </div>
      </form>
    </Card>
  );
};

export default ExpenseForm;
