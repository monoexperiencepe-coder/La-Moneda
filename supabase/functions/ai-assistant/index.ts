import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";

const AI_TOOLS = [
  {
    type: "function",
    function: {
      name: "getResumenFinancieroPeriodo",
      description: "Resumen financiero del periodo (ingresos, gastos, categorías, pendientes). Solo roles financieros.",
      parameters: {
        type: "object",
        properties: {
          periodo: { type: "string", enum: ["today", "week", "month", "year", "custom"] },
          desde: { type: "string" },
          hasta: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getIngresosPeriodo",
      description: "Ingresos agregados del periodo. Solo roles financieros.",
      parameters: {
        type: "object",
        properties: {
          periodo: { type: "string", enum: ["today", "week", "month", "year", "custom"] },
          desde: { type: "string" },
          hasta: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getGastosPeriodo",
      description: "Gastos del periodo con totales.",
      parameters: {
        type: "object",
        properties: {
          periodo: { type: "string", enum: ["today", "week", "month", "year", "custom"] },
          desde: { type: "string" },
          hasta: { type: "string" },
          tipo_gasto: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getGastosPorCategoria",
      description: "Totales por tipo_gasto en el periodo.",
      parameters: {
        type: "object",
        properties: {
          periodo: { type: "string", enum: ["today", "week", "month", "year", "custom"] },
          desde: { type: "string" },
          hasta: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getVehiculosConMasGasto",
      description: "Ranking vehículos con más gasto operativo. Solo roles financieros.",
      parameters: {
        type: "object",
        properties: {
          periodo: { type: "string", enum: ["today", "week", "month", "year", "custom"] },
          limit: { type: "number" },
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
      description: "Sugiere categoría/subtipo para un texto. NO modifica datos.",
      parameters: {
        type: "object",
        properties: { texto: { type: "string" } },
        required: ["texto"],
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

type IncomingMessage = {
  role: string;
  content?: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!OPENAI_API_KEY) {
    return jsonResponse(
      {
        status: "error",
        error: "OPENAI_API_KEY no configurada en la Edge Function ai-assistant.",
      },
      503,
    );
  }

  try {
    const body = await req.json();
    const messages: IncomingMessage[] = Array.isArray(body.messages) ? body.messages : [];

    if (messages.length === 0) {
      return jsonResponse({ status: "error", error: "messages requerido" }, 400);
    }

    const hasPendingTools = messages.some((m) => m.role === "tool");

    const openAiBody: Record<string, unknown> = {
      model: MODEL,
      messages,
      tools: AI_TOOLS,
      tool_choice: "auto",
    };

  if (!hasPendingTools && messages[messages.length - 1]?.role === "user") {
      /* primera vuelta: permitir tools */
    } else if (messages.some((m) => m.role === "tool")) {
      /* continuar conversación tras tools */
    }

    const firstPass = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openAiBody),
    });

    if (!firstPass.ok) {
      const errText = await firstPass.text();
      return jsonResponse({ status: "error", error: `OpenAI: ${errText.slice(0, 400)}` }, 502);
    }

    const firstJson = await firstPass.json();
    const choice = firstJson.choices?.[0];
    const msg = choice?.message;

    if (!msg) {
      return jsonResponse({ status: "error", error: "OpenAI sin mensaje" }, 502);
    }

    if (msg.tool_calls?.length) {
      const toolCalls = msg.tool_calls.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseArgs(tc.function.arguments),
      }));
      return jsonResponse({
        status: "needs_tools",
        assistantText: msg.content ?? null,
        toolCalls,
      });
    }

    const finalMessages = [...messages, { role: "assistant", content: msg.content ?? "" }];

    const structuredPass = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          ...finalMessages,
          {
            role: "user",
            content:
              "Devuelve la respuesta final en JSON estructurado según el schema (summary, data, warnings, suggestedActions, confidence).",
          },
        ],
        response_format: STRUCTURED_SCHEMA,
      }),
    });

    if (!structuredPass.ok) {
      return jsonResponse({
        status: "complete",
        assistantText: msg.content ?? "",
        structured: {
          summary: msg.content ?? "Listo.",
          warnings: [],
          suggestedActions: [],
          confidence: null,
        },
      });
    }

    const structuredJson = await structuredPass.json();
    const content = structuredJson.choices?.[0]?.message?.content;
    let structured = null;
    try {
      structured = content ? JSON.parse(content) : null;
    } catch {
      structured = { summary: content ?? msg.content ?? "", warnings: [], suggestedActions: [], confidence: null };
    }

    return jsonResponse({
      status: "complete",
      assistantText: structured?.summary ?? msg.content ?? "",
      structured,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error interno";
    return jsonResponse({ status: "error", error: message }, 500);
  }
});
