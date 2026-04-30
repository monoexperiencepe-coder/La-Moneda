import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { gastoToInsert, mapGastoRow } from './supabaseMappers';
import type { Gasto } from '../data/types';

export async function fetchGastos(): Promise<Gasto[]> {
  if (!EMPRESA_ID) return [];
  const { data, error } = await supabase
    .from('gastos')
    .select('*')
    .eq('empresa_id', EMPRESA_ID)
    .order('fecha', { ascending: false })
    .order('id', { ascending: false });
  if (error) {
    console.error('[gastos]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapGastoRow(r as Record<string, unknown>));
}

export async function insertGasto(row: Omit<Gasto, 'id' | 'createdAt'>): Promise<Gasto | null> {
  if (!EMPRESA_ID) return null;
  const { data, error } = await supabase
    .from('gastos')
    .insert(gastoToInsert(EMPRESA_ID, row))
    .select('*')
    .single();
  if (error) {
    console.error('[gastos insert]', error.message);
    return null;
  }
  return data ? mapGastoRow(data as Record<string, unknown>) : null;
}

export async function removeGasto(id: number): Promise<boolean> {
  if (!EMPRESA_ID) return false;
  const { error } = await supabase
    .from('gastos')
    .delete()
    .eq('id', id)
    .eq('empresa_id', EMPRESA_ID);
  if (error) {
    console.error('[gastos delete]', error.message);
    return false;
  }
  return true;
}
