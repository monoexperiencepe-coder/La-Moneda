/**
 * Registro oficial de superficies con montos accesibles por CONTADOR.
 * Mantener alineado con la auditoría de permisos de montos.
 */

export type AmountSurfaceRisk = 'CRÍTICO' | 'ALTO' | 'MEDIO' | 'BAJO' | 'NINGUNO';

export type AmountSurfaceEntry = {
  component: string;
  accessibleByContador: boolean;
  risk: AmountSurfaceRisk;
  migrated: boolean;
};

/** Fuente oficial — orden de cierre de riesgo. */
export const AMOUNT_SURFACE_REGISTRY: AmountSurfaceEntry[] = [
  { component: 'ExportarSection / reportesExport', accessibleByContador: true, risk: 'CRÍTICO', migrated: true },
  { component: 'Resumen', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'UtilidadOperativa', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'Reportes — RendimientoMensual', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'Reportes — Ingresos', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'Reportes — GastosOperativos', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'Reportes — RentabilidadVehiculo', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'Reportes — UtilidadAcumulada', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'Reportes — PrestamosAportes', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'GastosMesChart', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'IngresosMesChart', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'MonthlyBarChartCard', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'VehiculoDetalle', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'VehicleCard', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'VehiculosHub', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'CajaNegocio', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'GastosCaja', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'Financiamiento — PrestamosPanel', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'Financiamiento — AportesPanel', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'Financiamiento — PrestamosRegistroTable', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'Financiamiento — PrestamoHistorialTimeline', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'Financiamiento — PrestamoCapitalModal', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'Inversiones', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'InversionesGeneralesPanel', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'Metas / metasGuiaCoach', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'Gastos (KPIs header)', accessibleByContador: true, risk: 'MEDIO', migrated: true },
  { component: 'FinanzasHub', accessibleByContador: true, risk: 'MEDIO', migrated: true },
  { component: 'PendienteRevisionConciliacionPanel', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'RevisionClasificacion', accessibleByContador: true, risk: 'ALTO', migrated: true },
  { component: 'ControlGlobal', accessibleByContador: true, risk: 'MEDIO', migrated: true },
  { component: 'MantenimientoView', accessibleByContador: true, risk: 'MEDIO', migrated: true },
  { component: 'RegistrosTable / Dashboard / Ingresos', accessibleByContador: true, risk: 'BAJO', migrated: true },
  { component: 'IAClasificacion (ruta bloqueada)', accessibleByContador: false, risk: 'BAJO', migrated: false },
  { component: 'ReportesView (sin ruta)', accessibleByContador: false, risk: 'BAJO', migrated: false },
];

export type AmountSurfaceAuditSummary = {
  ALTO: number;
  CRÍTICO: number;
  MEDIO: number;
  pendientes: AmountSurfaceEntry[];
};

export function summarizeAmountSurfaceAudit(
  registry: AmountSurfaceEntry[] = AMOUNT_SURFACE_REGISTRY,
): AmountSurfaceAuditSummary {
  const pendientes = registry.filter((e) => e.accessibleByContador && !e.migrated && (e.risk === 'ALTO' || e.risk === 'CRÍTICO'));
  return {
    ALTO: pendientes.filter((e) => e.risk === 'ALTO').length,
    CRÍTICO: pendientes.filter((e) => e.risk === 'CRÍTICO').length,
    MEDIO: registry.filter((e) => e.accessibleByContador && !e.migrated && e.risk === 'MEDIO').length,
    pendientes,
  };
}
