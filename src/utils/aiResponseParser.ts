/** Utilidades para parsear y sanitizar respuestas del asistente IA. */

export interface ParsedAiAction {
  label: string;
  description: string;
  actionType: string;
  payload?: Record<string, unknown>;
}

export interface ParsedAiResponse {
  summary: string;
  data: Record<string, unknown> | unknown[] | null;
  warnings: string[];
  suggestedActions: ParsedAiAction[];
  confidence: number | null;
}

/**
 * Elimina markdown crudo, bloques JSON y caracteres de estructura visual
 * para producir texto limpio apto para mostrar en UI.
 */
export function sanitizeAiAssistantText(text: string): string {
  let s = text ?? '';

  // Remove ```json ... ``` blocks
  s = s.replace(/```json[\s\S]*?```/gi, '');
  // Remove generic ``` ... ``` blocks
  s = s.replace(/```[\s\S]*?```/g, '');

  // Remove standalone JSON objects at end of message
  // (lines that start with { after optional whitespace, going to end)
  s = s.replace(/\n\s*\{[\s\S]{10,}\}\s*$/, '');
  s = s.replace(/^\s*\{[\s\S]{20,}\}\s*$/, '');

  // Convert ## Heading → plain text (keep text)
  s = s.replace(/^#{1,6}\s+(.+)$/gm, '$1');

  // Remove **bold** markers
  s = s.replace(/\*\*(.+?)\*\*/g, '$1');
  // Remove *italic* markers
  s = s.replace(/\*(.+?)\*/g, '$1');

  // Remove markdown table separator rows (| --- | --- |)
  s = s.replace(/^\|[\s\-:|]+\|$/gm, '');

  // Convert table content rows to readable text
  s = s.replace(/^\|(.+)\|$/gm, (_, inner: string) =>
    inner
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean)
      .join(' · '),
  );

  // Collapse 3+ blank lines into 2
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}

/** Intenta extraer un objeto JSON de un string (directo, en bloque ```json, o al final). */
function extractJson(text: string): Record<string, unknown> | null {
  const t = text?.trim();
  if (!t) return null;

  // 1. Direct JSON object
  if (t.startsWith('{')) {
    try {
      const p = JSON.parse(t) as Record<string, unknown>;
      if (typeof p === 'object' && !Array.isArray(p)) return p;
    } catch {
      /* noop */
    }
  }

  // 2. ```json ... ```
  const m1 = t.match(/```json\s*([\s\S]*?)```/i);
  if (m1?.[1]) {
    try {
      const p = JSON.parse(m1[1].trim()) as Record<string, unknown>;
      if (p && typeof p === 'object') return p;
    } catch {
      /* noop */
    }
  }

  // 3. Generic ``` ... ``` that looks like JSON
  const m2 = t.match(/```\s*([\s\S]*?)```/);
  if (m2?.[1]?.trimStart().startsWith('{')) {
    try {
      const p = JSON.parse(m2[1].trim()) as Record<string, unknown>;
      if (p && typeof p === 'object') return p;
    } catch {
      /* noop */
    }
  }

  // 4. JSON object at the end of the text (last {…})
  const m3 = t.match(/\{[\s\S]{20,}\}$/);
  if (m3) {
    try {
      const p = JSON.parse(m3[0]) as Record<string, unknown>;
      if (p && typeof p === 'object') return p;
    } catch {
      /* noop */
    }
  }

  return null;
}

/**
 * Parsea texto bruto de la IA en una respuesta estructurada limpia.
 * Maneja los casos:
 * - JSON directo o en bloque ```json
 * - Texto markdown mezclado con JSON al final
 * - Texto puro sin estructura
 */
export function parseAiAssistantText(raw: string | null | undefined): ParsedAiResponse {
  const empty: ParsedAiResponse = {
    summary: '',
    data: null,
    warnings: [],
    suggestedActions: [],
    confidence: null,
  };
  if (!raw?.trim()) return empty;

  const json = extractJson(raw);

  if (json && typeof json.summary === 'string') {
    return {
      summary: sanitizeAiAssistantText(json.summary),
      data:
        json.data != null && typeof json.data === 'object'
          ? (json.data as Record<string, unknown> | unknown[])
          : null,
      warnings: Array.isArray(json.warnings)
        ? (json.warnings as unknown[]).filter((w): w is string => typeof w === 'string')
        : [],
      suggestedActions: Array.isArray(json.suggestedActions)
        ? (json.suggestedActions as unknown[]).filter(
            (a): a is ParsedAiAction =>
              a != null && typeof a === 'object' && 'label' in (a as object),
          )
        : [],
      confidence: typeof json.confidence === 'number' ? json.confidence : null,
    };
  }

  // No valid JSON — sanitize the raw text as summary
  return { ...empty, summary: sanitizeAiAssistantText(raw) };
}

// ─── Financial metric extraction ──────────────────────────────────────────────

export interface AiMetricCard {
  label: string;
  value: string;
  subtitle?: string;
  raw: number;
  variant: 'green' | 'red' | 'blue' | 'amber' | 'gray';
}

