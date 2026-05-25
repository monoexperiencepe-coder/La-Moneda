/**
 * Helpers para deduplicar opciones de Select sin alterar datos en BD.
 */

export type SelectOption = { value: string; label: string };

/** Deduplica por `value` exacto (trim). Conserva la primera ocurrencia. */
export function dedupeOptionsByValue<T extends SelectOption>(options: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const opt of options) {
    const v = opt.value.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(opt);
  }
  return out;
}

/** Deduplica por clave derivada; conserva la primera ocurrencia. */
export function dedupeOptionsByKey<T extends SelectOption>(
  options: T[],
  keyFn: (opt: T) => string,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const opt of options) {
    const k = keyFn(opt).trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(opt);
  }
  return out;
}
