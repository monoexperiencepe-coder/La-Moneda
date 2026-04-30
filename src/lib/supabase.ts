import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

if (!url || !anonKey) {
  console.warn(
    '[Supabase] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env — las consultas fallarán hasta completarlas.',
  );
}

/** Cliente público (anon). No usar service_role en el frontend. */
export const supabase = createClient(url, anonKey);
