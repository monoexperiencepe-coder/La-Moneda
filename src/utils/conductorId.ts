import type { Conductor } from '../data/types';
import { UUID_REGEX_FLAT } from './uuidColumn';

/** PK real en Supabase: `uuid` (producción). Soporta también bigint serial legado como string. */
export type ConductorId = string;

function isPositiveIntString(t: string): boolean {
  if (!/^\d+$/.test(t)) return false;
  const n = Number(t);
  return Number.isFinite(n) && n > 0;
}

/**
 * Normaliza el id de conductor desde Postgres/PostgREST.
 * - UUID → string intacto
 * - bigint/serial → string decimal
 * - nunca devuelve "0" ni string vacío (inválido → '')
 */
export function mapConductorId(v: unknown): ConductorId {
  if (v == null || v === '') return '';

  if (typeof v === 'bigint') {
    const s = v.toString();
    return s !== '0' ? s : '';
  }

  if (typeof v === 'number') {
    if (Number.isFinite(v) && v > 0) return String(v);
    return '';
  }

  if (typeof v === 'string') {
    const t = v.trim();
    if (!t || t === '0') return '';
    if (UUID_REGEX_FLAT.test(t)) return t;
    if (isPositiveIntString(t)) return t;
    return '';
  }

  return '';
}

export function isValidConductorId(id: unknown): id is ConductorId {
  if (id == null || id === '') return false;
  if (typeof id === 'number') {
    if (!Number.isFinite(id) || id <= 0) return false;
    return true;
  }
  const t = String(id).trim();
  if (!t || t === '0') return false;
  if (UUID_REGEX_FLAT.test(t)) return true;
  if (isPositiveIntString(t)) return true;
  return false;
}

/** Para .eq('id', …) en Supabase: siempre string normalizado. */
export function normalizeConductorIdForQuery(id: unknown): ConductorId {
  if (typeof id === 'string') {
    const t = id.trim();
    if (isValidConductorId(t)) return t;
    return '';
  }
  if (typeof id === 'number' && Number.isFinite(id) && id > 0) {
    return String(id);
  }
  return mapConductorId(id);
}

export function logConductorIdDiagnostics(conductores: Conductor[]): void {
  const invalid: { id: string; nombres: string; apellidos: string }[] = [];
  const counts = new Map<string, number>();

  for (const c of conductores) {
    if (!isValidConductorId(c.id)) {
      invalid.push({ id: String(c.id), nombres: c.nombres, apellidos: c.apellidos });
    } else {
      counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
    }
  }

  const duplicates = [...counts.entries()].filter(([, n]) => n > 1);

  if (invalid.length > 0) {
    console.warn(
      `[conductores] ${invalid.length} conductor(es) sin id válido (vacío, 0 o corrupto).`,
      invalid.slice(0, 10),
    );
  }
  if (duplicates.length > 0) {
    console.warn(
      '[conductores] ids duplicados en lista cargada:',
      duplicates.map(([id, count]) => ({ id, count })),
    );
  }
}
