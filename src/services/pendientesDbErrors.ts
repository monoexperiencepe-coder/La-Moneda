import type { PostgrestError } from '@supabase/supabase-js';

/** Columna o campo desconocido en PostgREST / Postgres (schema desactualizado). */
export function isPendienteSchemaColumnError(error: PostgrestError | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code ?? '');
  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
  if (code === 'PGRST204') return true;
  if (/could not find the .* column|column .* does not exist|42703/.test(text)) return true;
  return false;
}

export function formatSupabaseError(error: PostgrestError | null | undefined): string {
  if (!error) return 'Error desconocido en Supabase.';
  const parts = [error.message, error.details, error.hint].filter(
    (p): p is string => typeof p === 'string' && p.trim() !== '',
  );
  return parts.join(' — ') || 'Error desconocido en Supabase.';
}
