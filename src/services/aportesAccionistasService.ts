import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import type { AporteAccionista, Moneda } from '../data/types';

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

/** Movimiento contable de salida de capital (resta en totales). */
export const APORTE_TIPO_RETIRO = 'retiro_accionista';

export function aporteMontoNeto(r: Pick<AporteAccionista, 'tipo' | 'monto'>): number {
  const m = Number(r.monto);
  if (!Number.isFinite(m)) return 0;
  if (String(r.tipo ?? '').trim() === APORTE_TIPO_RETIRO) return -Math.abs(m);
  return m;
}

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

const APORTE_SELECT =
  'id, empresa_id, accionista, vehiculo_referencia, monto, moneda, fecha_aporte, genera_interes, tipo, observaciones, created_at';

export type AportesAccionistasFetchResult = {
  rows: AporteAccionista[];
  error: string | null;
};

function logAportesEmptyDiagnostic(empresaId: string | null) {
  console.warn(
    '[aportes_accionistas] Sin filas visibles.',
    '\n  empresa_id:',
    empresaId,
    '\n  Revisar: import v3, RLS en aportes_accionistas, políticas para rol finanzas.',
  );
}

/** Aportes de accionistas. @param tenantEmpresaId Preferir `profile.empresa_id` (RLS). */
export async function fetchAportesAccionistas(
  tenantEmpresaId?: string | null,
): Promise<AportesAccionistasFetchResult> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) {
    console.error('[aportes_accionistas] Falta empresa_id (perfil o VITE_EMPRESA_ID).');
    return { rows: [], error: 'Falta empresa_id en el entorno.' };
  }

  const { data, error } = await supabase
    .from('aportes_accionistas')
    .select(APORTE_SELECT)
    .eq('empresa_id', empresaId)
    .order('fecha_aporte', { ascending: false })
    .order('id', { ascending: false });

  if (error) {
    console.error('[aportes_accionistas] Supabase:', error.message, {
      empresa_id: empresaId,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { rows: [], error: error.message };
  }

  const rows = (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
  if (rows.length === 0) logAportesEmptyDiagnostic(empresaId);

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

export async function insertAporteAccionista(
  input: AporteAccionistaInsertInput,
  tenantEmpresaId?: string | null,
): Promise<{ error: string | null; row: AporteAccionista | null }> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) {
    return { error: 'Falta empresa_id en el entorno.', row: null };
  }
  const row = {
    empresa_id: empresaId,
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
  const { data, error } = await supabase.from('aportes_accionistas').insert(row).select(APORTE_SELECT).single();
  if (error) {
    return { error: error.message, row: null };
  }
  return { error: null, row: data ? mapRow(data as Record<string, unknown>) : null };
}

export async function deleteAporteAccionista(
  id: string,
  tenantEmpresaId?: string | null,
): Promise<{ error: string | null }> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) {
    return { error: 'Falta empresa_id en el entorno.' };
  }
  const { error } = await supabase
    .from('aportes_accionistas')
    .delete()
    .eq('id', id)
    .eq('empresa_id', empresaId);
  return { error: error?.message ?? null };
}
