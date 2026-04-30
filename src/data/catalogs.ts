import { CategoriaGasto, TipoDocumento, TipoDomicilio } from './types';

/** Tipos de ingreso según Dim_SubTipo Fact (hoja Fact) */
export { TIPOS_INGRESO_FACT as TIPOS_INGRESO } from './factCatalog';

export const GASTOS_MECANICOS = [
  'AIRE A/C',
  'AUTOPARTES',
  'BATERIA',
  'DIRECCIÓN Y SUSPENSIÓN',
  'GNV',
  'GPS',
  'HIDROCARBUROS - GRIFO',
  'LLANTA',
  'MANTENIMIENTO',
  'OTROS MECANICOS',
  'PLANCHADO',
  'TALLER DE GAS',
  'TALLER MOTOR',
  'ALINEAMIENTO Y BALANCEO',
  'DESCUENTO POR DEMORA TALLER',
  'LAVADO DE UNIDADES',
  'OTROS GASTOS',
];

export const GASTOS_FIJOS = [
  'SUELDOS',
  'INTERESES',
  'SEGUROS',
  'OTROS G.FIJOS',
  'RECARGA DE CHIPS',
  'GRATIFICACION',
  'ALQUILERES',
];

export const GASTOS_TRIBUTARIOS = [
  'ASESORÍA',
  'MULTAS',
  'PAPELETA',
  'REVISION TECNICA',
  'SAT',
  'SUNARP',
  'SUNAT',
  'TRÁMITES',
  'SOAT',
];

export const GASTOS_PROVISIONALES = [
  'CAJA FUERTE',
  'DELIVERY',
  'HERRAMIENTAS',
  'OFICINA',
  'OTROS PROVISIONALES',
  'REFACCIONES OFICINA',
  'REPRE. A SOCIO',
  'SUBSIDIOS',
  'TRANSPORTE',
  'ALMUERZOS SOCIOS',
];

export const CATEGORIAS_GASTO: Record<CategoriaGasto, string[]> = {
  GASTOS_MECANICOS,
  GASTOS_FIJOS,
  GASTOS_TRIBUTARIOS,
  GASTOS_PROVISIONALES,
};

export const CATEGORIAS_GASTO_LABELS: Record<CategoriaGasto, string> = {
  GASTOS_MECANICOS: 'Gastos Mecánicos',
  GASTOS_FIJOS: 'Gastos Fijos',
  GASTOS_TRIBUTARIOS: 'Gastos Tributarios',
  GASTOS_PROVISIONALES: 'Gastos Provisionales',
};

export const MARCAS_AUTOS: Record<string, string[]> = {
  TOYOTA: ['YARIS'],
  NISSAN: ['VERSA'],
  KIA: ['RIO', 'SOLUTO'],
  HYUNDAI: ['VERNA'],
};

export const TIPOS_DOCUMENTO: TipoDocumento[] = ['DNI', 'CE', 'PASAPORTE'];
export const TIPOS_DOMICILIO: TipoDomicilio[] = ['PROPIO', 'ALQUILADO', 'CASA DE FAMILIA'];

export const MESES = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

export const ANIOS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

export const CATEGORIA_COLORS: Record<CategoriaGasto, string> = {
  GASTOS_MECANICOS: '#4F46E5',
  GASTOS_FIJOS: '#8B5CF6',
  GASTOS_TRIBUTARIOS: '#F59E0B',
  GASTOS_PROVISIONALES: '#10B981',
};
