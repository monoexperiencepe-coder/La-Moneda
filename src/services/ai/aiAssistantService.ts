import { supabase } from '../../lib/supabase';
import { buildAiSystemPrompt } from '../../modules/ai/prompts';
import { canExecuteAiTool } from '../../modules/ai/permissions';
import { executeAiTool, type AiToolContext } from '../../modules/ai/tools/runner';
import { parseAiAssistantText } from '../../utils/aiResponseParser';
import type {
  AiAssistantApiResponse,
  AiAssistantDebugInfo,
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
import { enrichCopilotSuggestedActions, mergeCopilotActions } from '../../modules/copilot/enrichCopilotActions';

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

const CONFIG_ERROR_MESSAGE =
  'Asistente IA no configurado. Configure AI_API_KEY (y AI_PROVIDER) en la Edge Function ai-assistant.';

const FRIENDLY_EDGE_ERROR =
  'No pudimos contactar al asistente. Verifica la conexión o intenta de nuevo en unos segundos.';

function newMessageId(): string {
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const VALID_ACTION_TYPES = new Set(['navigate', 'review', 'classify_suggestion', 'apply_filters']);

function parseStructured(raw: string | null | undefined): AiStructuredResponse | null {
  if (!raw?.trim()) return null;
  const parsed = parseAiAssistantText(raw);
  if (!parsed.summary && !parsed.data && !parsed.warnings.length) return null;
  return {
    summary: parsed.summary || raw.trim(),
    data: parsed.data,
    warnings: parsed.warnings,
    suggestedActions: parsed.suggestedActions
      .filter((a) => VALID_ACTION_TYPES.has(a.actionType))
      .map((a) => ({
        label: a.label,
        description: a.description,
        actionType: a.actionType as 'navigate' | 'review' | 'classify_suggestion' | 'apply_filters',
        payload: a.payload,
      })),
    confidence: parsed.confidence,
  };
}

function buildContext(user: PermissionUser, empresaId: string): AiToolContext {
  return { user, empresaId };
}

function buildErrorAssistant(
  summary: string,
  opts: {
    toolsUsed: AiToolName[];
    debug: AiAssistantDebugInfo;
    warnings?: string[];
  },
): AiChatMessage {
  return {
    id: newMessageId(),
    role: 'assistant',
    content: summary,
    structured: {
      summary,
      warnings: opts.warnings ?? [summary],
      suggestedActions: [],
      confidence: null,
    },
    createdAt: new Date().toISOString(),
    toolsUsed: opts.toolsUsed,
    debug: opts.debug,
  };
}

async function invokeAiAssistant(body: {
  messages: OpenAiMessage[];
  userRole: string;
  isOperadorRestricted: boolean;
}): Promise<AiAssistantApiResponse> {
  const { data, error } = await supabase.functions.invoke('ai-assistant', { body });
  if (error) {
    if (import.meta.env.DEV) {
      console.warn('[ai-assistant] invoke error', error.message);
    }
    return {
      status: 'error',
      error: FRIENDLY_EDGE_ERROR,
    };
  }
  const res = (data ?? { status: 'error', error: 'Respuesta vacía del servidor' }) as AiAssistantApiResponse;
  if (res.configError) {
    if (import.meta.env.DEV) {
      console.error('[ai-assistant]', CONFIG_ERROR_MESSAGE);
    }
    return {
      status: 'error',
      configError: true,
      error: CONFIG_ERROR_MESSAGE,
    };
  }
  return res;
}

export async function sendAiAssistantMessage(opts: {
  message: string;
  history: AiChatMessage[];
  user: PermissionUser;
  email?: string | null;
  empresaId: string;
}): Promise<{ assistant: AiChatMessage; error?: string; retryable?: boolean }> {
  const started = performance.now();
  const toolsUsed: AiToolName[] = [];
  const deniedTools: AiToolName[] = [];
  const toolErrors: AiAssistantDebugInfo['toolErrors'] = [];
  const toolDurationsMs: Partial<Record<AiToolName, number>> = {};
  let lastProvider: string | null = null;
  let lastModel: string | null = null;
  let lastTokens: AiAssistantDebugInfo['tokens'] = null;
  let pendientesSugerenciasData: Record<string, unknown> | null = null;

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
  let retryable = false;
  let configError = false;
  const toolWarnings: string[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const res = await invokeAiAssistant({
      messages,
      userRole: opts.user.role,
      isOperadorRestricted: isOperador,
    });

    if (res.provider) lastProvider = res.provider;
    if (res.model) lastModel = res.model;
    if (res.usage) {
      lastTokens = {
        prompt: res.usage.prompt_tokens,
        completion: res.usage.completion_tokens,
        total: res.usage.total_tokens,
      };
    }

    if (res.status === 'error') {
      lastError = res.error ?? 'Error del asistente';
      configError = Boolean(res.configError);
      retryable = !configError;
      break;
    }

    if (res.status === 'needs_tools' && res.toolCalls?.length) {
      if (import.meta.env.DEV) {
        console.log(
          '[ai-tool-routing]',
          JSON.stringify({
            round,
            intent_detected: opts.message.slice(0, 120),
            tools_selected: res.toolCalls.map((tc) => tc.name),
            reason: res.toolCalls.map((tc) => ({ tool: tc.name, args: tc.arguments })),
          }),
        );
      }

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
        if (!canExecuteAiTool(permissionUser, call.name) && !deniedTools.includes(call.name)) {
          deniedTools.push(call.name);
        }

        const t0 = performance.now();
        const result = await executeAiTool(call.name, call.arguments, ctx);
        toolDurationsMs[call.name] = (toolDurationsMs[call.name] ?? 0) + (performance.now() - t0);

        if (!result.ok) {
          if (result.denied && !deniedTools.includes(call.name)) deniedTools.push(call.name);
          toolErrors.push({ name: call.name, error: result.error, denied: result.denied });
          const warn = result.denied
            ? `Permiso denegado para ${call.name}.`
            : `Advertencia: ${call.name} falló (${result.error}).`;
          toolWarnings.push(warn);
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.name,
            content: JSON.stringify({
              ok: false,
              error: result.error,
              denied: result.denied ?? false,
              warning: warn,
            }),
          });
          continue;
        }

        if (!toolsUsed.includes(call.name)) toolsUsed.push(call.name);
        if (call.name === 'getPendientesConSugerencia' && result.data && typeof result.data === 'object') {
          pendientesSugerenciasData = result.data as Record<string, unknown>;
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.name,
          content: JSON.stringify(result.data),
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
  const debug: AiAssistantDebugInfo = {
    toolsUsed: [...toolsUsed],
    deniedTools: [...deniedTools],
    toolErrors: [...toolErrors],
    toolDurationsMs: { ...toolDurationsMs },
    durationMs,
    provider: lastProvider,
    model: lastModel,
    tokens: lastTokens,
    blockedByPermissions: deniedTools.length > 0,
    timestamp: new Date().toISOString(),
  };

  const auditStatus = lastError
    ? configError
      ? 'error'
      : 'error'
    : deniedTools.length > 0 && toolsUsed.length === 0
      ? 'denied'
      : 'complete';

  void insertAiAssistantAuditLog(
    {
      questionPreview: opts.message,
      toolsUsed,
      deniedTools,
      userRole: opts.user.role,
      durationMs,
      status: auditStatus,
    },
    opts.empresaId,
  );

  if (lastError && !structured) {
    return {
      assistant: buildErrorAssistant(lastError, {
        toolsUsed,
        debug,
        warnings: configError
          ? [CONFIG_ERROR_MESSAGE]
          : [lastError, 'Puedes reintentar la consulta.'],
      }),
      error: lastError,
      retryable,
    };
  }

  const finalStructured: AiStructuredResponse = structured ?? {
    summary: lastAssistantText || 'Listo.',
    data: null,
    warnings: [],
    suggestedActions: [],
    confidence: null,
  };

  if (toolWarnings.length) {
    finalStructured.warnings = [...(finalStructured.warnings ?? []), ...toolWarnings];
  }

  if (pendientesSugerenciasData?.sugerencias) {
    finalStructured.data = {
      ...(finalStructured.data && typeof finalStructured.data === 'object' && !Array.isArray(finalStructured.data)
        ? (finalStructured.data as Record<string, unknown>)
        : {}),
      sugerencias: pendientesSugerenciasData.sugerencias,
      count: pendientesSugerenciasData.count,
    };
    if (!finalStructured.suggestedActions?.length) {
      finalStructured.suggestedActions = [
        {
          label: 'Revisar manualmente',
          description:
            'Abre Finanzas → pendientes o globales y aplica la clasificación sugerida. La IA no modifica registros.',
          actionType: 'review',
        },
      ];
    }
  }

  const copilotExtras = enrichCopilotSuggestedActions({
    user: permissionUser,
    message: opts.message,
    toolsUsed,
  });
  finalStructured.suggestedActions = mergeCopilotActions(
    finalStructured.suggestedActions,
    copilotExtras,
  );

  return {
    assistant: {
      id: newMessageId(),
      role: 'assistant',
      content: finalStructured.summary,
      structured: finalStructured,
      createdAt: new Date().toISOString(),
      toolsUsed,
      debug,
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
  const result = await executeAiTool('suggestCategoriaGasto', { texto: opts.texto, motivo: opts.texto }, buildContext(permissionUser, opts.empresaId));
  if (!result.ok) {
    return {
      summary: result.error,
      warnings: result.denied ? ['Permiso denegado'] : undefined,
      confidence: null,
    };
  }
  const data = result.data as Record<string, unknown>;
  const tipo = (data.tipo_gasto_sugerido ?? data.categoriaSugerida) as string | null;
  const sub = (data.subtipo_sugerido ?? data.subtipoSugerido) as string | null;
  const conf = typeof data.confianza === 'number' ? data.confianza : null;
  return {
    summary: tipo
      ? `Sugerencia: ${data.labelCategoria ?? tipo} / ${sub ?? '—'} (${Math.round((conf ?? 0) * 100)}% confianza). ${data.razon ?? data.motivo}`
      : String(data.razon ?? data.motivo ?? 'Sin sugerencia clara.'),
    data,
    confidence: conf,
    suggestedActions: tipo
      ? [
          {
            label: 'Revisar clasificación',
            description: 'Abre conciliación y aplica manualmente la categoría sugerida.',
            actionType: 'classify_suggestion',
            payload: { tipo_gasto: tipo, subtipo_gasto: sub },
          },
        ]
      : [],
  };
}

export type { AiToolCallRequest };
