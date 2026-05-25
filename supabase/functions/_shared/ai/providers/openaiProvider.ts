import { OPENAI_DEFAULT_BASE_URL, OPENAI_DEFAULT_MODEL } from './config.ts';
import { createOpenAiCompatibleProvider } from './openaiCompatibleClient.ts';
import type { AiChatProvider, AiProviderRuntimeConfig } from './types.ts';

export function createOpenAiProvider(
  config: Partial<AiProviderRuntimeConfig> & { apiKey: string },
): AiChatProvider {
  const base = createOpenAiCompatibleProvider({
    id: 'openai',
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? OPENAI_DEFAULT_BASE_URL,
    model: config.model ?? OPENAI_DEFAULT_MODEL,
    structuredOutput: true,
  });
  return {
    id: 'openai',
    model: base.model,
    baseUrl: base.baseUrl,
    supportsStructuredOutput: base.supportsStructuredOutput,
    chatCompletion: (body, meta) => base.chatCompletion(body, meta),
  };
}
