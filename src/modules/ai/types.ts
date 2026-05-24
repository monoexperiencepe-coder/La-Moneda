/** Respuesta estructurada del asistente IA (solo lectura / sugerencias). */

export type AiToolName =
  | 'getResumenFinancieroPeriodo'
  | 'getIngresosPeriodo'
  | 'getGastosPeriodo'
  | 'getGastosPorCategoria'
  | 'getVehiculosConMasGasto'
  | 'getPendientesRevision'
  | 'getGastosGlobales'
  | 'getPrestamosActivos'
  | 'getMovimientosRecientes'
  | 'getHistorialVehiculo'
  | 'suggestCategoriaGasto';

export type AiSuggestedAction = {
  label: string;
  description: string;
  /** Solo informativo; la fase 1 no ejecuta acciones. */
  actionType: 'navigate' | 'review' | 'classify_suggestion';
  payload?: Record<string, unknown>;
};

export type AiStructuredResponse = {
  summary: string;
  data?: Record<string, unknown> | unknown[] | null;
  warnings?: string[];
  suggestedActions?: AiSuggestedAction[];
  confidence?: number | null;
};

export type AiChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  structured?: AiStructuredResponse | null;
  createdAt: string;
  toolsUsed?: AiToolName[];
};

export type AiToolCallRequest = {
  id: string;
  name: AiToolName;
  arguments: Record<string, unknown>;
};

export type AiAssistantRequest = {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  toolResults?: Array<{
    toolCallId: string;
    name: AiToolName;
    result: unknown;
    error?: string;
  }>;
};

export type AiAssistantApiResponse = {
  status: 'complete' | 'needs_tools' | 'error';
  structured?: AiStructuredResponse;
  assistantText?: string;
  toolCalls?: AiToolCallRequest[];
  toolsUsed?: AiToolName[];
  error?: string;
  durationMs?: number;
};

export type AiAuditEntry = {
  questionPreview: string;
  toolsUsed: AiToolName[];
  durationMs: number;
  status: 'complete' | 'error' | 'denied';
};
