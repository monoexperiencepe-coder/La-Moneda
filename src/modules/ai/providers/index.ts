/**
 * Proveedores IA para el cliente (Vite). La Edge Function ai-assistant usa la copia en
 * supabase/functions/_shared/ai/providers/ (no importar desde src en functions).
 */
export * from './types';
export * from './config';
export { createOpenAiProvider } from './openaiProvider';
export { createDeepSeekProvider } from './deepseekProvider';
export { createOpenAiCompatibleProvider } from './openaiCompatibleClient';

import { createDeepSeekProvider } from './deepseekProvider';
import { createOpenAiProvider } from './openaiProvider';
import { resolveAiProviderRuntimeConfig } from './config';
import type { AiChatProvider, AiProviderRuntimeConfig } from './types';

/** Factory según AI_PROVIDER (default openai). */
export function createAiChatProvider(config: AiProviderRuntimeConfig): AiChatProvider {
  if (config.provider === 'deepseek') {
    return createDeepSeekProvider(config);
  }
  return createOpenAiProvider(config);
}

export function createAiChatProviderFromEnv(
  env: Record<string, string | undefined>,
): { provider: AiChatProvider; config: AiProviderRuntimeConfig } {
  const config = resolveAiProviderRuntimeConfig(env);
  return { provider: createAiChatProvider(config), config };
}
