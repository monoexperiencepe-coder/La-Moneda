import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { ingresoToInsert, mapIngresoRow } from './supabaseMappers';
import type { Ingreso } from '../data/types';

export async function fetchIngresos(): Promise<Ingreso[]> {
  if (!EMPRESA_ID) return [];
  const { data, error } = await supabase
    .from('ingresos')
    .select('*')
    .eq('empresa_id', EMPRESA_ID)
    .order('fecha', { ascending: false })
    .order('id', { ascending: false });
  if (error) {
    console.error('[ingresos]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapIngresoRow(r as Record<string, unknown>));
}

export async function insertIngreso(row: Omit<Ingreso, 'id' | 'createdAt'>): Promise<Ingreso | null> {
  if (!EMPRESA_ID) return null;
  const { data, error } = await supabase
    .from('ingresos')
    .insert(ingresoToInsert(EMPRESA_ID, row))
    .select('*')
    .single();
  if (error) {
    console.error('[ingresos insert]', error.message);
    return null;
  }
  return data ? mapIngresoRow(data as Record<string, unknown>) : null;
}

export async function removeIngreso(id: number): Promise<boolean> {
  if (!EMPRESA_ID) return false;
  const { error } = await supabase
    .from('ingresos')
    .delete()
    .eq('id', id)
    .eq('empresa_id', EMPRESA_ID);
  if (error) {
    console.error('[ingresos delete]', error.message);
    return false;
  }
  return true;
}
