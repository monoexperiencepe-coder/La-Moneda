import type { CategoriaDescuento } from './types';

export const CATEGORIAS_DESCUENTO: readonly CategoriaDescuento[] = [
  'CHOQUE',
  'DESCANSO_MEDICO',
  'DIA_AUTORIZADO',
  'OTROS',
  'PLANCHADO',
  'TALLER',
] as const;

export const LABEL_CATEGORIA_DESCUENTO: Record<CategoriaDescuento, string> = {
  CHOQUE: 'Choque',
  DESCANSO_MEDICO: 'Descanso médico',
  DIA_AUTORIZADO: 'Día autorizado',
  OTROS: 'Otros',
  PLANCHADO: 'Planchado',
  TALLER: 'Taller',
};
