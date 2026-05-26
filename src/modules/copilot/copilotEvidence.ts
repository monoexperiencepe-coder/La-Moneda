import type { AiStructuredResponse } from '../ai/types';
import { formatCurrencyByCode } from '../ai/dateRange';

const STORAGE_KEY = 'copilot:pending-evidence';

export type CopilotEvidencePayload = {
  id: string;
  title: string;
  value: string;
  formula?: string;
  subtitle?: string;
  highlightMonth?: number;
  highlightYear?: number;
};

function metricTotal(field: unknown): number | null {
  if (field == null || typeof field !== 'object') return null;
  const total = (field as Record<string, unknown>).total;
  return typeof total === 'number' ? total : null;
}

function metricFormatted(field: unknown): string | null {
  if (field == null || typeof field !== 'object') return null;
  const formatted = (field as Record<string, unknown>).formatted;
  return typeof formatted === 'string' ? formatted : null;
}

/** Extrae tarjeta de evidencia cuando el dato no está visible en pantalla. */
export function extractCopilotEvidence(
  structured: AiStructuredResponse,
  message: string,
): CopilotEvidencePayload | null {
  const data = structured.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  const d = data as Record<string, unknown>;
  const msg = message.toLowerCase();
  const wantsFormula =
    /\b(c[oó]mo calcul|f[oó]rmula|explic.*calcul|desglose)\b/.test(msg)
    || /\bganancia\b|\butilidad operativa\b/.test(msg);

  const ingField = d.ingresos_pen ?? (d.capas_financieras as Record<string, unknown> | undefined)?.ingresos_pen;
  const opexField = d.gastos_opex_pen ?? (d.capas_financieras as Record<string, unknown> | undefined)?.gastos_opex_pen;
  const utilField = d.utilidad_operativa_pen ?? (d.capas_financieras as Record<string, unknown> | undefined)?.utilidad_operativa_pen;

  const ingTotal = metricTotal(ingField);
  const opexTotal = metricTotal(opexField);
  const utilTotal = metricTotal(utilField);

  if (wantsFormula && ingTotal != null && opexTotal != null) {
    const util = utilTotal ?? ingTotal - opexTotal;
    const yearMatch = message.match(/\b(20\d{2})\b/);
    const year = yearMatch?.[1];
    return {
      id: `evidence-utilidad-${year ?? 'periodo'}`,
      title: year ? `Ganancia operativa ${year}` : 'Ganancia operativa',
      value: metricFormatted(utilField) ?? formatCurrencyByCode(util, 'PEN'),
      formula: `${metricFormatted(ingField) ?? formatCurrencyByCode(ingTotal, 'PEN')} − ${metricFormatted(opexField) ?? formatCurrencyByCode(opexTotal, 'PEN')}`,
      subtitle: 'Ingresos − gastos operativos (sin compra de activos)',
    };
  }

  const mejor = d.mejor_mes_historico as Record<string, unknown> | null | undefined;
  if (mejor && typeof mejor === 'object' && typeof mejor.label === 'string') {
    const isHistoric = /\bhist[oó]ric|r[eé]cord|todos los a[nñ]os\b/.test(msg);
    if (isHistoric || d.ranking_meses) {
      return {
        id: `evidence-historic-${mejor.periodo ?? mejor.label}`,
        title: 'Récord histórico de ingresos',
        value: typeof mejor.ingresos_formatted === 'string'
          ? mejor.ingresos_formatted
          : formatCurrencyByCode(Number(mejor.ingresos_pen ?? 0), 'PEN'),
        subtitle: String(mejor.label),
        highlightMonth: typeof mejor.mes === 'number' ? mejor.mes : undefined,
        highlightYear: typeof mejor.anio === 'number' ? mejor.anio : undefined,
      };
    }
  }

  return null;
}

const EVIDENCE_EVENT = 'copilot:evidence-updated';

export function queueCopilotEvidence(payload: CopilotEvidencePayload | null): void {
  if (!payload) {
    sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(EVIDENCE_EVENT));
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent(EVIDENCE_EVENT));
}

export function peekCopilotEvidence(): CopilotEvidencePayload | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CopilotEvidencePayload;
  } catch {
    return null;
  }
}

export function consumeCopilotEvidence(): CopilotEvidencePayload | null {
  const payload = peekCopilotEvidence();
  sessionStorage.removeItem(STORAGE_KEY);
  return payload;
}

export function syncCopilotEvidence(structured: AiStructuredResponse, message: string): CopilotEvidencePayload | null {
  const payload = extractCopilotEvidence(structured, message);
  queueCopilotEvidence(payload);
  return payload;
}
