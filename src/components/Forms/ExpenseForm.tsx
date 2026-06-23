import React, { useEffect, useMemo, useState } from 'react';
import { PlusCircle, CalendarRange } from 'lucide-react';
import Button from '../Common/Button';
import Input from '../Common/Input';
import Select from '../Common/Select';
import Card from '../Common/Card';
import MetodoCuentaPicker from '../Common/MetodoCuentaPicker';
import PeriodoPagoModal from '../Ingreso/PeriodoPagoModal';
import { Gasto, Vehicle } from '../../data/types';
import { formatVehicleSelectLabel } from '../../utils/vehicleDisplayNumber';
import {
  TIPOS_GASTO_FACT,
  getSubtiposGasto,
  getDetalleMetodoByLabel,
  getDetallesMetodoPago,
  METODOS_PAGO,
} from '../../data/factCatalog';
import {
  FINANZA_GASTO_REGISTRO_OPTIONS,
  firstFactTipoForFinanza,
  getFactTiposForFinanza,
  type FinanzaGastoRegistroValue,
} from '../../data/finanzaGastoRegistro';
import {
  REPRESENTACION_INTERNA_FACT_SUBTIPO,
  REPRESENTACION_INTERNA_FACT_TIPO,
  defaultSubtipoRepresentacionInterna,
} from '../../data/representacionInterna';
import { getRepresentacionInternaSubtipoLabel } from '../../utils/representacionInternaSubtipoLabel';
import { inferCategoriaFromTipoGasto } from '../../utils/factMappers';
import {
  getDefaultFactTipoSubtipoForOperativoCanon,
  getOperativoSubtipoLabel,
} from '../../utils/operativoSubtipo';
import {
  getDefaultFactTipoSubtipoForInversionCanon,
  getInversionSubtipoLabel,
  normalizeInversionSubtipo,
  type InversionSubtipoCanon,
} from '../../utils/inversionSubtipo';
import { labelTipoGastoFinanciero } from '../../utils/tipoGastoLabels';
import {
  tipoGastoUsaSubtipoAdministrativoCanon,
  tipoGastoUsaSubtipoFinancieroCanon,
  tipoGastoUsaSubtipoOperativo,
} from '../../utils/gastoMoveCategoriaDefaults';
import {
  getDefaultFactTipoSubtipoForFinancieroSubtipo,
  getFinancieroPrestamoSubtipoLabel,
  normalizeFinancieroPrestamoSubtipo,
} from '../../utils/financieroPrestamoSubtipo';
import {
  getDefaultFactTipoSubtipoForAdministrativoSubtipo,
  getAdministrativoSubtipoLabel,
  normalizeAdministrativoSubtipo,
} from '../../utils/administrativoSubtipo';
import {
  buildSubtipoFormSelectOptions,
  formatSubtipoOptionLabel,
  logSubtipoInversionDebug,
  mergeSubtiposHistoricosConOficiales,
  buildSubtipoSelectOptions,
} from '../../constants/gastosSubtipos';
import { todayStr } from '../../utils/formatting';
import { useAuth } from '../../context/AuthContext';

/** Orden visual (arriba → abajo) para llevar al usuario al primer error. */
const EXPENSE_VALIDATION_SCROLL_ORDER: (keyof FormState)[] = [
  'categoriaFinanciera',
  'fecha',
  'vehicleId',
  'subtipoInversionCanon',
  'subtipoOperativoCanon',
  'subtipoRepresentacion',
  'subtipoFinancieroCanon',
  'subtipoAdministrativoCanon',
  'tipo',
  'subTipo',
  'metodoPagoDetalle',
  'monto',
];

const EXPENSE_FIELD_SCROLL_IDS: Partial<Record<keyof FormState, string>> = {
  categoriaFinanciera: 'expense-field-categoria-financiera',
  fecha: 'expense-field-fecha',
  vehicleId: 'expense-field-vehicle',
  subtipoInversionCanon: 'expense-field-subtipo-inversion',
  subtipoOperativoCanon: 'expense-field-subtipo-operativo',
  subtipoRepresentacion: 'expense-field-subtipo-representacion',
  subtipoFinancieroCanon: 'expense-field-subtipo-financiero',
  subtipoAdministrativoCanon: 'expense-field-subtipo-administrativo',
  tipo: 'expense-field-tipo-fact',
  subTipo: 'expense-field-subtipo',
  metodoPagoDetalle: 'expense-field-metodo-cuenta',
  monto: 'expense-field-monto',
};

function scrollToFirstExpenseValidationError(
  errs: Partial<Record<keyof FormState, string>>,
): void {
  for (const key of EXPENSE_VALIDATION_SCROLL_ORDER) {
    if (!errs[key]) continue;
    const domId = EXPENSE_FIELD_SCROLL_IDS[key];
    if (!domId) continue;
    const el = document.getElementById(domId);
    if (!el) continue;
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
      queueMicrotask(() => el.focus({ preventScroll: true }));
    } else {
      const inner = el.querySelector<HTMLElement>('input, select, textarea, button');
      if (inner) queueMicrotask(() => inner.focus({ preventScroll: true }));
    }
    break;
  }
}

interface ExpenseFormProps {
  vehicles: Vehicle[];
  gastos?: Gasto[];
  onSubmit: (gasto: Omit<Gasto, 'id' | 'createdAt'>) => void | Promise<void>;
  noCard?: boolean;
  prefillVehicleId?: number | null;
  /** Solo inversión con utilidad: categoría fija `inversion_compra` (Finanzas → Inversiones). */
  finanzaPreset?: 'inversion_compra' | null;
  onLoadingChange?: (loading: boolean) => void;
}

