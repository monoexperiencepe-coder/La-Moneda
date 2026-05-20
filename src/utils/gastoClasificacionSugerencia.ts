import type { Gasto } from '../data/types';
import { normKey } from './subtipoFinancieroLabel';

export type ClasificacionSugerencia = {
  tipo_gasto: string;
  subtipo_gasto: string;
  razon: string;
};

function textoGasto(g: Gasto): string {
  return normKey(
    [g.motivo, g.comentarios, g.tipo, g.subTipo, g.subtipo_gasto, g.categoria, g.categoriaReal, g.subcategoria]
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .join(' '),
  );
}

type Regla = {
  test: (t: string) => boolean;
  sug: ClasificacionSugerencia;
};

const REGLAS: Regla[] = [
  {
    test: (t) => /\b(sat|multa|tramite|tramites|papeleta|infraccion)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'multas_tramites', razon: 'Texto tipo SAT / multas / trámites' },
  },
  {
    test: (t) => /\b(soat|afocat|seguro\s+vehicular|poliza)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'documentos', razon: 'Texto tipo SOAT / documentos vehículo' },
  },
  {
    test: (t) => /\b(aceite|lubricante|filtro\s+aceite|cambio\s+aceite)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'motor', razon: 'Texto tipo aceite / motor' },
  },
  {
    test: (t) => /\b(llanta|llantas|rodaje|neumatico|goma)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'llantas', razon: 'Texto tipo llantas' },
  },
  {
    test: (t) => /\b(freno|frenos|pastilla|disco\s+freno)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'frenos', razon: 'Texto tipo frenos' },
  },
  {
    test: (t) => /\b(combustible|gasolina|grifo|petroleo|diesel|gnv|glp)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'combustible', razon: 'Texto tipo combustible' },
  },
  {
    test: (t) => /\b(prestamo|prestamos|interes|banco|cuota|credito|financier)\b/.test(t),
    sug: { tipo_gasto: 'financiero_prestamo', subtipo_gasto: 'prestamo', razon: 'Texto tipo préstamo / financiero' },
  },
  {
    test: (t) => /\b(planilla|sueldo|gratificacion|cts|essalud\s+laboral)\b/.test(t),
    sug: { tipo_gasto: 'planilla_laboral', subtipo_gasto: 'planilla', razon: 'Texto tipo planilla laboral' },
  },
  {
    test: (t) => /\b(compra\s+activo|inversion|inversi[oó]n|compra\s+carro|compra\s+vehiculo|compra\s+unidad)\b/.test(t),
    sug: { tipo_gasto: 'inversion_compra', subtipo_gasto: 'inversion_compra', razon: 'Texto tipo inversión / compra activo' },
  },
  {
    test: (t) => /\b(almuerzo|cena|representacion|socio|reunion)\b/.test(t),
    sug: {
      tipo_gasto: 'representacion_interna',
      subtipo_gasto: 'gasto_representacion',
      razon: 'Texto tipo representación / socios',
    },
  },
  {
    test: (t) => /\b(sunat|notarial|tributari|oficina|administrativ)\b/.test(t),
    sug: {
      tipo_gasto: 'administrativo_empresa',
      subtipo_gasto: 'administrativo_general',
      razon: 'Texto tipo administrativo / tributario',
    },
  },
  {
    test: (t) => /\b(taller|mecanico|repuesto|motor|bateria|gps|chip)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'motor', razon: 'Texto tipo operativo vehículo' },
  },
];

/** Heurística local (sin IA). No aplica cambios; solo sugiere. */
export function sugerirClasificacionGasto(g: Gasto): ClasificacionSugerencia | null {
  const t = textoGasto(g);
  if (!t) return null;
  for (const r of REGLAS) {
    if (r.test(t)) return r.sug;
  }
  return null;
}
