import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  createAiChatProviderFromEnv,
  type AiProviderChatMessage,
} from "../_shared/ai/providers/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_TOOLS = [
  {
    type: "function",
    function: {
      name: "getResumenFinancieroPeriodo",
      description: "Resumen financiero del periodo (ingresos, gastos, utilidad, pendientes). Solo roles financieros. Para año 2024 usa anio=2024.",
      parameters: {
        type: "object",
        properties: {
          periodo: { type: "string", enum: ["today", "week", "month", "year", "custom"] },
          desde: { type: "string" },
          hasta: { type: "string" },
          anio: { type: "number", description: "Año histórico específico, ej: 2024" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getIngresosPeriodo",
      description: "Ingresos del periodo (totales, conteo). Solo roles financieros. Para año 2024 usa anio=2024. NO usar para gastos ni inversiones.",
      parameters: {
        type: "object",
        properties: {
          periodo: { type: "string", enum: ["today", "week", "month", "year", "custom"] },
          desde: { type: "string" },
          hasta: { type: "string" },
          anio: { type: "number", description: "Año histórico específico, ej: 2024" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getIngresosHistoricosPorMes",
      description: "Ranking histórico de ingresos por mes (todos los años o un año). Usar para récord histórico, mejor mes histórico.",
      parameters: {
        type: "object",
        properties: {
          anio: { type: "number", description: "Opcional. Año específico; omitir para histórico completo." },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getGastosPeriodo",
      description: "Gastos operativos del periodo. Para año 2024 usa anio=2024. NO usar para inversión de compra vehicular.",
      parameters: {
        type: "object",
        properties: {
          periodo: { type: "string", enum: ["today", "week", "month", "year", "custom"] },
          desde: { type: "string" },
          hasta: { type: "string" },
          anio: { type: "number", description: "Año histórico específico, ej: 2024" },
          tipo_gasto: { type: "string" },
          solo_mantenimiento: { type: "boolean", description: "Solo mantenimiento/reparación vehicular" },
          subtipo_grupo: { type: "string", enum: ["mantenimiento"] },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getGastosPorCategoria",
      description: "Totales de gastos agrupados por categoría operativa en el periodo. Para año 2024 usa anio=2024.",
      parameters: {
        type: "object",
        properties: {
          periodo: { type: "string", enum: ["today", "week", "month", "year", "custom"] },
          desde: { type: "string" },
          hasta: { type: "string" },
          anio: { type: "number", description: "Año histórico específico, ej: 2024" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getVehiculosConMasGasto",
      description: "Ranking de vehículos con mayor GASTO OPERATIVO (combustible, mantenimiento). Solo roles financieros. NO usar para inversión de compra; para eso usa getRankingInversionVehiculos.",
      parameters: {
        type: "object",
        properties: {
          periodo: { type: "string", enum: ["today", "week", "month", "year", "custom"] },
          anio: { type: "number", description: "Año histórico específico, ej: 2024" },
          limit: { type: "number" },
          solo_mantenimiento: { type: "boolean", description: "Ranking solo por mantenimiento/reparación" },
          subtipo_grupo: { type: "string", enum: ["mantenimiento"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getPendientesRevision",
      description: "Gastos pendiente_revision sin clasificar.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getGastosGlobales",
      description: "Resumen gastos_globales.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getPrestamosActivos",
      description: "Préstamos activos. Solo roles financieros.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "getMovimientosRecientes",
      description: "Últimos gastos visibles.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getHistorialVehiculo",
      description: "Historial de gastos de un vehículo.",
      parameters: {
        type: "object",
        properties: {
          vehicle_id: { type: "string" },
          placa: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggestCategoriaGasto",
      description: "Sugiere tipo_gasto y subtipo. NO modifica datos.",
      parameters: {
        type: "object",
        properties: {
          texto: { type: "string" },
          motivo: { type: "string" },
          comentarios: { type: "string" },
          monto: { type: "number" },
          vehicle_id: { type: "string" },
          tipo_gasto: { type: "string" },
          subtipo_gasto: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getPendientesConSugerencia",
      description: "Pendientes y gastos globales con sugerencia de clasificación (solo lectura).",
      parameters: {
        type: "object",
        properties: { limit: { type: "number" } },
      },
    },
  },
  // ─── Inversiones vehiculares ──────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "getRankingInversionVehiculos",
      description:
        "Ranking de vehículos por INVERSIÓN TOTAL de adquisición (valor compra, GNV, GPS, notarial, seguro, fundas). " +
        "Usar para: 'vehículo con mayor inversión', 'activo más caro', 'cuánto se invirtió en la flota'. " +
        "NO es gasto operativo; es inversión inicial. Solo roles financieros.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getDetalleInversionVehiculo",
      description:
        "Desglose completo de inversión de adquisición de UN vehículo (compra, GNV, GPS, seguro, notarial, total). " +
        "Usar para: 'cuánto costó el carro X', 'desglose inversión placa ABC'. Solo roles financieros.",
      parameters: {
        type: "object",
        properties: {
          vehicle_id: { type: "string" },
          placa: { type: "string" },
        },
      },
    },
  },
];

const STRUCTURED_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "ai_assistant_response",
    strict: true,
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        data: { type: ["object", "array", "null"] },
        warnings: { type: "array", items: { type: "string" } },
        suggestedActions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              description: { type: "string" },
              actionType: { type: "string", enum: ["navigate", "review", "classify_suggestion"] },
              payload: { type: ["object", "null"] },
            },
            required: ["label", "description", "actionType"],
            additionalProperties: false,
          },
        },
        confidence: { type: ["number", "null"] },
      },
      required: ["summary", "warnings", "suggestedActions", "confidence"],
      additionalProperties: false,
    },
  },
};

type IncomingMessage = AiProviderChatMessage;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function denoEnv(): Record<string, string | undefined> {
  return {
    AI_PROVIDER: Deno.env.get("AI_PROVIDER") ?? undefined,
    AI_API_KEY: Deno.env.get("AI_API_KEY") ?? undefined,
    AI_BASE_URL: Deno.env.get("AI_BASE_URL") ?? undefined,
    AI_MODEL: Deno.env.get("AI_MODEL") ?? undefined,
    OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY") ?? undefined,
    OPENAI_MODEL: Deno.env.get("OPENAI_MODEL") ?? undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { provider: chatProvider, config: aiConfig } = createAiChatProviderFromEnv(denoEnv());

  if (!aiConfig.apiKey) {
    console.error(
      JSON.stringify({
        event: "ai_config_error",
        provider: aiConfig.provider,
        message: "AI_API_KEY no configurada",
      }),
    );
    return jsonResponse(
      {
        status: "error",
        configError: true,
        provider: aiConfig.provider,
        error:
          "AI_API_KEY no configurada en la Edge Function ai-assistant (o OPENAI_API_KEY si AI_PROVIDER=openai).",
      },
      503,
    );
  }

  const requestStarted = performance.now();

  try {
    const body = await req.json();
    const messages: IncomingMessage[] = Array.isArray(body.messages) ? body.messages : [];

    if (messages.length === 0) {
      return jsonResponse({ status: "error", error: "messages requerido" }, 400);
    }

    const firstResult = await chatProvider.chatCompletion(
      {
        model: aiConfig.model,
        messages,
        tools: AI_TOOLS,
        tool_choice: "auto",
      },
      { pass: "tool_round" },
    );

    if (!firstResult.ok || !firstResult.data) {
      return jsonResponse(
        {
          status: "error",
          provider: aiConfig.provider,
          model: firstResult.model,
          error: `${aiConfig.provider}: ${firstResult.error ?? "Error en chat completion"}`,
          latencyMs: firstResult.latencyMs,
        },
        502,
      );
    }

    const choice = firstResult.data.choices?.[0];
    const msg = choice?.message;

    if (!msg) {
      return jsonResponse(
        {
          status: "error",
          provider: aiConfig.provider,
          error: "Proveedor sin mensaje en la respuesta",
        },
        502,
      );
    }

    if (msg.tool_calls?.length) {
      const toolCalls = msg.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseArgs(tc.function.arguments),
      }));
      console.log(
        JSON.stringify({
          event: "ai-tool-routing",
          tools_selected: toolCalls.map((tc) => tc.name),
          args_summary: toolCalls.map((tc) => ({ name: tc.name, args: tc.arguments })),
        }),
      );
      return jsonResponse({
        status: "needs_tools",
        provider: aiConfig.provider,
        model: firstResult.model,
        assistantText: msg.content ?? null,
        toolCalls,
        latencyMs: Math.round(performance.now() - requestStarted),
        usage: firstResult.data.usage
          ? {
              prompt_tokens: firstResult.data.usage.prompt_tokens,
              completion_tokens: firstResult.data.usage.completion_tokens,
              total_tokens: firstResult.data.usage.total_tokens,
            }
          : undefined,
      });
    }

    const finalMessages: IncomingMessage[] = [
      ...messages,
      { role: "assistant", content: msg.content ?? "" },
    ];

    let structured: Record<string, unknown> | null = null;
    let usage = firstResult.data.usage;
    let responseModel = firstResult.model;

    if (chatProvider.supportsStructuredOutput()) {
      const structuredResult = await chatProvider.chatCompletion(
        {
          model: aiConfig.model,
          messages: [
            ...finalMessages,
            {
              role: "user",
              content:
                "Devuelve la respuesta final en JSON estructurado según el schema (summary, data, warnings, suggestedActions, confidence).",
            },
          ],
          response_format: STRUCTURED_SCHEMA,
        },
        { pass: "structured" },
      );

      if (structuredResult.ok && structuredResult.data) {
        usage = structuredResult.data.usage ?? usage;
        responseModel = structuredResult.model;
        const content = structuredResult.data.choices?.[0]?.message?.content;
        try {
          structured = content ? (JSON.parse(content) as Record<string, unknown>) : null;
        } catch {
          structured = {
            summary: content ?? msg.content ?? "",
            warnings: [],
            suggestedActions: [],
            confidence: null,
          };
        }
      }
    }

    if (!structured) {
      // Fallback: try to extract JSON from the raw assistant text
      const rawContent = msg.content ?? "";
      const jsonMatch =
        rawContent.match(/```json\s*([\s\S]*?)```/i) ??
        rawContent.match(/```\s*(\{[\s\S]*?\})\s*```/) ??
        rawContent.match(/(\{[\s\S]{20,}\})$/);
      if (jsonMatch?.[1]) {
        try {
          const extracted = JSON.parse(jsonMatch[1].trim()) as Record<string, unknown>;
          if (typeof extracted.summary === "string") {
            structured = extracted;
          }
        } catch {
          /* noop */
        }
      }
      if (!structured) {
        // Strip any JSON/markdown from the summary text
        let cleanContent = rawContent
          .replace(/```json[\s\S]*?```/gi, "")
          .replace(/```[\s\S]*?```/g, "")
          .replace(/\n\s*\{[\s\S]{10,}\}\s*$/, "")
          .replace(/^#{1,6}\s+(.+)$/gm, "$1")
          .replace(/\*\*(.+?)\*\*/g, "$1")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        structured = {
          summary: cleanContent || "Listo.",
          warnings: [],
          suggestedActions: [],
          confidence: null,
        };
      }
    }

    const totalLatencyMs = Math.round(performance.now() - requestStarted);

    console.log(
      JSON.stringify({
        event: "ai_assistant_complete",
        provider: aiConfig.provider,
        model: responseModel,
        latency_ms: totalLatencyMs,
        prompt_tokens: usage?.prompt_tokens,
        completion_tokens: usage?.completion_tokens,
        total_tokens: usage?.total_tokens,
      }),
    );

    return jsonResponse({
      status: "complete",
      provider: aiConfig.provider,
      assistantText: (structured.summary as string) ?? msg.content ?? "",
      structured,
      model: responseModel,
      latencyMs: totalLatencyMs,
      usage: usage
        ? {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
          }
        : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno";
    return jsonResponse(
      {
        status: "error",
        provider: aiConfig.provider,
        error: message,
        latencyMs: Math.round(performance.now() - requestStarted),
      },
      500,
    );
  }
});
