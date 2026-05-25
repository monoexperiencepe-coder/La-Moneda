/**
 * Registry seguro de acciones de navegación del Copiloto.
 * NO acepta rutas arbitrarias del modelo — solo acciones registradas.
 */
import type { AiSuggestedAction } from '../ai/types';
import { canUseAiAssistant } from '../ai/permissions';
import {
  canViewSection,
  type PermissionUser,
} from '../../utils/permissions';

export type CopilotActionId =
  | 'navigate_ingresos'
  | 'navigate_gastos'
  | 'navigate_inversiones'
  | 'navigate_inversiones_generales'
  | 'navigate_vehiculo'
  | 'navigate_documentacion'
  | 'navigate_pendientes_ia'
  | 'navigate_asistente';

export type CopilotNavigateParams = {
  year?: number | string;
  month?: number | string;
  search?: string;
  tipo_gasto?: string;
  subtipo_gasto?: string;
  /** Subtipo canónico de inversión no vehicular (inversion_terreno / inversion_inmueble / etc.) */
  subtipo_inversion?: string;
  vehicleId?: number | string;
  placa?: string;
};

export type CopilotNavigateResult =
  | { ok: true; path: string; params: Record<string, string>; statusLabel: string }
  | { ok: false; error: string; denied?: boolean };

const ALLOWED_PATH_PREFIXES = [
  '/finanzas/ingresos',
  '/finanzas/gastos',
  '/finanzas/inversiones',
  '/finanzas/inversiones/generales',
  '/finanzas/ia-clasificacion',
  '/operaciones/docs',
  '/vehiculos/',
  '/asistente',
] as const;

function padMonth(m: number | string): string {
  const n = Math.trunc(Number(m));
  if (!Number.isFinite(n) || n < 1 || n > 12) return '';
  return String(n).padStart(2, '0');
}

function normYear(y: number | string | undefined): string | null {
  if (y == null || y === '') return null;
  const n = Math.trunc(Number(y));
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return null;
  return String(n);
}

function buildQueryParams(input: CopilotNavigateParams): Record<string, string> {
  const params: Record<string, string> = {};
  const year = normYear(input.year);
  if (year) params.year = year;
  const month = input.month != null ? padMonth(input.month) : '';
  if (month) params.month = month;
  if (input.search?.trim()) params.search = input.search.trim().slice(0, 120);
  if (input.tipo_gasto?.trim()) params.tipo_gasto = input.tipo_gasto.trim();
  if (input.subtipo_gasto?.trim()) params.subtipo_gasto = input.subtipo_gasto.trim();
  if (input.subtipo_inversion?.trim()) params.subtipo_gasto = input.subtipo_inversion.trim();
  if (input.placa?.trim()) params.placa = input.placa.trim().toUpperCase();
  if (input.vehicleId != null && String(input.vehicleId).trim()) {
    params.vehicleId = String(input.vehicleId).trim();
  }
  return params;
}

function assertPathAllowed(path: string): boolean {
  return ALLOWED_PATH_PREFIXES.some((p) => path === p || path.startsWith(p));
}

function denied(msg: string): CopilotNavigateResult {
  return { ok: false, error: msg, denied: true };
}

export function navigateToIngresos(
  user: PermissionUser,
  filters: CopilotNavigateParams = {},
): CopilotNavigateResult {
  if (!canViewSection(user, 'finanzas_ingresos')) {
    return denied('No tienes permiso para ver ingresos.');
  }
  const params = buildQueryParams(filters);
  const year = params.year;
  return {
    ok: true,
    path: '/finanzas/ingresos',
    params,
    statusLabel: year ? `Abriendo ingresos ${year}…` : 'Abriendo ingresos…',
  };
}

