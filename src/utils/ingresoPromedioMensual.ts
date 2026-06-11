/** Meses a usar como divisor del promedio mensual de ingresos para un año dado. */
export function ingresoPromedioMensualDivisor(year: number, referenceDate = new Date()): number {
  const currentYear = referenceDate.getFullYear();
  if (year < currentYear) return 12;
  if (year > currentYear) return 1;
  return referenceDate.getMonth() + 1;
}

export function ingresoPromedioMensualLabel(year: number, referenceDate = new Date()): string {
  const currentYear = referenceDate.getFullYear();
  if (year < currentYear) return 'Sobre 12 meses';
  const months = ingresoPromedioMensualDivisor(year, referenceDate);
  return `Sobre ${months} mes${months === 1 ? '' : 'es'} transcurridos`;
}
