import { AI_TOOL_DEFINITIONS } from '../ai/tools/definitions';
import { canExecuteAiTool } from '../ai/permissions';
import type { AiToolName } from '../ai/types';
import type { PermissionUser } from '../../utils/permissions';

export type CopilotInventoryRow = {
  tool: string;
  enabled: boolean;
  descripcion: string;
  fuente: string;
};

const TOOL_FUENTE: Partial<Record<AiToolName, string>> = {
  getResumenFinancieroPeriodo: 'public.ingresos + public.gastos',
  getIngresosPeriodo: 'public.ingresos',
  getIngresosHistoricosPorMes: 'public.ingresos',
  getGastosPeriodo: 'public.gastos',
  getGastosPorCategoria: 'public.gastos',
  getVehiculosConMasGasto: 'public.gastos (operativo_vehiculo)',
  getTopVehiculosUtilidad: 'public.ingresos + public.gastos (vehicle_id)',
  getPendientesRevision: 'public.gastos (pendiente_revision)',
  getGastosGlobales: 'public.gastos (gastos_globales)',
  getPrestamosActivos: 'prestamos financieros',
  getMovimientosRecientes: 'public.gastos',
  getHistorialVehiculo: 'public.gastos',
  suggestCategoriaGasto: 'heurística local (sin SQL)',
  getPendientesConSugerencia: 'public.gastos + pendientes',
  getRankingInversionVehiculos: 'inversiones_generales_vehiculo',
  getDetalleInversionVehiculo: 'inversiones_generales_vehiculo',
  getInversionesNoVehiculares: 'public.gastos (inversion_compra)',
  getFlotaResumen: 'public.vehiculos + public.conductores',
  getConteoConductores: 'public.conductores',
  getAlertasAutomaticas: 'computeTodayReview (Home)',
  getVehiculosDisponibles: 'public.vehiculos + public.conductores',
  getConductoresAsignados: 'public.conductores + public.vehiculos',
  getVehiculosSinConductor: 'public.vehiculos + public.conductores',
  getVehiculoPorPlaca: 'public.vehiculos',
  getConductorPorVehiculo: 'public.conductores + public.vehiculos',
};

/** Dominios de negocio vs cobertura de tools (incluye huecos sin tool). */
const DOMAIN_GAPS: CopilotInventoryRow[] = [
  {
    tool: 'documentacion_vencimientos',
    enabled: false,
    descripcion: 'Documentos vencidos / por vencer.',
    fuente: 'public.control_fechas (sin tool IA)',
  },
  {
    tool: 'reportes_hub',
    enabled: false,
    descripcion: 'Reportes exportables y secciones analíticas.',
    fuente: 'UI Reportes (sin tool IA)',
  },
];

export function buildCopilotToolInventory(user: PermissionUser | null): CopilotInventoryRow[] {
  const fromTools: CopilotInventoryRow[] = AI_TOOL_DEFINITIONS.map((def) => {
    const name = def.function.name;
    return {
      tool: name,
      enabled: user ? canExecuteAiTool(user, name) : false,
      descripcion: def.function.description.slice(0, 160),
      fuente: TOOL_FUENTE[name] ?? 'app',
    };
  });

  const domainAliases: CopilotInventoryRow[] = [
    {
      tool: 'vehiculos',
      enabled: user ? canExecuteAiTool(user, 'getFlotaResumen') : false,
      descripcion: 'Conteo y estado de flota → getFlotaResumen',
      fuente: 'public.vehiculos',
    },
    {
      tool: 'conductores',
      enabled: user ? canExecuteAiTool(user, 'getConteoConductores') : false,
      descripcion: 'Conteo de conductores → getConteoConductores',
      fuente: 'public.conductores',
    },
    {
      tool: 'alertas_automaticas',
      enabled: user ? canExecuteAiTool(user, 'getAlertasAutomaticas') : false,
      descripcion: 'Alertas «Qué hacer hoy» → getAlertasAutomaticas',
      fuente: 'computeTodayReview (Home)',
    },
    {
      tool: 'ingresos',
      enabled: user ? canExecuteAiTool(user, 'getIngresosPeriodo') : false,
      descripcion: 'Ingresos por periodo',
      fuente: 'public.ingresos',
    },
    {
      tool: 'gastos',
      enabled: user ? canExecuteAiTool(user, 'getGastosPeriodo') : false,
      descripcion: 'Gastos OPEX/CAPEX por periodo',
      fuente: 'public.gastos',
    },
  ];

  return [...domainAliases, ...fromTools, ...DOMAIN_GAPS];
}

export function auditCopilotInventory(user: PermissionUser | null): CopilotInventoryRow[] {
  const rows = buildCopilotToolInventory(user);
  console.table(rows.map((r) => ({ tool: r.tool, enabled: r.enabled, fuente: r.fuente })));
  console.log('[auditCopilot] inventario completo', rows);
  return rows;
}
