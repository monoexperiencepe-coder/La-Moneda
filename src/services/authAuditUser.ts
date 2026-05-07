import { supabase } from '../lib/supabase';

/** UUID v4 (acepta variantes 1–5 en el tercer grupo, como auth.users). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidAuditUserId(id: string | null | undefined): id is string {
  return typeof id === 'string' && UUID_RE.test(id.trim());
}

/**
 * Solo `auth.users.id` vía getUser(). Sin fallbacks legacy (env, "0", etc.).
 * Si no hay sesión o el id no es UUID, devuelve null y deja warning en consola.
 */
export async function getAuthenticatedUserIdForAudit(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!isValidAuditUserId(id)) {
    console.warn('No authenticated user for audit log');
    return null;
  }
  return id.trim();
}
