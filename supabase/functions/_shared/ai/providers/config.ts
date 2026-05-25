import type { AiProviderId, AiProviderRuntimeConfig } from './types.ts';

export const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export const DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-reasoner'] as const;
export const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';

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

/** AI_* con fallback OPENAI_* si provider=openai. */
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
