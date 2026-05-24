import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { nextTramoOrden, recalcularCuotaMensualPrestamo } from '../utils/prestamoMovimientos';

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}
import type {
  ModalidadPagoPrestamo,
  Moneda,
  PrestamoFinanciero,
  PrestamoFinancieroDetalle,
  PrestamoFinancieroEstado,
  PrestamoFinancieroTramo,
} from '../data/types';

function parseMoneda(raw: unknown, fallback: Moneda): Moneda {
  const u = String(raw ?? '').trim().toUpperCase();
  return u === 'PEN' ? 'PEN' : u === 'USD' ? 'USD' : fallback;
}

function parseModalidad(raw: unknown): ModalidadPagoPrestamo {
  const s = String(raw ?? 'tasa_anual')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
  return s === 'cuota_fija' ? 'cuota_fija' : 'tasa_anual';
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapPrestamoRow(r: Record<string, unknown>): PrestamoFinanciero {
  const legacyMoneda = parseMoneda(r.moneda, 'USD');
  const monedaCapital = parseMoneda(r.moneda_capital ?? r.moneda, legacyMoneda);
  const monedaPago = parseMoneda(r.moneda_pago ?? r.moneda, legacyMoneda);
  const modalidadPago = parseModalidad(r.modalidad_pago);
  const tasaRaw = r.tasa_anual;
  const tasaAnual =
    tasaRaw == null || String(tasaRaw).trim() === ''
      ? null
      : Number.isFinite(Number(tasaRaw))
        ? Number(tasaRaw)
        : null;

  return {
    id: Number(r.id),
    empresaId: String(r.empresa_id ?? ''),
    codigo: String(r.codigo ?? ''),
    prestamista: String(r.prestamista ?? ''),
    moneda: legacyMoneda,
    monedaCapital,
    monedaPago,
    modalidadPago,
    titulo: String(r.titulo ?? ''),
    montoOriginal: Number(r.monto_original ?? 0),
    capitalActualEstimado: Number(r.capital_actual_estimado ?? r.monto_original ?? 0),
    tasaAnual,
    cuotaFijaMensual: numOrNull(r.cuota_fija_mensual),
    interesMensualActual: Number(r.interes_mensual_actual ?? 0),
    fechaInicio: String(r.fecha_inicio ?? '').slice(0, 10),
    estado: (String(r.estado ?? 'activo').toLowerCase() === 'cancelado'
      ? 'cancelado'
      : 'activo') as PrestamoFinancieroEstado,
    fechaCancelacion:
      r.fecha_cancelacion == null || String(r.fecha_cancelacion).trim() === ''
        ? null
        : String(r.fecha_cancelacion).slice(0, 10),
    requiereTramos: Boolean(r.requiere_tramos),
    notas: String(r.notas ?? ''),
    observaciones: String(r.observaciones ?? r.notas ?? ''),
    createdAt: String(r.created_at ?? ''),
  };
}

function mapTramoRow(r: Record<string, unknown>): PrestamoFinancieroTramo {
  const hastaRaw = r.hasta;
  const interesRaw = r.interes_mensual;
  const legacyMoneda = parseMoneda(r.moneda, 'USD');
  const monedaCapital = parseMoneda(r.moneda_capital ?? r.moneda, legacyMoneda);
  const monedaPago = parseMoneda(r.moneda_pago ?? r.moneda, legacyMoneda);
  const modalidadPago = parseModalidad(r.modalidad_pago);
  const tasaRaw = r.tasa_anual;
  const tasaAnual =
    tasaRaw == null || String(tasaRaw).trim() === ''
      ? null
      : Number.isFinite(Number(tasaRaw))
        ? Number(tasaRaw)
        : null;

  return {
    id: Number(r.id),
    prestamoFinancieroId: Number(r.prestamo_financiero_id),
    moneda: legacyMoneda,
    monedaCapital,
    monedaPago,
    modalidadPago,
    desde: String(r.desde ?? '').slice(0, 10),
    hasta:
      hastaRaw == null || String(hastaRaw).trim() === ''
        ? null
        : String(hastaRaw).slice(0, 10),
    capitalReferencial: r.capital_referencial == null ? null : Number(r.capital_referencial),
    tasaAnual,
    cuotaFijaMensual: numOrNull(r.cuota_fija_mensual),
    interesMensual:
      interesRaw == null || String(interesRaw).trim() === ''
        ? null
        : Number(interesRaw),
    evento: String(r.evento ?? ''),
    nota: String(r.nota ?? ''),
    orden: Number(r.orden ?? 0),
    createdAt: String(r.created_at ?? ''),
  };
}

export type PrestamosFinancierosFetchResult = {
  detalle: PrestamoFinancieroDetalle[];
  /** Error al leer préstamos (fallo total). */
  error: string | null;
  /** Error al leer tramos (hay préstamos pero sin tramos en UI). */
  tramosError: string | null;
};

function logPrestamosEmptyDiagnostic(empresaId: string | null) {
  console.warn(
    '[prestamos_financieros] Sin filas visibles para esta sesión.',
    '\n  empresa_id:',
    empresaId,
    '\n  Revisar: coincidencia empresa_id en BD, políticas RLS (rol admin/socio/contador/operador en user_profiles), migración v3.',
    '\n  SQL útil: supabase/diagnostico_prestamos_financieros.sql',
  );
}

/** Lista préstamos financieros con tramos. @param tenantEmpresaId Preferir `profile.empresa_id` (RLS). */
export async function fetchPrestamosFinancierosDetalle(
  tenantEmpresaId?: string | null,
): Promise<PrestamosFinancierosFetchResult> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) {
    console.error('[prestamos_financieros] Falta empresa_id (perfil o VITE_EMPRESA_ID).');
    return { detalle: [], error: 'Falta empresa_id en el entorno.', tramosError: null };
  }

  const { data: prestamosRaw, error: e1 } = await supabase
    .from('prestamos_financieros')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('id', { ascending: true });

  if (e1) {
    console.error('[prestamos_financieros] Supabase:', e1.message, {
      empresa_id: empresaId,
      code: e1.code,
      details: e1.details,
      hint: e1.hint,
    });
    return {
      detalle: [],
      error: e1.message,
      tramosError: null,
    };
  }

  const prestamos = (prestamosRaw ?? []).map((r) => mapPrestamoRow(r as Record<string, unknown>));
  if (prestamos.length === 0) {
    logPrestamosEmptyDiagnostic(empresaId);
    return { detalle: [], error: null, tramosError: null };
  }

  const ids = prestamos.map((p) => p.id);
  const { data: tramosRaw, error: e2 } = await supabase
    .from('prestamos_tramos')
    .select('*')
    .eq('empresa_id', empresaId)
    .in('prestamo_financiero_id', ids)
    .order('prestamo_financiero_id', { ascending: true })
    .order('orden', { ascending: true })
    .order('id', { ascending: true });

  if (e2) {
    console.error('[prestamos_tramos] Supabase:', e2.message, {
      empresa_id: empresaId,
      code: e2.code,
      details: e2.details,
      hint: e2.hint,
    });
    return {
      detalle: prestamos.map((p) => ({ prestamo: p, tramos: [] })),
      error: null,
      tramosError: e2.message,
    };
  }

  const tramosAll = (tramosRaw ?? []).map((r) => mapTramoRow(r as Record<string, unknown>));
  const byPrestamo = new Map<number, PrestamoFinancieroTramo[]>();
  for (const t of tramosAll) {
    const list = byPrestamo.get(t.prestamoFinancieroId) ?? [];
    list.push(t);
    byPrestamo.set(t.prestamoFinancieroId, list);
  }

  return {
    detalle: prestamos.map((p) => ({
      prestamo: p,
      tramos: byPrestamo.get(p.id) ?? [],
    })),
    error: null,
    tramosError: null,
  };
}

