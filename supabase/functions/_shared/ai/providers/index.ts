export * from './types.ts';
export * from './config.ts';
export { createOpenAiProvider } from './openaiProvider.ts';
export { createDeepSeekProvider } from './deepseekProvider.ts';
export { createOpenAiCompatibleProvider } from './openaiCompatibleClient.ts';

import { createDeepSeekProvider } from './deepseekProvider.ts';
import { createOpenAiProvider } from './openaiProvider.ts';
import { resolveAiProviderRuntimeConfig } from './config.ts';
import type { AiChatProvider, AiProviderRuntimeConfig } from './types.ts';

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
