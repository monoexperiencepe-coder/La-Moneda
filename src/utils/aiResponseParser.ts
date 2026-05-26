/** Utilidades para parsear y sanitizar respuestas del asistente IA. */

export interface ParsedAiAction {
  label: string;
  description: string;
  actionType: string;
  payload?: Record<string, unknown>;
}

export interface ParsedAiResponse {
  summary: string;
  insights: string[];
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

/**
 * Reemplaza frases técnicas que el modelo no debería exponer al usuario.
 * Actúa como capa de seguridad por si el modelo ignora las instrucciones del prompt.
 */
export function sanitizeTechnicalLeakage(text: string): string {
  if (!text) return text;
  let s = text;

  // Frases que revelan arquitectura interna → reemplazar con equivalente humano
  const replacements: [RegExp, string][] = [
    [/\bla tool\b/gi, 'el análisis'],
    [/\blas tools?\b/gi, 'el análisis'],
    [/\bla herramienta\b/gi, 'el análisis'],
    [/\blas herramientas?\b/gi, 'los datos disponibles'],
    [/\bel payload\b/gi, 'la información'],
    [/\bel schema\b/gi, 'la estructura'],
    [/\btool output\b/gi, 'los resultados'],
    [/\bdebug\b/gi, ''],
    [/\bel pipeline\b/gi, 'el proceso'],
    [/\bla API\b/gi, 'la fuente de datos'],
    [/voy a consultar\b[^.!?]*/gi, 'Déjame revisar eso.'],
    [/voy a confirmar\b[^.!?]*/gi, 'Déjame verificar eso.'],
    [/no tengo una? herramienta[^.!?]*/gi, 'No encuentro suficiente información para precisarlo.'],
    [/no (tengo|tiene) acceso a ese (nivel de )?desglose[^.!?]*/gi, 'Los registros disponibles no permiten ese nivel de detalle.'],
    [/no está precargado[^.!?]*/gi, 'No está disponible en este momento.'],
    [/la tool devolvió[^.!?]*/gi, 'Los registros muestran'],
    [/el sistema devolvió[^.!?]*/gi, 'Los datos muestran'],
    [/según la (herramienta|tool|función)[^.!?]*/gi, 'Según los registros'],
    [/\bgetResumenFinancieroPeriodo\b/g, ''],
    [/\bgetGastosPeriodo\b/g, ''],
    [/\bgetIngresosPeriodo\b/g, ''],
    [/\bgetVehiculosConMasGasto\b/g, ''],
    [/\bgetGastosPorCategoria\b/g, ''],
    [/\bgetHistorialVehiculo\b/g, ''],
    [/\bgetResumenFinanciero\b/g, ''],
    [/\banio=\d{4}\b/g, ''],
    [/\bperiodo=["']?[\w]+["']?/g, ''],
  ];

  for (const [pattern, replacement] of replacements) {
    s = s.replace(pattern, replacement);
  }

  // Clean up double spaces or orphaned punctuation from replacements
  s = s.replace(/\s{2,}/g, ' ').replace(/\.\s*\./g, '.').trim();

  return s;
}

/**
 * Comprime el texto ejecutivo eliminando frases suaves, relleno y
 * expresiones poco directas que reducen el impacto de las respuestas.
 * Se aplica DESPUÉS de sanitizeTechnicalLeakage.
 */
export function compressExecutiveNarrative(text: string): string {
  if (!text) return text;
  let s = text;

  // ── Frases suaves / intro de relleno ──────────────────────────────────────
  const softPhrases: [RegExp, string][] = [
    // Introducciones vacías al inicio de párrafo
    [/^(con la información (financiera )?disponible[^,]*,?\s*)/gim, ''],
    [/^(con los datos disponibles[^,]*,?\s*)/gim, ''],
    [/^(basad[ao]s? en (los datos|la información)[^,]*,?\s*)/gim, ''],
    [/^(basándome en[^,]*,?\s*)/gim, ''],
    [/^(actualmente[,\s]+)/gim, ''],
    [/^(en términos generales[,\s]+)/gim, ''],
    [/^(a grandes rasgos[,\s]+)/gim, ''],
    [/^(en líneas generales[,\s]+)/gim, ''],
    [/^(es importante (señalar|destacar|mencionar) que\s+)/gim, ''],
    [/^(cabe (mencionar|destacar|señalar) que\s+)/gim, ''],
    [/^(según (el sistema|los registros|los datos)[,\s]+)/gim, ''],
    [/^(el análisis (muestra|indica|revela|sugiere)[,\s]+)/gim, ''],
    [/^(los datos (muestran|indican|revelan|sugieren)[,\s]+)/gim, ''],
    [/^(podemos observar que\s+)/gim, ''],
    [/^(se puede (observar|ver|apreciar) que\s+)/gim, ''],
    [/^(hay que (tener en cuenta|considerar) que\s+)/gim, ''],
    [/^(vale (la pena )?(mencionar|destacar) que\s+)/gim, ''],
    [/^(dado que\s+)/gim, ''],
    // Cierre de relleno
    [/\ben (conclusión|resumen|síntesis)[,\s]+/gi, ''],
    [/\bpara (resumir|concluir)[,\s]+/gi, ''],
    // Hedging / incertidumbre excesiva
    [/\bparece (que|ser)\b/gi, ''],
    [/\bpodría (indicar|sugerir|señalar)\b[^.!?]*/gi, ''],
    [/\bla tendencia (apunta|indica|sugiere)\b/gi, 'la tendencia es'],
    [/\bparecería (que|ser)\b/gi, ''],
  ];

  for (const [pattern, replacement] of softPhrases) {
    s = s.replace(pattern, replacement);
  }

  // Capitalize sentences that lost their starter due to replacements
  s = s.replace(/(^|\n\n)(\s*)([a-záéíóúüñ])/g, (_, nl, ws, c: string) => `${nl}${ws}${c.toUpperCase()}`);

  // Collapse excessive blank lines
  s = s.replace(/\n{3,}/g, '\n\n');

  // Fix orphaned punctuation
  s = s.replace(/\s{2,}/g, ' ').replace(/\.\s*\./g, '.').replace(/,\s*\./g, '.').trim();

  return s;
}

/**
 * Traduce jerga financiera a lenguaje claro para el dueño del negocio.
 * Se aplica después de sanitizeTechnicalLeakage y compressExecutiveNarrative.
 */
export function simplifyBusinessLanguage(text: string): string {
  if (!text) return text;
  let s = text;

  const replacements: [RegExp, string][] = [
    [/\binversi[oó]n\s+CAPEX\b/gi, 'inversión en compra de activos'],
    [/\binversiones\s+CAPEX\b/gi, 'inversiones en activos'],
    [/\buna?\s+inversi[oó]n\s+CAPEX\b/gi, 'una inversión en activos'],
    [/\bCAPEX\b/g, 'inversión en activos'],
    [/\bOPEX\b/g, 'gastos operativos'],
    [/\butilidad operativa\b/gi, 'ganancia operativa'],
    [/\butilidades operativas\b/gi, 'ganancias operativas'],
    [/\bmargen eficiente\b/gi, 'mejor rendimiento'],
    [/\bfacturaci[oó]n bruta\b/gi, 'ingresos totales'],
    [/\bexpansi[oó]n de flota\b/gi, 'compra de vehículos'],
    [/\bflujo neto\b/gi, 'resultado neto'],
    [/\bflujo operativo\b/gi, 'resultado operativo'],
    [/\bgasto operativo recurrente\b/gi, 'gasto del día a día'],
    [/\binversi[oó]n vehicular\b/gi, 'compra de vehículos'],
    [/\beficiencia operativa\b/gi, 'rendimiento del negocio'],
    [/\bmejor eficiencia operativa\b/gi, 'mejor rendimiento'],
  ];

  for (const [pattern, replacement] of replacements) {
    s = s.replace(pattern, replacement);
  }

  s = s.replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim();
  return s;
}

/** Pipeline completo de texto ejecutivo para UI. */
export function formatExecutiveText(text: string): string {
  return sanitizeAiAssistantText(
    simplifyBusinessLanguage(compressExecutiveNarrative(sanitizeTechnicalLeakage(text))),
  );
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
    insights: [],
    data: null,
    warnings: [],
    suggestedActions: [],
    confidence: null,
  };
  if (!raw?.trim()) return empty;

  const json = extractJson(raw);

  if (json && typeof json.summary === 'string') {
    return {
      summary: formatExecutiveText(json.summary),
      insights: Array.isArray(json.insights)
        ? (json.insights as unknown[])
            .filter((w): w is string => typeof w === 'string')
            .map((w) => formatExecutiveText(w))
        : [],
      data:
        json.data != null && typeof json.data === 'object'
          ? (json.data as Record<string, unknown> | unknown[])
          : null,
      warnings: Array.isArray(json.warnings)
        ? (json.warnings as unknown[]).filter((w): w is string => typeof w === 'string').map((w) => formatExecutiveText(w))
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
  return { ...empty, summary: formatExecutiveText(raw) };
}

// ─── Financial metric extraction ──────────────────────────────────────────────

export interface AiMetricCard {
  label: string;
  value: string;
  subtitle?: string;
  raw: number;
  variant: 'green' | 'red' | 'blue' | 'amber' | 'gray';
}

export const fmtPen = (n: number): string =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtUsd = (n: number): string =>
  `US$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** @deprecated Use fmtPen */
export const fmtMoney = fmtPen;

function metricFromField(
  field: unknown,
): { total: number; formatted?: string } | null {
  if (field == null || typeof field !== 'object') return null;
  const o = field as Record<string, unknown>;
  if (typeof o.total === 'number') {
    return {
      total: o.total,
      formatted: typeof o.formatted === 'string' ? o.formatted : undefined,
    };
  }
  return null;
}

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

  // Pattern OPEX/CAPEX: capas separadas del asistente ejecutivo
  const ingPen = metricFromField(d.ingresos_pen);
  const opexPen = metricFromField(d.gastos_opex_pen);
  const capexPen = metricFromField(d.inversion_capex_pen);
  const utilOp = metricFromField(d.utilidad_operativa_pen);
  if (ingPen || opexPen || capexPen || utilOp) {
    const cards: AiMetricCard[] = [];
    if (ingPen)
      cards.push({
        label: 'Ingresos (PEN)',
        value: ingPen.formatted ?? fmtPen(ingPen.total),
        raw: ingPen.total,
        variant: 'green',
      });
    if (opexPen)
      cards.push({
        label: 'Gasto operativo',
        value: opexPen.formatted ?? fmtPen(opexPen.total),
        subtitle: 'Sin compra de activos',
        raw: opexPen.total,
        variant: 'red',
      });
    if (capexPen && capexPen.total > 0)
      cards.push({
        label: 'Inversiones en activos',
        value: capexPen.formatted ?? fmtPen(capexPen.total),
        subtitle: 'Compra de activos',
        raw: capexPen.total,
        variant: 'amber',
      });
    if (utilOp)
      cards.push({
        label: 'Ganancia operativa',
        value: utilOp.formatted ?? fmtPen(utilOp.total),
        subtitle: utilOp.total >= 0 ? 'Ingresos − gastos operativos' : 'Pérdida operativa',
        raw: utilOp.total,
        variant: utilOp.total >= 0 ? 'blue' : 'red',
      });
    if (cards.length >= 2) return cards;
  }

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
        value: fmtPen(ingTotal),
        subtitle: ingCount != null ? `${ingCount} registros` : undefined,
        raw: ingTotal,
        variant: 'green',
      });
    if (gasTotal != null)
      cards.push({
        label: 'Gastos',
        value: fmtPen(gasTotal),
        subtitle: gasCount != null ? `${gasCount} registros` : undefined,
        raw: gasTotal,
        variant: 'red',
      });
    if (utilidad != null)
      cards.push({
        label: 'Utilidad aprox.',
        value: fmtPen(utilidad),
        subtitle: utilidad >= 0 ? 'Resultado positivo' : 'Resultado negativo',
        raw: utilidad,
        variant: utilidad >= 0 ? 'blue' : 'red',
      });
    if (pendCount != null)
      cards.push({
        label: 'Pendientes',
        value: `${pendCount}`,
        subtitle: pendTotal != null ? fmtPen(pendTotal) : 'registros sin clasificar',
        raw: pendCount,
        variant: pendCount > 0 ? 'amber' : 'gray',
      });
    if (cards.length >= 2) return cards;
  }

  // Pattern B: flat { total, count }
  if (typeof d.total === 'number' && typeof d.count === 'number') {
    return [
      { label: 'Registros', value: String(d.count), raw: d.count, variant: 'gray' },
      { label: 'Total', value: fmtPen(d.total), raw: d.total, variant: 'blue' },
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
      if (typeof v === 'number' && (k === 'monto')) return fmtPen(v);
      return v != null ? String(v) : '—';
    }),
  );

  return { headers, rows: tableRows };
}