/** Campos editables del préstamo (cabecera); se envían a `prestamos_financieros`. */
export type PrestamoFinancieroUpdateInput = {
  codigo?: string;
  prestamista?: string;
  titulo?: string;
  monedaCapital?: Moneda;
  monedaPago?: Moneda;
  modalidadPago?: ModalidadPagoPrestamo;
  montoOriginal?: number;
  capitalActualEstimado?: number;
  tasaAnual?: number | null;
  cuotaFijaMensual?: number | null;
  interesMensualActual?: number;
  fechaInicio?: string;
  estado?: PrestamoFinancieroEstado;
  fechaCancelacion?: string | null;
  requiereTramos?: boolean;
  notas?: string;
  observaciones?: string;
};

function buildPrestamoUpdateRow(input: PrestamoFinancieroUpdateInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.codigo !== undefined) row.codigo = input.codigo;
  if (input.prestamista !== undefined) row.prestamista = input.prestamista;
  if (input.titulo !== undefined) row.titulo = input.titulo;
  if (input.monedaCapital !== undefined) {
    row.moneda_capital = input.monedaCapital;
    row.moneda = input.monedaCapital;
  }
  if (input.monedaPago !== undefined) row.moneda_pago = input.monedaPago;
  if (input.modalidadPago !== undefined) row.modalidad_pago = input.modalidadPago;
  if (input.montoOriginal !== undefined) row.monto_original = input.montoOriginal;
  if (input.capitalActualEstimado !== undefined) row.capital_actual_estimado = input.capitalActualEstimado;
  if (input.tasaAnual !== undefined) row.tasa_anual = input.tasaAnual;
  if (input.cuotaFijaMensual !== undefined) row.cuota_fija_mensual = input.cuotaFijaMensual;
  if (input.interesMensualActual !== undefined) row.interes_mensual_actual = input.interesMensualActual;
  if (input.fechaInicio !== undefined) row.fecha_inicio = input.fechaInicio;
  if (input.estado !== undefined) row.estado = input.estado;
  if (input.fechaCancelacion !== undefined) row.fecha_cancelacion = input.fechaCancelacion;
  if (input.requiereTramos !== undefined) row.requiere_tramos = input.requiereTramos;
  if (input.notas !== undefined) row.notas = input.notas;
  if (input.observaciones !== undefined) row.observaciones = input.observaciones;
  return row;
}

