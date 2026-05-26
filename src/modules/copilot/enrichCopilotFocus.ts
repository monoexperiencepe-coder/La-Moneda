/**
 * Infiere params de highlight para navegación del Copiloto desde respuesta + pregunta.
 */
import type { AiStructuredResponse, AiSuggestedAction } from '../ai/types';
import type { CopilotNavigateParams } from './copilotActions';
import { extractExplicitYearFromMessage } from '../../utils/extractExplicitYear';
import { buildIngresosStep } from './navigationNarrative/buildFromAction';
import type { NarrativeStep } from './navigationNarrative/types';

const MONTH_MAP: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const MONTH_NAMES = Object.keys(MONTH_MAP);

export type ResponseMonthFocus = {
  month: number;
  reason: 'ingreso_bruto' | 'eficiencia' | 'general';
};

function monthLabel(month: number): string {
  const name = MONTH_NAMES.find((n) => MONTH_MAP[n] === month) ?? `mes ${month}`;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Detecta mes por nombre con límite de palabra (evita "mayor" → mayo). */
export function detectMonthFromText(text: string): number | null {
  const lower = text.toLowerCase();
  for (const name of MONTH_NAMES) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(lower)) return MONTH_MAP[name];
  }
  const mm = lower.match(/\bmes\s+(\d{1,2})\b/);
  if (mm) {
    const n = Number(mm[1]);
    if (n >= 1 && n <= 12) return n;
  }
  return null;
}

function detectAllMonthsFromText(text: string): number[] {
  const lower = text.toLowerCase();
  const found: number[] = [];
  for (const name of MONTH_NAMES) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(lower)) {
      const num = MONTH_MAP[name];
      if (!found.includes(num)) found.push(num);
    }
  }
  return found;
}

function detectMonthNearKeywords(text: string, keywords: RegExp): number | null {
  const lower = text.toLowerCase();
  let best: { month: number; distance: number } | null = null;

  for (const name of MONTH_NAMES) {
    const monthRe = new RegExp(`\\b${name}\\b`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = monthRe.exec(lower)) !== null) {
      const monthIndex = match.index;
      const windowStart = Math.max(0, monthIndex - 120);
      const windowEnd = Math.min(lower.length, monthIndex + match[0].length + 120);
      const window = lower.slice(windowStart, windowEnd);
      const kwMatch = keywords.exec(window);
      if (!kwMatch) continue;
      const kwIndex = windowStart + kwMatch.index;
      const distance = Math.abs(monthIndex - kwIndex);
      if (!best || distance < best.distance) {
        best = { month: MONTH_MAP[name], distance };
      }
    }
  }

  return best?.month ?? null;
}

function monthFromStructuredData(data: unknown): number | null {
  if (data == null || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const candidates: string[] = [];

  const meses = d.meses_destacados ?? d.mes_destacado;
  if (Array.isArray(meses)) {
    for (const item of meses) {
      if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        if (typeof row.mes === 'string') candidates.push(row.mes);
        if (typeof row.label === 'string') candidates.push(row.label);
        if (typeof row.periodo === 'string') candidates.push(row.periodo);
      }
    }
  }

  for (const key of ['mejor_mes', 'mes_mejor', 'mes']) {
    const v = d[key];
    if (typeof v === 'string') candidates.push(v);
  }

  for (const text of candidates) {
    const m = detectMonthFromText(text);
    if (m != null) return m;
    const iso = text.match(/\b(20\d{2})-(\d{2})\b/);
    if (iso) {
      const n = Number(iso[2]);
      if (n >= 1 && n <= 12) return n;
    }
  }
  return null;
}

/** Infiere meses destacados desde la respuesta (ingreso bruto vs eficiencia). */
export function inferResponseMonthFocus(combined: string, data?: unknown): {
  ingresoBruto: number | null;
  eficiencia: number | null;
  general: number | null;
} {
  const ingresoKeywords =
    /\b(mayor|mejor|m[aá]s alto|pico|bruto|ingreso[s]?|facturaci[oó]n|recaudaci[oó]n)\b/i;
  const eficienciaKeywords =
    /\b(eficiencia|utilidad operativa|margen|m[aá]s eficiente|ratio|rentabilidad operativa)\b/i;

  const allMonths = detectAllMonthsFromText(combined);
  const ingresoBruto =
    detectMonthNearKeywords(combined, ingresoKeywords) ??
    monthFromStructuredData(data);
  const eficiencia = detectMonthNearKeywords(combined, eficienciaKeywords);
  const general = allMonths.length ? allMonths[allMonths.length - 1] : detectMonthFromText(combined);

  return {
    ingresoBruto: ingresoBruto ?? (allMonths.length === 1 ? allMonths[0] : null),
    eficiencia: eficiencia ?? null,
    general: general ?? null,
  };
}

function detectPlacaFromText(text: string): string | null {
  const m = text.match(/\b([A-Z]{2,3}-\d{3})\b/i);
  return m ? m[1].toUpperCase() : null;
}

