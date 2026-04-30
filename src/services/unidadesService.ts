import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { mapUnidadRow, unidadToInsert } from './supabaseMappers';
import type { UnidadRegistro } from '../data/types';

export async function fetchUnidades(): Promise<UnidadRegistro[]> {
  if (!EMPRESA_ID) return [];
  const { data, error } = await supabase
    .from('unidades')
    .select('*')
    .eq('empresa_id', EMPRESA_ID)
    .order('id', { ascending: false });
  if (error) {
    console.error('[unidades]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapUnidadRow(r as Record<string, unknown>));
}

export async function insertUnidad(row: Omit<UnidadRegistro, 'id' | 'createdAt'>): Promise<UnidadRegistro | null> {
  if (!EMPRESA_ID) return null;
  const { data, error } = await supabase
    .from('unidades')
    .insert(unidadToInsert(EMPRESA_ID, row))
    .select('*')
    .single();
  if (error) {
    console.error('[unidades insert]', error.message);
    return null;
  }
  return data ? mapUnidadRow(data as Record<string, unknown>) : null;
}

export async function removeUnidad(id: string): Promise<boolean> {
  if (!EMPRESA_ID || !id) return false;
  const { error } = await supabase
    .from('unidades')
    .delete()
    .eq('id', id)
    .eq('empresa_id', EMPRESA_ID);
  if (error) {
    console.error('[unidades delete]', error.message);
    return false;
  }
  return true;
}
