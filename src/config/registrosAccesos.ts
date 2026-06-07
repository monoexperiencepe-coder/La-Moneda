import type { PermissionUser } from '../utils/permissions';
import { canMutateVehiculos } from '../utils/permissions';

export type RegistrosAccesoDef = {
  id: string;
  emoji: string;
  /** Etiqueta en menú FAB */
  menuLabel: string;
  /** Etiqueta corta en Home */
  quickLabel: string;
  hint: string;
  path: string;
  quickCls: string;
  quickGlow: string;
  /** Solo admin / socio / contador */
  requiresVehiculosMutate?: boolean;
  /** Abre modal global (sin navegar) */
  openModal?: 'indisponibilidad';
};

export const REGISTROS_ACCESOS: RegistrosAccesoDef[] = [
  {
    id: 'ingreso',
    emoji: '💵',
    menuLabel: 'Registrar ingreso',
    quickLabel: '+ Ingreso',
    hint: 'Registrar cobro',
    path: '/finanzas/ingresos?registrar=1',
    quickCls: 'border-emerald-200 bg-gradient-to-br from-white to-emerald-50/80 text-emerald-950',
    quickGlow: 'hover:shadow-[0_4px_20px_rgba(16,185,129,0.18)]',
  },
  {
    id: 'gasto',
    emoji: '💸',
    menuLabel: 'Registrar gasto',
    quickLabel: '+ Gasto',
    hint: 'Registrar salida',
    path: '/finanzas/gastos?registrar=1',
    quickCls: 'border-rose-200 bg-gradient-to-br from-white to-rose-50/80 text-rose-950',
    quickGlow: 'hover:shadow-[0_4px_20px_rgba(244,63,94,0.18)]',
  },
  {
    id: 'kilometraje',
    emoji: '🛠️',
    menuLabel: 'Kilometraje',
    quickLabel: '+ Kilometraje',
    hint: 'Control de km',
    path: '/operaciones/mantenimiento',
    quickCls: 'border-slate-200 bg-gradient-to-br from-white to-slate-50/80 text-slate-900',
    quickGlow: 'hover:shadow-[0_4px_20px_rgba(100,116,139,0.18)]',
  },
  {
    id: 'vencimiento',
    emoji: '📋',
    menuLabel: 'Vencimiento',
    quickLabel: '+ Vencimiento',
    hint: 'Documento / fecha',
    path: '/operaciones/docs',
    quickCls: 'border-amber-200 bg-gradient-to-br from-white to-amber-50/80 text-amber-950',
    quickGlow: 'hover:shadow-[0_4px_20px_rgba(245,158,11,0.18)]',
  },
  {
    id: 'pendiente',
    emoji: '📌',
    menuLabel: 'Pendiente',
    quickLabel: '+ Pendiente',
    hint: 'Tarea operativa',
    path: '/operaciones/pendientes',
    quickCls: 'border-violet-200 bg-gradient-to-br from-white to-violet-50/80 text-violet-950',
    quickGlow: 'hover:shadow-[0_4px_20px_rgba(139,92,246,0.18)]',
  },
  {
    id: 'indisponibilidad',
    emoji: '🚫',
    menuLabel: 'Registrar indisponibilidad',
    quickLabel: '+ Indisp.',
    hint: 'Días fuera y pérdida estimada',
    path: '/operaciones/disponibilidad',
    quickCls: 'border-rose-200 bg-gradient-to-br from-white to-rose-50/80 text-rose-950',
    quickGlow: 'hover:shadow-[0_4px_20px_rgba(244,63,94,0.18)]',
    requiresVehiculosMutate: true,
    openModal: 'indisponibilidad',
  },
  {
    id: 'conductor',
    emoji: '👤',
    menuLabel: 'Registrar conductor',
    quickLabel: '+ Conductor',
    hint: 'Alta de conductor',
    path: '/operaciones/conductores?registrar=1',
    quickCls: 'border-sky-200 bg-gradient-to-br from-white to-sky-50/80 text-sky-950',
    quickGlow: 'hover:shadow-[0_4px_20px_rgba(14,165,233,0.18)]',
  },
  {
    id: 'vehiculo',
    emoji: '🚗',
    menuLabel: 'Registrar vehículo',
    quickLabel: '+ Vehículo',
    hint: 'Alta de unidad',
    path: '/vehiculos/inventario?registrar=1',
    quickCls: 'border-indigo-200 bg-gradient-to-br from-white to-indigo-50/80 text-indigo-950',
    quickGlow: 'hover:shadow-[0_4px_20px_rgba(99,102,241,0.18)]',
    requiresVehiculosMutate: true,
  },
];

export function filterRegistrosAccesos(
  items: readonly RegistrosAccesoDef[],
  user: PermissionUser | null | undefined,
): RegistrosAccesoDef[] {
  return items.filter((item) => {
    if (item.requiresVehiculosMutate && !canMutateVehiculos(user)) return false;
    return true;
  });
}
