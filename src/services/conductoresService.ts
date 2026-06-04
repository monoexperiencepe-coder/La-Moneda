import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { conductorPatchToSnake, conductorToInsert, mapConductorRow } from './supabaseMappers';
import {
  isValidConductorId,
  logConductorIdDiagnostics,
  normalizeConductorIdForQuery,
  type ConductorId,
} from '../utils/conductorId';
import type { Conductor } from '../data/types';

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

/** Filas únicas por id (evita doble conteo). */
export function dedupeConductoresById(conductores: readonly Conductor[]): Conductor[] {
  const seen = new Set<string>();
  const out: Conductor[] = [];
  for (const c of conductores) {
    const key = String(c.id ?? '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export async function countConductoresRows(tenantEmpresaId?: string | null): Promise<number> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return 0;
  const { count, error } = await supabase
    .from('conductores')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId);
  if (error) {
    console.error('[conductores count]', error.message, error);
    return 0;
  }
  return count ?? 0;
}

/** @param tenantEmpresaId Preferir `profile.empresa_id` (RLS). `EMPRESA_ID` solo filtro cliente legacy. */
export async function fetchConductores(tenantEmpresaId?: string | null): Promise<Conductor[]> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return [];
  const { data, error } = await supabase
    .from('conductores')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('id', { ascending: false });
  if (error) {
    console.error('[conductores fetch]', error.message, error);
    return [];
  }
  const rows = (data ?? []).map((r) => mapConductorRow(r as Record<string, unknown>));
  logConductorIdDiagnostics(rows);
  return dedupeConductoresById(rows);
}

export async function insertConductor(
  row: Omit<Conductor, 'id' | 'createdAt'>,
  tenantEmpresaId?: string | null,
): Promise<Conductor | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return null;
  const { data, error } = await supabase
    .from('conductores')
    .insert(conductorToInsert(empresaId, row))
    .select('*')
    .single();
  if (error) {
    console.error('[conductores insert]', error.message, error);
    return null;
  }
  return data ? mapConductorRow(data as Record<string, unknown>) : null;
}

export async function patchConductor(
  id: ConductorId,
  patch: Partial<Omit<Conductor, 'id' | 'createdAt'>>,
  tenantEmpresaId?: string | null,
): Promise<Conductor | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) {
    console.error('[conductores update] tenant empresa_id no configurado');
    return null;
  }

  const conductorId = normalizeConductorIdForQuery(id);
  if (!isValidConductorId(conductorId)) {
    console.error('[conductores update] id inválido para UPDATE', {
      id,
      conductorId,
      type: typeof id,
    });
    return null;
  }

  const snake = conductorPatchToSnake(patch);
  console.log('[conductores update] request', {
    id: conductorId,
    type: typeof conductorId,
    empresaId,
  });

  if (Object.keys(snake).length === 0) {
    const { data: cur, error: readErr } = await supabase
      .from('conductores')
      .select('*')
      .eq('id', conductorId)
      .eq('empresa_id', empresaId)
      .maybeSingle();
    if (readErr) {
      console.error('[conductores update] read empty patch failed', readErr);
      return null;
    }
    return cur ? mapConductorRow(cur as Record<string, unknown>) : null;
  }

  const { data, error, status, statusText } = await supabase
    .from('conductores')
    .update(snake)
    .eq('id', conductorId)
    .eq('empresa_id', empresaId)
    .select('*');

  if (error) {
    console.error('[conductores update] supabase error', {
      id: conductorId,
      status,
      statusText,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      patch: snake,
    });
    return null;
  }

  const row = data?.[0];
  if (!row) {
    console.warn('[conductores update] 0 filas actualizadas', {
      id: conductorId,
      empresaId,
      status,
      statusText,
      count: data?.length ?? 0,
      patch: snake,
    });
    return null;
  }

  const mapped = mapConductorRow(row as Record<string, unknown>);
  console.log('[conductores update] ok', {
    id: mapped.id,
    type: typeof mapped.id,
    conductor: mapped,
  });
  return mapped;
}

export async function removeConductor(
  id: ConductorId,
  tenantEmpresaId?: string | null,
): Promise<boolean> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return false;
  const conductorId = normalizeConductorIdForQuery(id);
  if (!isValidConductorId(conductorId)) {
    console.error('[conductores delete] id inválido', id);
    return false;
  }
  const { error } = await supabase
    .from('conductores')
    .delete()
    .eq('id', conductorId)
    .eq('empresa_id', empresaId);
  if (error) {
    console.error('[conductores delete]', error.message, error);
    return false;
  }
  return true;
}
