import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { conductorPatchToSnake, conductorToInsert, mapConductorRow } from './supabaseMappers';
import type { Conductor } from '../data/types';

export async function fetchConductores(): Promise<Conductor[]> {
  if (!EMPRESA_ID) return [];
  const { data, error } = await supabase
    .from('conductores')
    .select('*')
    .eq('empresa_id', EMPRESA_ID)
    .order('id', { ascending: false });
  if (error) {
    console.error('[conductores]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapConductorRow(r as Record<string, unknown>));
}

export async function insertConductor(row: Omit<Conductor, 'id' | 'createdAt'>): Promise<Conductor | null> {
  if (!EMPRESA_ID) return null;
  const { data, error } = await supabase
    .from('conductores')
    .insert(conductorToInsert(EMPRESA_ID, row))
    .select('*')
    .single();
  if (error) {
    console.error('[conductores insert]', error.message);
    return null;
  }
  return data ? mapConductorRow(data as Record<string, unknown>) : null;
}

export async function patchConductor(
  id: number,
  patch: Partial<Omit<Conductor, 'id' | 'createdAt'>>,
): Promise<Conductor | null> {
  if (!EMPRESA_ID) return null;
  const snake = conductorPatchToSnake(patch);
  if (Object.keys(snake).length === 0) {
    const { data: cur } = await supabase
      .from('conductores')
      .select('*')
      .eq('id', id)
      .eq('empresa_id', EMPRESA_ID)
      .maybeSingle();
    return cur ? mapConductorRow(cur as Record<string, unknown>) : null;
  }
  const { data, error } = await supabase
    .from('conductores')
    .update(snake)
    .eq('id', id)
    .eq('empresa_id', EMPRESA_ID)
    .select('*')
    .single();
  if (error) {
    console.error('[conductores update]', error.message);
    return null;
  }
  return data ? mapConductorRow(data as Record<string, unknown>) : null;
}

export async function removeConductor(id: number): Promise<boolean> {
  if (!EMPRESA_ID) return false;
  const { error } = await supabase
    .from('conductores')
    .delete()
    .eq('id', id)
    .eq('empresa_id', EMPRESA_ID);
  if (error) {
    console.error('[conductores delete]', error.message);
    return false;
  }
  return true;
}
