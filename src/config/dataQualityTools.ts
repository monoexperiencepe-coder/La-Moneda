import type { AppRole } from '../data/types';

export const DATA_QUALITY_TOOLS_DISABLED_MSG =
  'Data Quality tools desactivadas. Activa VITE_DATA_QUALITY_TOOLS=1';

export function isDataQualityToolsEnabled(): boolean {
  return String(import.meta.env.VITE_DATA_QUALITY_TOOLS ?? '').trim() === '1';
}

/** Ver panel y auditorías (admin o socio). */
export function canViewDataQualityTools(role: AppRole): boolean {
  return role === 'admin' || role === 'socio';
}

/** Aplicar correcciones (operador excluido). */
export function canApplyDataQualityFixes(role: AppRole): boolean {
  return role === 'admin' || role === 'socio';
}