interface FormState {
  categoriaFinanciera: FinanzaGastoRegistroValue | '';
  fecha: string;
  vehicleId: string;
  tipo: string;
  subTipo: string;
  /** Solo categoría `representacion_interna`: subtipo financiero (no Fact). */
  subtipoRepresentacion: string;
  /** Solo `operativo_vehiculo`: valor canónico persistido en `subtipo_gasto` (snake_case). */
  subtipoOperativoCanon: string;
  /** Solo `inversion_compra`: subtipo canónico (vehicular / terreno / inmueble / general / otros). */
  subtipoInversionCanon: string;
  /** Solo `financiero_prestamo`: subtipo oficial (Tipo Fact inferido). */
  subtipoFinancieroCanon: string;
  /** Solo `administrativo_empresa`: subtipo oficial (Tipo Fact inferido). */
  subtipoAdministrativoCanon: string;
  fechaDesde: string;
  fechaHasta: string;
  metodoPago: string;
  metodoPagoDetalle: string;
  monto: string;
  pagadoA: string;
  comentarios: string;
}

/** Tipo Fact por defecto al abrir el formulario (evita depender del orden alfabético del catálogo). */
const DEFAULT_TIPO_GASTO_FACT = 'MECÁNICOS';

function emptyForm(): FormState {
  const tipo0 =
    (DEFAULT_TIPO_GASTO_FACT && TIPOS_GASTO_FACT.includes(DEFAULT_TIPO_GASTO_FACT)
      ? DEFAULT_TIPO_GASTO_FACT
      : TIPOS_GASTO_FACT[0]) ?? '';
  const y = getDetallesMetodoPago('Yape')[0];
  return {
    categoriaFinanciera: '',
    fecha: todayStr(),
    vehicleId: '',
    subtipoInversionCanon: '',
    tipo: tipo0,
    subTipo: getSubtiposGasto(tipo0)[0] ?? '',
    subtipoRepresentacion: '',
    subtipoOperativoCanon: '',
    subtipoFinancieroCanon: '',
    subtipoAdministrativoCanon: '',
    fechaDesde: '',
    fechaHasta: '',
    metodoPago: 'Yape',
    metodoPagoDetalle: y?.detalle ?? '',
    monto: '',
    pagadoA: '',
    comentarios: '',
  };
}

function initialExpenseForm(finanzaPreset: 'inversion_compra' | null): FormState {
  if (finanzaPreset === 'inversion_compra') {
    const cat: FinanzaGastoRegistroValue = 'inversion_compra';
    const defaultCanon: InversionSubtipoCanon = 'adquisicion_vehiculo';
    const { tipo: t0, subTipo: s0 } = getDefaultFactTipoSubtipoForInversionCanon(defaultCanon);
    const y = getDetallesMetodoPago('Yape')[0];
    return {
      categoriaFinanciera: cat,
      fecha: todayStr(),
      vehicleId: '',
      tipo: t0,
      subTipo: s0,
      subtipoRepresentacion: '',
      subtipoOperativoCanon: '',
      subtipoInversionCanon: defaultCanon,
      subtipoFinancieroCanon: '',
      subtipoAdministrativoCanon: '',
      fechaDesde: '',
      fechaHasta: '',
      metodoPago: 'Yape',
      metodoPagoDetalle: y?.detalle ?? '',
      monto: '',
      pagadoA: '',
      comentarios: '',
    };
  }
  return emptyForm();
}

