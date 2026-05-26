/** Logs DEV para diagnosticar AI Focus Mode. */
export function aiFocusDevLog(event: string, data?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  if (data) console.log(event, data);
  else console.log(event);
}
