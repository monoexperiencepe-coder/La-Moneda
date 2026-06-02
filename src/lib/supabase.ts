import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

if (!url || !anonKey) {
  console.warn(
    '[Supabase] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env — las consultas fallarán hasta completarlas.',
  );
}

/** Cliente público (anon). No usar service_role en el frontend. */
export const supabase = createClient(url, anonKey, {
  realtime: {
    logger:
      import.meta.env.DEV || import.meta.env.VITE_REALTIME_DEBUG === '1'
        ? (kind: string, msg: string, data?: unknown) => {
            console.info('[realtime:transport]', { kind, msg, data });
          }
        : undefined,
  },
});