function patchActionFocus(
  action: AiSuggestedAction,
  focus: Partial<CopilotNavigateParams>,
): AiSuggestedAction {
  const payload = (action.payload ?? {}) as Record<string, unknown>;
  const cp = (payload.copilotParams ?? payload.filters ?? payload.params ?? {}) as CopilotNavigateParams;
  const next: CopilotNavigateParams = { ...cp, ...focus, year: focus.year ?? cp.year };

  if (focus.month != null) next.month = focus.month;
  else if ('month' in focus && focus.month === undefined) delete next.month;

  return {
    ...action,
    payload: {
      ...payload,
      copilotParams: next,
    },
  };
}

function buildIngresosHighlightPatch(
  month: number,
  year: number | null | undefined,
  reason: ResponseMonthFocus['reason'],
  narrativeSteps?: NarrativeStep[],
): Partial<CopilotNavigateParams> {
  const name = monthLabel(month);
  const suffix =
    reason === 'eficiencia'
      ? 'mejor eficiencia operativa'
      : reason === 'ingreso_bruto'
        ? 'mayor ingreso'
        : 'ingresos';
  const label = year ? `${name} · ${suffix} ${year}` : `${name} · ${suffix}`;

  return {
    year: year ?? undefined,
    month,
    highlightMonth: month,
    highlightType: 'month',
    scrollTarget: 'income-summary',
    highlightLabel: label,
    narrativeSteps,
  };
}

function buildIngresosNarrativeSteps(
  primaryMonth: number,
  year: number | null | undefined,
): NarrativeStep[] {
  return [buildIngresosStep(primaryMonth, year ?? undefined, 'ingreso_bruto')];
}

/** Enriquece suggestedActions con highlightMonth/Vehicle cuando la respuesta lo permite. */
export function enrichSuggestedActionsWithFocus(opts: {
  message: string;
  structured: AiStructuredResponse;
}): AiSuggestedAction[] {
  const { message, structured } = opts;
  const actions = structured.suggestedActions ?? [];
  if (!actions.length) return actions;

  const year =
    extractExplicitYearFromMessage(message) ??
    extractExplicitYearFromMessage(structured.summary ?? '');
  const combined = `${structured.summary ?? ''} ${(structured.insights ?? []).join(' ')}`;
  const months = inferResponseMonthFocus(combined, structured.data);
  const primaryMonth = months.ingresoBruto ?? months.general;
  const placa = detectPlacaFromText(combined);

  const mapped = actions.map((action) => {
    if (action.actionType !== 'navigate' && action.actionType !== 'apply_filters') return action;

    const payload = (action.payload ?? {}) as Record<string, unknown>;
    const copilotAction = typeof payload.copilotAction === 'string' ? payload.copilotAction : '';
    const cp = (payload.copilotParams ?? {}) as CopilotNavigateParams;

    if (copilotAction === 'navigate_ingresos' && primaryMonth != null) {
      const reason: ResponseMonthFocus['reason'] =
        months.ingresoBruto != null ? 'ingreso_bruto' : 'general';
      const narrativeSteps = buildIngresosNarrativeSteps(primaryMonth, year);
      return patchActionFocus(
        action,
        buildIngresosHighlightPatch(primaryMonth, year, reason, narrativeSteps),
      );
    }

    if (copilotAction === 'navigate_gastos' && placa) {
      return patchActionFocus(action, {
        year: year ?? cp.year,
        search: placa,
        highlightVehicle: placa,
        highlightType: 'vehicle',
        scrollTarget: 'gastos-table',
        highlightLabel: `${placa} · gastos operativos`,
      });
    }

    if (
      (copilotAction === 'navigate_inversiones' || copilotAction === 'navigate_inversiones_generales') &&
      (placa || cp.vehicleId)
    ) {
      const vid = cp.vehicleId ?? placa;
      return patchActionFocus(action, {
        year: year ?? cp.year,
        placa: placa ?? cp.placa,
        vehicleId: cp.vehicleId,
        highlightVehicle: placa ?? String(vid ?? ''),
        highlightType: 'vehicle',
        scrollTarget: 'inversiones-table',
        highlightLabel: placa ? `${placa} · inversión` : `Vehículo ${vid}`,
      });
    }

    if (year != null && !cp.year) {
      return patchActionFocus(action, { year });
    }

    if (primaryMonth != null && cp.month != null && Number(cp.month) !== primaryMonth) {
      return patchActionFocus(action, { month: undefined });
    }

    return action;
  });

  const extra: AiSuggestedAction[] = [];
  if (
    months.eficiencia != null &&
    primaryMonth != null &&
    months.eficiencia !== primaryMonth
  ) {
    const effName = monthLabel(months.eficiencia);
    extra.push({
      label: `Ver ${effName}`,
      description: year ? `Mejor rendimiento del ${year}` : 'Mejor rendimiento del año',
      actionType: 'navigate',
      payload: {
        copilotAction: 'navigate_ingresos',
        copilotParams: {
          ...buildIngresosHighlightPatch(months.eficiencia, year, 'eficiencia'),
          narrativeSteps: [buildIngresosStep(months.eficiencia, year ?? undefined, 'eficiencia')],
        },
      },
    });
  }

  return [...mapped, ...extra];
}

export { MONTH_MAP };
