import { supabase } from '../../lib/supabase';
import { buildAiSystemPrompt } from '../../modules/ai/prompts';
import { executeAiTool, type AiToolContext } from '../../modules/ai/tools/runner';
import type {
  AiAssistantApiResponse,
  AiChatMessage,
  AiStructuredResponse,
  AiToolCallRequest,
  AiToolName,
} from '../../modules/ai/types';
import {
  isFinancialOperadorRestricted,
  permissionUserFromAuth,
  type PermissionUser,
} from '../../utils/permissions';
import { insertAiAssistantAuditLog } from './aiAuditService';

type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
};

const MAX_TOOL_ROUNDS = 6;

function newMessageId(): string {
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseStructured(raw: string | null | undefined): AiStructuredResponse | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as AiStructuredResponse;
    if (typeof parsed.summary === 'string') return parsed;
  } catch {
    /* fallback below */
  }
  return { summary: raw.trim(), data: null, warnings: [], suggestedActions: [], confidence: null };
}

function buildContext(user: PermissionUser, empresaId: string): AiToolContext {
  return { user, empresaId };
}

async function invokeAiAssistant(body: {
  messages: OpenAiMessage[];
  userRole: string;
  isOperadorRestricted: boolean;
}): Promise<AiAssistantApiResponse> {
  const { data, error } = await supabase.functions.invoke('ai-assistant', { body });
  if (error) {
    return {
      status: 'error',
      error:
        error.message ||
        'No se pudo contactar al asistente IA. Verifica que la Edge Function ai-assistant esté desplegada y OPENAI_API_KEY configurada.',
    };
  }
  return (data ?? { status: 'error', error: 'Respuesta vacía del servidor' }) as AiAssistantApiResponse;
}

export async function sendAiAssistantMessage(opts: {
  message: string;
  history: AiChatMessage[];
  user: PermissionUser;
  email?: string | null;
  empresaId: string;
}): Promise<{ assistant: AiChatMessage; error?: string }> {
  const started = performance.now();
  const toolsUsed: AiToolName[] = [];
  const permissionUser = permissionUserFromAuth(opts.user, opts.email ?? null);
  const isOperador = isFinancialOperadorRestricted(permissionUser);
  const ctx = buildContext(permissionUser, opts.empresaId);

  const systemPrompt = buildAiSystemPrompt({
    userName: opts.user.name,
    userRole: opts.user.role,
    isOperadorRestricted: isOperador,
  });

  const messages: OpenAiMessage[] = [
    { role: 'system', content: systemPrompt },
    ...opts.history.slice(-8).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.structured?.summary ?? m.content,
    })),
    { role: 'user', content: opts.message.trim() },
  ];

  let lastAssistantText = '';
  let structured: AiStructuredResponse | null = null;
  let lastError: string | undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const res = await invokeAiAssistant({
      messages,
      userRole: opts.user.role,
      isOperadorRestricted: isOperador,
    });

    if (res.status === 'error') {
      lastError = res.error ?? 'Error del asistente';
      break;
    }

    if (res.status === 'needs_tools' && res.toolCalls?.length) {
      const assistantMsg: OpenAiMessage = {
        role: 'assistant',
        content: res.assistantText ?? null,
        tool_calls: res.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
      messages.push(assistantMsg);

      for (const call of res.toolCalls) {
        if (!toolsUsed.includes(call.name)) toolsUsed.push(call.name);
        const result = await executeAiTool(call.name, call.arguments, ctx);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.name,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    if (res.status === 'complete') {
      structured = res.structured ?? parseStructured(res.assistantText);
      lastAssistantText = structured?.summary ?? res.assistantText ?? '';
      if (res.toolsUsed?.length) {
        for (const t of res.toolsUsed) {
          if (!toolsUsed.includes(t)) toolsUsed.push(t);
        }
      }
      break;
    }
  }

  const durationMs = performance.now() - started;

  void insertAiAssistantAuditLog(
    {
      questionPreview: opts.message,
      toolsUsed,
      durationMs,
      status: lastError ? 'error' : 'complete',
    },
    opts.empresaId,
  );

  if (lastError && !structured) {
    return {
      assistant: {
        id: newMessageId(),
        role: 'assistant',
        content: lastError,
        structured: {
          summary: lastError,
          warnings: ['El asistente no pudo completar la consulta.'],
          suggestedActions: [],
          confidence: null,
        },
        createdAt: new Date().toISOString(),
        toolsUsed,
      },
      error: lastError,
    };
  }

  const finalStructured: AiStructuredResponse = structured ?? {
    summary: lastAssistantText || 'Listo.',
    data: null,
    warnings: [],
    suggestedActions: [],
    confidence: null,
  };

  return {
    assistant: {
      id: newMessageId(),
      role: 'assistant',
      content: finalStructured.summary,
      structured: finalStructured,
      createdAt: new Date().toISOString(),
      toolsUsed,
    },
  };
}

/** Ejecuta una sugerencia de clasificación sin pasar por OpenAI (rápido / offline). */
export async function suggestGastoCategoriaQuick(opts: {
  texto: string;
  user: PermissionUser;
  empresaId: string;
}): Promise<AiStructuredResponse> {
  const permissionUser = permissionUserFromAuth(opts.user, null);
  const result = await executeAiTool('suggestCategoriaGasto', { texto: opts.texto }, buildContext(permissionUser, opts.empresaId));
  if (!result.ok) {
    return {
      summary: result.error,
      warnings: result.denied ? ['Permiso denegado'] : undefined,
      confidence: null,
    };
  }
  const data = result.data as Record<string, unknown>;
  return {
    summary: data.categoriaSugerida
      ? `Sugerencia: ${data.labelCategoria ?? data.categoriaSugerida} / ${data.subtipoSugerido} (${Math.round(Number(data.confianza ?? 0) * 100)}% confianza). ${data.motivo}`
      : String(data.motivo ?? 'Sin sugerencia clara.'),
    data,
    confidence: typeof data.confianza === 'number' ? data.confianza : null,
    suggestedActions: data.categoriaSugerida
      ? [
          {
            label: 'Revisar clasificación',
            description: 'Abre conciliación y aplica manualmente la categoría sugerida.',
            actionType: 'classify_suggestion',
            payload: { tipo_gasto: data.categoriaSugerida, subtipo_gasto: data.subtipoSugerido },
          },
        ]
      : [],
  };
}

export type { AiToolCallRequest };
