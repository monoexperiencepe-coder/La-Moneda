import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import {
  mapRegistroTiempoRow,
  registroTiempoPatchToSnake,
  registroTiempoToInsert,
} from './supabaseMappers';
import type { RegistroTiempo } from '../data/types';

export async function fetchRegistrosTiempo(): Promise<RegistroTiempo[]> {
  if (!EMPRESA_ID) return [];
  const { data, error } = await supabase
    .from('registros_tiempo')
    .select('*')
    .eq('empresa_id', EMPRESA_ID)
    .order('fecha', { ascending: false })
    .order('id', { ascending: false });
  if (error) {
    console.error('[registros_tiempo]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapRegistroTiempoRow(r as Record<string, unknown>));
}

export async function insertRegistroTiempo(
  row: Omit<RegistroTiempo, 'id' | 'createdAt'>,
): Promise<RegistroTiempo | null> {
  if (!EMPRESA_ID) return null;
  const { data, error } = await supabase
    .from('registros_tiempo')
    .insert(registroTiempoToInsert(EMPRESA_ID, row))
    .select('*')
    .single();
  if (error) {
    console.error('[registros_tiempo insert]', error.message);
    return null;
  }
  return data ? mapRegistroTiempoRow(data as Record<string, unknown>) : null;
}

export async function patchRegistroTiempo(
  id: number,
  patch: Partial<Omit<RegistroTiempo, 'id' | 'createdAt'>>,
): Promise<RegistroTiempo | null> {
  if (!EMPRESA_ID) return null;
  const snake = registroTiempoPatchToSnake(patch);
  if (Object.keys(snake).length === 0) {
    const { data: cur } = await supabase
      .from('registros_tiempo')
      .select('*')
      .eq('id', id)
      .eq('empresa_id', EMPRESA_ID)
      .maybeSingle();
    return cur ? mapRegistroTiempoRow(cur as Record<string, unknown>) : null;
  }
  const { data, error } = await supabase
    .from('registros_tiempo')
    .update(snake)
    .eq('id', id)
    .eq('empresa_id', EMPRESA_ID)
    .select('*')
    .single();
  if (error) {
    console.error('[registros_tiempo update]', error.message);
    return null;
  }
  return data ? mapRegistroTiempoRow(data as Record<string, unknown>) : null;
}

export async function removeRegistroTiempo(id: number): Promise<boolean> {
  if (!EMPRESA_ID) return false;
  const { error } = await supabase.from('registros_tiempo').delete().eq('id', id).eq('empresa_id', EMPRESA_ID);
  if (error) {
    console.error('[registros_tiempo delete]', error.message);
    return false;
  }
  return true;
}