export async function updatePrestamoFinanciero(
  prestamoId: number,
  input: PrestamoFinancieroUpdateInput,
  tenantEmpresaId?: string | null,
): Promise<{ error: string | null }> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) {
    return { error: 'Falta empresa_id en el entorno.' };
  }
  const row = buildPrestamoUpdateRow(input);
  if (Object.keys(row).length === 0) {
    return { error: 'No hay cambios para guardar.' };
  }
  const { error } = await supabase
    .from('prestamos_financieros')
    .update(row)
    .eq('id', prestamoId)
    .eq('empresa_id', empresaId);
  return { error: error?.message ?? null };
}

export type PrestamoTramoUpdateInput = {
  monedaCapital?: Moneda;
  monedaPago?: Moneda;
  modalidadPago?: ModalidadPagoPrestamo;
  desde?: string;
  hasta?: string | null;
  capitalReferencial?: number | null;
  tasaAnual?: number | null;
  cuotaFijaMensual?: number | null;
  interesMensual?: number | null;
  evento?: string;
  nota?: string;
  orden?: number;
};

function buildTramoUpdateRow(input: PrestamoTramoUpdateInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.monedaCapital !== undefined) {
    row.moneda_capital = input.monedaCapital;
    row.moneda = input.monedaCapital;
  }
  if (input.monedaPago !== undefined) row.moneda_pago = input.monedaPago;
  if (input.modalidadPago !== undefined) row.modalidad_pago = input.modalidadPago;
  if (input.desde !== undefined) row.desde = input.desde;
  if (input.hasta !== undefined) row.hasta = input.hasta;
  if (input.capitalReferencial !== undefined) row.capital_referencial = input.capitalReferencial;
  if (input.tasaAnual !== undefined) row.tasa_anual = input.tasaAnual;
  if (input.cuotaFijaMensual !== undefined) row.cuota_fija_mensual = input.cuotaFijaMensual;
  if (input.interesMensual !== undefined) row.interes_mensual = input.interesMensual;
  if (input.evento !== undefined) row.evento = input.evento;
  if (input.nota !== undefined) row.nota = input.nota;
  if (input.orden !== undefined) row.orden = input.orden;
  return row;
}

