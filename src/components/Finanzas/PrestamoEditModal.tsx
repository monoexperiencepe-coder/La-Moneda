import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Modal from '../Common/Modal';
import type {
  ModalidadPagoPrestamo,
  Moneda,
  PrestamoFinancieroDetalle,
  PrestamoFinancieroEstado,
} from '../../data/types';
import {
  insertPrestamoFinanciero,
  insertPrestamoTramo,
  updatePrestamoFinanciero,
  updatePrestamoTramo,
} from '../../services/prestamosFinancierosService';
import { useAuth } from '../../context/AuthContext';
import { cuotaMensualDesdeCapitalYTasaAnual } from '../../utils/prestamosFinancierosCalc';

type TramoForm = {
  id: number;
  desde: string;
  hasta: string;
  capitalReferencial: string;
  tasaPct: string;
  cuotaFijaMensual: string;
  interesMensual: string;
  monedaCapital: Moneda;
  monedaPago: Moneda;
  modalidadPago: ModalidadPagoPrestamo;
  evento: string;
  nota: string;
  orden: string;
};

function parseNum(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseNumRequired(s: string, fallback: number): number {
  const n = parseNum(s);
  return n != null ? n : fallback;
}

/** Cuota mensual (interés) si capital y tasa % son válidos; si no, null. */
function calcCuotaTasaAnualStr(capitalStr: string, tasaPctStr: string): string | null {
  const cap = parseNum(capitalStr);
  const pct = parseNum(tasaPctStr);
  if (cap == null || pct == null) return null;
  if (cap < 0 || pct < 0) return null;
  return String(cuotaMensualDesdeCapitalYTasaAnual(cap, pct / 100));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type DraftTramoInicial = {
  desde: string;
  hasta: string;
  capitalReferencial: string;
  tasaPct: string;
  cuotaFijaMensual: string;
  interesMensual: string;
  modalidadPago: ModalidadPagoPrestamo;
  evento: string;
  nota: string;
};

interface PrestamoEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  detalle: PrestamoFinancieroDetalle | null;
  onSaved: () => void | Promise<void>;
}

const PrestamoEditModal: React.FC<PrestamoEditModalProps> = ({ isOpen, onClose, mode, detalle, onSaved }) => {
  const { profile } = useAuth();
  const tenantEmpresaId = profile?.empresa_id;
  const isCreate = mode === 'create';
  const p = detalle?.prestamo;
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [codigo, setCodigo] = useState('');
  const [prestamista, setPrestamista] = useState('');
  const [titulo, setTitulo] = useState('');
  const [monedaCapital, setMonedaCapital] = useState<Moneda>('USD');
  const [monedaPago, setMonedaPago] = useState<Moneda>('USD');
  const [modalidadPago, setModalidadPago] = useState<ModalidadPagoPrestamo>('tasa_anual');
  const [montoOriginal, setMontoOriginal] = useState('');
  const [capitalActual, setCapitalActual] = useState('');
  const [tasaPct, setTasaPct] = useState('');
  const [cuotaFijaMensual, setCuotaFijaMensual] = useState('');
  const [interesMensualActual, setInteresMensualActual] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [estado, setEstado] = useState<PrestamoFinancieroEstado>('activo');
  const [fechaCancelacion, setFechaCancelacion] = useState('');
  const [requiereTramos, setRequiereTramos] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const [tramosForm, setTramosForm] = useState<TramoForm[]>([]);
  const [incluirTramoInicial, setIncluirTramoInicial] = useState(false);
  const [draftTramo, setDraftTramo] = useState<DraftTramoInicial>({
    desde: '',
    hasta: '',
    capitalReferencial: '',
    tasaPct: '',
    cuotaFijaMensual: '',
    interesMensual: '',
    modalidadPago: 'tasa_anual',
    evento: 'inicio',
    nota: '',
  });

  const resetDefaults = useCallback(() => {
    const hoy = todayIso();
    setFormError(null);
    setCodigo('');
    setPrestamista('');
    setTitulo('');
    setMonedaCapital('USD');
    setMonedaPago('USD');
    setModalidadPago('tasa_anual');
    setMontoOriginal('');
    setCapitalActual('');
    setTasaPct('');
    setCuotaFijaMensual('');
    setInteresMensualActual('');
    setFechaInicio(hoy);
    setEstado('activo');
    setFechaCancelacion('');
    setRequiereTramos(false);
    setObservaciones('');
    setTramosForm([]);
    setIncluirTramoInicial(false);
    setDraftTramo({
      desde: hoy,
      hasta: '',
      capitalReferencial: '',
      tasaPct: '',
      cuotaFijaMensual: '',
      interesMensual: '',
      modalidadPago: 'tasa_anual',
      evento: 'inicio',
      nota: '',
    });
  }, []);

  const resetFromDetalle = useCallback(() => {
    if (!detalle) return;
    const pr = detalle.prestamo;
    setFormError(null);
    setCodigo(pr.codigo ?? '');
    setPrestamista(pr.prestamista ?? '');
    setTitulo(pr.titulo ?? '');
    setMonedaCapital(pr.monedaCapital);
    setMonedaPago(pr.monedaPago);
    setModalidadPago(pr.modalidadPago);
    setMontoOriginal(String(pr.montoOriginal ?? ''));
    setCapitalActual(String(pr.capitalActualEstimado ?? ''));
    setTasaPct(
      pr.tasaAnual != null && Number.isFinite(pr.tasaAnual) ? String(pr.tasaAnual * 100) : '',
    );
    setCuotaFijaMensual(
      pr.cuotaFijaMensual != null && Number.isFinite(pr.cuotaFijaMensual) ? String(pr.cuotaFijaMensual) : '',
    );
    setInteresMensualActual(String(pr.interesMensualActual ?? ''));
    setFechaInicio((pr.fechaInicio ?? '').slice(0, 10));
    setEstado(pr.estado);
    setFechaCancelacion(pr.fechaCancelacion ? pr.fechaCancelacion.slice(0, 10) : '');
    setRequiereTramos(Boolean(pr.requiereTramos));
    setObservaciones((pr.observaciones ?? pr.notas ?? '').trim());
    const sorted = [...detalle.tramos].sort((a, b) => a.orden - b.orden || a.id - b.id);
    setTramosForm(
      sorted.map((t) => ({
        id: t.id,
        desde: (t.desde ?? '').slice(0, 10),
        hasta: t.hasta ? t.hasta.slice(0, 10) : '',
        capitalReferencial:
          t.capitalReferencial != null && Number.isFinite(t.capitalReferencial)
            ? String(t.capitalReferencial)
            : '',
        tasaPct:
          t.tasaAnual != null && Number.isFinite(t.tasaAnual) ? String(t.tasaAnual * 100) : '',
        cuotaFijaMensual:
          t.cuotaFijaMensual != null && Number.isFinite(t.cuotaFijaMensual)
            ? String(t.cuotaFijaMensual)
            : '',
        interesMensual:
          t.interesMensual != null && Number.isFinite(t.interesMensual) ? String(t.interesMensual) : '',
        monedaCapital: t.monedaCapital,
        monedaPago: t.monedaPago,
        modalidadPago: t.modalidadPago,
        evento: t.evento ?? '',
        nota: t.nota ?? '',
        orden: String(t.orden ?? 0),
      })),
    );
    setIncluirTramoInicial(false);
  }, [detalle]);

  useEffect(() => {
    if (!isOpen) return;
    if (isCreate) {
      resetDefaults();
    } else if (detalle) {
      resetFromDetalle();
    }
  }, [isOpen, isCreate, detalle, resetDefaults, resetFromDetalle]);

  const recalcTramosCuotaPorCapitalCabecera = useCallback((nuevoCapitalStr: string) => {
    setTramosForm((rows) =>
      rows.map((r) => {
        if (r.modalidadPago !== 'tasa_anual') return r;
        const pct = parseNum(r.tasaPct);
        const capRef = parseNum(r.capitalReferencial);
        const loanCap = parseNum(nuevoCapitalStr);
        const cap = capRef != null && capRef >= 0 ? capRef : loanCap;
        if (pct == null || cap == null || pct < 0 || cap < 0) return r;
        const next = String(cuotaMensualDesdeCapitalYTasaAnual(cap, pct / 100));
        return next === r.interesMensual ? r : { ...r, interesMensual: next };
      }),
    );
  }, []);

  const onCapitalCabeceraChange = (value: string) => {
    setCapitalActual(value);
    if (modalidadPago === 'tasa_anual') {
      const cuota = calcCuotaTasaAnualStr(value, tasaPct);
      if (cuota != null) setInteresMensualActual(cuota);
      recalcTramosCuotaPorCapitalCabecera(value);
    }
  };

  const onTasaCabeceraChange = (value: string) => {
    setTasaPct(value);
    if (modalidadPago === 'tasa_anual') {
      const cuota = calcCuotaTasaAnualStr(capitalActual, value);
      if (cuota != null) setInteresMensualActual(cuota);
    }
  };

  const applyDraftTramoPatch = useCallback(
    (patch: Partial<DraftTramoInicial>) => {
      setDraftTramo((d) => {
        let next = { ...d, ...patch };
        if (next.modalidadPago === 'tasa_anual') {
          const cuota = calcCuotaTasaAnualStr(
            next.capitalReferencial.trim() !== '' ? next.capitalReferencial : capitalActual,
            next.tasaPct,
          );
          if (cuota != null) next = { ...next, interesMensual: cuota };
        }
        return next;
      });
    },
    [capitalActual],
  );

  const title = useMemo(() => {
    if (isCreate) return 'Nuevo préstamo';
    if (!p) return 'Editar préstamo';
    return `Editar: ${p.prestamista || `Préstamo #${p.id}`}`;
  }, [isCreate, p]);

  const handleSave = async () => {
    setFormError(null);

    if (!fechaInicio.trim()) {
      setFormError('La fecha de inicio es obligatoria.');
      return;
    }

    let mo: number;
    let ca: number;
    let cuotaMes: number;

    if (isCreate) {
      if (!prestamista.trim()) {
        setFormError('Indica el prestamista o entidad.');
        return;
      }
      const moP = parseNum(montoOriginal);
      const caP = parseNum(capitalActual);
      const cuP = parseNum(interesMensualActual);
      if (moP == null || caP == null || cuP == null) {
        setFormError('Capital original, capital actual y cuota mensual son obligatorios (números).');
        return;
      }
      mo = moP;
      ca = caP;
      cuotaMes = cuP;
    } else {
      if (!detalle || !p) return;
      mo = parseNumRequired(montoOriginal, p.montoOriginal);
      ca = parseNumRequired(capitalActual, p.capitalActualEstimado);
      cuotaMes = parseNumRequired(interesMensualActual, p.interesMensualActual);
    }

    if (mo < 0 || ca < 0 || cuotaMes < 0) {
      setFormError('Montos y cuota deben ser números válidos (≥ 0).');
      return;
    }

    let tasaDecimal: number | null = null;
    if (modalidadPago === 'tasa_anual') {
      const pct = parseNum(tasaPct);
      if (pct == null) {
        setFormError('Indica la tasa anual en porcentaje (ej. 12 para 12 %), o 0.');
        return;
      }
      tasaDecimal = pct / 100;
    }

    let cuotaFijaVal: number | null = null;
    if (modalidadPago === 'cuota_fija') {
      const cf = parseNum(cuotaFijaMensual);
      cuotaFijaVal = cf;
    }

    let fechaCan: string | null = null;
    if (estado === 'cancelado') {
      fechaCan = fechaCancelacion.trim() ? fechaCancelacion.trim().slice(0, 10) : todayIso();
    }

    setSaving(true);
    try {
      const obsTrim = observaciones.trim();
      const payloadBase = {
        codigo: codigo.trim(),
        prestamista: prestamista.trim(),
        titulo: titulo.trim(),
        monedaCapital,
        monedaPago,
        modalidadPago,
        montoOriginal: mo,
        capitalActualEstimado: ca,
        tasaAnual: modalidadPago === 'tasa_anual' ? tasaDecimal : null,
        cuotaFijaMensual: modalidadPago === 'cuota_fija' ? cuotaFijaVal : null,
        interesMensualActual: cuotaMes,
        fechaInicio: fechaInicio.trim().slice(0, 10),
        estado,
        fechaCancelacion: fechaCan,
        requiereTramos,
        notas: obsTrim,
        observaciones: obsTrim,
      };

      if (isCreate) {
        if (incluirTramoInicial) {
          const dDesde = draftTramo.desde.trim().slice(0, 10);
          if (!dDesde) {
            setFormError('El tramo inicial necesita fecha «desde».');
            return;
          }
          let dTasa: number | null = null;
          if (draftTramo.modalidadPago === 'tasa_anual') {
            const pct = parseNum(draftTramo.tasaPct);
            if (pct == null) {
              setFormError('En el tramo inicial, indica la tasa anual en % (o 0).');
              return;
            }
            dTasa = pct / 100;
          }
          const dCf = draftTramo.modalidadPago === 'cuota_fija' ? parseNum(draftTramo.cuotaFijaMensual) : null;

          const { id: newId, error: eIns } = await insertPrestamoFinanciero(payloadBase, tenantEmpresaId);
          if (eIns) {
            setFormError(eIns);
            return;
          }
          if (newId == null) {
            setFormError('No se obtuvo el id del préstamo creado.');
            return;
          }
          const capRef = parseNum(draftTramo.capitalReferencial);
          const intT = parseNum(draftTramo.interesMensual);
          const { error: eTr } = await insertPrestamoTramo(
            newId,
            {
            monedaCapital,
            monedaPago,
            modalidadPago: draftTramo.modalidadPago,
            desde: dDesde,
            hasta: draftTramo.hasta.trim() ? draftTramo.hasta.trim().slice(0, 10) : null,
            capitalReferencial: capRef,
            tasaAnual: draftTramo.modalidadPago === 'tasa_anual' ? dTasa : null,
            cuotaFijaMensual: draftTramo.modalidadPago === 'cuota_fija' ? dCf : null,
            interesMensual: intT,
            evento: draftTramo.evento.trim() || 'inicio',
            nota: draftTramo.nota.trim(),
            orden: 0,
            },
            tenantEmpresaId,
          );
          if (eTr) {
            setFormError(`Préstamo creado (id ${newId}), pero el tramo inicial falló: ${eTr}`);
            return;
          }
          await Promise.resolve(onSaved());
          onClose();
          return;
        }

        const { id: newId, error: eIns } = await insertPrestamoFinanciero(payloadBase, tenantEmpresaId);
        if (eIns) {
          setFormError(eIns);
          return;
        }
        if (newId == null) {
          setFormError('No se obtuvo el id del préstamo creado.');
          return;
        }
        await Promise.resolve(onSaved());
        onClose();
        return;
      }

      if (!p) return;

      const { error: e1 } = await updatePrestamoFinanciero(p.id, payloadBase, tenantEmpresaId);
      if (e1) {
        setFormError(e1);
        return;
      }

      for (const row of tramosForm) {
        const capRef = parseNum(row.capitalReferencial);
        const tasaT = parseNum(row.tasaPct);
        const tasaDec = tasaT != null ? tasaT / 100 : null;
        const cfT = parseNum(row.cuotaFijaMensual);
        const intT = parseNum(row.interesMensual);
        const ord = parseNum(row.orden);
        const { error: eT } = await updatePrestamoTramo(
          p.id,
          row.id,
          {
            monedaCapital: row.monedaCapital,
            monedaPago: row.monedaPago,
            modalidadPago: row.modalidadPago,
            desde: row.desde.trim().slice(0, 10),
            hasta: row.hasta.trim() ? row.hasta.trim().slice(0, 10) : null,
            capitalReferencial: capRef,
            tasaAnual: row.modalidadPago === 'tasa_anual' ? tasaDec : null,
            cuotaFijaMensual: row.modalidadPago === 'cuota_fija' ? cfT : null,
            interesMensual: intT,
            evento: row.evento.trim(),
            nota: row.nota.trim(),
            orden: ord != null ? Math.round(ord) : undefined,
          },
          tenantEmpresaId,
        );
        if (eT) {
          setFormError(`Tramo #${row.id}: ${eT}`);
          return;
        }
      }

      await Promise.resolve(onSaved());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const updateTramo = useCallback(
    (id: number, patch: Partial<TramoForm>) => {
      setTramosForm((rows) =>
        rows.map((r) => {
          if (r.id !== id) return r;
          const next = { ...r, ...patch };
          if (next.modalidadPago === 'tasa_anual') {
            const capRef = parseNum(next.capitalReferencial);
            const loanCap = parseNum(capitalActual);
            const cap = capRef != null && capRef >= 0 ? capRef : loanCap;
            const pct = parseNum(next.tasaPct);
            if (pct != null && cap != null && pct >= 0 && cap >= 0) {
              next.interesMensual = String(cuotaMensualDesdeCapitalYTasaAnual(cap, pct / 100));
            }
          }
          return next;
        }),
      );
    },
    [capitalActual],
  );

  if (!isOpen) return null;
  if (!isCreate && (!detalle || !p)) return null;

  const labelClass = 'block text-[11px] font-semibold text-slate-600 mb-0.5';
  const inputClass =
    'w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : isCreate ? 'Registrar préstamo' : 'Guardar cambios'}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-slate-800">
        {formError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">{formError}</div>
        ) : null}

        <p className="text-xs text-slate-500 leading-snug">
          {isCreate
            ? 'Completa los datos del contrato. Opcionalmente puedes registrar un tramo inicial (timeline) en el mismo guardado.'
            : 'Ajusta capital, tasa, cuota mensual y demás en un solo guardado. Si el préstamo tiene tramos, edítalos abajo; se aplican después de actualizar la cabecera.'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Prestamista {isCreate ? '(obligatorio)' : ''}</label>
            <input
              className={inputClass}
              value={prestamista}
              onChange={(e) => setPrestamista(e.target.value)}
              placeholder="Banco, persona o entidad"
            />
          </div>
          <div>
            <label className={labelClass}>Título / referencia</label>
            <input className={inputClass} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Código interno</label>
            <input className={inputClass} value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Fecha inicio contrato</label>
            <input className={inputClass} type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Moneda capital</label>
            <select
              className={inputClass}
              value={monedaCapital}
              onChange={(e) => setMonedaCapital(e.target.value as Moneda)}
            >
              <option value="USD">USD</option>
              <option value="PEN">PEN</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Moneda pago (cuota)</label>
            <select
              className={inputClass}
              value={monedaPago}
              onChange={(e) => setMonedaPago(e.target.value as Moneda)}
            >
              <option value="USD">USD</option>
              <option value="PEN">PEN</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Modalidad</label>
            <select
              className={inputClass}
              value={modalidadPago}
              onChange={(e) => {
                const next = e.target.value as ModalidadPagoPrestamo;
                setModalidadPago(next);
                if (next === 'tasa_anual') {
                  const cuota = calcCuotaTasaAnualStr(capitalActual, tasaPct);
                  if (cuota != null) setInteresMensualActual(cuota);
                  recalcTramosCuotaPorCapitalCabecera(capitalActual);
                }
              }}
            >
              <option value="tasa_anual">Tasa anual (cuota ≈ capital × tasa / 12)</option>
              <option value="cuota_fija">Cuota fija mensual</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Capital original</label>
            <input className={inputClass} inputMode="decimal" value={montoOriginal} onChange={(e) => setMontoOriginal(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Capital actual estimado</label>
            <input
              className={inputClass}
              inputMode="decimal"
              value={capitalActual}
              onChange={(e) => onCapitalCabeceraChange(e.target.value)}
            />
          </div>
          {modalidadPago === 'tasa_anual' ? (
            <div>
              <label className={labelClass}>Tasa anual (% nominal)</label>
              <input
                className={inputClass}
                inputMode="decimal"
                value={tasaPct}
                onChange={(e) => onTasaCabeceraChange(e.target.value)}
                placeholder="ej. 12"
              />
            </div>
          ) : (
            <div>
              <label className={labelClass}>Importe cuota fija (mensual)</label>
              <input
                className={inputClass}
                inputMode="decimal"
                value={cuotaFijaMensual}
                onChange={(e) => setCuotaFijaMensual(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className={labelClass}>Cuota mensual registrada (interés / pago)</label>
            <input
              className={inputClass}
              inputMode="decimal"
              value={interesMensualActual}
              onChange={(e) => setInteresMensualActual(e.target.value)}
            />
            <p className="mt-0.5 text-[10px] text-slate-400">
              Con modalidad «Tasa anual», se recalcula al instante como capital × (tasa % / 100) / 12. Puedes ajustar el valor a mano si
              necesitas una excepción.
            </p>
          </div>
          <div>
            <label className={labelClass}>Estado</label>
            <select
              className={inputClass}
              value={estado}
              onChange={(e) => setEstado(e.target.value as PrestamoFinancieroEstado)}
            >
              <option value="activo">Activo</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
          {estado === 'cancelado' ? (
            <div>
              <label className={labelClass}>Fecha cancelación</label>
              <input
                className={inputClass}
                type="date"
                value={fechaCancelacion}
                onChange={(e) => setFechaCancelacion(e.target.value)}
              />
              <p className="mt-0.5 text-[10px] text-slate-400">Si la dejas vacía, se usa la fecha de hoy.</p>
            </div>
          ) : null}
          <div className="sm:col-span-2 flex items-center gap-2">
            <input
              id="req-tramos"
              type="checkbox"
              checked={requiereTramos}
              onChange={(e) => setRequiereTramos(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
            />
            <label htmlFor="req-tramos" className="text-xs text-slate-600">
              Requiere tramos (histórico por periodos)
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Observaciones</label>
            <textarea
              className={`${inputClass} min-h-[72px]`}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>
        </div>

        {isCreate ? (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <input
                id="tramo-inicial"
                type="checkbox"
                checked={incluirTramoInicial}
                onChange={(e) => {
                  const on = e.target.checked;
                  setIncluirTramoInicial(on);
                  if (on) {
                    setDraftTramo((d) => {
                      const base = {
                        ...d,
                        desde: fechaInicio.trim().slice(0, 10) || d.desde,
                        modalidadPago: modalidadPago,
                      };
                      if (base.modalidadPago === 'tasa_anual') {
                        const capStr =
                          base.capitalReferencial.trim() !== '' ? base.capitalReferencial : capitalActual;
                        const cuota = calcCuotaTasaAnualStr(capStr, base.tasaPct);
                        return cuota != null ? { ...base, interesMensual: cuota } : base;
                      }
                      return base;
                    });
                  }
                }}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
              />
              <label htmlFor="tramo-inicial" className="text-xs font-medium text-slate-700">
                Incluir tramo inicial en la línea de tiempo (opcional)
              </label>
            </div>
            {incluirTramoInicial ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-indigo-100/80">
                <div>
                  <label className={labelClass}>Desde</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={draftTramo.desde}
                    onChange={(e) => setDraftTramo((d) => ({ ...d, desde: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelClass}>Hasta</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={draftTramo.hasta}
                    onChange={(e) => setDraftTramo((d) => ({ ...d, hasta: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelClass}>Modalidad tramo</label>
                  <select
                    className={inputClass}
                    value={draftTramo.modalidadPago}
                    onChange={(e) =>
                      applyDraftTramoPatch({
                        modalidadPago: e.target.value as ModalidadPagoPrestamo,
                      })
                    }
                  >
                    <option value="tasa_anual">Tasa anual</option>
                    <option value="cuota_fija">Cuota fija</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Capital ref.</label>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={draftTramo.capitalReferencial}
                    onChange={(e) => applyDraftTramoPatch({ capitalReferencial: e.target.value })}
                  />
                </div>
                {draftTramo.modalidadPago === 'tasa_anual' ? (
                  <div>
                    <label className={labelClass}>Tasa %</label>
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      value={draftTramo.tasaPct}
                      onChange={(e) => applyDraftTramoPatch({ tasaPct: e.target.value })}
                    />
                  </div>
                ) : (
                  <div>
                    <label className={labelClass}>Cuota fija</label>
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      value={draftTramo.cuotaFijaMensual}
                      onChange={(e) => setDraftTramo((d) => ({ ...d, cuotaFijaMensual: e.target.value }))}
                    />
                  </div>
                )}
                <div>
                  <label className={labelClass}>Interés / cuota (mensual)</label>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={draftTramo.interesMensual}
                    onChange={(e) => setDraftTramo((d) => ({ ...d, interesMensual: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Evento</label>
                  <input
                    className={inputClass}
                    value={draftTramo.evento}
                    onChange={(e) => setDraftTramo((d) => ({ ...d, evento: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Nota</label>
                  <input
                    className={inputClass}
                    value={draftTramo.nota}
                    onChange={(e) => setDraftTramo((d) => ({ ...d, nota: e.target.value }))}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!isCreate && tramosForm.length > 0 ? (
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Tramos</h4>
            <div className="max-h-[40vh] overflow-auto space-y-3 pr-1">
              {tramosForm.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 space-y-2"
                >
                  <p className="text-[10px] font-semibold text-slate-500">Tramo id {row.id}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className={labelClass}>Desde</label>
                      <input
                        type="date"
                        className={inputClass}
                        value={row.desde}
                        onChange={(e) => updateTramo(row.id, { desde: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Hasta</label>
                      <input
                        type="date"
                        className={inputClass}
                        value={row.hasta}
                        onChange={(e) => updateTramo(row.id, { hasta: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Orden</label>
                      <input
                        className={inputClass}
                        inputMode="numeric"
                        value={row.orden}
                        onChange={(e) => updateTramo(row.id, { orden: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Modalidad</label>
                      <select
                        className={inputClass}
                        value={row.modalidadPago}
                        onChange={(e) =>
                          updateTramo(row.id, { modalidadPago: e.target.value as ModalidadPagoPrestamo })
                        }
                      >
                        <option value="tasa_anual">Tasa anual</option>
                        <option value="cuota_fija">Cuota fija</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Mon. capital</label>
                      <select
                        className={inputClass}
                        value={row.monedaCapital}
                        onChange={(e) => updateTramo(row.id, { monedaCapital: e.target.value as Moneda })}
                      >
                        <option value="USD">USD</option>
                        <option value="PEN">PEN</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Mon. pago</label>
                      <select
                        className={inputClass}
                        value={row.monedaPago}
                        onChange={(e) => updateTramo(row.id, { monedaPago: e.target.value as Moneda })}
                      >
                        <option value="USD">USD</option>
                        <option value="PEN">PEN</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Capital ref.</label>
                      <input
                        className={inputClass}
                        inputMode="decimal"
                        value={row.capitalReferencial}
                        onChange={(e) => updateTramo(row.id, { capitalReferencial: e.target.value })}
                      />
                    </div>
                    {row.modalidadPago === 'tasa_anual' ? (
                      <div>
                        <label className={labelClass}>Tasa %</label>
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={row.tasaPct}
                          onChange={(e) => updateTramo(row.id, { tasaPct: e.target.value })}
                        />
                      </div>
                    ) : (
                      <div>
                        <label className={labelClass}>Cuota fija</label>
                        <input
                          className={inputClass}
                          inputMode="decimal"
                          value={row.cuotaFijaMensual}
                          onChange={(e) => updateTramo(row.id, { cuotaFijaMensual: e.target.value })}
                        />
                      </div>
                    )}
                    <div>
                      <label className={labelClass}>Interés / cuota (mensual)</label>
                      <input
                        className={inputClass}
                        inputMode="decimal"
                        value={row.interesMensual}
                        onChange={(e) => updateTramo(row.id, { interesMensual: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Evento</label>
                      <input
                        className={inputClass}
                        value={row.evento}
                        onChange={(e) => updateTramo(row.id, { evento: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Nota</label>
                      <input
                        className={inputClass}
                        value={row.nota}
                        onChange={(e) => updateTramo(row.id, { nota: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
};

export default PrestamoEditModal;
