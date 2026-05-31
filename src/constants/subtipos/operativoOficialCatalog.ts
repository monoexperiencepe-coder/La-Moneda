/**
 * Catálogo oficial de subtipos operativos (dueño de negocio).
 * Mismo listado para operativo_vehiculo y operativo_flota_general.
 */
export const OFFICIAL_OPERATIVO_SUBTIPO_VALUES = [
  'AFOCAT',
  'ATU',
  'GARANTÍAS',
  'MUNICIPALES',
  'OFICINA',
  'OTROS / ESPECIFICAR',
  'PERMISOS VARIOS',
  'FARO / ARREGLOS',
  'REVISIÓN TÉCNICA PARTICULAR',
  'REVISIÓN TÉCNICA TAXI',
  'SAT',
  'SEGUROS',
  'SOAT',
  'SUNARP',
  'SUNAT',
  'SUTRAN',
  'TAXI O DELIVERY',
  'TRABAJOS EVENTUALES',
  'TRÁMITES NOTARIALES',
  'ÚTILES DE OFICINA',
  'ACCESORIOS',
  'AIRE ACONDICIONADO',
  'BATERÍA',
  'COMBUSTIBLE',
  'DOCUMENTOS',
  'ELECTRICISTA',
  'FRENOS',
  'GNV TALLER',
  'GPS EQUIPOS',
  'IMPUESTO VEHICULAR',
  'FUNDAS O FORROS AUTO',
  'MANTENIMIENTO SIMPLE',
  'MANTENIMIENTO COMPLETO',
  'MOTOR TALLER',
  'SUSPENSIÓN',
  'LLANTAS',
  'PLANCHADO / PINTURA',
  'GPS RECARGA CHIPS',
  'CANASTA O REGALO',
  'MULTA CALLE',
  'DEVOLUCIÓN GARANTÍA',
] as const;

export type OfficialOperativoSubtipoValue = (typeof OFFICIAL_OPERATIVO_SUBTIPO_VALUES)[number];

export const OPERATIVO_SUBTIPO_REQUIERE_REVISION = '__requiere_revision__';

export function getOfficialOperativoSubtipoEntries(): ReadonlyArray<{ value: string; label: string }> {
  return OFFICIAL_OPERATIVO_SUBTIPO_VALUES.map((value) => ({ value, label: value }));
}

export function getOfficialOperativoSubtipoValues(): readonly string[] {
  return OFFICIAL_OPERATIVO_SUBTIPO_VALUES;
}
