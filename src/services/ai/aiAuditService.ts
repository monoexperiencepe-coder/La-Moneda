import { supabase } from '../../lib/supabase';
import { EMPRESA_ID } from '../../config/app';
import { getAuthenticatedUserIdForAudit } from '../authAuditUser';
import type { AiAuditEntry } from '../../modules/ai/types';

function resolveEmpresaId(tenantEmpresaId?: string | null): string | null {
  const id = (tenantEmpresaId ?? EMPRESA_ID)?.trim();
  return id || null;
}

function previewQuestion(text: string, max = 120): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Registra uso del asistente (sin prompt completo). */
export async function insertAiAssistantAuditLog(
  entry: AiAuditEntry,
  tenantEmpresaId?: string | null,
): Promise<void> {
  const uid = await getAuthenticatedUserIdForAudit();
  const empresaId = resolveEmpresaId(tenantEmpresaId);
  if (!uid || !empresaId) return;

  const { error } = await supabase.from('ai_assistant_logs').insert({
    user_id: uid,
    empresa_id: empresaId,
    question_preview: previewQuestion(entry.questionPreview),
    tools_used: entry.toolsUsed,
    duration_ms: Math.max(0, Math.trunc(entry.durationMs)),
    status: entry.status,
  });

  if (error && import.meta.env.DEV) {
    console.warn('[ai_assistant_logs]', error.message);
  }
}
