/** UUID estándar (hex + guiones), sin validar variante RFC a fondo. */
export const UUID_REGEX_FLAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Solo para columnas que deben ser UUID en Postgres.
 * Cualquier otro string (p. ej. "123" numérico) → null.
 */
export function cleanUuid(value: unknown): string | null {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') return null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (t === '' || t === '0') return null;
    if (UUID_REGEX_FLAT.test(t)) return t;
    return null;
  }
  return null;
}

/** En payloads PostgREST: `0` / `"0"` en `*_id` suelen romper columnas uuid. Incluye bigint 0n. */
export function sanitizePostgrestRowZeroIdColumns(row: Record<string, unknown>): void {
  for (const key of Object.keys(row)) {
    if (!key.endsWith('_id')) continue;
    const v = row[key];
    if (v === 0 || v === '0' || (typeof v === 'bigint' && v === BigInt(0))) {
      row[key] = null;
    }
  }
}

/** Recorre objetos/arrays y anula `*_id` que sean 0 o "0" (p. ej. jsonb de auditoría). */
export function deepStripZeroIdFields(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(deepStripZeroIdFields);
  if (typeof value !== 'object') return value;
  const o = value as Record<string, unknown>;
  const out: Record<string, unknown> = { ...o };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (k.endsWith('_id') && (v === 0 || v === '0' || (typeof v === 'bigint' && v === BigInt(0)))) {
      out[k] = null;
    } else if (v != null && typeof v === 'object') {
      out[k] = deepStripZeroIdFields(v) as unknown;
    }
  }
  return out;
}

/** `0` / `"0"` / `0n` en valores que Postgres podría castear a uuid (jsonb, metadatos Excel, etc.). */
export function isZeroLikeUuidPoison(v: unknown): boolean {
  if (v === 0 || v === '0') return true;
  if (typeof v === 'bigint' && v === BigInt(0)) return true;
  if (typeof v === 'string' && v.trim() === '0') return true;
  return false;
}

/**
 * Claves que suelen guardar UUID (o FK mezclada uuid/bigint) en JSON anidado.
 * Cubre `vehicleId` / `fromVehicleId` además de `*_id`.
 */
export function jsonKeyLikelyStoresUuid(key: string): boolean {
  const k = key.toLowerCase();
  if (k === 'empresa_id' || k === 'user_id') return true;
  if (k.endsWith('_id')) return true;
  if (k.endsWith('uuid')) return true;
  if (k.endsWith('vehicleid') || k.includes('vehicle_id')) return true;
  if (k.endsWith('empresaid')) return true;
  return false;
}

/** Recorre json y convierte sentinels 0/"0" en null en claves tipo uuid/FK (p. ej. `excel_extra`). */
export function deepSanitizeUuidPoisonInJson(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(deepSanitizeUuidPoisonInJson);
  if (typeof value !== 'object') return value;
  const o = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) {
    let v = o[k];
    if (jsonKeyLikelyStoresUuid(k) && isZeroLikeUuidPoison(v)) {
      v = null;
    } else if (v != null && typeof v === 'object') {
      v = deepSanitizeUuidPoisonInJson(v) as unknown;
    }
    out[k] = v;
  }
  return out;
}

/** Valor estable para logs de auditoría (sin `Number(uuid)` → NaN). */
export function vehicleIdAuditScalar(v: unknown): string | number | null {
  if (v == null || v === '' || v === 0 || v === '0') return null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '' || t === '0') return null;
    if (UUID_REGEX_FLAT.test(t)) return t;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v === 'bigint') {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}