export async function updatePrestamoTramo(
  prestamoFinancieroId: number,
  tramoId: number,
  input: PrestamoTramoUpdateInput,
  tenantEmpresaId?: string | null,
): Promise<{ error: string | null }> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) {
    return { error: 'Falta empresa_id en el entorno.' };
  }
  const row = buildTramoUpdateRow(input);
  if (Object.keys(row).length === 0) {
    return { error: null };
  }
  const { error } = await supabase
    .from('prestamos_tramos')
    .update(row)
    .eq('id', tramoId)
    .eq('prestamo_financiero_id', prestamoFinancieroId)
    .eq('empresa_id', empresaId);
  return { error: error?.message ?? null };
}

/** Alta de cabecera en `prestamos_financieros` (requiere RLS INSERT y empresa_id válido). */
export type PrestamoFinancieroInsertInput = {
  codigo: string;
  prestamista: string;
  titulo: string;
  monedaCapital: Moneda;
  monedaPago: Moneda;
  modalidadPago: ModalidadPagoPrestamo;
  montoOriginal: number;
  capitalActualEstimado: number;
  tasaAnual: number | null;
  cuotaFijaMensual: number | null;
  interesMensualActual: number;
  fechaInicio: string;
  estado: PrestamoFinancieroEstado;
  fechaCancelacion: string | null;
  requiereTramos: boolean;
  notas: string;
  observaciones: string;
};

export async function insertPrestamoFinanciero(
  input: PrestamoFinancieroInsertInput,
  tenantEmpresaId?: string | null,
): Promise<{ id: number | null; error: string | null }> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) {
    return { id: null, error: 'Falta empresa_id en el entorno.' };
  }
  const row: Record<string, unknown> = {
    empresa_id: empresaId,
    codigo: input.codigo,
    prestamista: input.prestamista,
    titulo: input.titulo,
    moneda: input.monedaCapital,
    moneda_capital: input.monedaCapital,
    moneda_pago: input.monedaPago,
    modalidad_pago: input.modalidadPago,
    monto_original: input.montoOriginal,
    capital_actual_estimado: input.capitalActualEstimado,
    tasa_anual: input.tasaAnual,
    cuota_fija_mensual: input.cuotaFijaMensual,
    interes_mensual_actual: input.interesMensualActual,
    fecha_inicio: input.fechaInicio,
    estado: input.estado,
    fecha_cancelacion: input.fechaCancelacion,
    requiere_tramos: input.requiereTramos,
    notas: input.notas,
    observaciones: input.observaciones,
  };
  const { data, error } = await supabase
    .from('prestamos_financieros')
    .insert(row)
    .select('id')
    .single();
  if (error) {
    return { id: null, error: error.message };
  }
  const rid = data?.id != null ? Number(data.id) : NaN;
  return { id: Number.isFinite(rid) ? rid : null, error: null };
}

export type PrestamoTramoInsertInput = {
  monedaCapital: Moneda;
  monedaPago: Moneda;
  modalidadPago: ModalidadPagoPrestamo;
  desde: string;
  hasta?: string | null;
  capitalReferencial?: number | null;
  tasaAnual?: number | null;
  cuotaFijaMensual?: number | null;
  interesMensual?: number | null;
  evento?: string;
  nota?: string;
  orden: number;
};

export async function insertPrestamoTramo(
  prestamoFinancieroId: number,
  input: PrestamoTramoInsertInput,
  tenantEmpresaId?: string | null,
): Promise<{ id: number | null; error: string | null }> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) {
    return { id: null, error: 'Falta empresa_id en el entorno.' };
  }
  const row: Record<string, unknown> = {
    empresa_id: empresaId,
    prestamo_financiero_id: prestamoFinancieroId,
    moneda: input.monedaCapital,
    moneda_capital: input.monedaCapital,
    moneda_pago: input.monedaPago,
    modalidad_pago: input.modalidadPago,
    desde: input.desde,
    hasta: input.hasta ?? null,
    capital_referencial: input.capitalReferencial ?? null,
    tasa_anual: input.tasaAnual ?? null,
    cuota_fija_mensual: input.cuotaFijaMensual ?? null,
    interes_mensual: input.interesMensual ?? null,
    evento: input.evento ?? '',
    nota: input.nota ?? '',
    orden: input.orden,
  };
  const { data, error } = await supabase.from('prestamos_tramos').insert(row).select('id').single();
  if (error) {
    return { id: null, error: error.message };
  }
  const rid = data?.id != null ? Number(data.id) : NaN;
  return { id: Number.isFinite(rid) ? rid : null, error: null };
}

