import React, { useEffect, useMemo, useState } from 'react';
import { PlusCircle, CalendarRange } from 'lucide-react';
import Button from '../Common/Button';
import Input from '../Common/Input';
import Select from '../Common/Select';
import Card from '../Common/Card';
import PeriodoPagoModal from '../Ingreso/PeriodoPagoModal';
import PagoRapidoIngreso from '../Ingreso/PagoRapidoIngreso';
import { Ingreso, Vehicle, Moneda } from '../../data/types';
import { formatVehicleSelectLabel } from '../../utils/vehicleDisplayNumber';
import {
  TIPOS_INGRESO_FACT,
  getSubtiposIngreso,
} from '../../data/factCatalog';
import { usePaymentSettings } from '../../context/PaymentSettingsContext';
import {
  ALCANCE_INGRESO_OPTIONS,
  CATEGORIAS_INGRESO_EXTRAORDINARIO,
  TIPO_INGRESO_EXTRAORDINARIO,
  type AlcanceIngreso,
  type CategoriaIngresoExtraordinario,
} from '../../data/ingresoAlcanceCatalog';
import { todayStr, formatDate } from '../../utils/formatting';
import {
  INGRESO_SUBTIPO_PERSONALIZADO,
  stampPeriodoDiasExtra,
  subtiposIngresoConPersonalizado,
  syncPeriodoPersonalizadoFin,
  validatePeriodoPersonalizadoRango,
} from '../../utils/ingresoPeriodoPersonalizado';

interface IncomeFormProps {
  vehicles: Vehicle[];
  ingresos?: Ingreso[];
  onSubmit: (ingreso: Omit<Ingreso, 'id' | 'createdAt'>) => void | Promise<void>;
  noCard?: boolean;
  prefillVehicleId?: number | null;
  onLoadingChange?: (loading: boolean) => void;
}

interface FormState {
  alcanceIngreso: AlcanceIngreso;
  fecha: string;
  vehicleId: string;
  tipo: string;
  subTipo: string;
  categoriaExtraordinaria: CategoriaIngresoExtraordinario;
  fechaDesde: string;
  fechaHasta: string;
  periodoDias: string;
  metodoPago: string;
  metodoPagoDetalle: string;
  paymentAccountId: string | null;
  moneda: Moneda;
  tipoCambio: string;
  monto: string;
  comentarios: string;
}

function emptyForm(): FormState {
  const t = TIPOS_INGRESO_FACT.includes('ALQUILER') ? 'ALQUILER' : (TIPOS_INGRESO_FACT[0] ?? '');
  return {
    alcanceIngreso: 'vehicular',
    fecha: todayStr(),
    vehicleId: '',
    tipo: t,
    subTipo: getSubtiposIngreso(t)[0] ?? '',
    categoriaExtraordinaria: CATEGORIAS_INGRESO_EXTRAORDINARIO[0].value,
    fechaDesde: '',
    fechaHasta: '',
    periodoDias: '',
    metodoPago: 'Yape',
    metodoPagoDetalle: '',
    paymentAccountId: null,
    moneda: 'PEN',
    tipoCambio: '',
    monto: '',
    comentarios: '',
  };
}

