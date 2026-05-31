/**
 * Gastos de representación interna (antes «personales / socios / familiares»).
 * tipo_gasto en BD: `representacion_interna` (histórico puede ser personal_socios_familiares / personal_socios).
 */

export const REPRESENTACION_INTERNA_FACT_TIPO = 'OTROS GASTOS' as const;
export const REPRESENTACION_INTERNA_FACT_SUBTIPO = 'REPRESENTACIÓN' as const;

/** Valores oficiales Excel (nuevos registros). Históricos snake_case siguen en BD. */
export const SUBTIPOS_REPRESENTACION_INTERNA = [
  'ALMUERZOS SOCIOS',
  'REGALOS EMPRESARIALES',
  'INVITACIONES A EVENTOS PARA CLIENTES',
  'ALOJAMIENTOS',
  'TRASLADO EJECUTIVOS',
  'REUNIONES CORPORATIVOS INTERNOS',
  'RECONOCIMIENTOS',
  'CAPACITACION',
  'MOBILIARIO',
] as const;

export type SubtipoRepresentacionInterna = (typeof SUBTIPOS_REPRESENTACION_INTERNA)[number];

const DEFAULT_SUBTIPO: SubtipoRepresentacionInterna = SUBTIPOS_REPRESENTACION_INTERNA[0];

/**
 * Frase ya normalizada (`norm` de parseQuickEntry): devuelve código `subtipo_gasto` o null.
 */
export function matchRepresentacionInternaSubtipoFromNormPhrase(
  n: string,
): SubtipoRepresentacionInterna | null {
  if (!n) return null;
  if (
    n.includes('TAXI SOCIOS')
    || n.includes('MOVILIDAD SOCIOS')
    || n.includes('TAXI')
    || n.includes('MOVILIDAD')
    || n.includes('TRANSPORTE')
    || n.includes('PASAJE')
    || n.includes('UBER')
    || n.includes('DIDI')
    || n.includes('INDRIVE')
    || n.includes('TRASLADO EJECUTIV')
  ) {
    return 'TRASLADO EJECUTIVOS';
  }
  if (
    (n.includes('ALMUERZO') && n.includes('SOCIO'))
    || (n.includes('COMIDA') && n.includes('SOCIO'))
    || n.includes('ALMUERZO SOCIOS')
    || n.includes('COMIDA SOCIOS')
  ) {
    return 'ALMUERZOS SOCIOS';
  }
  if (
    n.includes('REUNION SOCIOS')
    || n.includes('REUNIÓN SOCIOS')
    || n.includes('REUNIONES CORPORATIV')
    || ((n.includes('REUNION') || n.includes('REUNIÓN')) && n.includes('SOCIO'))
  ) {
    return 'REUNIONES CORPORATIVOS INTERNOS';
  }
  if (n.includes('REGALO')) return 'REGALOS EMPRESARIALES';
  if (n.includes('ALOJAM')) return 'ALOJAMIENTOS';
  if (n.includes('RECONOCIM')) return 'RECONOCIMIENTOS';
  if (n.includes('CAPACITAC')) return 'CAPACITACION';
  if (n.includes('MOBILIARIO')) return 'MOBILIARIO';
  if (n.includes('INVITACION') && n.includes('EVENTO')) {
    return 'INVITACIONES A EVENTOS PARA CLIENTES';
  }
  if (n.includes('CENA FAMILIAR') || (n.includes('CENA') && (n.includes('FAMILIAR') || n.includes('FAMILIA')))) {
    return 'INVITACIONES A EVENTOS PARA CLIENTES';
  }
  if (n.includes('REPRESENTACION') || n.includes('REPRESENTACIÓN')) {
    return 'INVITACIONES A EVENTOS PARA CLIENTES';
  }
  return null;
}

export function defaultSubtipoRepresentacionInterna(): SubtipoRepresentacionInterna {
  return DEFAULT_SUBTIPO;
}