export async function deletePrestamoTramo(
  prestamoFinancieroId: number,
  tramoId: number,
  tenantEmpresaId?: string | null,
): Promise<{ error: string | null }> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) {
    return { error: 'Falta empresa_id en el entorno.' };
  }
  const { error } = await supabase
    .from('prestamos_tramos')
    .delete()
    .eq('id', tramoId)
    .eq('prestamo_financiero_id', prestamoFinancieroId)
    .eq('empresa_id', empresaId);
  return { error: error?.message ?? null };
}

export async function deletePrestamoFinanciero(
  prestamoId: number,
  tenantEmpresaId?: string | null,
): Promise<{ error: string | null }> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) {
    return { error: 'Falta empresa_id en el entorno.' };
  }
  const { error: eTramos } = await supabase
    .from('prestamos_tramos')
    .delete()
    .eq('prestamo_financiero_id', prestamoId)
    .eq('empresa_id', empresaId);
  if (eTramos) {
    return { error: eTramos.message };
  }
  const { error } = await supabase
    .from('prestamos_financieros')
    .delete()
    .eq('id', prestamoId)
    .eq('empresa_id', empresaId);
  return { error: error?.message ?? null };
}

/** Restaura cabecera + tramos tras undo de eliminación (nuevos ids en BD). */
export async function restorePrestamoFinancieroDetalle(
  snapshot: PrestamoFinancieroDetalle,
  tenantEmpresaId?: string | null,
): Promise<{ detalle: PrestamoFinancieroDetalle | null; error: string | null }> {
  const p = snapshot.prestamo;
  const { id: newId, error: eIns } = await insertPrestamoFinanciero(
    {
      codigo: p.codigo,
      prestamista: p.prestamista,
      titulo: p.titulo,
      monedaCapital: p.monedaCapital,
      monedaPago: p.monedaPago,
      modalidadPago: p.modalidadPago,
      montoOriginal: p.montoOriginal,
      capitalActualEstimado: p.capitalActualEstimado,
      tasaAnual: p.tasaAnual,
      cuotaFijaMensual: p.cuotaFijaMensual,
      interesMensualActual: p.interesMensualActual,
      fechaInicio: p.fechaInicio,
      estado: p.estado,
      fechaCancelacion: p.fechaCancelacion,
      requiereTramos: p.requiereTramos,
      notas: p.notas,
      observaciones: p.observaciones,
    },
    tenantEmpresaId,
  );
  if (eIns || newId == null) {
    return { detalle: null, error: eIns ?? 'No se obtuvo id al restaurar.' };
  }
  const tramosRestored: PrestamoFinancieroTramo[] = [];
  for (const t of [...snapshot.tramos].sort((a, b) => a.orden - b.orden || a.id - b.id)) {
    const { id: tramoId, error: eTr } = await insertPrestamoTramo(
      newId,
      {
        monedaCapital: t.monedaCapital,
        monedaPago: t.monedaPago,
        modalidadPago: t.modalidadPago,
        desde: t.desde,
        hasta: t.hasta,
        capitalReferencial: t.capitalReferencial,
        tasaAnual: t.tasaAnual,
        cuotaFijaMensual: t.cuotaFijaMensual,
        interesMensual: t.interesMensual,
        evento: t.evento,
        nota: t.nota,
        orden: t.orden,
      },
      tenantEmpresaId,
    );
    if (eTr) {
      return { detalle: null, error: `Préstamo restaurado (id ${newId}) pero falló un tramo: ${eTr}` };
    }
    tramosRestored.push({
      ...t,
      id: tramoId ?? t.id,
      prestamoFinancieroId: newId,
    });
  }
  const { detalle: rows } = await fetchPrestamosFinancierosDetalle(tenantEmpresaId);
  const fresh = rows.find((r) => r.prestamo.id === newId);
  if (fresh) {
    return { detalle: fresh, error: null };
  }
  return {
    detalle: {
      prestamo: { ...p, id: newId },
      tramos: tramosRestored,
    },
    error: null,
  };
}