const IncomeForm: React.FC<IncomeFormProps> = ({
  vehicles,
  ingresos = [],
  onSubmit,
  noCard = false,
  prefillVehicleId = null,
  onLoadingChange,
}) => {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = useState(false);
  const { findAccount, getAccountsForMethod, status: paymentSettingsStatus } = usePaymentSettings();

  useEffect(() => {
    if (paymentSettingsStatus !== 'ready' && paymentSettingsStatus !== 'fallback') return;
    setForm((current) => {
      if (current.paymentAccountId) return current;
      const first = getAccountsForMethod(current.metodoPago)[0];
      return first ? { ...current, metodoPagoDetalle: first.detalle, paymentAccountId: first.paymentAccountId ?? null } : current;
    });
  }, [getAccountsForMethod, paymentSettingsStatus]);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);
  const [periodoOpen, setPeriodoOpen] = useState(false);

  const activeVehicles = vehicles.filter((v) => v.activo);
  const esVehicular = form.alcanceIngreso === 'vehicular';
  const esExtraordinario = form.alcanceIngreso === 'extraordinario';

  useEffect(() => {
    if (
      esVehicular &&
      prefillVehicleId != null &&
      Number.isFinite(prefillVehicleId) &&
      prefillVehicleId > 0
    ) {
      setForm((f) => ({ ...f, vehicleId: String(prefillVehicleId) }));
      setErrors((e) => ({ ...e, vehicleId: '' }));
    }
  }, [prefillVehicleId, esVehicular]);

  const subtipos = useMemo(() => {
    const base = getSubtiposIngreso(form.tipo);
    return form.tipo === 'ALQUILER' ? subtiposIngresoConPersonalizado(base) : base;
  }, [form.tipo]);
  const esPeriodoPersonalizado =
    esVehicular && form.subTipo.trim().toLowerCase() === INGRESO_SUBTIPO_PERSONALIZADO.toLowerCase();

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.fecha) {
      newErrors.fecha = 'La fecha de movimiento / pago es requerida';
    }
    if (esVehicular) {
      if (!form.vehicleId) newErrors.vehicleId = 'Selecciona un vehículo';
      if (!form.tipo) newErrors.tipo = 'Selecciona un tipo de ingreso';
      if (subtipos.length > 0 && !form.subTipo) newErrors.subTipo = 'Selecciona sub tipo';
    } else {
      if (!form.categoriaExtraordinaria) {
        newErrors.categoriaExtraordinaria = 'Selecciona la categoría';
      }
    }
    if (!form.monto || Number(form.monto) <= 0) newErrors.monto = 'Ingresa un monto válido';
    if (esPeriodoPersonalizado) {
      if (!form.fechaDesde.trim()) {
        newErrors.fechaDesde = 'Indica la fecha inicio del periodo';
      }
      const dias = Number(form.periodoDias);
      if (!form.periodoDias.trim() || !Number.isFinite(dias) || dias < 1 || dias > 366) {
        newErrors.periodoDias = 'Indica cantidad de días (1–366)';
      }
      if (!form.fechaHasta.trim()) {
        newErrors.fechaHasta = 'Indica la fecha fin';
      } else if (
        form.fechaDesde.trim() &&
        form.periodoDias.trim() &&
        Number.isFinite(dias) &&
        dias >= 1
      ) {
        const rango = validatePeriodoPersonalizadoRango(form.fechaDesde, form.fechaHasta, dias);
        if (!rango.ok) newErrors.fechaHasta = rango.message;
      }
    }
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
    if (loading) return;
    if (!validate()) return;
    setLoading(true);
    try {
      const row = findAccount(form.metodoPago, form.metodoPagoDetalle);
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

      const tipo = esExtraordinario ? TIPO_INGRESO_EXTRAORDINARIO : form.tipo;
      const subTipo = esExtraordinario ? form.categoriaExtraordinaria : form.subTipo || null;
      const periodoDias =
        esPeriodoPersonalizado && form.periodoDias.trim()
          ? Math.round(Number(form.periodoDias))
          : null;
      await Promise.resolve(
        onSubmit({
          fecha: form.fecha,
          fechaRegistro: todayStr(),
          vehicleId: esVehicular ? Number(form.vehicleId) : null,
          esExtraordinario,
          tipo,
          subTipo,
          fechaDesde: esPeriodoPersonalizado
            ? form.fechaDesde.trim()
            : esVehicular
              ? form.fechaDesde.trim() || null
              : null,
          fechaHasta: esPeriodoPersonalizado
            ? form.fechaHasta.trim()
            : esVehicular
              ? form.fechaHasta.trim() || null
              : null,
          excelExtra: esPeriodoPersonalizado ? stampPeriodoDiasExtra(null, periodoDias) : null,
          metodoPago: form.metodoPago,
          metodoPagoDetalle: form.metodoPagoDetalle.trim(),
          celularMetodo: row?.celular?.trim() ? row.celular.trim() : null,
          paymentAccountId: row?.paymentAccountId ?? form.paymentAccountId,
          signo: '+',
          monto: rawM,
          moneda,
          tipoCambio,
          montoPENReferencia,
          comentarios: form.comentarios,
        }),
      );
      setForm(emptyForm());
      setErrors({});
    } finally {
      setLoading(false);
    }
  };

  const getVehicleDetail = (vehicleId: string) => {
    if (!vehicleId) return '';
    const v = vehicles.find((v) => v.id === Number(vehicleId));
    return v ? `${v.marca} ${v.modelo} — ${v.placa}` : '';
  };

  const periodoLabel =
    form.fechaDesde && form.fechaHasta
      ? `${form.fechaDesde} → ${form.fechaHasta}`
      : form.fechaDesde || form.fechaHasta
        ? `${form.fechaDesde || '…'} → ${form.fechaHasta || '…'}`
        : null;

  const inner = (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Tipo de ingreso</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ALCANCE_INGRESO_OPTIONS.map((opt) => {
            const active = form.alcanceIngreso === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setForm((p) => ({
                    ...p,
                    alcanceIngreso: opt.value,
                    vehicleId: opt.value === 'vehicular' ? p.vehicleId : '',
                  }));
                  setErrors({});
                }}
                className={`text-left rounded-xl border-2 px-3 py-2.5 transition-colors ${
                  active
                    ? 'border-emerald-500 bg-emerald-50/90 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <p className={`text-sm font-bold ${active ? 'text-emerald-900' : 'text-slate-800'}`}>
                  {opt.label}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{opt.hint}</p>
              </button>
            );
          })}
        </div>
      </div>

      {esVehicular ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="N° Vehículo"
              options={activeVehicles.map((v) => ({
                value: v.id,
                label: formatVehicleSelectLabel(v),
              }))}
              value={form.vehicleId}
              placeholder="Seleccionar vehículo..."
              onChange={(v) => {
                setForm((p) => ({ ...p, vehicleId: v }));
                setErrors((p) => ({ ...p, vehicleId: '' }));
              }}
              error={errors.vehicleId}
              required
            />
            <Select
              label="Tipo (Fact)"
              options={TIPOS_INGRESO_FACT.map((t) => ({ value: t, label: t }))}
              value={form.tipo}
              placeholder="Seleccionar tipo..."
              onChange={(v) => {
                const subs = getSubtiposIngreso(v);
                setForm((p) => ({
                  ...p,
                  tipo: v,
                  subTipo: subs[0] ?? '',
                  periodoDias: '',
                }));
                setErrors((p) => ({ ...p, tipo: '', subTipo: '', periodoDias: '' }));
              }}
              error={errors.tipo}
              required
            />
          </div>

          <Select
            label="Sub tipo"
            options={subtipos.map((s) => ({ value: s, label: s }))}
            value={form.subTipo}
            placeholder={subtipos.length ? 'Seleccionar...' : '—'}
            onChange={(v) => {
              const personalizado = v.trim().toLowerCase() === INGRESO_SUBTIPO_PERSONALIZADO.toLowerCase();
              setForm((p) => {
                const periodoDias = personalizado ? p.periodoDias : '';
                const fechaDesde = personalizado ? p.fechaDesde || todayStr() : p.fechaDesde;
                return {
                  ...p,
                  subTipo: v,
                  periodoDias,
                  fechaDesde: personalizado ? fechaDesde : p.fechaDesde,
                  fechaHasta: personalizado
                    ? syncPeriodoPersonalizadoFin(fechaDesde, periodoDias, '')
                    : p.fechaHasta,
                };
              });
              setErrors((p) => ({
                ...p,
                subTipo: '',
                periodoDias: '',
                fechaDesde: '',
                fechaHasta: '',
              }));
              if (personalizado) setPeriodoOpen(false);
            }}
            error={errors.subTipo}
            disabled={subtipos.length === 0}
            required={subtipos.length > 0}
          />

          {form.vehicleId && (
            <div className="bg-primary-50 rounded-lg px-4 py-2.5">
              <p className="text-xs text-primary-600 font-medium">📋 Detalle: {getVehicleDetail(form.vehicleId)}</p>
            </div>
          )}
        </>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Fecha de movimiento / pago"
          type="date"
          value={form.fecha}
          onChange={(e) => {
            setForm((p) => ({ ...p, fecha: e.target.value }));
            setErrors((err) => ({ ...err, fecha: '' }));
          }}
          error={errors.fecha}
          required
        />
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-3 flex flex-col justify-center">
          <p className="text-xs font-medium text-gray-600">Fecha registro (Fact)</p>
          <p className="text-sm text-gray-800 mt-0.5">
            Se guarda al enviar (por defecto <strong>{todayStr()}</strong>).
          </p>
        </div>
      </div>

      {esVehicular && esPeriodoPersonalizado ? (
        <div className="space-y-3 rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900/80">
            Periodo cubierto por este ingreso
          </p>
          <Input
            label="Fecha inicio"
            type="date"
            value={form.fechaDesde}
            onChange={(e) => {
              const fechaDesde = e.target.value;
              setForm((p) => ({
                ...p,
                fechaDesde,
                fechaHasta: syncPeriodoPersonalizadoFin(fechaDesde, p.periodoDias, p.fechaHasta),
              }));
              setErrors((err) => ({ ...err, fechaDesde: '', fechaHasta: '' }));
            }}
            error={errors.fechaDesde}
            required
          />
          <Input
            label="Cantidad de días"
            type="number"
            min="1"
            max="366"
            step="1"
            value={form.periodoDias}
            onChange={(e) => {
              const periodoDias = e.target.value;
              setForm((p) => ({
                ...p,
                periodoDias,
                fechaHasta: syncPeriodoPersonalizadoFin(p.fechaDesde, periodoDias, p.fechaHasta),
              }));
              setErrors((err) => ({ ...err, periodoDias: '', fechaHasta: '' }));
            }}
            error={errors.periodoDias}
            placeholder="Ej. 4"
            required
          />
          <Input
            label="Fecha fin"
            type="date"
            value={form.fechaHasta}
            onChange={(e) => {
              const fechaHasta = e.target.value;
              setForm((p) => ({ ...p, fechaHasta }));
              const dias = Number(form.periodoDias);
              if (
                !fechaHasta.trim() ||
                !form.fechaDesde.trim() ||
                !form.periodoDias.trim() ||
                !Number.isFinite(dias) ||
                dias < 1
              ) {
                setErrors((err) => ({ ...err, fechaHasta: '' }));
                return;
              }
              const rango = validatePeriodoPersonalizadoRango(form.fechaDesde, fechaHasta, dias);
              setErrors((err) => ({ ...err, fechaHasta: rango.ok ? '' : rango.message }));
            }}
            error={errors.fechaHasta}
            required
          />
          {form.fechaDesde && form.fechaHasta && form.periodoDias.trim() ? (
            <p className="text-[11px] text-emerald-800/90 tabular-nums">
              Cubre: {formatDate(form.fechaDesde)} → {formatDate(form.fechaHasta)}
              {form.fecha !== form.fechaDesde ? (
                <span className="block mt-0.5 text-emerald-700/80">
                  Pago registrado: {formatDate(form.fecha)}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}

      {esVehicular && !esPeriodoPersonalizado ? (
        <>
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
          <PeriodoPagoModal
            isOpen={periodoOpen}
            onClose={() => setPeriodoOpen(false)}
            fechaDesde={form.fechaDesde}
            fechaHasta={form.fechaHasta}
            onGuardar={(desde, hasta) => {
              setForm((p) => ({ ...p, fechaDesde: desde, fechaHasta: hasta }));
            }}
          />
        </>
      ) : null}

      {!esVehicular ? (
        <Select
          label="Categoría extraordinaria"
          options={CATEGORIAS_INGRESO_EXTRAORDINARIO.map((c) => ({ value: c.value, label: c.label }))}
          value={form.categoriaExtraordinaria}
          onChange={(v) => {
            setForm((p) => ({ ...p, categoriaExtraordinaria: v as CategoriaIngresoExtraordinario }));
            setErrors((p) => ({ ...p, categoriaExtraordinaria: '' }));
          }}
          error={errors.categoriaExtraordinaria}
          required
        />
      ) : null}

      <PagoRapidoIngreso
        metodoPago={form.metodoPago}
        metodoPagoDetalle={form.metodoPagoDetalle}
        ingresos={ingresos}
          onChange={({ metodoPago, metodoPagoDetalle, paymentAccountId }) => {
          setForm((p) => ({
            ...p,
            metodoPago,
              metodoPagoDetalle,
              paymentAccountId,
          }));
          setErrors((e) => ({ ...e, metodoPagoDetalle: '' }));
        }}
      />
      {errors.metodoPagoDetalle && <p className="text-xs text-red-500">{errors.metodoPagoDetalle}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Select
          label="Moneda del ingreso"
          options={[
            { value: 'PEN', label: 'Soles (PEN)' },
            { value: 'USD', label: 'Dólares (USD)' },
          ]}
          value={form.moneda}
          onChange={(v) => {
            setForm((p) => ({
              ...p,
              moneda: v as Moneda,
              tipoCambio: v === 'PEN' ? '' : p.tipoCambio,
            }));
            setErrors((e) => ({ ...e, tipoCambio: '', monto: '' }));
          }}
          required
        />
        <Input
          label={`Tipo de cambio (S/ por US$)${form.moneda === 'PEN' ? ' — opcional' : ''}`}
          type="number"
          min="0"
          step="0.0001"
          value={form.tipoCambio}
          onChange={(e) => {
            setForm((p) => ({ ...p, tipoCambio: e.target.value }));
            setErrors((p) => ({ ...p, tipoCambio: '' }));
          }}
          error={errors.tipoCambio}
          placeholder="3.75"
          helper={
            form.moneda === 'USD' ? 'Obligatorio para reflejar el ingreso en KPIs (soles).' : 'Referencia del día si aplica.'
          }
        />
        <Input
          label={form.moneda === 'USD' ? 'Monto (US$)' : 'Monto (S/)'}
          type="number"
          min="0"
          step="0.01"
          value={form.monto}
          onChange={(e) => {
            setForm((p) => ({ ...p, monto: e.target.value }));
            setErrors((p) => ({ ...p, monto: '' }));
          }}
          error={errors.monto}
          placeholder="0.00"
          required
        />
      </div>

      <Input
        label={esExtraordinario ? 'Descripción / comentario' : 'Comentarios (OBS)'}
        type="text"
        value={form.comentarios}
        onChange={(e) => setForm((p) => ({ ...p, comentarios: e.target.value }))}
        placeholder={
          esExtraordinario
            ? 'Ej. restante de multa, compensación con taller…'
            : 'Observaciones adicionales...'
        }
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
        <Button type="submit" loading={loading} icon={<PlusCircle size={16} />}>
          {esExtraordinario ? 'Registrar ingreso extraordinario' : 'Registrar ingreso'}
        </Button>
      </div>
    </form>
  );

  if (noCard) return inner;

  return (
    <Card
      title="Registrar ingreso"
      subtitle="Vehicular (unidad) o extraordinario (empresa sin vehículo)"
    >
      {inner}
    </Card>
  );
};

export default IncomeForm;
