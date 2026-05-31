/**
 * Auditoría técnica DEV (solo lectura / logs). No modifica BD.
 */
import type { Gasto, Conductor, Vehicle, KilometrajeRegistro, Ingreso } from '../data/types';
import { getOfficialSubtiposForCategoria } from '../constants/subtipos/officialSubtiposCatalog';
import { buildUnifiedSubtipoCatalog } from '../constants/subtipos/buildUnifiedSubtipoCatalog';
import {
  auditSubtiposAdmin as auditSubtiposAdminPayload,
  auditSubtiposInversion,
  auditSubtiposRepresentacion,
} from './auditSubtiposCatalog';
import { auditKmQaFlowMeta, getKmDesdeUltimoMantenimiento } from '../utils/kmMantenimientoControl';
import { auditDocumentacionQaFlowMeta } from '../utils/documentacionQaFlow';
import type { PermissionUser } from '../utils/permissions';
import { canViewGastoTipo } from '../utils/permissions';
import { buildFlotaResumen } from '../modules/fleet/fleetAnalytics';

// ─── 1. Vehículos y conductores ─────────────────────────────────────────────

export function auditVehiculos(vehicles: readonly Vehicle[]): void {
  const activos = vehicles.filter((v) => v.activo !== false);
  console.log('[vehiculos:audit]', {
    total: vehicles.length,
    activos: activos.length,
    inactivos: vehicles.length - activos.length,
    muestra: vehicles.slice(0, 5).map((v) => ({
      id: v.id,
      placa: v.placa,
      marca: v.marca,
      modelo: v.modelo,
      activo: v.activo,
    })),
    fuente: 'public.vehiculos via fetchVehiculos → RegistrosContext.vehicles',
    crudUi: false,
    crudService: 'vehiculosService.ts (solo lectura)',
    altaNueva: 'Excel/scripts o insert manual Supabase (RLS: admin/contador/socio)',
    aiToolFlotaCount: true,
  });
}

/** Resumen operativo de flota (DEV). */
export function auditFlotaSummary(
  vehicles: readonly Vehicle[],
  conductores: readonly Conductor[],
): void {
  console.log('[vehiculos:summary]', buildFlotaResumen(vehicles, conductores));
}

export function auditConductores(
  conductores: readonly Conductor[],
  vehicles: readonly Vehicle[],
): void {
  const conVehiculo = conductores.filter((c) => c.vehicleId != null);
  const sinVehiculo = conductores.length - conVehiculo.length;
  const vehicleIds = new Set(vehicles.map((v) => String(v.id)));
  const huerfanos = conVehiculo.filter((c) => !vehicleIds.has(String(c.vehicleId)));
  console.log('[conductores:audit]', {
    total: conductores.length,
    conVehicleId: conVehiculo.length,
    sinVehicleId: sinVehiculo,
    vehicleIdHuerfanos: huerfanos.length,
    relacion: 'conductores.vehicle_id → vehiculos.id (N:1, primer VIGENTE en UI)',
    fuente: 'public.conductores via fetchConductores',
    crudUi: true,
    muestra: conductores.slice(0, 5).map((c) => ({
      id: c.id,
      vehicleId: c.vehicleId,
      estado: c.estado,
      nombre: `${c.nombres} ${c.apellidos}`.trim(),
    })),
  });
}

// ─── 2. Kilometraje ───────────────────────────────────────────────────────────

/** Informe estático del flujo QA kilometraje (ruta, tabla, undo, umbral alerta). */
export function auditKmQaFlow(): ReturnType<typeof auditKmQaFlowMeta> {
  const meta = auditKmQaFlowMeta();
  console.log('[km:qa-flow]', meta);
  return meta;
}

/** Informe estático del flujo QA documentación (ruta, tabla, CRUD, cleanup). */
export function auditDocumentacionQaFlow(): ReturnType<typeof auditDocumentacionQaFlowMeta> {
  const meta = auditDocumentacionQaFlowMeta();
  console.log('[documentacion:qa-flow]', meta);
  return meta;
}

export function auditKmState(
  kilometrajes: readonly KilometrajeRegistro[],
  vehicleId?: number | string | null,
): void {
  const filtered = vehicleId != null
    ? kilometrajes.filter((k) => String(k.vehicleId) === String(vehicleId))
    : kilometrajes;
  const resumen =
    vehicleId != null
      ? getKmDesdeUltimoMantenimiento(Number(vehicleId), [...kilometrajes])
      : null;
  console.log('[km:audit]', {
    totalGlobal: kilometrajes.length,
    filtroVehicleId: vehicleId ?? 'todos',
    filasFiltradas: filtered.length,
    resumenVehiculo: resumen,
    fuenteUnica: 'RegistrosContext.kilometrajes[]',
    historial: 'slice ordenado fecha desc (raw rows)',
    resumenSuperior: 'getKmDesdeUltimoMantenimiento (ignora semanal si fecha < último mantenimiento)',
    postCreateRefetch: false,
    realtimeTabla: 'kilometrajes',
  });
}

export function logKmAfterCreate(
  created: KilometrajeRegistro,
  kilometrajes: readonly KilometrajeRegistro[],
): void {
  const resumen = getKmDesdeUltimoMantenimiento(Number(created.vehicleId), [...kilometrajes]);
  console.log('[km:after-create]', {
    id: created.id,
    vehicleId: created.vehicleId,
    fecha: created.fecha,
    kilometraje: created.kilometraje,
    kmMantenimiento: created.kmMantenimiento,
    descripcion: created.descripcion?.slice(0, 80),
    totalEnMemoria: kilometrajes.length,
    resumenTrasMerge: resumen,
  });
}

