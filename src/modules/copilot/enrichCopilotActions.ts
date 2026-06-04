import type { AiSuggestedAction, AiToolName } from '../ai/types';
import type { CopilotActionId, CopilotNavigateParams } from './copilotActions';
import { executeCopilotAction } from './copilotActions';
import type { PermissionUser } from '../../utils/permissions';
import { canViewSection } from '../../utils/permissions';
import { messageImpliesMaintenance } from '../ai/maintenanceSubtipos';

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
  const idx = months.findIndex((mo) => new RegExp(`\\b${mo}\\b`, 'i').test(lower));
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
  if (messageImpliesMaintenance(t)) return 'mantenimiento';
  return undefined;
}

function inferMaintenanceScope(text: string): boolean {
  return messageImpliesMaintenance(text);
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
  const wantsFlotaOps =
    toolsUsed.includes('getFlotaResumen') ||
    toolsUsed.includes('getConteoConductores') ||
    toolsUsed.includes('getAlertasAutomaticas') ||
    toolsUsed.includes('getVehiculoPorNumero') ||
    toolsUsed.includes('getConductorPorNumero') ||
    toolsUsed.includes('getVehiculosDisponibles') ||
    toolsUsed.includes('getConductoresAsignados') ||
    toolsUsed.includes('getVehiculosSinConductor');

  if (wantsFlotaOps) {
    if (toolsUsed.includes('getConteoConductores') && canViewSection(user, 'operaciones')) {
      actions.push(
        makeNavigateAction(
          'Ver conductores',
          'Abrir listado de conductores.',
          'navigate_conductores',
          {},
        ),
      );
    }
    if (
      (toolsUsed.includes('getFlotaResumen') ||
        toolsUsed.includes('getVehiculosDisponibles') ||
        toolsUsed.includes('getVehiculosSinConductor')) &&
      canViewSection(user, 'vehiculos')
    ) {
      actions.push(
        makeNavigateAction(
          'Ver flota',
          'Abrir inventario de vehículos.',
          'navigate_flota_inventario',
          {},
        ),
      );
    }
    if (toolsUsed.includes('getAlertasAutomaticas')) {
      actions.push(
        makeNavigateAction(
          'Ver alertas',
          'Abrir Qué hacer hoy.',
          'navigate_home_alertas',
          { view: 'alertas' },
        ),
      );
    }
    return actions;
  }

  const hasNavigateIntent =
    /\b(muestr|muéstr|muestra|ver|abre|abrir|ll[eé]v|naveg|ir a|mostrar)\b/.test(text);

  const wantsIngresos =
    text.includes('ingreso') ||
    toolsUsed.includes('getIngresosPeriodo') ||
    toolsUsed.includes('getIngresosHistoricosPorMes') ||
    toolsUsed.includes('getResumenFinancieroPeriodo');
  const wantsGastos =
    text.includes('gasto') ||
    toolsUsed.includes('getGastosPeriodo') ||
    toolsUsed.includes('getGastosPorCategoria') ||
    toolsUsed.includes('getVehiculosConMasGasto');
  const wantsInversiones =
    text.includes('inversi') ||
    toolsUsed.includes('getRankingInversionVehiculos') ||
    toolsUsed.includes('getDetalleInversionVehiculo');
  const wantsPendientesRevision =
    text.includes('clasificar') ||
    toolsUsed.includes('getPendientesRevision') ||
    toolsUsed.includes('getPendientesConSugerencia');
  const wantsPendientesEquipo =
    toolsUsed.includes('getPendientesResumen') ||
    (text.includes('pendiente') && /\bequipo|operativ/.test(text));

  if ((hasNavigateIntent || wantsPendientesEquipo) && wantsPendientesEquipo) {
    const probe = executeCopilotAction(user, 'navigate_pendientes_equipo', {});
    if (probe.ok) {
      actions.push(
        makeNavigateAction(
          'Ver pendientes',
          'Abrir pendientes del equipo.',
          'navigate_pendientes_equipo',
          {},
        ),
      );
    }
  }

  if ((hasNavigateIntent || wantsIngresos) && wantsIngresos && !wantsGastos) {
    const params: CopilotNavigateParams = {};
    if (year) params.year = year;
    if (month) params.month = month;
    const probe = executeCopilotAction(user, 'navigate_ingresos', params);
    if (probe.ok) {
      actions.push(
        makeNavigateAction(
          year ? `Ver ingresos del ${year}` : 'Ver ingresos',
          year ? `Resumen de ingresos del ${year}` : 'Ver listado de ingresos.',
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
    const mantenimientoScope = inferMaintenanceScope(text);
    if (mantenimientoScope) {
      params.tipo_gasto = 'operativo_vehiculo';
      params.mantenimientoScope = true;
    } else {
      if (tipo) params.tipo_gasto = tipo;
      if (subtipo) params.subtipo_gasto = subtipo;
    }
    const probe = executeCopilotAction(user, 'navigate_gastos', params);
    if (probe.ok) {
      actions.push(
        makeNavigateAction(
          mantenimientoScope
            ? year
              ? `Ver mantenimiento ${year}`
              : 'Ver mantenimiento'
            : year
              ? `Ver gastos del ${year}`
              : 'Ver gastos',
          mantenimientoScope
            ? 'Gastos de mantenimiento y reparación vehicular.'
            : 'Ver gastos con filtros aplicados.',
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
          'Ver inversiones',
          'Ver inversiones en activos por vehículo.',
          'navigate_inversiones_generales',
          params,
        ),
      );
    }
  }

  if ((hasNavigateIntent || wantsPendientesRevision) && wantsPendientesRevision) {
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
  const seen = new Set(out.map((a) => `${a.label.trim().toLowerCase()}|${(a.description ?? '').trim().toLowerCase()}`));
  for (const a of extra) {
    const key = `${a.label.trim().toLowerCase()}|${(a.description ?? '').trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
