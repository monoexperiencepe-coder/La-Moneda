import type { Gasto } from '../data/types';

export interface HistorialYearsSource {
  label: string;
  years: number[];
}

/** Extrae años únicos de `fecha` (YYYY-MM-DD), orden descendente. */
export function extractYearsFromGastos(
  gastos: Iterable<Pick<Gasto, 'fecha'>>,
  opts?: { minYear?: number; maxYear?: number },
): number[] {
  const min = opts?.minYear ?? 1900;
  const max = opts?.maxYear ?? 2100;
  const ys = new Set<number>();
  for (const g of gastos) {
    const y = Number(String(g.fecha).slice(0, 4));
    if (Number.isFinite(y) && y >= min && y <= max) ys.add(y);
  }
  return [...ys].sort((a, b) => b - a);
}

/** Une fuentes de años sin duplicar; reporta origen para debug. */
export function mergeHistorialYears(sources: HistorialYearsSource[]): {
  years: number[];
  source: string;
} {
  const ys = new Set<number>();
  const used: string[] = [];
  for (const s of sources) {
    if (s.years.length === 0) continue;
    used.push(s.label);
    for (const y of s.years) ys.add(y);
  }
  const years = [...ys].sort((a, b) => b - a);
  const source = used.length === 0 ? 'none' : used.length === 1 ? used[0]! : used.join('+');
  return { years, source };
}
