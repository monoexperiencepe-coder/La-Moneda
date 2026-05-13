/**
 * Gastos de representación interna (antes «personales / socios / familiares»).
 * tipo_gasto en BD: `representacion_interna` (histórico puede ser personal_socios_familiares / personal_socios).
 */

export const REPRESENTACION_INTERNA_FACT_TIPO = 'OTROS GASTOS' as const;
export const REPRESENTACION_INTERNA_FACT_SUBTIPO = 'REPRESENTACIÓN' as const;

/** Códigos persistidos en `subtipo_gasto` (snake_case). Orden = formulario. */
export const SUBTIPOS_REPRESENTACION_INTERNA = [
  'movilidad_socios',
  'almuerzo_socios',
  'reunion_socios',
  'gasto_representacion',
] as const;

export type SubtipoRepresentacionInterna = (typeof SUBTIPOS_REPRESENTACION_INTERNA)[number];

const DEFAULT_SUBTIPO: SubtipoRepresentacionInterna = SUBTIPOS_REPRESENTACION_INTERNA[0];

/**
 * Frase ya normalizada (`norm` de parseQuickEntry): devuelve código `subtipo_gasto` o null.
 * Orden: movilidad → almuerzo → reunión → representación (quick entry).
 * «Cena familiar» ya no es subtipo propio: va a `gasto_representacion` si coincide la frase.
 */
export function matchRepresentacionInternaSubtipoFromNormPhrase(n: string): SubtipoRepresentacionInterna | null {
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
  ) {
    return 'movilidad_socios';
  }
  if (
    (n.includes('ALMUERZO') && n.includes('SOCIO'))
    || (n.includes('COMIDA') && n.includes('SOCIO'))
    || n.includes('ALMUERZO SOCIOS')
    || n.includes('COMIDA SOCIOS')
  ) {
    return 'almuerzo_socios';
  }
  if (
    n.includes('REUNION SOCIOS')
    || n.includes('REUNIÓN SOCIOS')
    || ((n.includes('REUNION') || n.includes('REUNIÓN')) && n.includes('SOCIO'))
  ) {
    return 'reunion_socios';
  }
  if (n.includes('CENA FAMILIAR') || (n.includes('CENA') && (n.includes('FAMILIAR') || n.includes('FAMILIA')))) {
    return 'gasto_representacion';
  }
  if (n.includes('REPRESENTACION') || n.includes('REPRESENTACIÓN')) {
    return 'gasto_representacion';
  }
  return null;
}

export function defaultSubtipoRepresentacionInterna(): SubtipoRepresentacionInterna {
  return DEFAULT_SUBTIPO;
}
