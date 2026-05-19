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

export async function fetchConductores(): Promise<Conductor[]> {
  if (!EMPRESA_ID) return [];
  const { data, error } = await supabase
    .from('conductores')
    .select('*')
    .eq('empresa_id', EMPRESA_ID)
    .order('id', { ascending: false });
  if (error) {
    console.error('[conductores fetch]', error.message, error);
    return [];
  }
  const rows = (data ?? []).map((r) => mapConductorRow(r as Record<string, unknown>));
  logConductorIdDiagnostics(rows);
  return rows;
}

export async function insertConductor(row: Omit<Conductor, 'id' | 'createdAt'>): Promise<Conductor | null> {
  if (!EMPRESA_ID) return null;
  const { data, error } = await supabase
    .from('conductores')
    .insert(conductorToInsert(EMPRESA_ID, row))
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
): Promise<Conductor | null> {
  if (!EMPRESA_ID) {
    console.error('[conductores update] EMPRESA_ID no configurado');
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
    empresaId: EMPRESA_ID,
  });

  if (Object.keys(snake).length === 0) {
    const { data: cur, error: readErr } = await supabase
      .from('conductores')
      .select('*')
      .eq('id', conductorId)
      .eq('empresa_id', EMPRESA_ID)
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
    .eq('empresa_id', EMPRESA_ID)
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
      empresaId: EMPRESA_ID,
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

export async function removeConductor(id: ConductorId): Promise<boolean> {
  if (!EMPRESA_ID) return false;
  const conductorId = normalizeConductorIdForQuery(id);
  if (!isValidConductorId(conductorId)) {
    console.error('[conductores delete] id inválido', id);
    return false;
  }
  const { error } = await supabase
    .from('conductores')
    .delete()
    .eq('id', conductorId)
    .eq('empresa_id', EMPRESA_ID);
  if (error) {
    console.error('[conductores delete]', error.message, error);
    return false;
  }
  return true;
}
