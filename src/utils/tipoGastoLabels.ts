/**
 * Etiquetas visibles para `tipo_gasto` (sin cambiar valores persistidos).
 */
const TIPO_GASTO_LABEL: Record<string, string> = {
  operativo_vehiculo: 'Operativos por vehículo',
  operativo_flota_general: 'Operativo flota general',
  administrativo_empresa: 'Administrativos',
  financiero_prestamo: 'Financieros',
  planilla_laboral: 'Planilla',
  representacion_interna: 'Representación interna',
  personal_socios_familiares: 'Representación interna',
  personal_socios: 'Representación interna',
  personales: 'Representación interna',
  otros_gastos_varios: 'Otros gastos / Gastos varios',
  gastos_globales: 'Globales',
  inversion_compra: 'Inversión con utilidad',
  pendiente_revision: 'Pendiente de revisión',
  /** Valores legacy / históricos (misma etiqueta que el canonical). */
  financiero: 'Financieros',
  inversion: 'Inversión con utilidad',
  operativo_flota_global: 'Globales',
};
export function labelTipoGastoFinanciero(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  if (!t) return '—';
  return TIPO_GASTO_LABEL[t] ?? t;
}
