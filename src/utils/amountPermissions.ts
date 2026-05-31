import type { AppRole } from '../data/types';

/** Ventana de visibilidad temporal para contador (ms). */
export const AMOUNT_VISIBILITY_WINDOW_MS = 24 * 60 * 60 * 1000;

export const MASKED_AMOUNT_PEN = 'S/ •••••';
export const MASKED_AMOUNT_USD = 'US$ •••••';
export const MASKED_AMOUNT_HINT = 'Oculto por permisos';
export const CONTADOR_24H_VISIBILITY_HINT = 'Visible para ti por 24h';

/** Clave interna en `excel_extra` hasta migración `created_by` en BD. */
export const LM_CREATED_BY_KEY = '_lm_created_by';

export function canViewAmountsGlobal(role: AppRole | string | null | undefined): boolean {
  const r = (role ?? '').trim().toLowerCase();
  return r === 'admin' || r === 'socio';
}

export function canAccessAI(role: AppRole | string | null | undefined): boolean {
  const r = (role ?? '').trim().toLowerCase();
  return r === 'admin' || r === 'socio';
}

/**
 * ¿El instante `createdAt` cae dentro de las últimas 24 h respecto a `nowMs`?
 * Usa epoch UTC (Date.parse ISO) — independiente de zona horaria local.
 */
export function isWithinLast24HoursUtc(
  createdAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (createdAt == null || String(createdAt).trim() === '') return false;
  const createdMs = Date.parse(String(createdAt).trim());
  if (Number.isNaN(createdMs)) return false;
  const elapsed = nowMs - createdMs;
  return elapsed >= 0 && elapsed < AMOUNT_VISIBILITY_WINDOW_MS;
}

export function canViewAmountForRecord(params: {
  role: AppRole | string | null | undefined;
  userId: string | null | undefined;
  recordCreatedBy: string | null | undefined;
  recordCreatedAt: string | null | undefined;
  nowMs?: number;
}): boolean {
  const role = (params.role ?? '').trim().toLowerCase();
  if (role === 'admin' || role === 'socio') return true;
  if (role === 'operador') return false;
  if (role === 'contador') {
    const uid = (params.userId ?? '').trim();
    const creator = (params.recordCreatedBy ?? '').trim();
    if (!uid || !creator || creator !== uid) return false;
    return isWithinLast24HoursUtc(params.recordCreatedAt, params.nowMs);
  }
  return false;
}

export function resolveRecordCreatedBy(record: {
  createdBy?: string | null;
  excelExtra?: Record<string, unknown> | null;
  /** Fila cruda Supabase (p. ej. created_by futuro). */
  raw?: Record<string, unknown> | null;
}): string | null {
  const fromField = record.createdBy?.trim();
  if (fromField) return fromField;
  const rawBy = record.raw?.created_by;
  if (rawBy != null && String(rawBy).trim() !== '') return String(rawBy).trim();
  const extra = record.excelExtra;
  if (extra && typeof extra[LM_CREATED_BY_KEY] === 'string') {
    const v = String(extra[LM_CREATED_BY_KEY]).trim();
    if (v) return v;
  }
  return null;
}

export function stampCreatedByExtra(
  excelExtra: Record<string, unknown> | null | undefined,
  userId: string,
): Record<string, unknown> {
  return { ...(excelExtra ?? {}), [LM_CREATED_BY_KEY]: userId };
}

export function isContadorTemporaryRecordAmountVisible(params: {
  role: AppRole | string | null | undefined;
  userId: string | null | undefined;
  recordCreatedBy: string | null | undefined;
  recordCreatedAt: string | null | undefined;
  nowMs?: number;
}): boolean {
  return (
    (params.role ?? '').trim().toLowerCase() === 'contador' &&
    canViewAmountForRecord(params)
  );
}