export function navigateToGastos(
  user: PermissionUser,
  filters: CopilotNavigateParams = {},
): CopilotNavigateResult {
  if (!canViewSection(user, 'finanzas_gastos')) {
    return denied('No tienes permiso para ver gastos.');
  }
  const params = buildQueryParams(filters);
  const parts: string[] = ['Abriendo gastos'];
  if (params.year) parts.push(params.year);
  if (params.tipo_gasto) parts.push(params.tipo_gasto.replace(/_/g, ' '));
  return {
    ok: true,
    path: '/finanzas/gastos',
    params,
    statusLabel: `${parts.join(' ')}…`,
  };
}

export function navigateToInversiones(
  user: PermissionUser,
  filters: Pick<CopilotNavigateParams, 'vehicleId' | 'placa' | 'subtipo_inversion'> = {},
): CopilotNavigateResult {
  if (!canViewSection(user, 'finanzas_inversiones')) {
    return denied('No tienes permiso para ver inversiones.');
  }
  const params = buildQueryParams(filters);
  const subLabel: Record<string, string> = {
    adquisicion_vehiculo: 'vehículos',
    compra_terreno: 'terrenos',
    acondicionamiento_areas: 'acondicionamiento',
    laptops: 'laptops',
    electrodomesticos: 'electrodomésticos',
    sistema_seguridad: 'seguridad',
    equipamiento_taller: 'taller',
    compra_software_gestion: 'software',
    muebles_enseres: 'muebles',
    equipamiento_oficina: 'oficina',
    inversion_terreno: 'terrenos',
    inversion_inmueble: 'inmuebles',
    inversion_general: 'general',
    otros_activos: 'otros activos',
    inversion_vehicular: 'vehiculares',
  };
  const sub = filters.subtipo_inversion;
  return {
    ok: true,
    path: params.vehicleId || params.placa ? '/finanzas/inversiones/generales' : '/finanzas/inversiones',
    params,
    statusLabel: params.placa
      ? `Abriendo inversiones (${params.placa})…`
      : params.vehicleId
        ? `Abriendo inversiones vehículo ${params.vehicleId}…`
        : sub
          ? `Abriendo inversiones ${subLabel[sub] ?? sub}…`
          : 'Abriendo inversiones…',
  };
}

export function navigateToVehiculo(
  user: PermissionUser,
  filters: Pick<CopilotNavigateParams, 'vehicleId' | 'placa'> = {},
): CopilotNavigateResult {
  if (!canViewSection(user, 'vehiculos')) {
    return denied('No tienes permiso para ver vehículos.');
  }
  const id = filters.vehicleId != null ? String(filters.vehicleId).trim() : '';
  if (!id) {
    return { ok: false, error: 'Indica vehicleId para abrir el detalle del vehículo.' };
  }
  const path = `/vehiculos/${encodeURIComponent(id)}`;
  if (!assertPathAllowed(path)) {
    return { ok: false, error: 'Ruta de vehículo no permitida.' };
  }
  return {
    ok: true,
    path,
    params: {},
    statusLabel: `Abriendo vehículo ${id}…`,
  };
}

export function navigateToDocumentacion(
  user: PermissionUser,
  filters: Pick<CopilotNavigateParams, 'year' | 'search'> = {},
): CopilotNavigateResult {
  if (!canViewSection(user, 'operaciones')) {
    return denied('No tienes permiso para ver documentación.');
  }
  const params = buildQueryParams(filters);
  return {
    ok: true,
    path: '/operaciones/docs',
    params,
    statusLabel: params.year ? `Abriendo documentación ${params.year}…` : 'Abriendo documentación…',
  };
}

export function navigateToPendientesIA(user: PermissionUser): CopilotNavigateResult {
  if (!canViewSection(user, 'finanzas_gastos')) {
    return denied('No tienes permiso para ver pendientes de clasificación.');
  }
  return {
    ok: true,
    path: '/finanzas/ia-clasificacion',
    params: {},
    statusLabel: 'Abriendo pendientes IA…',
  };
}

