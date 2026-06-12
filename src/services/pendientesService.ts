import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import {
  mapPendienteRow,
  pendientePatchToSnake,
  pendienteToInsert,
  pendienteToInsertLegacy,
} from './supabaseMappers';
import type { Pendiente } from '../data/types';
import { getAuthenticatedUserIdForAudit } from './authAuditUser';
import { formatSupabaseError, isPendienteSchemaColumnError } from './pendientesDbErrors';

function resolveTenantId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

function stripPendienteOptionalColumns(payload: Record<string, unknown>): Record<string, unknown> {
  const next = { ...payload };
  delete next.titulo;
  delete next.metadata;
  delete next.created_by;
  delete next.resolved_at;
  delete next.resolved_by;
  delete next.deleted_at;
  return next;
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
    console.error('[pendientes fetch]', formatSupabaseError(error), error);
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

  const attempts: Record<string, unknown>[] = [
    pendienteToInsert(empresaId, rowWithCreator),
    pendienteToInsertLegacy(empresaId, rowWithCreator),
  ];

  let lastError: { message: string; code?: string; details?: string; hint?: string } | null = null;

  for (let i = 0; i < attempts.length; i += 1) {
    const payload = attempts[i]!;
    const { data, error } = await supabase.from('pendientes').insert(payload).select('*').single();
    if (!error) {
      return data ? mapPendienteRow(data as Record<string, unknown>) : null;
    }
    lastError = error;
    console.error('[pendientes insert]', formatSupabaseError(error), { attempt: i + 1, payload, error });
    if (!isPendienteSchemaColumnError(error) || i >= attempts.length - 1) break;
  }

  if (lastError) {
    console.error(
      '[pendientes insert] falló tras reintentos. Si el error menciona columnas faltantes, ejecuta supabase/migration_pendientes_redesign_apply.sql',
      lastError,
    );
  }
  return null;
}

export async function patchPendiente(
  id: number,
  patch: Partial<Omit<Pendiente, 'id' | 'createdAt'>>,
  tenantEmpresaId?: string | null,
): Promise<Pendiente | null> {
  const empresaId = resolveTenantId(tenantEmpresaId);
  if (!empresaId) return null;
  let snake = pendientePatchToSnake(patch);
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

  let { data, error } = await supabase
    .from('pendientes')
    .update(snake)
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .select('*')
    .single();

  if (error && isPendienteSchemaColumnError(error)) {
    const fallback = stripPendienteOptionalColumns(snake);
    if (Object.keys(fallback).length > 0) {
      ({ data, error } = await supabase
        .from('pendientes')
        .update(fallback)
        .eq('id', id)
        .eq('empresa_id', empresaId)
        .select('*')
        .single());
    }
  }

  if (error) {
    console.error('[pendientes update]', formatSupabaseError(error), error);
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
    .select('*')
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (fetchErr) {
    console.error('[pendientes soft delete fetch]', formatSupabaseError(fetchErr), fetchErr);
    return false;
  }
  const prevMeta =
    cur?.metadata && typeof cur.metadata === 'object' && !Array.isArray(cur.metadata)
      ? (cur.metadata as Record<string, unknown>)
      : {};
  const metadata = { ...prevMeta, deleted_at: deletedAt, deleted_by: uid ?? null };

  let { error } = await supabase
    .from('pendientes')
    .update({ deleted_at: deletedAt, metadata })
    .eq('id', id)
    .eq('empresa_id', empresaId);

  if (error && isPendienteSchemaColumnError(error)) {
    ({ error } = await supabase
      .from('pendientes')
      .update({ metadata })
      .eq('id', id)
      .eq('empresa_id', empresaId));
  }

  if (error) {
    console.error('[pendientes soft delete]', formatSupabaseError(error), error);
    return false;
  }
  return true;
}
