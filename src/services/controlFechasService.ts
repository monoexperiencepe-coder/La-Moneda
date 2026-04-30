import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { controlFechaToInsert, mapControlFechaRow } from './supabaseMappers';
import type { ControlFecha } from '../data/types';

export async function fetchControlFechas(): Promise<ControlFecha[]> {
  if (!EMPRESA_ID) return [];
  const { data, error } = await supabase
    .from('control_fechas')
    .select('*')
    .eq('empresa_id', EMPRESA_ID)
    .order('fecha_vencimiento', { ascending: true })
    .order('id', { ascending: true });
  if (error) {
    console.error('[control_fechas]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapControlFechaRow(r as Record<string, unknown>));
}

export async function insertControlFecha(row: Omit<ControlFecha, 'id' | 'createdAt'>): Promise<ControlFecha | null> {
  if (!EMPRESA_ID) return null;
  const { data, error } = await supabase
    .from('control_fechas')
    .insert(controlFechaToInsert(EMPRESA_ID, row))
    .select('*')
    .single();
  if (error) {
    console.error('[control_fechas insert]', error.message);
    return null;
  }
  return data ? mapControlFechaRow(data as Record<string, unknown>) : null;
}

export async function removeControlFecha(id: number): Promise<boolean> {
  if (!EMPRESA_ID) return false;
  const { error } = await supabase
    .from('control_fechas')
    .delete()
    .eq('id', id)
    .eq('empresa_id', EMPRESA_ID);
  if (error) {
    console.error('[control_fechas delete]', error.message);
    return false;
  }
  return true;
}