export function navigateToAsistente(user: PermissionUser): CopilotNavigateResult {
  if (!canUseAiAssistant(user)) {
    return denied('No tienes permiso para usar el asistente IA.');
  }
  return {
    ok: true,
    path: '/asistente',
    params: {},
    statusLabel: 'Abriendo asistente…',
  };
}

export function executeCopilotAction(
  user: PermissionUser,
  actionId: CopilotActionId,
  params: CopilotNavigateParams = {},
): CopilotNavigateResult {
  switch (actionId) {
    case 'navigate_ingresos':
      return navigateToIngresos(user, params);
    case 'navigate_gastos':
      return navigateToGastos(user, params);
    case 'navigate_inversiones':
    case 'navigate_inversiones_generales':
      return navigateToInversiones(user, params);
    case 'navigate_vehiculo':
      return navigateToVehiculo(user, params);
    case 'navigate_documentacion':
      return navigateToDocumentacion(user, params);
    case 'navigate_pendientes_ia':
      return navigateToPendientesIA(user);
    case 'navigate_asistente':
      return navigateToAsistente(user);
    default:
      return { ok: false, error: 'Acción de copiloto no reconocida.' };
  }
}

/** Valida ruta explícita del payload contra whitelist y permisos de sección. */
export function resolveWhitelistedRoute(
  user: PermissionUser,
  path: string,
  params: Record<string, string> = {},
): CopilotNavigateResult | null {
  const normalized = path.split('?')[0].trim();
  if (!assertPathAllowed(normalized)) return null;

  if (normalized === '/finanzas/ingresos') return navigateToIngresos(user, params);
  if (normalized === '/finanzas/gastos') return navigateToGastos(user, params);
  if (normalized.startsWith('/finanzas/inversiones')) return navigateToInversiones(user, params);
  if (normalized.startsWith('/vehiculos/')) {
    const id = normalized.replace('/vehiculos/', '');
    return navigateToVehiculo(user, { vehicleId: id });
  }
  if (normalized === '/operaciones/docs') return navigateToDocumentacion(user, params);
  if (normalized === '/finanzas/ia-clasificacion') return navigateToPendientesIA(user);
  if (normalized === '/asistente') return navigateToAsistente(user);
  return null;
}

export function resolveCopilotActionFromSuggested(
  user: PermissionUser,
  action: AiSuggestedAction,
): CopilotNavigateResult | null {
  if (action.actionType !== 'navigate' && action.actionType !== 'apply_filters') return null;

  const payload = (action.payload ?? {}) as Record<string, unknown>;
  const copilotAction = typeof payload.copilotAction === 'string' ? payload.copilotAction : null;
  const copilotParams = (payload.copilotParams ?? payload.filters ?? payload.params ?? {}) as CopilotNavigateParams;

  if (copilotAction) {
    const result = executeCopilotAction(user, copilotAction as CopilotActionId, copilotParams);
    return result.ok ? result : result;
  }

  const route = typeof payload.route === 'string' ? payload.route : null;
  if (route) {
    const rawParams =
      payload.params && typeof payload.params === 'object'
        ? (payload.params as Record<string, string>)
        : {};
    const merged: Record<string, string> = { ...rawParams };
    if (typeof payload.tipo_gasto === 'string') merged.tipo_gasto = payload.tipo_gasto;
    if (typeof payload.estado === 'string') merged.estado = payload.estado;
    if (typeof payload.year === 'string' || typeof payload.year === 'number') {
      merged.year = String(payload.year);
    }
    if (typeof payload.month === 'string' || typeof payload.month === 'number') {
      merged.month = String(payload.month);
    }
  if (typeof payload.search === 'string') merged.search = payload.search;
    const resolved = resolveWhitelistedRoute(user, route, merged);
    if (resolved) return resolved;
    return { ok: false, error: 'Ruta no permitida por el copiloto.' };
  }

  return null;
}

export function buildNavigateUrl(result: Extract<CopilotNavigateResult, { ok: true }>): string {
  const qs = new URLSearchParams(result.params).toString();
  return qs ? `${result.path}?${qs}` : result.path;
}
