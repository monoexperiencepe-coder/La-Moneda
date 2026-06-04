/**
 * Etiquetas amigables para acciones sugeridas del copiloto (dueño / no técnico).
 */
import type { AiSuggestedAction } from '../ai/types';
import type { CopilotNavigateParams } from './copilotActions';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function monthDisplayName(m: number | string | undefined): string | null {
  if (m == null) return null;
  const n = Math.trunc(Number(m));
  if (n >= 1 && n <= 12) return MONTH_NAMES[n - 1];
  return null;
}

function humanizeIngresosAction(
  cp: CopilotNavigateParams,
  fallbackLabel: string,
): { label: string; description: string } {
  const month = monthDisplayName(cp.highlightMonth ?? cp.month);
  const year = cp.year != null ? String(cp.year) : null;
  const reason = cp.monthFocusReason;

  if (month) {
    const isEficiencia =
      reason === 'eficiencia'
      || ((cp.highlightLabel ?? '').toLowerCase().includes('eficiencia')
        && reason !== 'ingreso_bruto')
      || ((cp.highlightLabel ?? '').toLowerCase().includes('rendimiento')
        && reason !== 'ingreso_bruto');
    return {
      label: `Ver ${month}`,
      description: isEficiencia
        ? year
          ? `Mejor rendimiento del ${year}`
          : 'Mejor rendimiento del año'
        : year
          ? `Mayor ingreso del ${year}`
          : 'Mayor ingreso del año',
    };
  }

  if (year) {
    return {
      label: `Ver ingresos del ${year}`,
      description: 'Resumen de ingresos del periodo',
    };
  }

  return {
    label: fallbackLabel.replace(/^Abrir\s+/i, 'Ver '),
    description: 'Ver detalle de ingresos',
  };
}

function humanizeGastosAction(cp: CopilotNavigateParams, fallbackLabel: string): { label: string; description: string } {
  if (cp.mantenimientoScope || cp.subtipo_gasto === 'mantenimiento') {
    const year = cp.year != null ? String(cp.year) : null;
    return {
      label: year ? `Ver mantenimiento ${year}` : 'Ver mantenimiento',
      description: year
        ? `Gastos de mantenimiento y reparación del ${year}`
        : 'Gastos de mantenimiento y reparación vehicular',
    };
  }
  if (cp.highlightVehicle || cp.placa) {
    const v = cp.highlightVehicle ?? cp.placa ?? 'vehículo';
    return {
      label: 'Ver gastos del vehículo',
      description: `Gastos operativos de ${v}`,
    };
  }
  const year = cp.year != null ? String(cp.year) : null;
  return {
    label: year ? `Ver gastos del ${year}` : fallbackLabel.replace(/^Abrir\s+/i, 'Ver '),
    description: year ? `Gastos operativos del ${year}` : 'Ver detalle de gastos',
  };
}

function humanizeInversionAction(cp: CopilotNavigateParams): { label: string; description: string } {
  const v = cp.highlightVehicle ?? cp.placa;
  if (v) {
    return {
      label: 'Ver inversión',
      description: `Inversión registrada para ${v}`,
    };
  }
  return {
    label: 'Ver inversiones',
    description: 'Detalle de inversiones en activos',
  };
}

/** Aplica labels/descriptions legibles; mantiene payload técnico oculto en UI. */
export function humanizeSuggestedAction(action: AiSuggestedAction): AiSuggestedAction {
  if (action.actionType !== 'navigate' && action.actionType !== 'apply_filters') {
    return action;
  }

  const payload = (action.payload ?? {}) as Record<string, unknown>;
  const copilotAction = typeof payload.copilotAction === 'string' ? payload.copilotAction : '';
  const cp = (payload.copilotParams ?? payload.filters ?? payload.params ?? {}) as CopilotNavigateParams;

  let human: { label: string; description: string } | null = null;

  if (copilotAction === 'navigate_ingresos') {
    human = humanizeIngresosAction(cp, action.label);
  } else if (copilotAction === 'navigate_gastos') {
    human = humanizeGastosAction(cp, action.label);
  } else if (copilotAction === 'navigate_inversiones' || copilotAction === 'navigate_inversiones_generales') {
    human = humanizeInversionAction(cp);
  } else if (copilotAction === 'navigate_pendientes_equipo') {
    human = { label: 'Ver pendientes', description: 'Abrir pendientes del equipo' };
  } else if (copilotAction === 'navigate_pendientes_ia') {
    human = { label: 'Ver pendientes IA', description: 'Gastos por clasificar' };
  }

  if (!human) return action;

  return {
    ...action,
    label: human.label,
    description: human.description,
  };
}

export function humanizeSuggestedActions(actions: AiSuggestedAction[] | undefined): AiSuggestedAction[] {
  return (actions ?? []).map(humanizeSuggestedAction);
}

export { monthDisplayName };
