/**
 * Categorías financieras al registrar un gasto (misma capa que `tipo_gasto` en Supabase).
 * `inversion_compra` alimenta Finanzas → Inversiones → Inversión con utilidad.
 */
import { TIPOS_GASTO_FACT } from './factCatalog';
import { REPRESENTACION_INTERNA_FACT_TIPO } from './representacionInterna';

export type FinanzaGastoRegistroValue =
  | 'operativo_vehiculo'
  | 'operativo_flota_general'
  | 'administrativo_empresa'
  | 'financiero_prestamo'
  | 'planilla_laboral'
  | 'representacion_interna'
  | 'gastos_globales'
  | 'inversion_compra';

export const FINANZA_GASTO_REGISTRO_OPTIONS: {
  value: FinanzaGastoRegistroValue;
  label: string;
  emoji: string;
  hint: string;
}[] = [
  {
    value: 'operativo_vehiculo',
    label: 'Operativos por vehículo',
    emoji: '🔧',
    hint: 'Gasto por unidad: taller, repuestos, SOAT de unidad, combustible, etc. Requiere N° vehículo.',
  },
  {
    value: 'operativo_flota_general',
    label: 'Operativo flota general',
    emoji: '🚛',
    hint: 'Varios vehículos o sin trazabilidad exacta de unidad. No asignes un carro si distorsiona KPIs por unidad.',
  },
  {
    value: 'administrativo_empresa',
    label: 'Administrativos',
    emoji: '🏢',
    hint: 'SUNAT, oficina, boletas, servicios de empresa sin unidad.',
  },
  {
    value: 'financiero_prestamo',
    label: 'Financieros',
    emoji: '🏦',
    hint: 'Préstamos, intereses, bancos.',
  },
  {
    value: 'planilla_laboral',
    label: 'Planilla',
    emoji: '👥',
    hint: 'Sueldos, planilla, gratificaciones laborales.',
  },
  {
    value: 'representacion_interna',
    label: 'Representación interna',
    emoji: '🤝',
    hint: 'Almuerzos/cenas socios, familia, reuniones y representación (sin elegir tipo Fact redundante).',
  },
  {
    value: 'gastos_globales',
    label: 'Globales',
    emoji: '🌐',
    hint: 'Gasto de flota sin unidad concreta (varios carros, flota).',
  },
  {
    value: 'inversion_compra',
    label: 'Inversión con utilidad',
    emoji: '🚗',
    hint: 'Compra o inversión por unidad (tabla gastos, tipo inversion_compra). Requiere N° vehículo.',
  },
];

/**
 * Tipos Fact (Dim) permitidos por categoría financiera.
 * Orden = orden sugerido en el desplegable.
 */
export const FACT_TIPOS_POR_FINANZA_GASTO: Record<FinanzaGastoRegistroValue, readonly string[]> = {
  operativo_vehiculo: [
    'MECÁNICOS',
    'ABASTECIMIENTO DE COMBUSTIBLE',
    'ACCESORIOS',
    'GNV',
    'IMPLEMENTACIÓN',
    'DOCUMENTOS',
    'SEGUROS /DOCUMENTOS',
  ],
  operativo_flota_general: [
    'MECÁNICOS',
    'ABASTECIMIENTO DE COMBUSTIBLE',
    'ACCESORIOS',
    'GNV',
    'IMPLEMENTACIÓN',
    'DOCUMENTOS',
    'SEGUROS /DOCUMENTOS',
    'OTROS GASTOS',
  ],
  administrativo_empresa: [
    'TRIBUTARIOS / NOTARIALES',
    'GASTOS FIJOS',
    'OTROS GASTOS',
    'DOCUMENTOS',
    'SEGUROS /DOCUMENTOS',
    'COMPRA ACTIVO',
    'DEVOLUCION POR INGRESO TRANSITORIO',
  ],
  financiero_prestamo: ['GASTOS FIJOS', 'OTROS GASTOS', 'TRIBUTARIOS / NOTARIALES'],
  planilla_laboral: ['GASTOS FIJOS'],
  /** Un solo tipo Fact fijo en UI; el detalle va en `subtipo_gasto`. */
  representacion_interna: [REPRESENTACION_INTERNA_FACT_TIPO],
  gastos_globales: ['OTROS GASTOS', 'MECÁNICOS', 'ACCESORIOS', 'GASTOS FIJOS', 'ABASTECIMIENTO DE COMBUSTIBLE'],
  inversion_compra: [
    'COMPRA ACTIVO',
    'ACCESORIOS',
    'IMPLEMENTACIÓN',
    'DOCUMENTOS',
    'SEGUROS /DOCUMENTOS',
    'MECÁNICOS',
    'OTROS GASTOS',
    'TRIBUTARIOS / NOTARIALES',
  ],
};

/** Tipos Fact existentes en catálogo, en el orden definido para la categoría. */
export function getFactTiposForFinanza(cat: FinanzaGastoRegistroValue): string[] {
  const prefer = FACT_TIPOS_POR_FINANZA_GASTO[cat];
  const valid = new Set(TIPOS_GASTO_FACT);
  return prefer.filter((t) => valid.has(t));
}

export function firstFactTipoForFinanza(cat: FinanzaGastoRegistroValue): string {
  const list = getFactTiposForFinanza(cat);
  return list[0] ?? TIPOS_GASTO_FACT[0] ?? '';
}
