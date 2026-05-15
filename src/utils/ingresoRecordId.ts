/**
 * PK de `public.ingresos`: puede ser `bigint` o `uuid` según el proyecto.
 * Nunca usar num() sobre uuid (NaN → 0 rompe delete y RLS).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ingresoPrimaryKeyFromRow(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v));
  const s = String(v).trim();
  return s;
}

/** Válido para delete: UUID, o entero bigint string > 0 (sin coerciones falsas). */
export function isValidIngresoPrimaryKey(id: string): boolean {
  const t = id.trim();
  if (!t || t === '0') return false;
  if (UUID_RE.test(t)) return true;
  return /^[1-9]\d*$/.test(t);
}

/** PK `public.gastos`: bigint o uuid (misma regla que ingresos; nunca `Number(uuid)`). */
export function gastoPrimaryKeyFromRow(v: unknown): string {
  return ingresoPrimaryKeyFromRow(v);
}

export function isValidGastoPrimaryKey(id: string): boolean {
  return isValidIngresoPrimaryKey(id);
}
