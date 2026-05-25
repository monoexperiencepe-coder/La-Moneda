/** Tipos compatibles OpenAI Chat Completions (OpenAI / DeepSeek / otros). */

export type AiProviderId = 'openai' | 'deepseek';

export type AiChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type AiChatToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type AiProviderChatMessage = {
  role: AiChatRole | string;
  content?: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: AiChatToolCall[];
};

export type AiChatCompletionRequest = {
  model: string;
  messages: AiProviderChatMessage[];
  tools?: unknown[];
  tool_choice?: 'auto' | 'none' | unknown;
  response_format?: unknown;
  temperature?: number;
};

export type AiTokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type AiChatCompletionChoice = {
  index?: number;
  message?: {
    role?: string;
    content?: string | null;
    tool_calls?: AiChatToolCall[];
  };
  finish_reason?: string | null;
};

export type AiChatCompletionResponse = {
  id?: string;
  model?: string;
  choices?: AiChatCompletionChoice[];
  usage?: AiTokenUsage;
};

export type AiChatCompletionResult = {
  ok: boolean;
  status: number;
  data?: AiChatCompletionResponse;
  error?: string;
  latencyMs: number;
  provider: AiProviderId;
  model: string;
};

export type AiProviderRuntimeConfig = {
  provider: AiProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type AiProviderLogMeta = {
  provider: AiProviderId;
  model: string;
  latencyMs: number;
  pass: string;
  usage?: AiTokenUsage;
  status: number;
};

export interface AiChatProvider {
  readonly id: AiProviderId;
  readonly model: string;
  readonly baseUrl: string;
  chatCompletion(
    body: AiChatCompletionRequest,
    meta?: { pass?: string },
  ): Promise<AiChatCompletionResult>;
  supportsStructuredOutput(): boolean;
}
