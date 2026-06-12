import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { mapPendienteRow, pendientePatchToSnake, pendienteToInsert } from './supabaseMappers';
import type { Pendiente } from '../data/types';
import { getAuthenticatedUserIdForAudit } from './authAuditUser';

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

/** @param tenantEmpresaId Preferir `profile.empresa_id` (RLS). */
export async function fetchPendientes(tenantEmpresaId?: string | null): Promise<Pendiente[]> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return [];
  const { data, error } = await supabase
    .from('pendientes')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('fecha', { ascending: false })
    .order('id', { ascending: false });
  if (error) {
    console.error('[pendientes]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapPendienteRow(r as Record<string, unknown>));
}

export async function insertPendiente(
  row: Omit<Pendiente, 'id' | 'createdAt'>,
  tenantEmpresaId?: string | null,
  creator?: { id: string; name: string } | null,
): Promise<Pendiente | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return null;
  const uid = creator?.id ?? (await getAuthenticatedUserIdForAudit());
  const rowWithCreator: Omit<Pendiente, 'id' | 'createdAt'> = {
    ...row,
    createdBy: uid ?? row.createdBy ?? null,
    createdByName: creator?.name ?? row.createdByName ?? null,
  };
  const { data, error } = await supabase
    .from('pendientes')
    .insert(pendienteToInsert(empresaId, rowWithCreator))
    .select('*')
    .single();
  if (error) {
    console.error('[pendientes insert]', error.message);
    return null;
  }
  return data ? mapPendienteRow(data as Record<string, unknown>) : null;
}

export async function patchPendiente(
  id: number,
  patch: Partial<Omit<Pendiente, 'id' | 'createdAt'>>,
  tenantEmpresaId?: string | null,
): Promise<Pendiente | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return null;
  const snake = pendientePatchToSnake(patch);
  if (Object.keys(snake).length === 0) {
    const { data: cur } = await supabase
      .from('pendientes')
      .select('*')
      .eq('id', id)
      .eq('empresa_id', empresaId)
      .maybeSingle();
    return cur ? mapPendienteRow(cur as Record<string, unknown>) : null;
  }
  if (snake.metadata && typeof snake.metadata === 'object') {
    const { data: cur } = await supabase
      .from('pendientes')
      .select('metadata')
      .eq('id', id)
      .eq('empresa_id', empresaId)
      .maybeSingle();
    const prevMeta =
      cur?.metadata && typeof cur.metadata === 'object' && !Array.isArray(cur.metadata)
        ? (cur.metadata as Record<string, unknown>)
        : {};
    snake.metadata = { ...prevMeta, ...(snake.metadata as Record<string, unknown>) };
  }
  const { data, error } = await supabase
    .from('pendientes')
    .update(snake)
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .select('*')
    .single();
  if (error) {
    console.error('[pendientes update]', error.message);
    return null;
  }
  return data ? mapPendienteRow(data as Record<string, unknown>) : null;
}

export async function removePendiente(id: number, tenantEmpresaId?: string | null): Promise<boolean> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return false;
  const uid = await getAuthenticatedUserIdForAudit();
  const deletedAt = new Date().toISOString();

  const { data: cur, error: fetchErr } = await supabase
    .from('pendientes')
    .select('metadata')
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (fetchErr) {
    console.error('[pendientes soft delete fetch]', fetchErr.message);
    return false;
  }
  const prevMeta =
    cur?.metadata && typeof cur.metadata === 'object' && !Array.isArray(cur.metadata)
      ? (cur.metadata as Record<string, unknown>)
      : {};
  const metadata = { ...prevMeta, deleted_at: deletedAt, deleted_by: uid ?? null };

  const { error } = await supabase
    .from('pendientes')
    .update({ deleted_at: deletedAt, metadata })
    .eq('id', id)
    .eq('empresa_id', empresaId);
  if (error) {
    console.error('[pendientes soft delete]', error.message);
    return false;
  }
  return true;
}
