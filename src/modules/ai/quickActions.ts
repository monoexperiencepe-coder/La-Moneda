import type { PermissionUser } from '../../utils/permissions';
import { isFinancialOperadorRestricted } from '../../utils/permissions';

export type AiQuickAction = {
  id: string;
  label: string;
  prompt: string;
};

const ADMIN_ACTIONS: AiQuickAction[] = [
  {
    id: 'resume-mes',
    label: 'Resume este mes',
    prompt:
      'Resume el mes actual: ingresos, gastos, utilidad aproximada, categorías principales y pendientes de revisión. Usa solo datos reales.',
  },
  {
    id: 'pendientes',
    label: 'Gastos pendientes',
    prompt: 'Lista los gastos pendientes de revisión y posibles duplicados. No inventes datos.',
  },
  {
    id: 'vehiculos-gasto',
    label: 'Vehículos con más gasto',
    prompt: '¿Qué vehículos tuvieron más gasto operativo este mes? Muestra ranking con montos.',
  },
  {
    id: 'por-categoria',
    label: 'Gastos por categoría',
    prompt: 'Muestra gastos por categoría (tipo_gasto) del mes actual con totales.',
  },
  {
    id: 'prestamos',
    label: 'Préstamos activos',
    prompt: 'Lista los préstamos financieros activos con capital y cuota si está disponible.',
  },
  {
    id: 'movimientos',
    label: 'Movimientos recientes',
    prompt: 'Muéstrame los movimientos de gastos más recientes visibles para mi rol.',
  },
  {
    id: 'errores',
    label: 'Detectar posibles errores',
    prompt:
      'Revisa gastos del mes y movimientos recientes: detecta posibles duplicados, montos anómalos y pendientes sin clasificar. Solo alertas basadas en datos.',
  },
  {
    id: 'pendientes-sug',
    label: 'Pendientes con sugerencia',
    prompt:
      'Usa getPendientesConSugerencia para listar pendientes y gastos globales con categoría sugerida. Indica que deben revisarse manualmente (no aplicar automático).',
  },
];

const OPERADOR_ACTIONS: AiQuickAction[] = [
  {
    id: 'pendientes-clasificar',
    label: 'Pendientes por clasificar',
    prompt: '¿Qué registros faltan clasificar? Lista pendiente_revision con montos y motivos.',
  },
  {
    id: 'globales',
    label: 'Gastos globales',
    prompt: 'Resume los gastos globales recientes visibles para mi rol.',
  },
  {
    id: 'sugerir-cat',
    label: 'Sugerir categoría',
    prompt:
      'Sugiere categoría y subtipo para: "ARRANCADOR COMPLETO" (usa suggestCategoriaGasto con motivo y contexto). No apliques cambios.',
  },
  {
    id: 'movimientos-op',
    label: 'Movimientos recientes',
    prompt: 'Muéstrame movimientos recientes de gastos que puedo ver como operador.',
  },
  {
    id: 'pendientes-sug-op',
    label: 'Pendientes con sugerencia',
    prompt:
      'Trae pendientes y gastos globales con sugerencia de clasificación (getPendientesConSugerencia). Solo revisión manual.',
  },
];

export function getAiQuickActionsForUser(user: PermissionUser | null | undefined): AiQuickAction[] {
  if (!user) return [];
  if (isFinancialOperadorRestricted(user)) return OPERADOR_ACTIONS;
  return ADMIN_ACTIONS;
}