function dayBeforeIso(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type MovimientoCapitalPrestamoInput = {
  prestamo: PrestamoFinanciero;
  tramos: PrestamoFinancieroTramo[];
  tipo: 'retiro_capital' | 'aumento_capital';
  monto: number;
  fecha: string;
  comentario: string;
};

export type MovimientoCapitalPrestamoResult = {
  error: string | null;
  newTramoId: number | null;
  detalle: PrestamoFinancieroDetalle | null;
};

/** Retiro o aumento de capital: cierra tramo vigente, inserta tramo histórico y actualiza snapshot. */
export async function aplicarMovimientoCapitalPrestamo(
  input: MovimientoCapitalPrestamoInput,
  tenantEmpresaId?: string | null,
): Promise<MovimientoCapitalPrestamoResult> {
  const { prestamo, tramos, tipo, monto, fecha, comentario } = input;
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) {
    return { error: 'Falta empresa_id en el entorno.', newTramoId: null, detalle: null };
  }
  if (!Number.isFinite(monto) || monto <= 0) {
    return { error: 'El monto debe ser mayor que cero.', newTramoId: null, detalle: null };
  }
  const capActual = prestamo.capitalActualEstimado;
  const delta = tipo === 'retiro_capital' ? -monto : monto;
  const nuevoCapital = Math.round((capActual + delta) * 100) / 100;
  if (tipo === 'retiro_capital' && nuevoCapital < 0) {
    return { error: 'El retiro supera el capital actual.', newTramoId: null, detalle: null };
  }

  const nuevaCuota = recalcularCuotaMensualPrestamo(prestamo, nuevoCapital);

  const tramosOrd = [...tramos].sort((a, b) => a.orden - b.orden || a.id - b.id);
  const tramoAbierto = [...tramosOrd].reverse().find((t) => !t.hasta?.trim());
  if (tramoAbierto) {
    const hastaCierre = dayBeforeIso(fecha);
    if (hastaCierre >= tramoAbierto.desde.slice(0, 10)) {
      const { error: eClose } = await updatePrestamoTramo(
        prestamo.id,
        tramoAbierto.id,
        { hasta: hastaCierre },
        tenantEmpresaId,
      );
      if (eClose) {
        return { error: eClose, newTramoId: null, detalle: null };
      }
    }
  }

  const orden = nextTramoOrden(tramosOrd);
  const nota =
    comentario.trim() ||
    (tipo === 'retiro_capital' ? `Retiro parcial ${monto}` : `Aumento de capital ${monto}`);

  const { id: newTramoId, error: eTr } = await insertPrestamoTramo(
    prestamo.id,
    {
      monedaCapital: prestamo.monedaCapital,
      monedaPago: prestamo.monedaPago,
      modalidadPago: prestamo.modalidadPago,
      desde: fecha.slice(0, 10),
      hasta: null,
      capitalReferencial: nuevoCapital,
      tasaAnual: prestamo.tasaAnual,
      cuotaFijaMensual: prestamo.cuotaFijaMensual,
      interesMensual: nuevaCuota,
      evento: tipo,
      nota,
      orden,
    },
    tenantEmpresaId,
  );
  if (eTr) {
    return { error: eTr, newTramoId: null, detalle: null };
  }

  const { error: eUp } = await updatePrestamoFinanciero(
    prestamo.id,
    {
      capitalActualEstimado: nuevoCapital,
      interesMensualActual: nuevaCuota,
    },
    tenantEmpresaId,
  );
  if (eUp) {
    if (newTramoId != null) {
      await deletePrestamoTramo(prestamo.id, newTramoId, tenantEmpresaId);
    }
    return { error: eUp, newTramoId: null, detalle: null };
  }

  const { detalle: rows } = await fetchPrestamosFinancierosDetalle(tenantEmpresaId);
  const fresh = rows.find((r) => r.prestamo.id === prestamo.id) ?? null;
  return { error: null, newTramoId, detalle: fresh };
}

