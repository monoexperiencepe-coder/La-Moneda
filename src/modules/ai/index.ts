/** Barrel del módulo IA (fase 1 — solo lectura). */

export * from './types';
export * from './permissions';
export * from './prompts';
export * from './dateRange';
export { AI_TOOL_DEFINITIONS } from './tools/definitions';
export {
  createAiChatProvider,
  createAiChatProviderFromEnv,
  createDeepSeekProvider,
  createOpenAiProvider,
  resolveAiProviderRuntimeConfig,
  normalizeAiProviderId,
  DEEPSEEK_DEFAULT_MODEL,
  DEEPSEEK_MODELS,
  type AiProviderId,
  type AiProviderRuntimeConfig,
} from './providers';