const ExpenseForm: React.FC<ExpenseFormProps> = ({
  vehicles,
  gastos = [],
  onSubmit,
  noCard = false,
  prefillVehicleId = null,
  finanzaPreset = null,
  onLoadingChange,
}) => {
  const { user, role } = useAuth();
  const [form, setForm] = useState<FormState>(() => initialExpenseForm(finanzaPreset));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = useState(false);
  const [periodoOpen, setPeriodoOpen] = useState(false);

  const logSubmitClick = () => {
    const isSubmitting = loading;
    const disabled = isSubmitting;
    console.warn('[gasto:create:click]', {
      role,
      userId: user?.id ?? null,
      disabled,
      isSubmitting,
      env: import.meta.env.MODE,
    });
    if (disabled) {
      console.warn('[gasto:create:disabled_reason]', { reason: 'isSubmitting', isSubmitting: true });
    }
  };

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  useEffect(() => {
    if (prefillVehicleId != null && Number.isFinite(prefillVehicleId) && prefillVehicleId > 0) {
      setForm((f) => ({ ...f, vehicleId: String(prefillVehicleId) }));
    }
  }, [prefillVehicleId]);

  useEffect(() => {
    if (form.categoriaFinanciera === 'gastos_globales') {
      setForm((f) => (f.vehicleId ? { ...f, vehicleId: '' } : f));
    }
  }, [form.categoriaFinanciera]);

  useEffect(() => {
    if (!form.categoriaFinanciera) return;
    if (
      form.categoriaFinanciera === 'representacion_interna'
      || tipoGastoUsaSubtipoOperativo(form.categoriaFinanciera)
      || form.categoriaFinanciera === 'inversion_compra'
      || tipoGastoUsaSubtipoFinancieroCanon(form.categoriaFinanciera)
      || tipoGastoUsaSubtipoAdministrativoCanon(form.categoriaFinanciera)
    ) {
      return;
    }
    const allowed = getFactTiposForFinanza(form.categoriaFinanciera);
    if (allowed.length === 0 || allowed.includes(form.tipo)) return;
    const t0 = allowed[0];
    setForm((f) => ({ ...f, tipo: t0, subTipo: getSubtiposGasto(t0)[0] ?? '' }));
  }, [form.categoriaFinanciera, form.tipo]);

  const subtiposRepresentacionMerged = useMemo(() => {
    if (form.categoriaFinanciera !== 'representacion_interna') return [];
    return mergeSubtiposHistoricosConOficiales(
      'representacion_interna',
      (gastos ?? [])
        .filter((g) => g.tipo_gasto === 'representacion_interna' || g.tipo_gasto === 'personal_socios')
        .map((g) => g.subtipo_gasto ?? '')
        .filter(Boolean),
    );
  }, [form.categoriaFinanciera, gastos]);

  const subtiposOperativoMerged = useMemo(() => {
    const cat = form.categoriaFinanciera;
    if (!cat || !tipoGastoUsaSubtipoOperativo(cat)) return [];
    return buildSubtipoSelectOptions(cat, gastos);
  }, [form.categoriaFinanciera, gastos]);

  const subtiposFinancieroMerged = useMemo(() => {
    if (form.categoriaFinanciera !== 'financiero_prestamo') return [];
    return mergeSubtiposHistoricosConOficiales(
      'financiero_prestamo',
      (gastos ?? [])
        .filter((g) => g.tipo_gasto === 'financiero_prestamo' || g.tipo_gasto === 'financiero')
        .map((g) => g.subtipo_gasto ?? '')
        .filter(Boolean),
    );
  }, [form.categoriaFinanciera, gastos]);

  const subtiposAdministrativoMerged = useMemo(() => {
    if (form.categoriaFinanciera !== 'administrativo_empresa') return [];
    return mergeSubtiposHistoricosConOficiales(
      'administrativo_empresa',
      (gastos ?? [])
        .filter((g) => g.tipo_gasto === 'administrativo_empresa')
        .map((g) => g.subtipo_gasto ?? '')
        .filter(Boolean),
    );
  }, [form.categoriaFinanciera, gastos]);

  const subtiposFactMerged = useMemo(() => {
    const cat = form.categoriaFinanciera;
    if (
      !cat
      || cat === 'representacion_interna'
      || tipoGastoUsaSubtipoOperativo(cat)
      || cat === 'financiero_prestamo'
      || cat === 'administrativo_empresa'
      || cat === 'inversion_compra'
    ) {
      return [];
    }
    return buildSubtipoFormSelectOptions(cat, gastos, form.tipo);
  }, [form.categoriaFinanciera, form.tipo, gastos]);

  const subtipos = useMemo(
    () => subtiposFactMerged.map((o) => o.value),
    [subtiposFactMerged],
  );

  const tiposFactParaCategoria = useMemo(() => {
    if (!form.categoriaFinanciera) return [...TIPOS_GASTO_FACT];
    return getFactTiposForFinanza(form.categoriaFinanciera);
  }, [form.categoriaFinanciera]);

  const inversionSubtipoSelectOptions = useMemo(() => {
    const options = buildSubtipoSelectOptions('inversion_compra', gastos);
    if (form.categoriaFinanciera === 'inversion_compra') {
      logSubtipoInversionDebug({
        source: 'expense_form',
        categoria: 'inversion_compra',
        options,
      });
    }
    return options;
  }, [form.categoriaFinanciera, gastos]);

  const buildExpenseValidationErrors = (): Partial<Record<keyof FormState, string>> => {
    const newErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.categoriaFinanciera) newErrors.categoriaFinanciera = 'Elige categoría financiera';
    if (!form.fecha) newErrors.fecha = 'La fecha de movimiento es requerida';
    const esFinancieroCanon =
      form.categoriaFinanciera && tipoGastoUsaSubtipoFinancieroCanon(form.categoriaFinanciera);
    const esAdministrativoCanon =
      form.categoriaFinanciera && tipoGastoUsaSubtipoAdministrativoCanon(form.categoriaFinanciera);
    if (!esFinancieroCanon && !esAdministrativoCanon) {
      if (!form.tipo) {
        newErrors.tipo = 'Selecciona el tipo de gasto';
      } else if (form.categoriaFinanciera && form.categoriaFinanciera !== 'representacion_interna') {
        const permitidos = getFactTiposForFinanza(form.categoriaFinanciera);
        if (!permitidos.includes(form.tipo)) {
          newErrors.tipo = 'Elige un tipo Fact válido para esta categoría';
        }
      }
    }
    if (form.categoriaFinanciera === 'representacion_interna') {
      if (!form.subtipoRepresentacion.trim()) {
        newErrors.subtipoRepresentacion = 'Elige subtipo de representación interna';
      }
    } else if (esFinancieroCanon) {
      if (!form.subtipoFinancieroCanon.trim()) {
        newErrors.subtipoFinancieroCanon = 'Elige subtipo financiero';
      }
    } else if (esAdministrativoCanon) {
      if (!form.subtipoAdministrativoCanon.trim()) {
        newErrors.subtipoAdministrativoCanon = 'Elige subtipo administrativo';
      }
    } else if (
      form.categoriaFinanciera &&
      tipoGastoUsaSubtipoOperativo(form.categoriaFinanciera)
    ) {
      if (!form.subtipoOperativoCanon.trim()) {
        newErrors.subtipoOperativoCanon = 'Elige subtipo operativo';
      }
    } else if (subtipos.length > 0 && !form.subTipo) {
      newErrors.subTipo = 'Selecciona sub tipo';
    }
    const m = Number(form.monto);
    if (!form.monto?.trim() || Number.isNaN(m) || m <= 0) {
      newErrors.monto = 'Ingresa un monto válido';
    }
    if (!form.metodoPagoDetalle.trim()) newErrors.metodoPagoDetalle = 'Selecciona la cuenta de pago';
    if (form.categoriaFinanciera === 'operativo_vehiculo' && !form.vehicleId.trim()) {
      newErrors.vehicleId = 'Operativo por vehículo: indica el N° de unidad.';
    }
    return newErrors;
  };

  const buildGastoPayload = (): Omit<Gasto, 'id' | 'createdAt'> => {
    const row = getDetalleMetodoByLabel(form.metodoPago, form.metodoPagoDetalle);
    const catFin = form.categoriaFinanciera as FinanzaGastoRegistroValue;
    const esGlobal = catFin === 'gastos_globales' || catFin === 'operativo_flota_general';
    const esRep = catFin === 'representacion_interna';
    const esFinanciero = tipoGastoUsaSubtipoFinancieroCanon(catFin);
    const esAdministrativo = tipoGastoUsaSubtipoAdministrativoCanon(catFin);
    const subtipoFinCanon = esFinanciero
      ? (normalizeFinancieroPrestamoSubtipo(form.subtipoFinancieroCanon)
        ?? form.subtipoFinancieroCanon.trim())
      : '';
    const subtipoAdminCanon = esAdministrativo
      ? (normalizeAdministrativoSubtipo(form.subtipoAdministrativoCanon)
        ?? form.subtipoAdministrativoCanon.trim())
      : '';
    const factDerived = esFinanciero
      ? getDefaultFactTipoSubtipoForFinancieroSubtipo(subtipoFinCanon)
      : esAdministrativo
        ? getDefaultFactTipoSubtipoForAdministrativoSubtipo(subtipoAdminCanon)
        : null;
    const factTipo = esRep
      ? REPRESENTACION_INTERNA_FACT_TIPO
      : factDerived?.tipo ?? form.tipo;
    const factSub = esRep
      ? REPRESENTACION_INTERNA_FACT_SUBTIPO
      : (factDerived?.subTipo ?? form.subTipo) || null;
    const esInversion = catFin === 'inversion_compra';
    const subtipoFin = esRep
      ? form.subtipoRepresentacion.trim()
      : esFinanciero
        ? subtipoFinCanon
        : esAdministrativo
          ? subtipoAdminCanon
          : tipoGastoUsaSubtipoOperativo(catFin)
          ? form.subtipoOperativoCanon.trim()
          : esInversion
            ? (normalizeInversionSubtipo(form.subtipoInversionCanon) ?? 'adquisicion_vehiculo')
            : (form.subTipo || null)
              ? form.subTipo.trim()
              : null;
    const motivoFin = esRep
      ? (subtipoFin ? getRepresentacionInternaSubtipoLabel(subtipoFin) : REPRESENTACION_INTERNA_FACT_SUBTIPO)
      : esFinanciero
        ? getFinancieroPrestamoSubtipoLabel(subtipoFin)
        : esAdministrativo
          ? getAdministrativoSubtipoLabel(subtipoFin)
          : tipoGastoUsaSubtipoOperativo(catFin) && form.subtipoOperativoCanon.trim()
          ? getOperativoSubtipoLabel(form.subtipoOperativoCanon.trim())
          : esInversion && form.subtipoInversionCanon.trim()
            ? getInversionSubtipoLabel(form.subtipoInversionCanon.trim())
            : (form.subTipo || form.tipo);
    const rawM = Number(Number(form.monto).toFixed(2));
    return {
      fecha: form.fecha,
      fechaRegistro: todayStr(),
      vehicleId: esGlobal ? null : form.vehicleId.trim() ? Number(form.vehicleId) : null,
      tipo: factTipo,
      subTipo: factSub,
      fechaDesde: form.fechaDesde.trim() || null,
      fechaHasta: form.fechaHasta.trim() || null,
      metodoPago: form.metodoPago,
      metodoPagoDetalle: form.metodoPagoDetalle.trim(),
      celularMetodo: row?.celular?.trim() ? row.celular.trim() : null,
      categoria: inferCategoriaFromTipoGasto(factTipo),
      motivo: motivoFin,
      signo: '-',
      monto: rawM,
      pagadoA: form.pagadoA.trim(),
      comentarios: form.comentarios,
      tipo_gasto: catFin,
      subtipo_gasto: subtipoFin,
      es_global_flota: esGlobal,
      origen_clasificacion: 'registro_ui',
      clasificacion_manual: true,
      clasificacion_confianza: 1,
      requiere_revision: false,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    logSubmitClick();
    if (loading) return;
    console.warn('[gasto:create:before_validate]', { ...form });
    const newErrors = buildExpenseValidationErrors();
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      console.warn('[gasto:create:validation_blocked]', {
        reason: 'client_validation',
        errors: newErrors,
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToFirstExpenseValidationError(newErrors));
      });
      return;
    }
    setLoading(true);
    try {
      const payload = buildGastoPayload();
      console.warn('[gasto:create:before_insert]', payload);
      const created = await Promise.resolve(onSubmit(payload));
      console.warn('[gasto:create:success]', created ?? payload);
      setForm(initialExpenseForm(finanzaPreset));
      setErrors({});
    } catch (error) {
      console.error('[gasto:create:error]', error);
    } finally {
      setLoading(false);
    }
  };

  const periodoLabel =
    form.fechaDesde && form.fechaHasta
      ? `${form.fechaDesde} → ${form.fechaHasta}`
      : form.fechaDesde || form.fechaHasta
        ? `${form.fechaDesde || '…'} → ${form.fechaHasta || '…'}`
        : null;

  const seleccionesBloqueadas = !form.categoriaFinanciera;

  const inner = (
    <form onSubmit={handleSubmit} className="mt-2 space-y-3">
      {finanzaPreset === 'inversion_compra' ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2.5">
          <p className="text-xs font-bold text-violet-900">Inversión con utilidad</p>
          <p className="mt-0.5 text-[11px] leading-snug text-violet-800/95">
            Se guarda en la tabla de gastos con <span className="font-mono">tipo_gasto = inversion_compra</span>. El N°
            de vehículo es opcional (cuotas parciales o compra sin unidad asignada).
          </p>
        </div>
      ) : (
        <Select
          id="expense-field-categoria-financiera"
          label="Categoría financiera"
          placeholder="— Elige una —"
          options={FINANZA_GASTO_REGISTRO_OPTIONS.map((o) => ({
            value: o.value,
            label: `${o.emoji} ${o.label}`,
          }))}
          value={form.categoriaFinanciera}
          onChange={(v) => {
            if (!v) {
              setForm((p) => {
                const next = {
                  ...emptyForm(),
                  fecha: p.fecha,
                  metodoPago: p.metodoPago,
                  metodoPagoDetalle: p.metodoPagoDetalle,
                };
                if (prefillVehicleId != null && Number.isFinite(prefillVehicleId) && prefillVehicleId > 0) {
                  next.vehicleId = String(prefillVehicleId);
                }
                return next;
              });
              setErrors({});
              return;
            }
            const cat = v as FinanzaGastoRegistroValue;
            setForm((p) => {
              if (cat === 'representacion_interna') {
                return {
                  ...p,
                  categoriaFinanciera: cat,
                  tipo: REPRESENTACION_INTERNA_FACT_TIPO,
                  subTipo: REPRESENTACION_INTERNA_FACT_SUBTIPO,
                  subtipoRepresentacion: defaultSubtipoRepresentacionInterna(),
                  subtipoOperativoCanon: '',
                  vehicleId: p.vehicleId,
                };
              }
              if (cat === 'operativo_vehiculo' || cat === 'operativo_flota_general') {
                const canon = 'motor';
                const { tipo: tOp, subTipo: sOp } = getDefaultFactTipoSubtipoForOperativoCanon(canon);
                return {
                  ...p,
                  categoriaFinanciera: cat,
                  tipo: tOp,
                  subTipo: sOp,
                  subtipoOperativoCanon: canon,
                  subtipoRepresentacion: '',
                  subtipoFinancieroCanon: '',
                  vehicleId: cat === 'operativo_flota_general' ? '' : p.vehicleId,
                };
              }
              if (cat === 'financiero_prestamo') {
                const canon = 'PRÉSTAMO';
                const { tipo: tFin, subTipo: sFin } = getDefaultFactTipoSubtipoForFinancieroSubtipo(canon);
                return {
                  ...p,
                  categoriaFinanciera: cat,
                  tipo: tFin,
                  subTipo: sFin,
                  subtipoFinancieroCanon: canon,
                  subtipoAdministrativoCanon: '',
                  subtipoRepresentacion: '',
                  subtipoOperativoCanon: '',
                  subtipoInversionCanon: '',
                };
              }
              if (cat === 'administrativo_empresa') {
                const canon = 'administrativo_general';
                const { tipo: tAdm, subTipo: sAdm } =
                  getDefaultFactTipoSubtipoForAdministrativoSubtipo(canon);
                return {
                  ...p,
                  categoriaFinanciera: cat,
                  tipo: tAdm,
                  subTipo: sAdm,
                  subtipoAdministrativoCanon: canon,
                  subtipoFinancieroCanon: '',
                  subtipoRepresentacion: '',
                  subtipoOperativoCanon: '',
                  subtipoInversionCanon: '',
                };
              }
              if (cat === 'inversion_compra') {
                const canon: InversionSubtipoCanon = 'adquisicion_vehiculo';
                const { tipo: tInv, subTipo: sInv } = getDefaultFactTipoSubtipoForInversionCanon(canon);
                return {
                  ...p,
                  categoriaFinanciera: cat,
                  tipo: tInv,
                  subTipo: sInv,
                  subtipoInversionCanon: canon,
                  subtipoRepresentacion: '',
                  subtipoOperativoCanon: '',
                  subtipoFinancieroCanon: '',
                  subtipoAdministrativoCanon: '',
                };
              }
              const tipo0 = firstFactTipoForFinanza(cat);
              return {
                ...p,
                categoriaFinanciera: cat,
                tipo: tipo0,
                subTipo: getSubtiposGasto(tipo0)[0] ?? '',
                subtipoRepresentacion: '',
              subtipoOperativoCanon: '',
              subtipoFinancieroCanon: '',
              subtipoAdministrativoCanon: '',
              vehicleId: cat === 'gastos_globales' ? '' : p.vehicleId,
              };
            });
            setErrors((e) => ({
              ...e,
              categoriaFinanciera: '',
              fecha: '',
              vehicleId: '',
              subtipoRepresentacion: '',
              subtipoOperativoCanon: '',
              subtipoFinancieroCanon: '',
              subtipoAdministrativoCanon: '',
              tipo: '',
              subTipo: '',
              monto: '',
              metodoPagoDetalle: '',
            }));
          }}
          error={errors.categoriaFinanciera}
          helper="Primero elige categoría: hasta entonces fecha, vehículo, período, tipo Fact y método de pago no se pueden cambiar."
          required
        />
      )}

      <div className="rounded-xl border border-gray-200 bg-gray-50/40 p-3 shadow-inner shadow-gray-900/[0.03] sm:p-4">
        <p className="mb-2 text-[11px] leading-snug text-gray-600">
          {form.categoriaFinanciera
            ? FINANZA_GASTO_REGISTRO_OPTIONS.find((o) => o.value === form.categoriaFinanciera)?.hint
            : 'Elige categoría financiera arriba para afinar tipo Fact y validaciones (vehículo obligatorio en operativo, etc.).'}
        </p>

        <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                id="expense-field-fecha"
                label="Fecha de movimiento"
                type="date"
                value={form.fecha}
                onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))}
                error={errors.fecha}
                required
                disabled={seleccionesBloqueadas}
              />
              <div className="flex flex-col justify-center rounded-lg border border-dashed border-gray-200 bg-white/80 px-3 py-2">
                <p className="text-[11px] font-medium text-gray-600">Fecha de registro</p>
                <p className="text-xs text-gray-800">
                  Al guardar: <strong>{todayStr()}</strong>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {form.categoriaFinanciera === 'gastos_globales' ? (
                <div className="rounded-lg border border-teal-100 bg-teal-50/60 px-3 py-2 sm:col-span-2">
                  <p className="text-[11px] font-medium text-teal-900">Globales: sin unidad asignada</p>
                  <p className="mt-0.5 text-[11px] text-teal-800/90">
                    El gasto queda como flota general (campo es_global_flota). No uses N° vehículo aquí.
                  </p>
                </div>
              ) : form.categoriaFinanciera === 'operativo_flota_general' ? (
                <div className="rounded-lg border border-orange-200 bg-orange-50/70 px-3 py-2 sm:col-span-2">
                  <p className="text-[11px] font-medium text-orange-950">Operativo flota general / sin vehículo específico</p>
                  <p className="mt-0.5 text-[11px] text-orange-900/95 leading-snug">
                    Usar cuando el gasto corresponde a varios vehículos o no hay trazabilidad exacta. No se exige N° de
                    unidad y no entra en ranking por vehículo.
                  </p>
                </div>
              ) : (
                <Select
                  id="expense-field-vehicle"
                  label={
                    form.categoriaFinanciera === 'operativo_vehiculo'
                      ? 'N° Vehículo (obligatorio)'
                      : 'N° Vehículo (opcional)'
                  }
                  options={vehicles.filter((v) => v.activo).map((v) => ({
                    value: String(v.id),
                    label: formatVehicleSelectLabel(v),
                  }))}
                  value={form.vehicleId}
                  placeholder="General / sin vehículo"
                  onChange={(v) => setForm((p) => ({ ...p, vehicleId: v }))}
                  helper={
                    form.categoriaFinanciera === 'operativo_vehiculo'
                      ? 'Operativo: debe estar ligado a una unidad.'
                      : form.categoriaFinanciera === 'inversion_compra'
                        ? 'Opcional: úsalo si ya conoces la unidad; vacío para cuotas o compras sin asignar.'
                        : 'Opcional si el gasto aplica a una unidad concreta.'
                  }
                  error={errors.vehicleId}
                  disabled={seleccionesBloqueadas}
                />
              )}
              <div className="flex flex-col justify-end">
                <button
                  type="button"
                  disabled={seleccionesBloqueadas}
                  onClick={() => setPeriodoOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-rose-300 hover:bg-rose-50/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:bg-transparent"
                >
                  <CalendarRange size={18} className="shrink-0 text-rose-600" />
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
                setForm((p) => ({ ...p, fechaDesde: desde, fechaHasta: hasta }));
              }}
            />

            <p className="text-[10px] leading-snug text-gray-500">
              Sin categoría el catálogo Fact se muestra completo pero los desplegables de tipo están bloqueados; al elegir categoría se desbloquean y el tipo se ajusta a lo coherente.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {form.categoriaFinanciera === 'inversion_compra' ? (
                <>
                  <Select
                    id="expense-field-subtipo-inversion"
                    label="Tipo de inversión"
                    options={inversionSubtipoSelectOptions}
                    value={form.subtipoInversionCanon}
                    placeholder="Seleccionar…"
                    onChange={(v) => {
                      if (!v) return;
                      const canon = normalizeInversionSubtipo(v) ?? (v as InversionSubtipoCanon);
                      const { tipo: tInv, subTipo: sInv } = getDefaultFactTipoSubtipoForInversionCanon(canon);
                      setForm((p) => ({ ...p, subtipoInversionCanon: canon, tipo: tInv, subTipo: sInv }));
                      setErrors((e) => ({ ...e, subtipoInversionCanon: '' }));
                    }}
                    error={errors.subtipoInversionCanon}
                    required
                    disabled={seleccionesBloqueadas}
                    helper="Se guarda como subtipo_gasto canónico (10 tipos oficiales). Los valores antiguos siguen visibles solo como histórico."
                  />
                  <div className="flex flex-col justify-center rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-[11px] leading-snug text-gray-700">
                    <p className="font-semibold text-gray-600">Tipo Fact (metadata)</p>
                    <p className="mt-1">
                      <span className="text-gray-500">Tipo:</span> {form.tipo || '—'}
                    </p>
                    <p>
                      <span className="text-gray-500">Sub tipo:</span> {form.subTipo || '—'}
                    </p>
                    <p className="mt-1.5 text-[10px] text-gray-500">
                      Ajustado automáticamente según el tipo de inversión.
                    </p>
                  </div>
                </>
              ) : form.categoriaFinanciera === 'representacion_interna' ? (
                <Select
                  id="expense-field-subtipo-representacion"
                  label="Subtipo (representación interna)"
                  options={subtiposRepresentacionMerged.map((o) => ({
                    value: o.value,
                    label: formatSubtipoOptionLabel('representacion_interna', o),
                  }))}
                  value={form.subtipoRepresentacion}
                  placeholder="Seleccionar…"
                  onChange={(v) => {
                    setForm((p) => ({ ...p, subtipoRepresentacion: v }));
                    setErrors((e) => ({ ...e, subtipoRepresentacion: '' }));
                  }}
                  error={errors.subtipoRepresentacion}
                  required
                  disabled={seleccionesBloqueadas}
                  helper="Tipo Fact fijo (OTROS GASTOS · REPRESENTACIÓN) para no duplicar selección."
                />
              ) : form.categoriaFinanciera === 'administrativo_empresa' ? (
                <>
                  <Select
                    id="expense-field-subtipo-administrativo"
                    label="Subtipo administrativo"
                    options={subtiposAdministrativoMerged.map((o) => ({
                      value: o.value,
                      label: formatSubtipoOptionLabel('administrativo_empresa', o),
                    }))}
                    value={form.subtipoAdministrativoCanon}
                    placeholder="Seleccionar…"
                    onChange={(v) => {
                      if (!v) return;
                      const canon = normalizeAdministrativoSubtipo(v) ?? v;
                      const { tipo: tAdm, subTipo: sAdm } =
                        getDefaultFactTipoSubtipoForAdministrativoSubtipo(canon);
                      setForm((p) => ({
                        ...p,
                        subtipoAdministrativoCanon: canon,
                        tipo: tAdm,
                        subTipo: sAdm,
                      }));
                      setErrors((e) => ({ ...e, subtipoAdministrativoCanon: '' }));
                    }}
                    error={errors.subtipoAdministrativoCanon}
                    required
                    disabled={seleccionesBloqueadas}
                    helper="Clasificación interna calculada automáticamente."
                  />
                  <div className="flex flex-col justify-center rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-[11px] leading-snug text-gray-600">
                    <p className="font-semibold text-gray-600">Clasificación interna</p>
                    <p className="mt-1 text-[10px] text-gray-500">
                      Tipo Fact y subtipo Fact se asignan al guardar según el subtipo elegido.
                    </p>
                  </div>
                </>
              ) : form.categoriaFinanciera === 'financiero_prestamo' ? (
                <>
                  <Select
                    id="expense-field-subtipo-financiero"
                    label="Subtipo financiero"
                    options={subtiposFinancieroMerged.map((o) => ({
                      value: o.value,
                      label: formatSubtipoOptionLabel('financiero_prestamo', o),
                    }))}
                    value={form.subtipoFinancieroCanon}
                    placeholder="Seleccionar…"
                    onChange={(v) => {
                      if (!v) return;
                      const canon = normalizeFinancieroPrestamoSubtipo(v) ?? v;
                      const { tipo: tFin, subTipo: sFin } =
                        getDefaultFactTipoSubtipoForFinancieroSubtipo(canon);
                      setForm((p) => ({
                        ...p,
                        subtipoFinancieroCanon: canon,
                        tipo: tFin,
                        subTipo: sFin,
                      }));
                      setErrors((e) => ({ ...e, subtipoFinancieroCanon: '' }));
                    }}
                    error={errors.subtipoFinancieroCanon}
                    required
                    disabled={seleccionesBloqueadas}
                    helper="Clasificación interna calculada automáticamente."
                  />
                  <div className="flex flex-col justify-center rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-[11px] leading-snug text-gray-600">
                    <p className="font-semibold text-gray-600">Clasificación interna</p>
                    <p className="mt-1 text-[10px] text-gray-500">
                      Tipo Fact y subtipo Fact se asignan al guardar según el subtipo elegido.
                    </p>
                  </div>
                </>
              ) : form.categoriaFinanciera && tipoGastoUsaSubtipoOperativo(form.categoriaFinanciera) ? (
                <>
                  <Select
                    id="expense-field-subtipo-operativo"
                    label="Subtipo operativo"
                    options={subtiposOperativoMerged.map((o) => ({
                      value: o.value,
                      label: formatSubtipoOptionLabel(form.categoriaFinanciera, o),
                    }))}
                    value={form.subtipoOperativoCanon}
                    placeholder="Seleccionar…"
                    onChange={(v) => {
                      if (!v) return;
                      const { tipo: tOp, subTipo: sOp } = getDefaultFactTipoSubtipoForOperativoCanon(v);
                      setForm((p) => ({ ...p, subtipoOperativoCanon: v, tipo: tOp, subTipo: sOp }));
                      setErrors((e) => ({ ...e, subtipoOperativoCanon: '' }));
                    }}
                    error={errors.subtipoOperativoCanon}
                    required
                    disabled={seleccionesBloqueadas}
                    helper="Catálogo oficial operativo. Clasificación interna calculada automáticamente."
                  />
                  <div className="flex flex-col justify-center rounded-lg border border-gray-200 bg-white/80 px-3 py-2.5 text-[11px] leading-snug text-gray-600">
                    <p className="font-semibold text-gray-600">Clasificación interna</p>
                    <p className="mt-1 text-[10px] text-gray-500">
                      Tipo Fact y subtipo Fact se asignan al guardar según el subtipo elegido.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Select
                    id="expense-field-tipo-fact"
                    label="Tipo (Fact)"
                    options={tiposFactParaCategoria.map((t) => ({ value: t, label: t }))}
                    value={form.tipo}
                    placeholder="Seleccionar tipo..."
                    onChange={(v) => {
                      const subs = getSubtiposGasto(v);
                      setForm((p) => ({
                        ...p,
                        tipo: v,
                        subTipo: subs[0] ?? '',
                      }));
                      setErrors((p) => ({ ...p, tipo: '', subTipo: '' }));
                    }}
                    error={errors.tipo}
                    required
                    disabled={seleccionesBloqueadas}
                  />
                  <Select
                    id="expense-field-subtipo"
                    label="Sub tipo"
                    options={subtiposFactMerged.map((o) => ({
                      value: o.value,
                      label: formatSubtipoOptionLabel(form.categoriaFinanciera, o),
                    }))}
                    value={form.subTipo}
                    placeholder={subtipos.length ? 'Seleccionar...' : '—'}
                    onChange={(v) => {
                      setForm((p) => ({ ...p, subTipo: v }));
                      setErrors((p) => ({ ...p, subTipo: '' }));
                    }}
                    error={errors.subTipo}
                    disabled={seleccionesBloqueadas || subtipos.length === 0}
                    required={subtipos.length > 0}
                  />
                </>
              )}
            </div>

            {form.tipo === 'GNV' ? (
              <p className="text-[11px] leading-snug text-amber-900/90 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2">
                Usar para instalación, certificado, reparación o equipo GNV. Para recargas, usar{' '}
                <span className="font-semibold">Abastecimiento de combustible</span>.
              </p>
            ) : null}
            {form.tipo === 'ABASTECIMIENTO DE COMBUSTIBLE' ? (
              <p className="text-[11px] leading-snug text-sky-900/90 rounded-lg border border-sky-200/80 bg-sky-50/90 px-3 py-2">
                Usar para recargas o consumo de combustible: GNV, GLP o gasolina.
              </p>
            ) : null}

            <p className="text-[11px] text-gray-500">
              Clasificación guardada:{' '}
              <span className="font-semibold text-gray-800">
                {form.categoriaFinanciera
                  ? FINANZA_GASTO_REGISTRO_OPTIONS.find((o) => o.value === form.categoriaFinanciera)?.label
                    ?? labelTipoGastoFinanciero(form.categoriaFinanciera)
                  : '— elige categoría —'}
              </span>
              {' · '}
              KPI Fact: {inferCategoriaFromTipoGasto(form.tipo).replace(/_/g, ' ')}
            </p>

            <div id="expense-field-metodo-cuenta" className="scroll-mt-4">
              <MetodoCuentaPicker
                metodosChips={METODOS_PAGO}
                metodoPago={form.metodoPago}
                metodoPagoDetalle={form.metodoPagoDetalle}
                registrosForCount={gastos}
                theme="rose"
                conteoEtiqueta="gastos"
                disabled={seleccionesBloqueadas}
                onChange={({ metodoPago, metodoPagoDetalle }) => {
                  setForm((p) => ({ ...p, metodoPago, metodoPagoDetalle }));
                  setErrors((e) => ({ ...e, metodoPagoDetalle: '' }));
                }}
              />
              {errors.metodoPagoDetalle ? (
                <p className="text-xs text-red-500">{errors.metodoPagoDetalle}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                id="expense-field-monto"
                label="Monto (S/)"
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
              <Input
                label="Pagado a"
                type="text"
                value={form.pagadoA}
                onChange={(e) => setForm((p) => ({ ...p, pagadoA: e.target.value }))}
                placeholder="Ej. Taller San José, mecánico Juan…"
                helper="Quién recibe el pago"
              />
            </div>

            <Input
              label="Comentarios u observaciones (opcional)"
              type="text"
              value={form.comentarios}
              onChange={(e) => setForm((p) => ({ ...p, comentarios: e.target.value }))}
              placeholder="Notas adicionales…"
            />

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200/80 pt-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setForm(initialExpenseForm(finanzaPreset));
                  setErrors({});
                }}
              >
                Limpiar todo
              </Button>
              <Button
                type="submit"
                loading={loading}
                icon={<PlusCircle size={16} />}
                variant="danger"
                title={loading ? 'Guardando gasto…' : undefined}
                onClick={logSubmitClick}
              >
                {finanzaPreset === 'inversion_compra' ? 'Registrar inversión' : 'Registrar gasto'}
              </Button>
            </div>
          </div>
        </div>
    </form>
  );

  if (noCard) return inner;

  return (
    <Card title="Registrar gasto" subtitle="Formulario siempre visible; la categoría financiera ajusta tipo Fact y reglas">
      {inner}
    </Card>
  );
};

export default ExpenseForm;
