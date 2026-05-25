import type {
  AiChatCompletionRequest,
  AiChatCompletionResult,
  AiProviderId,
  AiProviderLogMeta,
} from './types';

export type OpenAiCompatibleProviderOptions = {
  id: AiProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
  /** deepseek-reasoner puede no soportar response_format json_schema */
  structuredOutput?: boolean;
};

function logAiCall(meta: AiProviderLogMeta): void {
  console.log(
    JSON.stringify({
      event: 'ai_chat_completion',
      provider: meta.provider,
      model: meta.model,
      pass: meta.pass ?? 'default',
      latency_ms: meta.latencyMs,
      status: meta.status,
      prompt_tokens: meta.usage?.prompt_tokens,
      completion_tokens: meta.usage?.completion_tokens,
      total_tokens: meta.usage?.total_tokens,
    }),
  );
}

export function createOpenAiCompatibleProvider(
  opts: OpenAiCompatibleProviderOptions,
): {
  id: AiProviderId;
  model: string;
  baseUrl: string;
  supportsStructuredOutput: () => boolean;
  chatCompletion: (
    body: AiChatCompletionRequest,
    meta?: { pass?: string },
  ) => Promise<AiChatCompletionResult>;
} {
  const structuredOk = opts.structuredOutput !== false;

  return {
    id: opts.id,
    model: opts.model,
    baseUrl: opts.baseUrl,
    supportsStructuredOutput: () => structuredOk,
    async chatCompletion(body, meta) {
      const t0 = performance.now();
      const url = `${opts.baseUrl}/chat/completions`;
      const model = body.model || opts.model;

      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...body, model }),
        });
      } catch (e) {
        const latencyMs = Math.round(performance.now() - t0);
        const message = e instanceof Error ? e.message : 'Error de red';
        logAiCall({
          provider: opts.id,
          model,
          latencyMs,
          pass: meta?.pass ?? 'default',
          status: 0,
        });
        return {
          ok: false,
          status: 0,
          error: message,
          latencyMs,
          provider: opts.id,
          model,
        };
      }

      const latencyMs = Math.round(performance.now() - t0);
      const text = await res.text();
      let data: AiChatCompletionResult['data'];
      if (res.ok) {
        try {
          data = JSON.parse(text) as AiChatCompletionResult['data'];
        } catch {
          return {
            ok: false,
            status: res.status,
            error: 'Respuesta JSON inválida del proveedor',
            latencyMs,
            provider: opts.id,
            model,
          };
        }
        logAiCall({
          provider: opts.id,
          model: data?.model ?? model,
          latencyMs,
          pass: meta?.pass ?? 'default',
          status: res.status,
          usage: data?.usage,
        });
        return {
          ok: true,
          status: res.status,
          data,
          latencyMs,
          provider: opts.id,
          model: data?.model ?? model,
        };
      }

      logAiCall({
        provider: opts.id,
        model,
        latencyMs,
        pass: meta?.pass ?? 'default',
        status: res.status,
      });
      return {
        ok: false,
        status: res.status,
        error: text.slice(0, 500),
        latencyMs,
        provider: opts.id,
        model,
      };
    },
  };
}