export const fmtMoney = (n: number): string =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function getCount(obj: unknown): number | null {
  if (obj == null || typeof obj !== 'object') return null;
  const count = (obj as Record<string, unknown>).count;
  return typeof count === 'number' ? count : null;
}

/** Extrae metric cards premium de un `data` de respuesta del asistente. */
export function extractMetricCards(
  data: Record<string, unknown> | unknown[] | null | undefined,
): AiMetricCard[] {
  if (!data || Array.isArray(data)) return [];
  const d = data as Record<string, unknown>;

  // Pattern A: { ingresos: { total, count }, gastos: { total, count }, utilidad, pendientes }
  if (d.ingresos != null || d.gastos != null) {
    const ingTotal =
      typeof (d.ingresos as Record<string, unknown>)?.total === 'number'
        ? ((d.ingresos as Record<string, unknown>).total as number)
        : typeof d.ingresos_total === 'number'
          ? (d.ingresos_total as number)
          : null;
    const ingCount = getCount(d.ingresos);

    const gasTotal =
      typeof (d.gastos as Record<string, unknown>)?.total === 'number'
        ? ((d.gastos as Record<string, unknown>).total as number)
        : typeof d.gastos_total === 'number'
          ? (d.gastos_total as number)
          : null;
    const gasCount = getCount(d.gastos);

    const utilidad =
      typeof d.utilidad === 'number'
        ? d.utilidad
        : ingTotal != null && gasTotal != null
          ? ingTotal - gasTotal
          : null;

    const pendCount =
      getCount(d.pendientes) ??
      (typeof d.pendientes_count === 'number' ? (d.pendientes_count as number) : null);
    const pendTotal =
      typeof (d.pendientes as Record<string, unknown>)?.total === 'number'
        ? ((d.pendientes as Record<string, unknown>).total as number)
        : null;

    const cards: AiMetricCard[] = [];
    if (ingTotal != null)
      cards.push({
        label: 'Ingresos',
        value: fmtMoney(ingTotal),
        subtitle: ingCount != null ? `${ingCount} registros` : undefined,
        raw: ingTotal,
        variant: 'green',
      });
    if (gasTotal != null)
      cards.push({
        label: 'Gastos',
        value: fmtMoney(gasTotal),
        subtitle: gasCount != null ? `${gasCount} registros` : undefined,
        raw: gasTotal,
        variant: 'red',
      });
    if (utilidad != null)
      cards.push({
        label: 'Utilidad aprox.',
        value: fmtMoney(utilidad),
        subtitle: utilidad >= 0 ? 'Resultado positivo' : 'Resultado negativo',
        raw: utilidad,
        variant: utilidad >= 0 ? 'blue' : 'red',
      });
    if (pendCount != null)
      cards.push({
        label: 'Pendientes',
        value: `${pendCount}`,
        subtitle: pendTotal != null ? fmtMoney(pendTotal) : 'registros sin clasificar',
        raw: pendCount,
        variant: pendCount > 0 ? 'amber' : 'gray',
      });
    if (cards.length >= 2) return cards;
  }

  // Pattern B: flat { total, count }
  if (typeof d.total === 'number' && typeof d.count === 'number') {
    return [
      { label: 'Registros', value: String(d.count), raw: d.count, variant: 'gray' },
      { label: 'Total', value: fmtMoney(d.total), raw: d.total, variant: 'blue' },
    ];
  }

  return [];
}

/** Extrae una tabla simple de un array de objetos en `data`. */
export interface AiSimpleTable {
  headers: string[];
  rows: string[][];
}

export function extractSimpleTable(
  data: Record<string, unknown> | unknown[] | null | undefined,
  maxRows = 10,
): AiSimpleTable | null {
  if (!data) return null;

  let rows: unknown[] = [];
  if (Array.isArray(data)) {
    rows = data;
  } else {
    const d = data as Record<string, unknown>;
    const candidates = ['categorias', 'ranking', 'filas', 'movimientos', 'gastos', 'items'];
    for (const key of candidates) {
      if (Array.isArray(d[key])) {
        rows = d[key] as unknown[];
        break;
      }
    }
  }

  if (!rows.length || typeof rows[0] !== 'object') return null;

  const LABEL_MAP: Record<string, string> = {
    tipo_gasto: 'Tipo',
    label: 'Categoría',
    count: 'Cant.',
    monto: 'Monto',
    fecha: 'Fecha',
    motivo: 'Motivo',
    vehicle_id: 'Vehículo',
    placa: 'Placa',
  };
  const SHOW_KEYS = ['label', 'tipo_gasto', 'count', 'monto', 'fecha', 'motivo', 'vehicle_id', 'placa'];
  const firstRow = rows[0] as Record<string, unknown>;
  const headers = SHOW_KEYS.filter((k) => k in firstRow).map((k) => LABEL_MAP[k] ?? k);
  const keys = SHOW_KEYS.filter((k) => k in firstRow);
  if (!keys.length) return null;

  const tableRows: string[][] = (rows.slice(0, maxRows) as Record<string, unknown>[]).map((r) =>
    keys.map((k) => {
      const v = r[k];
      if (typeof v === 'number' && (k === 'monto')) return fmtMoney(v);
      return v != null ? String(v) : '—';
    }),
  );

  return { headers, rows: tableRows };
}
