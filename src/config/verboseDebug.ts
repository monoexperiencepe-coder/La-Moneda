/** Logs masivos de depuración (solo con VITE_VERBOSE_DEBUG=1 en .env). */
export function isVerboseDebug(): boolean {
  return String(import.meta.env.VITE_VERBOSE_DEBUG ?? '').trim() === '1';
}
