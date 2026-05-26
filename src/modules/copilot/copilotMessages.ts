/**
 * Persistencia de conversación del Copiloto en sessionStorage (por sesión).
 */
import type { AiChatMessage } from '../ai/types';

const KEY_PREFIX = 'la_moneda_copilot_messages';

export type StoredCopilotConversation = {
  messages: AiChatMessage[];
  updatedAt: string;
};

function storageKey(empresaId: string, userId: string): string {
  return `${KEY_PREFIX}:${empresaId}:${userId}`;
}

/** Mensajes listos para guardar (sin debug pesado). */
function stripForStorage(messages: AiChatMessage[]): AiChatMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    structured: m.structured
      ? {
          summary: m.structured.summary,
          insights: m.structured.insights,
          warnings: m.structured.warnings,
          data: m.structured.data,
          suggestedActions: m.structured.suggestedActions,
          confidence: m.structured.confidence,
        }
      : null,
    createdAt: m.createdAt,
    toolsUsed: m.toolsUsed,
  }));
}

export function loadCopilotMessages(empresaId: string, userId: string): AiChatMessage[] {
  if (!empresaId || !userId) return [];
  try {
    const raw = sessionStorage.getItem(storageKey(empresaId, userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredCopilotConversation;
    if (!Array.isArray(parsed.messages)) return [];
    return parsed.messages.filter(
      (m) => m && typeof m.id === 'string' && (m.role === 'user' || m.role === 'assistant'),
    );
  } catch {
    return [];
  }
}

export function saveCopilotMessages(
  empresaId: string,
  userId: string,
  messages: AiChatMessage[],
): void {
  if (!empresaId || !userId) return;
  try {
    const payload: StoredCopilotConversation = {
      messages: stripForStorage(messages),
      updatedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(storageKey(empresaId, userId), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function clearCopilotMessages(empresaId: string, userId: string): void {
  if (!empresaId || !userId) return;
  try {
    sessionStorage.removeItem(storageKey(empresaId, userId));
  } catch {
    /* noop */
  }
}
