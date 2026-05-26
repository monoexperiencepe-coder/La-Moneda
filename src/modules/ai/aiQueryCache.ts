/**
 * Cache corto de respuestas IA (sessionStorage, TTL 3 min).
 */
import type { AiChatMessage } from './types';

const TTL_MS = 3 * 60 * 1000;
const KEY_PREFIX = 'la_moneda_ai_cache';

export type CachedAiResponse = {
  assistant: AiChatMessage;
  cachedAt: number;
  toolsUsed: string[];
};

function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[¿?¡!.,;:]/g, '');
}

export function buildAiCacheKey(opts: {
  message: string;
  empresaId: string;
  userRole: string;
  explicitYear?: number | null;
}): string {
  const yearPart = opts.explicitYear != null ? String(opts.explicitYear) : 'any';
  return `${KEY_PREFIX}:${opts.empresaId}:${opts.userRole}:${yearPart}:${normalizeQuestion(opts.message)}`;
}

export function getCachedAiResponse(key: string): CachedAiResponse | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedAiResponse;
    if (!parsed?.assistant || typeof parsed.cachedAt !== 'number') return null;
    if (Date.now() - parsed.cachedAt > TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    if (import.meta.env.DEV) {
      console.log('[ai:cache-hit]', key);
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setCachedAiResponse(key: string, assistant: AiChatMessage, toolsUsed: string[]): void {
  try {
    const payload: CachedAiResponse = {
      assistant: {
        ...assistant,
        debug: import.meta.env.DEV ? assistant.debug : undefined,
      },
      cachedAt: Date.now(),
      toolsUsed,
    };
    sessionStorage.setItem(key, JSON.stringify(payload));
    if (import.meta.env.DEV) {
      console.log('[ai:cache-miss]', 'stored', key);
    }
  } catch {
    /* quota */
  }
}

export function invalidateAiCache(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* noop */
  }
}
