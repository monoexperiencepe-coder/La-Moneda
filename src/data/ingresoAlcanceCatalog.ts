/** Alcance del ingreso: ligado a unidad o extraordinario de empresa. */
export type AlcanceIngreso = 'vehicular' | 'extraordinario';

/** Valor persistido en `tipo` para ingresos no vehiculares. */
export const TIPO_INGRESO_EXTRAORDINARIO = 'EXTRAORDINARIO';

export const ALCANCE_INGRESO_OPTIONS: { value: AlcanceIngreso; label: string; hint: string }[] = [
  {
    value: 'vehicular',
    label: 'Vehicular',
    hint: 'Cobro ligado a una unidad (alquiler, garantías, etc.)',
  },
  {
    value: 'extraordinario',
    label: 'Extraordinario',
    hint: 'Ingreso de empresa sin vehículo (devolución, seguro, venta, etc.)',
  },
];

export const CATEGORIAS_INGRESO_EXTRAORDINARIO = [
  { value: 'DEVOLUCION', label: 'Devolución' },
  { value: 'REINTEGRO', label: 'Reintegro' },
  { value: 'REPARACION', label: 'Reparación / pago de reparación' },
  { value: 'MULTA_RECUPERADA', label: 'Multa recuperada' },
  { value: 'SEGURO', label: 'Seguro' },
  { value: 'AJUSTE', label: 'Ajuste financiero' },
  { value: 'VENTA', label: 'Venta' },
  { value: 'OTROS', label: 'Otros' },
] as const;

export type CategoriaIngresoExtraordinario = (typeof CATEGORIAS_INGRESO_EXTRAORDINARIO)[number]['value'];

const EXTRAORDINARIO_LABEL_BY_VALUE = Object.fromEntries(
  CATEGORIAS_INGRESO_EXTRAORDINARIO.map((c) => [c.value, c.label]),
) as Record<CategoriaIngresoExtraordinario, string>;

export function labelCategoriaIngresoExtraordinario(
  subTipo: string | null | undefined,
): string {
  const key = (subTipo ?? '').trim().toUpperCase().replace(/\s+/g, '_') as CategoriaIngresoExtraordinario;
  return EXTRAORDINARIO_LABEL_BY_VALUE[key] ?? (subTipo?.trim() || 'Extraordinario');
}
