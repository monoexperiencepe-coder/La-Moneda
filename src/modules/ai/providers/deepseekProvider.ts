import { DEEPSEEK_DEFAULT_BASE_URL, DEEPSEEK_DEFAULT_MODEL } from './config';
import { createOpenAiCompatibleProvider } from './openaiCompatibleClient';
import type { AiChatProvider, AiProviderRuntimeConfig } from './types';

/** deepseek-reasoner no usa tools/json_schema en el mismo modo que deepseek-chat */
function supportsStructuredForModel(model: string): boolean {
  return !model.includes('reasoner');
}

export function createDeepSeekProvider(
  config: Partial<AiProviderRuntimeConfig> & { apiKey: string },
): AiChatProvider {
  const model = config.model ?? DEEPSEEK_DEFAULT_MODEL;
  const base = createOpenAiCompatibleProvider({
    id: 'deepseek',
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEEPSEEK_DEFAULT_BASE_URL,
    model,
    structuredOutput: supportsStructuredForModel(model),
  });
  return {
    id: 'deepseek',
    model: base.model,
    baseUrl: base.baseUrl,
    supportsStructuredOutput: base.supportsStructuredOutput,
    chatCompletion: (body, meta) => base.chatCompletion(body, meta),
  };
}
