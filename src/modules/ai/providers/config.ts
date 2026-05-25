import type { AiProviderId, AiProviderRuntimeConfig } from './types';

export const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export const DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-reasoner'] as const;
export const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';

/** Resuelve proveedor desde AI_PROVIDER (fallback: openai). */
export function normalizeAiProviderId(raw: string | null | undefined): AiProviderId {
  const v = (raw ?? 'openai').trim().toLowerCase();
  if (v === 'deepseek') return 'deepseek';
  return 'openai';
}

export function defaultBaseUrlForProvider(provider: AiProviderId): string {
  return provider === 'deepseek' ? DEEPSEEK_DEFAULT_BASE_URL : OPENAI_DEFAULT_BASE_URL;
}

export function defaultModelForProvider(provider: AiProviderId): string {
  return provider === 'deepseek' ? DEEPSEEK_DEFAULT_MODEL : OPENAI_DEFAULT_MODEL;
}

/**
 * Configuración runtime (Edge: Deno.env / Cliente: import.meta.env opcional).
 * Prioridad: AI_* → legacy OPENAI_* (solo openai).
 */
export function resolveAiProviderRuntimeConfig(
  env: Record<string, string | undefined>,
): AiProviderRuntimeConfig {
  const provider = normalizeAiProviderId(env.AI_PROVIDER);
  const apiKey =
    (env.AI_API_KEY ?? '').trim() ||
    (provider === 'openai' ? (env.OPENAI_API_KEY ?? '').trim() : '');

  const baseUrl =
    (env.AI_BASE_URL ?? '').trim() || defaultBaseUrlForProvider(provider);

  const model =
    (env.AI_MODEL ?? '').trim() ||
    (env.OPENAI_MODEL ?? '').trim() ||
    defaultModelForProvider(provider);

  return { provider, apiKey, baseUrl: baseUrl.replace(/\/$/, ''), model };
}

/** Vite / frontend (solo informativo; las llamadas LLM van por Edge Function). */
export function resolveAiProviderConfigFromImportMeta(): Pick<
  AiProviderRuntimeConfig,
  'provider' | 'model'
> {
  const env = import.meta.env as Record<string, string | undefined>;
  const provider = normalizeAiProviderId(env.VITE_AI_PROVIDER);
  const model = (env.VITE_AI_MODEL ?? '').trim() || defaultModelForProvider(provider);
  return { provider, model };
}
