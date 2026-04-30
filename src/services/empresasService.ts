import { supabase } from '../lib/supabase';

/**
 * Prueba de lectura contra la tabla `empresas` con la clave anon.
 * Útil para validar URL, anon key y RLS antes de migrar mocks.
 */
export async function testConexion() {
  const { data, error } = await supabase.from('empresas').select('*');
  return { data, error };
}
