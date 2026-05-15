import { supabase } from '../lib/supabase';
import type { FinancialAuditLog } from '../data/types';
import { isValidAuditUserId } from './authAuditUser';
import { cleanUuid, deepStripZeroIdFields } from '../utils/uuidColumn';

export interface FinancialAuditLogInsert {
  user_id: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  reason?: string | null;
}

/** Log detallado de errores PostgREST / Supabase (diagnóstico). */
export function logPostgrestError(scope: string, error: { message: string; code?: string; details?: string; hint?: string }): void {
  console.error(`[${scope}]`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

function mapFinancialAuditRow(r: Record<string, unknown>): FinancialAuditLog {
  return {
    id: Number(r.id),
    userId: String(r.user_id ?? ''),
    actionType: String(r.action_type ?? ''),
    entityType: String(r.entity_type ?? ''),
    entityId: String(r.entity_id ?? ''),
    oldData: (r.old_data as Record<string, unknown> | null) ?? null,
    newData: (r.new_data as Record<string, unknown> | null) ?? null,
    reason: (r.reason as string | null) ?? null,
    createdAt: String(r.created_at ?? ''),
  };
}

export async function insertFinancialAuditLog(row: FinancialAuditLogInsert): Promise<boolean> {
  const uidFromClean = cleanUuid(row.user_id);
  const uid =
    uidFromClean ??
    (typeof row.user_id === 'string' && row.user_id.trim() !== '0' ? row.user_id.trim() : '');
  if (!isValidAuditUserId(uid)) {
    console.warn('No authenticated user for audit log', { user_id: row.user_id });
    return true;
  }
  const sanitized: FinancialAuditLogInsert = {
    ...row,
    user_id: uid,
    old_data: row.old_data
      ? (deepStripZeroIdFields(row.old_data) as Record<string, unknown>)
      : row.old_data,
    new_data: row.new_data
      ? (deepStripZeroIdFields(row.new_data) as Record<string, unknown>)
      : row.new_data,
  };
  const { error } = await supabase.from('financial_audit_logs').insert(sanitized);
  if (error) {
    logPostgrestError('financial_audit_logs insert', error);
    return false;
  }
  return true;
}

export async function fetchFinancialAuditLogs(limit = 200): Promise<FinancialAuditLog[]> {
  const { data, error } = await supabase
    .from('financial_audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    logPostgrestError('financial_audit_logs fetch', error);
    return [];
  }
  return (data ?? []).map((r) => mapFinancialAuditRow(r as Record<string, unknown>));
}

export async function deleteFinancialAuditLog(id: number): Promise<boolean> {
  const { error } = await supabase.from('financial_audit_logs').delete().eq('id', id);
  if (error) {
    logPostgrestError('financial_audit_logs delete one', error);
    return false;
  }
  return true;
}

/** Borra todos los logs (admin). Filtro amplio requerido por PostgREST. */
export async function clearFinancialAuditLogs(): Promise<boolean> {
  const { error } = await supabase
    .from('financial_audit_logs')
    .delete()
    .gte('created_at', '1970-01-01T00:00:00.000Z');
  if (error) {
    logPostgrestError('financial_audit_logs clear all', error);
    return false;
  }
  return true;
}

/** Borra logs con created_at estrictamente anterior al instante dado (`YYYY-MM-DD` → inicio UTC ese día). */
export async function clearFinancialAuditLogsBefore(isoDateEndExclusive: string): Promise<boolean> {
  const raw = isoDateEndExclusive.trim();
  if (!raw) return false;
  const d = raw.includes('T') ? raw : `${raw}T00:00:00.000Z`;
  const { error } = await supabase.from('financial_audit_logs').delete().lt('created_at', d);
  if (error) {
    logPostgrestError('financial_audit_logs clear before', error);
    return false;
  }
  return true;
}