export type RegistroHistorialEdicionInput = {
  prestamo: PrestamoFinanciero;
  tramos: PrestamoFinancieroTramo[];
  capitalAnterior: number;
  capitalNuevo: number;
  interesAnterior: number;
  interesNuevo: number;
  fecha: string;
  comentario?: string;
};

/** Inserta tramo de historial cuando edición cambia condiciones financieras. */
export async function registrarHistorialEdicionPrestamo(
  input: RegistroHistorialEdicionInput,
  tenantEmpresaId?: string | null,
): Promise<{ newTramoId: number | null; error: string | null }> {
  const { prestamo, tramos, capitalNuevo, interesNuevo, fecha, comentario } = input;
  const tramosOrd = [...tramos].sort((a, b) => a.orden - b.orden || a.id - b.id);
  const tramoAbierto = [...tramosOrd].reverse().find((t) => !t.hasta?.trim());
  if (tramoAbierto) {
    const hastaCierre = dayBeforeIso(fecha);
    if (hastaCierre >= tramoAbierto.desde.slice(0, 10)) {
      const { error: eClose } = await updatePrestamoTramo(
        prestamo.id,
        tramoAbierto.id,
        { hasta: hastaCierre },
        tenantEmpresaId,
      );
      if (eClose) return { newTramoId: null, error: eClose };
    }
  }
  const orden = nextTramoOrden(tramosOrd);
  const { id, error } = await insertPrestamoTramo(
    prestamo.id,
    {
      monedaCapital: prestamo.monedaCapital,
      monedaPago: prestamo.monedaPago,
      modalidadPago: prestamo.modalidadPago,
      desde: fecha.slice(0, 10),
      hasta: null,
      capitalReferencial: capitalNuevo,
      tasaAnual: prestamo.tasaAnual,
      cuotaFijaMensual: prestamo.cuotaFijaMensual,
      interesMensual: interesNuevo,
      evento: 'edicion',
      nota: comentario?.trim() || 'Edición de condiciones',
      orden,
    },
    tenantEmpresaId,
  );
  return { newTramoId: id, error };
}

/** Revierte movimiento de capital o tramo de edición (undo). */
export async function revertirMovimientoPrestamo(
  prestamoId: number,
  snapshot: PrestamoFinancieroDetalle,
  newTramoId: number | null,
  tenantEmpresaId?: string | null,
): Promise<{ error: string | null }> {
  if (newTramoId != null) {
    const { error: eDel } = await deletePrestamoTramo(prestamoId, newTramoId, tenantEmpresaId);
    if (eDel) return { error: eDel };
  }
  const p = snapshot.prestamo;
  const { error: eUp } = await updatePrestamoFinanciero(
    prestamoId,
    {
      codigo: p.codigo,
      prestamista: p.prestamista,
      titulo: p.titulo,
      monedaCapital: p.monedaCapital,
      monedaPago: p.monedaPago,
      modalidadPago: p.modalidadPago,
      montoOriginal: p.montoOriginal,
      capitalActualEstimado: p.capitalActualEstimado,
      tasaAnual: p.tasaAnual,
      cuotaFijaMensual: p.cuotaFijaMensual,
      interesMensualActual: p.interesMensualActual,
      fechaInicio: p.fechaInicio,
      estado: p.estado,
      fechaCancelacion: p.fechaCancelacion,
      requiereTramos: p.requiereTramos,
      notas: p.notas,
      observaciones: p.observaciones,
    },
    tenantEmpresaId,
  );
  if (eUp) return { error: eUp };

  for (const t of snapshot.tramos) {
    const { error: eT } = await updatePrestamoTramo(
      prestamoId,
      t.id,
      {
        monedaCapital: t.monedaCapital,
        monedaPago: t.monedaPago,
        modalidadPago: t.modalidadPago,
        desde: t.desde,
        hasta: t.hasta,
        capitalReferencial: t.capitalReferencial,
        tasaAnual: t.tasaAnual,
        cuotaFijaMensual: t.cuotaFijaMensual,
        interesMensual: t.interesMensual,
        evento: t.evento,
        nota: t.nota,
        orden: t.orden,
      },
      tenantEmpresaId,
    );
    if (eT) return { error: eT };
  }
  return { error: null };
}
