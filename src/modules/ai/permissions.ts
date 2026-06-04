import type { PermissionUser } from '../../utils/permissions';
import {
  canAccessAI,
  canUseFinanciamiento,
  canUseIngresos,
  canUseReports,
  isFinancialOperadorRestricted,
} from '../../utils/permissions';
import type { AiToolName } from './types';

const OPERADOR_ALLOWED_TOOLS: ReadonlySet<AiToolName> = new Set([
  'getGastosPeriodo',
  'getGastosPorCategoria',
  'getPendientesRevision',
  'getGastosGlobales',
  'getMovimientosRecientes',
  'suggestCategoriaGasto',
  'getPendientesConSugerencia',
  // Flota operativa (sin montos ni reportes financieros)
  'getFlotaResumen',
  'getConteoConductores',
  'getAlertasAutomaticas',
  'getDocumentosResumen',
  'getPendientesResumen',
  'getDetalleAlertas',
  'getDocumentosPorRango',
  'getDocumentosVehiculo',
  'getVehiculosDisponibles',
  'getConductoresAsignados',
  'getVehiculosSinConductor',
  'getVehiculoPorPlaca',
  'getConductorPorVehiculo',
  'getVehiculoPorNumero',
  'getConductorPorNumero',
]);

/** Consultas de flota: vehículos, conductores, disponibilidad. No incluye montos ni reportes. */
export const FLEET_TOOLS: ReadonlySet<AiToolName> = new Set([
  'getFlotaResumen',
  'getConteoConductores',
  'getAlertasAutomaticas',
  'getDocumentosResumen',
  'getPendientesResumen',
  'getDetalleAlertas',
  'getDocumentosPorRango',
  'getDocumentosVehiculo',
  'getVehiculosDisponibles',
  'getConductoresAsignados',
  'getVehiculosSinConductor',
  'getVehiculoPorPlaca',
  'getConductorPorVehiculo',
  'getVehiculoPorNumero',
  'getConductorPorNumero',
]);

const FINANCE_TOOLS: ReadonlySet<AiToolName> = new Set([
  'getResumenFinancieroPeriodo',
  'getIngresosPeriodo',
  'getIngresosHistoricosPorMes',
  'getVehiculosConMasGasto',
  'getTopVehiculosUtilidad',
  'getUtilidadVehiculo',
  'getIngresosVehiculo',
  'getGastosVehiculo',
  'getUtilidadVehiculoDetalle',
  'getGastosVehiculoDesglose',
  'getDocumentosPorRango',
  'getDocumentosVehiculo',
  'getPrestamosActivos',
  'getHistorialVehiculo',
  // Inversiones vehiculares (datos de adquisición)
  'getRankingInversionVehiculos',
  'getDetalleInversionVehiculo',
  // Inversiones no vehiculares (gastos.inversion_compra con subtipos no vehiculares)
  'getInversionesNoVehiculares',
]);

/** ¿Puede usar el asistente IA? (operador restringido + admin/socio). Contador: no. */
export function canUseAiAssistant(user: PermissionUser | null | undefined): boolean {
  if (!user) return false;
  if (isFinancialOperadorRestricted(user)) return true;
  return canAccessAI(user.role);
}

/** ¿Puede ejecutar esta herramienta con el rol actual? */
function canUseFleetTools(user: PermissionUser): boolean {
  if (isFinancialOperadorRestricted(user)) return true;
  return (
    user.role === 'admin' ||
    user.role === 'socio' ||
    user.role === 'operador'
  );
}

export function canExecuteAiTool(user: PermissionUser | null | undefined, tool: AiToolName): boolean {
  if (!user) return false;
  if (!canUseAiAssistant(user)) return false;
  if (FLEET_TOOLS.has(tool)) return canUseFleetTools(user);
  if (isFinancialOperadorRestricted(user)) {
    return OPERADOR_ALLOWED_TOOLS.has(tool);
  }
  if (tool === 'getIngresosPeriodo') return canUseIngresos(user);
  if (tool === 'getIngresosHistoricosPorMes') return canUseIngresos(user);
  if (tool === 'getIngresosVehiculo') return canUseIngresos(user);
  if (tool === 'getResumenFinancieroPeriodo') return canUseReports(user);
  if (tool === 'getPrestamosActivos') return canUseFinanciamiento(user);
  if (FINANCE_TOOLS.has(tool)) return canUseReports(user) || canUseFinanciamiento(user);
  return true;
}

export function aiToolDeniedMessage(tool: AiToolName): string {
  return `No tienes permiso para consultar «${tool}». Tu rol solo permite gastos globales, pendientes de revisión y sugerencias de clasificación.`;
}
