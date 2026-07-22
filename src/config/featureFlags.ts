/**
 * Feature flags de módulos opcionales.
 * Garantías: off por defecto. Activar con VITE_GUARANTEES_MODULE=1
 */
export const FEATURE_FLAGS = {
  /** Módulo Garantías (Fase 1). Menú, rutas y widgets informativos. */
  GUARANTEES_MODULE: String(import.meta.env.VITE_GUARANTEES_MODULE ?? '').trim() === '1',
  /**
   * Fase 2: sincronizar garantía al asignar conductor↔vehículo.
   * Debe permanecer false hasta aprobación explícita.
   */
  GUARANTEES_AUTO_ASSIGNMENT: String(import.meta.env.VITE_GUARANTEES_AUTO_ASSIGNMENT ?? '').trim() === '1',
} as const;

export function isGuaranteesModuleEnabled(): boolean {
  return FEATURE_FLAGS.GUARANTEES_MODULE;
}

export function isGuaranteesAutoAssignmentEnabled(): boolean {
  return FEATURE_FLAGS.GUARANTEES_MODULE && FEATURE_FLAGS.GUARANTEES_AUTO_ASSIGNMENT;
}
