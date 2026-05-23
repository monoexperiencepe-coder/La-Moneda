/** Instrumentación DEV-only para auditar cuellos de botella (fetch, bootstrap, KPIs). */
export const DEV_PERF = import.meta.env.DEV;

export async function devPerfAsync<T>(
  label: string,
  fn: () => Promise<T>,
  meta?: (result: T) => Record<string, unknown>,
): Promise<T> {
  if (!DEV_PERF) return fn();
  const t0 = performance.now();
  console.time(`[perf] ${label}`);
  try {
    const result = await fn();
    const ms = Math.round(performance.now() - t0);
    console.timeEnd(`[perf] ${label}`);
    console.info(`[perf] ${label}`, {
      ms,
      ...(Array.isArray(result) ? { rows: result.length } : {}),
      ...(meta ? meta(result) : {}),
    });
    return result;
  } catch (err) {
    console.timeEnd(`[perf] ${label}`);
    throw err;
  }
}

/** Mide un useMemo costoso en Gastos u otras pantallas (solo DEV). */
export function devMemoPerf<T>(
  label: string,
  fn: () => T,
  context?: Record<string, unknown>,
): T {
  if (!DEV_PERF) return fn();
  const t0 = performance.now();
  const result = fn();
  const ms = Math.round(performance.now() - t0);
  console.debug(`[perf] ${label}`, {
    ms,
    ...context,
    ...(Array.isArray(result) ? { rows: result.length } : {}),
  });
  return result;
}
