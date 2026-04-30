import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { mapPendienteRow, pendientePatchToSnake, pendienteToInsert } from './supabaseMappers';
import type { Pendiente } from '../data/types';

export async function fetchPendientes(): Promise<Pendiente[]> {
  if (!EMPRESA_ID) return [];
  const { data, error } = await supabase
    .from('pendientes')
    .select('*')
    .eq('empresa_id', EMPRESA_ID)
    .order('fecha', { ascending: false })
    .order('id', { ascending: false });
  if (error) {
    console.error('[pendientes]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapPendienteRow(r as Record<string, unknown>));
}

export async function insertPendiente(row: Omit<Pendiente, 'id' | 'createdAt'>): Promise<Pendiente | null> {
  if (!EMPRESA_ID) return null;
  const { data, error } = await supabase
    .from('pendientes')
    .insert(pendienteToInsert(EMPRESA_ID, row))
    .select('*')
    .single();
  if (error) {
    console.error('[pendientes insert]', error.message);
    return null;
  }
  return data ? mapPendienteRow(data as Record<string, unknown>) : null;
}

export async function patchPendiente(
  id: number,
  patch: Partial<Omit<Pendiente, 'id' | 'createdAt'>>,
): Promise<Pendiente | null> {
  if (!EMPRESA_ID) return null;
  const snake = pendientePatchToSnake(patch);
  if (Object.keys(snake).length === 0) {
    const { data: cur } = await supabase
      .from('pendientes')
      .select('*')
      .eq('id', id)
      .eq('empresa_id', EMPRESA_ID)
      .maybeSingle();
    return cur ? mapPendienteRow(cur as Record<string, unknown>) : null;
  }
  const { data, error } = await supabase
    .from('pendientes')
    .update(snake)
    .eq('id', id)
    .eq('empresa_id', EMPRESA_ID)
    .select('*')
    .single();
  if (error) {
    console.error('[pendientes update]', error.message);
    return null;
  }
  return data ? mapPendienteRow(data as Record<string, unknown>) : null;
}

export async function removePendiente(id: number): Promise<boolean> {
  if (!EMPRESA_ID) return false;
  const { error } = await supabase.from('pendientes').delete().eq('id', id).eq('empresa_id', EMPRESA_ID);
  if (error) {
    console.error('[pendientes delete]', error.message);
    return false;
  }
  return true;
}
