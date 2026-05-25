import type { AiSuggestedAction, AiToolName } from '../ai/types';
import type { CopilotActionId, CopilotNavigateParams } from './copilotActions';
import { executeCopilotAction } from './copilotActions';
import type { PermissionUser } from '../../utils/permissions';

function extractYear(text: string): string | null {
  const m = text.match(/\b(20\d{2})\b/);
  return m?.[1] ?? null;
}

function extractMonth(text: string): string | null {
  const months = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  const lower = text.toLowerCase();
  const idx = months.findIndex((mo) => lower.includes(mo));
  if (idx >= 0) return String(idx + 1).padStart(2, '0');
  const mm = lower.match(/\b(0?[1-9]|1[0-2])\b/);
  return mm?.[1] ? String(mm[1]).padStart(2, '0') : null;
}

function inferTipoGasto(text: string): string | undefined {
  const t = text.toLowerCase();
  if (t.includes('combustible') || t.includes('gasolina')) return 'operativo_vehiculo';
  if (t.includes('operativo') && t.includes('flota')) return 'operativo_flota_general';
  if (t.includes('global')) return 'gastos_globales';
  if (t.includes('administrativ')) return 'administrativo_empresa';
  if (t.includes('operativo')) return 'operativo_vehiculo';
  return undefined;
}

function inferSubtipo(text: string): string | undefined {
  const t = text.toLowerCase();
  if (t.includes('combustible') || t.includes('gasolina')) return 'combustible';
  if (t.includes('mantenimiento')) return 'mantenimiento';
  return undefined;
}

function makeNavigateAction(
  label: string,
  description: string,
  copilotAction: CopilotActionId,
  copilotParams: CopilotNavigateParams,
): AiSuggestedAction {
  return {
    label,
    description,
    actionType: 'navigate',
    payload: { copilotAction, copilotParams },
  };
}

/** Enriquece suggestedActions con navegación segura según mensaje y tools usadas. */
export function enrichCopilotSuggestedActions(opts: {
  user: PermissionUser;
  message: string;
  toolsUsed: AiToolName[];
}): AiSuggestedAction[] {
  const { user, message, toolsUsed } = opts;
  const text = message.toLowerCase();
  const year = extractYear(message) ?? undefined;
  const month = extractMonth(message) ?? undefined;
  const actions: AiSuggestedAction[] = [];
  const hasNavigateIntent =
    /\b(muestr|muéstr|muestra|ver|abre|abrir|ll[eé]v|naveg|ir a|mostrar)\b/.test(text);

  const wantsIngresos =
    text.includes('ingreso') || toolsUsed.includes('getIngresosPeriodo') || toolsUsed.includes('getResumenFinancieroPeriodo');
  const wantsGastos =
    text.includes('gasto') ||
    toolsUsed.includes('getGastosPeriodo') ||
    toolsUsed.includes('getGastosPorCategoria') ||
    toolsUsed.includes('getVehiculosConMasGasto');
  const wantsInversiones =
    text.includes('inversi') ||
    toolsUsed.includes('getRankingInversionVehiculos') ||
    toolsUsed.includes('getDetalleInversionVehiculo');
  const wantsPendientes =
    text.includes('pendiente') ||
    text.includes('clasificar') ||
    toolsUsed.includes('getPendientesRevision') ||
    toolsUsed.includes('getPendientesConSugerencia');

  if ((hasNavigateIntent || wantsIngresos) && wantsIngresos && !wantsGastos) {
    const params: CopilotNavigateParams = {};
    if (year) params.year = year;
    if (month) params.month = month;
    const probe = executeCopilotAction(user, 'navigate_ingresos', params);
    if (probe.ok) {
      actions.push(
        makeNavigateAction(
          year ? `Abrir ingresos ${year}` : 'Abrir ingresos',
          year ? `Ver ingresos del año ${year} con filtros aplicados.` : 'Ver listado de ingresos.',
          'navigate_ingresos',
          params,
        ),
      );
    } else if (probe.denied) {
      actions.push({
        label: 'Ingresos no disponibles',
        description: probe.error,
        actionType: 'review',
      });
    }
  }

  if ((hasNavigateIntent || wantsGastos) && wantsGastos && !wantsIngresos) {
    const params: CopilotNavigateParams = {};
    if (year) params.year = year;
    if (month) params.month = month;
    const tipo = inferTipoGasto(text);
    const subtipo = inferSubtipo(text);
    if (tipo) params.tipo_gasto = tipo;
    if (subtipo) params.subtipo_gasto = subtipo;
    const probe = executeCopilotAction(user, 'navigate_gastos', params);
    if (probe.ok) {
      actions.push(
        makeNavigateAction(
          year ? `Abrir gastos ${year}` : 'Abrir gastos',
          'Ver gastos con filtros aplicados en pantalla.',
          'navigate_gastos',
          params,
        ),
      );
    }
  }

  if ((hasNavigateIntent || wantsInversiones) && wantsInversiones) {
    const params: CopilotNavigateParams = {};
    const probe = executeCopilotAction(user, 'navigate_inversiones_generales', params);
    if (probe.ok) {
      actions.push(
        makeNavigateAction(
          'Abrir inversiones',
          'Ver inversiones generales por vehículo.',
          'navigate_inversiones_generales',
          params,
        ),
      );
    }
  }

  if ((hasNavigateIntent || wantsPendientes) && wantsPendientes) {
    const probe = executeCopilotAction(user, 'navigate_pendientes_ia', {});
    if (probe.ok) {
      actions.push(
        makeNavigateAction(
          'Ver pendientes IA',
          'Abrir centro de clasificación con pendientes.',
          'navigate_pendientes_ia',
          {},
        ),
      );
    }
  }

  return actions;
}

/** Fusiona acciones enriquecidas sin duplicar labels. */
export function mergeCopilotActions(
  existing: AiSuggestedAction[] | undefined,
  extra: AiSuggestedAction[],
): AiSuggestedAction[] {
  const out = [...(existing ?? [])];
  const seen = new Set(out.map((a) => a.label.trim().toLowerCase()));
  for (const a of extra) {
    const key = a.label.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
