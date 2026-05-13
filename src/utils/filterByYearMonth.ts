/** Filtra filas con `fecha` ISO `YYYY-MM-DD` por año y/o mes (combos con `ALL`). */
export function filterRowsByYearMonth<T extends { fecha: string }>(
  rows: T[],
  year: string,
  month: string,
): T[] {
  let out = rows;
  if (year !== 'ALL') {
    out = out.filter((r) => r.fecha.startsWith(`${year}-`));
  }
  if (month !== 'ALL') {
    const mm = String(month).padStart(2, '0');
    out = out.filter((r) => r.fecha.slice(5, 7) === mm);
  }
  return out;
}
