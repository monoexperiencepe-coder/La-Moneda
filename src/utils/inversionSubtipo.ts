/**
 * Catálogo canónico de subtipos de inversión (tipo_gasto = inversion_compra).
 *
 * Sigue el patrón de operativoSubtipo.ts:
 * - valor canónico persistido en subtipo_gasto (snake_case)
 * - mapeo a tipo/subTipo Fact para compatibilidad con el catálogo histórico
 * - normalización desde valores legacy y texto libre
 *
 * NO rompe datos existentes: los registros sin subtipo_inversion o con
 * subtipo_gasto = 'inversion_compra' / 'VEHÍCULO' / 'compra_activo_vehiculo'
 * se tratan como 'inversion_vehicular' (compatibilidad hacia atrás).
 */

export type InversionSubtipoCanon =
  | 'inversion_vehicular'
  | 'inversion_terreno'
  | 'inversion_inmueble'
  | 'inversion_general'
  | 'otros_activos';

export interface InversionSubtipoOption {
  value: InversionSubtipoCanon;
  label: string;
  /** Icono sugerido para UI */
  icon: string;
}

export const INVERSION_SUBTIPO_OPTIONS: InversionSubtipoOption[] = [
  { value: 'inversion_vehicular', label: 'Inversión vehicular',  icon: '🚐' },
  { value: 'inversion_terreno',   label: 'Terreno',              icon: '🏞️' },
  { value: 'inversion_inmueble',  label: 'Inmueble',             icon: '🏢' },
  { value: 'inversion_general',   label: 'Inversión general',    icon: '📦' },
  { value: 'otros_activos',       label: 'Otros activos',        icon: '🔧' },
];

export const INVERSION_SUBTIPO_LABELS: Record<InversionSubtipoCanon, string> = {
  inversion_vehicular: 'Inversión vehicular',
  inversion_terreno:   'Terreno',
  inversion_inmueble:  'Inmueble',
  inversion_general:   'Inversión general',
  otros_activos:       'Otros activos',
};

/** Fact tipo + subTipo por defecto para cada canónico. */
export const FACT_DEFAULT_BY_INVERSION_CANON: Record<InversionSubtipoCanon, { tipo: string; subTipo: string }> = {
  inversion_vehicular: { tipo: 'COMPRA ACTIVO', subTipo: 'VEHÍCULO'   },
  inversion_terreno:   { tipo: 'COMPRA ACTIVO', subTipo: 'TERRENO'    },
  inversion_inmueble:  { tipo: 'COMPRA ACTIVO', subTipo: 'INMUEBLE'   },
  inversion_general:   { tipo: 'COMPRA ACTIVO', subTipo: 'MAQUINARIA' },
  otros_activos:       { tipo: 'COMPRA ACTIVO', subTipo: 'MAQUINARIA' },
};

// ─── Aliases / normalización ──────────────────────────────────────────────────

/** Mapeo de valores legacy o de texto libre → canónico (claves sin acentos, minúsculas). */
const LEGACY_TO_CANON: Record<string, InversionSubtipoCanon> = {
  vehiculo: 'inversion_vehicular',
  compra_activo_vehiculo: 'inversion_vehicular',
  inversion_vehicular: 'inversion_vehicular',
  adquisicion_vehiculo: 'inversion_vehicular',
  terreno: 'inversion_terreno',
  lote: 'inversion_terreno',
  inversion_terreno: 'inversion_terreno',
  inmueble: 'inversion_inmueble',
  departamento: 'inversion_inmueble',
  local: 'inversion_inmueble',
  oficina: 'inversion_inmueble',
  inversion_inmueble: 'inversion_inmueble',
  maquinaria: 'inversion_general',
  equipo: 'inversion_general',
  inversion_general: 'inversion_general',
  otros_activos: 'otros_activos',
  inversion_compra: 'inversion_vehicular',
  laptops: 'otros_activos',
  computadoras: 'otros_activos',
  equipos_de_computo: 'otros_activos',
};

function invNormKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

/**
 * Normaliza cualquier valor raw a canónico.
 * - Si raw es vacío o 'inversion_compra', devuelve 'inversion_vehicular' (compatibilidad).
 * - Si raw ya es un canónico válido, lo devuelve.
 * - Aplica alias legacy.
 * - Si no reconoce, devuelve null (el llamador decide si usar un fallback).
 */
export function normalizeInversionSubtipo(raw: string): InversionSubtipoCanon | null {
  const trimmed = raw.trim();
  if (!trimmed) return 'inversion_vehicular';
  const nk = invNormKey(trimmed);
  if (nk === 'inversion_compra') return 'inversion_vehicular';
  const mapped = LEGACY_TO_CANON[nk];
  if (mapped) return mapped;
  return null;
}

/** Clave de deduplicación para selects/filtros de inversión. */
export function getInversionSubtipoDedupeKey(raw: string): string {
  return normalizeInversionSubtipo(raw) ?? invNormKey(raw);
}

/** Devuelve el label UI para un subtipo canónico (o texto limpio para valores históricos). */
export function getInversionSubtipoLabel(value: string): string {
  const norm = normalizeInversionSubtipo(value);
  if (norm) return INVERSION_SUBTIPO_LABELS[norm];
  // Fallback para valores Fact históricos en mayúsculas
  if (value.toUpperCase() === value) {
    const lc = value.toLowerCase();
    const canon = LEGACY_TO_CANON[lc];
    if (canon) return INVERSION_SUBTIPO_LABELS[canon];
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }
  return value;
}

/** Opciones para un Select de formulario. */
export function getInversionSubtipoOptions(): Array<{ value: InversionSubtipoCanon; label: string }> {
  return INVERSION_SUBTIPO_OPTIONS.map(({ value, label }) => ({ value, label }));
}

/** Devuelve el Fact tipo + subTipo para un canónico (para autocompletar los campos Fact). */
export function getDefaultFactTipoSubtipoForInversionCanon(
  canon: InversionSubtipoCanon,
): { tipo: string; subTipo: string } {
  return FACT_DEFAULT_BY_INVERSION_CANON[canon];
}

/** ¿El subtipo requiere vehicleId? Solo "inversion_vehicular". */
export function inversionSubtipoRequiereVehiculo(canon: InversionSubtipoCanon | string): boolean {
  const norm = normalizeInversionSubtipo(canon);
  return norm === 'inversion_vehicular' || norm === null;
}
