import { supabase } from '../lib/supabase';

export type UserProfileRow = { id: string; name: string; email: string };

/** Mapa id → etiqueta para UI (solo tiene sentido con RLS que permita leer filas ajenas a admins). */
export async function fetchUserProfilesLookup(): Promise<Map<string, UserProfileRow>> {
  const { data, error } = await supabase.from('user_profiles').select('id,name,email');
  if (error || !data?.length) {
    return new Map();
  }
  const m = new Map<string, UserProfileRow>();
  for (const row of data as UserProfileRow[]) {
    m.set(row.id, {
      id: row.id,
      name: row.name ?? '',
      email: row.email ?? '',
    });
  }
  return m;
}
