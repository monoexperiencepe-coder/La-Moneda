/** Normaliza placa para comparación y persistencia (trim, mayúsculas, espacios colapsados). */
export function normalizePlaca(placa: string): string {
  return placa.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function placasMatch(a: string, b: string): boolean {
  return normalizePlaca(a) === normalizePlaca(b);
}
