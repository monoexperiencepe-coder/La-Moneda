import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import type { AporteAccionista, Moneda } from '../data/types';

function mapRow(r: Record<string, unknown>): AporteAccionista {
  const veh = r.vehiculo_referencia;
  return {
    id: String(r.id),
    empresaId: String(r.empresa_id ?? ''),
    accionista: String(r.accionista ?? ''),
    vehiculoReferencia:
      veh == null || String(veh).trim() === '' ? null : String(veh).trim(),
    monto: Number(r.monto ?? 0),
    moneda: (String(r.moneda ?? 'USD').toUpperCase() === 'USD' ? 'USD' : 'PEN') as Moneda,
    fechaAporte: String(r.fecha_aporte ?? '').slice(0, 10),
    generaInteres: Boolean(r.genera_interes),
    tipo: String(r.tipo ?? 'aporte_accionista'),
    observaciones: String(r.observaciones ?? ''),
    createdAt: String(r.created_at ?? ''),
  };
}

export type AportesAccionistasFetchResult = {
  rows: AporteAccionista[];
  error: string | null;
};

function logAportesEmptyDiagnostic() {
  console.warn(
    '[aportes_accionistas] Sin filas visibles.',
    '\n  empresa_id (VITE_EMPRESA_ID):',
    EMPRESA_ID,
    '\n  Revisar: import v3, RLS en aportes_accionistas, políticas para rol finanzas.',
  );
}

/** Aportes de accionistas para la empresa configurada (solo lectura). */
export async function fetchAportesAccionistas(): Promise<AportesAccionistasFetchResult> {
  if (!EMPRESA_ID) {
    console.error('[aportes_accionistas] Falta VITE_EMPRESA_ID en build (.env).');
    return { rows: [], error: 'Falta VITE_EMPRESA_ID en el entorno.' };
  }

  const { data, error } = await supabase
    .from('aportes_accionistas')
    .select(
      'id, empresa_id, accionista, vehiculo_referencia, monto, moneda, fecha_aporte, genera_interes, tipo, observaciones, created_at',
    )
    .eq('empresa_id', EMPRESA_ID)
    .order('fecha_aporte', { ascending: false })
    .order('id', { ascending: false });

  if (error) {
    console.error('[aportes_accionistas] Supabase:', error.message, {
      empresa_id: EMPRESA_ID,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { rows: [], error: error.message };
  }

  const rows = (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
  if (rows.length === 0) logAportesEmptyDiagnostic();

  return { rows, error: null };
}

function randomDedupeKeyManual(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `manual:${crypto.randomUUID()}`;
  }
  return `manual:${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export type AporteAccionistaInsertInput = {
  accionista: string;
  vehiculoReferencia: string | null;
  monto: number;
  moneda: Moneda;
  fechaAporte: string;
  generaInteres: boolean;
  tipo: string;
  observaciones: string;
};

/** Alta de un aporte (dedupe_key único generado en cliente). */
export async function insertAporteAccionista(
  input: AporteAccionistaInsertInput,
): Promise<{ error: string | null }> {
  if (!EMPRESA_ID) {
    return { error: 'Falta VITE_EMPRESA_ID en el entorno.' };
  }
  const row = {
    empresa_id: EMPRESA_ID,
    accionista: input.accionista.trim(),
    vehiculo_referencia:
      input.vehiculoReferencia == null || input.vehiculoReferencia.trim() === ''
        ? null
        : input.vehiculoReferencia.trim(),
    monto: input.monto,
    moneda: input.moneda,
    fecha_aporte: input.fechaAporte.slice(0, 10),
    genera_interes: input.generaInteres,
    tipo: (input.tipo ?? 'aporte_accionista').trim() || 'aporte_accionista',
    observaciones: input.observaciones.trim(),
    dedupe_key: randomDedupeKeyManual(),
  };
  const { error } = await supabase.from('aportes_accionistas').insert(row);
  return { error: error?.message ?? null };
}