export function logKmSummaryRefresh(vehicleId: number | string, kilometrajes: readonly KilometrajeRegistro[]): void {
  console.log('[km:summary-refresh]', {
    vehicleId,
    resumen: getKmDesdeUltimoMantenimiento(Number(vehicleId), [...kilometrajes]),
    rowCount: kilometrajes.filter((k) => String(k.vehicleId) === String(vehicleId)).length,
  });
}

export function logKmRealtime(
  eventType: string,
  row: KilometrajeRegistro | null,
  action: 'merge' | 'remove',
): void {
  console.log('[km:realtime]', { eventType, action, id: row?.id, vehicleId: row?.vehicleId, fecha: row?.fecha });
}

// ─── 3. Historial / edición ───────────────────────────────────────────────────

export function logHistorialEditOrder(ctx: {
  role?: string;
  gastoId: string;
  oldRevisadoAt?: string | null;
  newRevisadoAt?: string | null;
  appearsOnTop?: boolean;
  tipo_gasto?: string | null;
  subtipo_gasto?: string | null;
  revisado_at?: string | null;
  createdAt?: string;
  fecha?: string;
  source: string;
  pinned?: boolean;
}): void {
  console.log('[historial:edit-order]', ctx);
}

export function logHistorialUpdatedAt(ctx: {
  gastoId: string;
  revisado_at: string | null | undefined;
  createdAt: string;
  fecha: string;
  path: 'move' | 'detail_edit' | 'realtime' | 'create' | 'historial_sync';
  willSurviveRefresh: boolean;
}): void {
  console.log('[historial:updated-at]', ctx);
}

export function logHistorialAdminRefresh(ctx: {
  scope: 'recent' | 'full';
  tipo_gasto: string;
  rowsCount: number;
  topRow?: { id: string; revisado_at?: string | null; fecha: string };
}): void {
  console.log('[historial:admin-refresh]', ctx);
}

// ─── 4. Realtime ──────────────────────────────────────────────────────────────

let lastRealtimeRole: string | null = null;

export function setRealtimeAuditRole(role: string | null): void {
  lastRealtimeRole = role;
}

export function logRealtimeAudit(ctx: {
  eventType: string;
  table: string;
  recordId?: string | number | null;
  refreshTriggered?: boolean;
  handler?: string;
  tipo_gasto?: string | null;
  visibleToCurrentUser?: boolean;
}): void {
  const role = lastRealtimeRole ?? 'unknown';
  console.log('[realtime:audit]', {
    ...ctx,
    receivedByRole: role,
    receivedByAdmin: role === 'admin' || role === 'socio' || role === 'contador',
    receivedByOperator: role === 'operador',
  });
}

// ─── 5. Subtipos ────────────────────────────────────────────────────────────

export function auditSubtiposAdmin(gastos: readonly Pick<Gasto, 'tipo_gasto' | 'subtipo_gasto'>[]): void {
  auditSubtiposAdminPayload(gastos);
}

export { auditSubtiposRepresentacion, auditSubtiposInversion };

export function auditSubtiposAll(gastos: readonly Pick<Gasto, 'tipo_gasto' | 'subtipo_gasto'>[]): void {
  const categorias = [
    'operativo_vehiculo',
    'operativo_flota_general',
    'administrativo_empresa',
    'financiero_prestamo',
    'inversion_compra',
    'representacion_interna',
    'planilla_laboral',
    'gastos_globales',
  ] as const;
  const resumen = categorias.map((cat) => {
    const oficial = getOfficialSubtiposForCategoria(cat).length;
    const histArr = Array.from(
      new Set(
        gastos
          .filter((g) => g.tipo_gasto === cat)
          .map((g) => g.subtipo_gasto?.trim() ?? '')
          .filter((s) => s.length > 0),
      ),
    );
    const mergedCount = buildUnifiedSubtipoCatalog(cat, histArr).options.length;
    return { categoria: cat, oficial, historicosBd: histArr.length, mergedOptions: mergedCount };
  });
  console.log('[subtipos:audit-all]', { categorias: resumen });
}

// ─── Registro global DEV ──────────────────────────────────────────────────────

export type TechAuditContext = {
  getVehicles: () => Vehicle[];
  getConductores: () => Conductor[];
  getKilometrajes: () => KilometrajeRegistro[];
  getGastos: () => Gasto[];
  getIngresos?: () => Ingreso[];
  getPermissionUser: () => PermissionUser | null;
};

export function runTechAuditFull(ctx: TechAuditContext): void {
  auditVehiculos(ctx.getVehicles());
  auditConductores(ctx.getConductores(), ctx.getVehicles());
  auditFlotaSummary(ctx.getVehicles(), ctx.getConductores());
  auditKmState(ctx.getKilometrajes());
  auditSubtiposAdmin(ctx.getGastos());
  auditSubtiposAll(ctx.getGastos());
  console.info('[tech-audit] Completo. También: window.auditInversionSubtipos(), window.auditGastosConciliacion()');
}

export function auditRealtimeVisibility(
  user: PermissionUser | null,
  gasto: Pick<Gasto, 'id' | 'tipo_gasto'>,
): void {
  const visible = canViewGastoTipo(user, gasto.tipo_gasto ?? null);
  logRealtimeAudit({
    eventType: 'CHECK',
    table: 'gastos',
    recordId: gasto.id,
    tipo_gasto: gasto.tipo_gasto,
    visibleToCurrentUser: visible,
    handler: visible ? 'upsertGasto' : 'removeGastoLocal',
  });
}
