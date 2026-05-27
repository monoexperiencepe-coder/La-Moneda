import { normKey } from '../../utils/normKey';

/** Clave de dedupe: ignora mayúsculas, tildes, espacios, guiones, underscores y slashes. */
export function subtipoDedupeKey(raw: string): string {
  return normKey(raw).replace(/[\s_\-/]+/g, '');
}
