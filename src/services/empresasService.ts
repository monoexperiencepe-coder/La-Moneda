import { supabase } from '../lib/supabase';

/**
 * Prueba de lectura contra `empresas` (requiere sesión authenticated + RLS tenant).
 * Anon sin sesión debe devolver error o 0 filas tras migration_empresas_user_profiles_rls_fase1.
 */
export async function testConexion() {
  const { data, error } = await supabase.from('empresas').select('*');
  return { data, error };
}
