/** Tablas cuyo evento Realtime requiere reconciliación adicional. */
const REFETCH_TABLES = new Set([
  'kilometrajes',
  'control_fechas',
  'financial_audit_logs',
]);

export function shouldRefetchAfterRealtime(table: string): boolean {
  return REFETCH_TABLES.has(table);
}
