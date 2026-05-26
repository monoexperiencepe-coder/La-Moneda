import type { AiSuggestedAction } from '../../ai/types';
import type { CopilotNavigateParams } from '../copilotActions';
import type { NarrativeStep } from './types';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function padMonth(m: number | string): string {
  const n = Math.trunc(Number(m));
  if (!Number.isFinite(n) || n < 1 || n > 12) return '';
  return String(n).padStart(2, '0');
}

function monthName(m: number | string): string {
  const n = Math.trunc(Number(m));
  if (n >= 1 && n <= 12) return MONTH_NAMES[n - 1];
  return `Mes ${m}`;
}

function scrollTargetId(scrollTarget?: string, fallback = 'copilot-income-summary'): string {
  if (scrollTarget === 'income-summary') return 'copilot-income-summary';
  if (scrollTarget === 'gastos-table') return 'copilot-gastos-table';
  if (scrollTarget === 'inversiones-table') return 'copilot-inversiones-table';
  if (scrollTarget === 'ai-evidence-card') return 'ai-evidence-card';
  return fallback;
}

function buildIngresosStep(
  month: number | string,
  year: number | string | undefined,
  reason: 'ingreso_bruto' | 'eficiencia' | 'general',
  pauseBeforeMs?: number,
): NarrativeStep {
  const name = monthName(month);
  const y = year != null ? String(year) : '';
  const isIncome = reason === 'ingreso_bruto' || reason === 'general';

  return {
    target: 'income-month',
    label: `Aquí está ${name}`,
    description: isIncome
      ? y
        ? `Mayor ingreso del ${y}`
        : 'Mayor ingreso del año'
      : y
        ? `Mejor rendimiento del ${y}`
        : 'Mejor rendimiento del año',
    highlightType: isIncome ? 'income' : 'success',
    duration: 4500,
    scroll: true,
    applyMonth: padMonth(month),
    applyYear: year,
    pauseBeforeMs,
  };
}

/** Construye pasos narrativos desde una acción sugerida del copiloto. */
export function buildNarrativeFromSuggestedAction(action: AiSuggestedAction): NarrativeStep[] | null {
  if (action.actionType !== 'navigate' && action.actionType !== 'apply_filters') return null;

  const payload = (action.payload ?? {}) as Record<string, unknown>;
  const cp = (payload.copilotParams ?? payload.filters ?? payload.params ?? {}) as CopilotNavigateParams & {
    narrativeSteps?: NarrativeStep[];
  };

  if (Array.isArray(cp.narrativeSteps) && cp.narrativeSteps.length > 0) {
    return cp.narrativeSteps;
  }

  const copilotAction = typeof payload.copilotAction === 'string' ? payload.copilotAction : '';

  if (copilotAction === 'navigate_ingresos' && cp.highlightMonth != null) {
    const reason = cp.monthFocusReason ?? 'ingreso_bruto';
    return [buildIngresosStep(cp.highlightMonth, cp.year, reason)];
  }

  if (cp.scrollTarget === 'ai-evidence-card') {
    return [{
      target: 'ai-evidence-card',
      label: cp.highlightLabel ?? 'Dato calculado',
      description: cp.highlightLabel ?? 'Evidencia del cálculo',
      highlightType: 'neutral',
      duration: 5000,
      scroll: true,
      applyYear: cp.year,
    }];
  }

  if (copilotAction === 'navigate_gastos' && cp.highlightVehicle) {
    return [{
      target: scrollTargetId(cp.scrollTarget, 'copilot-gastos-table'),
      label: cp.highlightLabel ?? `${cp.highlightVehicle} · gastos`,
      description: `Gastos operativos del vehículo ${cp.highlightVehicle}.`,
      highlightType: 'warning',
      duration: 4000,
      scroll: true,
      applyYear: cp.year,
    }];
  }

  if (
    (copilotAction === 'navigate_inversiones' || copilotAction === 'navigate_inversiones_generales') &&
    (cp.highlightVehicle || cp.placa)
  ) {
    const v = cp.highlightVehicle ?? cp.placa ?? '';
    return [{
      target: scrollTargetId(cp.scrollTarget, 'copilot-inversiones-table'),
      label: cp.highlightLabel ?? `${v} · inversión`,
      description: `Inversión registrada para ${v}.`,
      highlightType: 'neutral',
      duration: 4000,
      scroll: true,
    }];
  }

  if (cp.scrollTarget) {
    return [{
      target: scrollTargetId(cp.scrollTarget),
      label: cp.highlightLabel ?? 'Dato destacado',
      description: cp.highlightLabel,
      highlightType: 'neutral',
      duration: 3800,
      scroll: true,
      applyMonth: cp.highlightMonth != null ? padMonth(cp.highlightMonth) : cp.month,
      applyYear: cp.year,
    }];
  }

  return null;
}

export { buildIngresosStep, monthName, padMonth as narrativePadMonth };

/** Construye pasos desde params de navegación (fallback URL / copilot). */
export function buildNarrativeFromCopilotParams(
  params: CopilotNavigateParams,
): NarrativeStep[] | null {
  if (params.highlightMonth != null) {
    const scroll = params.scrollTarget ?? 'income-summary';
    if (scroll === 'income-summary' || !params.scrollTarget) {
      const reason = params.monthFocusReason ?? 'ingreso_bruto';
      return [buildIngresosStep(params.highlightMonth, params.year, reason)].map((s) => ({
        ...s,
        label: params.highlightLabel?.includes('Aquí')
          ? params.highlightLabel
          : s.label,
        description: params.highlightLabel && !params.highlightLabel.includes('Aquí')
          ? params.highlightLabel
          : s.description,
      }));
    }
  }

  if (params.scrollTarget || params.highlightVehicle) {
    return buildNarrativeFromSuggestedAction({
      label: params.highlightLabel ?? 'Dato destacado',
      description: '',
      actionType: 'navigate',
      payload: { copilotParams: params },
    });
  }

  return null;
}
