/** Logs DEV para diagnosticar AI Focus Mode y narrativa del copiloto. */
export function isAiFocusDebugEnabled(): boolean {
  return import.meta.env.VITE_AI_FOCUS_DEBUG === '1';
}

export function aiFocusDevLog(event: string, data?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  if (data) console.log(event, data);
  else console.log(event);
}

export function narrativeDevLog(event: string, data?: Record<string, unknown>): void {
  aiFocusDevLog(event, data);
}
