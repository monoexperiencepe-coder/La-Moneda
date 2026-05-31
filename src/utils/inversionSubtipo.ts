/**
 * Catálogo canónico de subtipos de inversión (tipo_gasto = inversion_compra).
 * Solo define catálogo visible, labels, aliases y normalización (no altera BD).
 */
import { resolveLegacyAliasNormKey } from '../constants/subtipos/legacySubtipoAliases';
import { subtipoDedupeKey } from '../constants/subtipos/subtipoDedupeKey';
import { normKey } from './normKey';

export type InversionSubtipoCanon =
  | 'adquisicion_vehiculo'
  | 'compra_terreno'
  | 'acondicionamiento_areas'
  | 'laptops'
  | 'electrodomesticos'
  | 'sistema_seguridad'
  | 'equipamiento_taller'
  | 'compra_software_gestion'
  | 'muebles_enseres'
  | 'equipamiento_oficina'
  | 'otros_especificar';

export interface InversionSubtipoOption {
  value: InversionSubtipoCanon;
  label: string;
  icon: string;
}

export const INVERSION_SUBTIPO_OPTIONS: InversionSubtipoOption[] = [
  { value: 'adquisicion_vehiculo', label: 'Adquisición de vehículo', icon: '🚐' },
  { value: 'compra_terreno', label: 'Compra terreno', icon: '🏞️' },
  { value: 'acondicionamiento_areas', label: 'Acondicionamientos de áreas', icon: '🏗️' },
  { value: 'laptops', label: 'Laptops', icon: '💻' },
  { value: 'electrodomesticos', label: 'Electrodomésticos', icon: '🧊' },
  { value: 'sistema_seguridad', label: 'Sistema de seguridad', icon: '📹' },
  { value: 'equipamiento_taller', label: 'Equipamiento de taller', icon: '🔧' },
  { value: 'compra_software_gestion', label: 'Compra de software de gestión', icon: '📱' },
  { value: 'muebles_enseres', label: 'Muebles y enseres', icon: '🪑' },
  { value: 'equipamiento_oficina', label: 'Equipamiento oficina', icon: '🖨️' },
  { value: 'otros_especificar', label: 'Otros / especificar', icon: '📋' },
];

export const INVERSION_SUBTIPO_LABELS: Record<InversionSubtipoCanon, string> = {
  adquisicion_vehiculo: 'Adquisición de vehículo',
  compra_terreno: 'Compra terreno',
  acondicionamiento_areas: 'Acondicionamientos de áreas',
  laptops: 'Laptops',
  electrodomesticos: 'Electrodomésticos',
  sistema_seguridad: 'Sistema de seguridad',
  equipamiento_taller: 'Equipamiento de taller',
  compra_software_gestion: 'Compra de software de gestión',
  muebles_enseres: 'Muebles y enseres',
  equipamiento_oficina: 'Equipamiento oficina',
  otros_especificar: 'Otros / especificar',
};

const OFFICIAL_SET = new Set<string>(INVERSION_SUBTIPO_OPTIONS.map((o) => o.value));

/** Labels para valores legacy que ya no son opción oficial. */
const HISTORIC_ONLY_LABELS: Record<string, string> = {
  inversion_inmueble: 'Inmueble',
  inversion_general: 'Inversión general',
  otros_activos: 'Otros activos',
  maquinaria: 'Maquinaria',
  inmueble: 'Inmueble',
  departamento: 'Departamento',
  equipo: 'Equipo',
  activo_fijo: 'Activo fijo',
  inversion_compra: 'Inversión compra',
};

export const FACT_DEFAULT_BY_INVERSION_CANON: Record<InversionSubtipoCanon, { tipo: string; subTipo: string }> = {
  adquisicion_vehiculo: { tipo: 'COMPRA ACTIVO', subTipo: 'VEHÍCULO' },
  compra_terreno: { tipo: 'COMPRA ACTIVO', subTipo: 'TERRENO' },
  acondicionamiento_areas: { tipo: 'COMPRA ACTIVO', subTipo: 'INMUEBLE' },
  laptops: { tipo: 'COMPRA ACTIVO', subTipo: 'MAQUINARIA' },
  electrodomesticos: { tipo: 'COMPRA ACTIVO', subTipo: 'MAQUINARIA' },
  sistema_seguridad: { tipo: 'COMPRA ACTIVO', subTipo: 'MAQUINARIA' },
  equipamiento_taller: { tipo: 'COMPRA ACTIVO', subTipo: 'MAQUINARIA' },
  compra_software_gestion: { tipo: 'COMPRA ACTIVO', subTipo: 'MAQUINARIA' },
  muebles_enseres: { tipo: 'COMPRA ACTIVO', subTipo: 'OFICINA' },
  equipamiento_oficina: { tipo: 'COMPRA ACTIVO', subTipo: 'OFICINA' },
  otros_especificar: { tipo: 'COMPRA ACTIVO', subTipo: 'OTROS' },
};

/** Alias / legacy → canónico oficial (dedupe en selects; no reescribe BD). */
const LEGACY_TO_CANON: Record<string, InversionSubtipoCanon> = {
  adquisicion_vehiculo: 'adquisicion_vehiculo',
  adquisicion_de_vehiculo: 'adquisicion_vehiculo',
  adquisicion_auto: 'adquisicion_vehiculo',
  inversion_vehicular: 'adquisicion_vehiculo',
  compra_activo_vehiculo: 'adquisicion_vehiculo',
  compra_activo_vehiculos: 'adquisicion_vehiculo',
  compra_de_vehiculo: 'adquisicion_vehiculo',
  compra_de_vehículo: 'adquisicion_vehiculo',
  compra_vehiculo: 'adquisicion_vehiculo',
  compra_vehículo: 'adquisicion_vehiculo',
  compra_auto: 'adquisicion_vehiculo',
  vehiculo: 'adquisicion_vehiculo',
  vehículo: 'adquisicion_vehiculo',
  compra_terreno: 'compra_terreno',
  inversion_terreno: 'compra_terreno',
  terreno: 'compra_terreno',
  lote: 'compra_terreno',
  predio: 'compra_terreno',
  acondicionamiento_areas: 'acondicionamiento_areas',
  acondicionamiento: 'acondicionamiento_areas',
  acondicionamientos: 'acondicionamiento_areas',
  remodelacion: 'acondicionamiento_areas',
  obras: 'acondicionamiento_areas',
  laptops: 'laptops',
  laptop: 'laptops',
  computadora_portatil: 'laptops',
  computadoras: 'laptops',
  equipos_de_computo: 'laptops',
  electrodomesticos: 'electrodomesticos',
  electrodomestico: 'electrodomesticos',
  refrigeradora: 'electrodomesticos',
  microondas: 'electrodomesticos',
  sistema_seguridad: 'sistema_seguridad',
  camaras: 'sistema_seguridad',
  alarma: 'sistema_seguridad',
  seguridad: 'sistema_seguridad',
  equipamiento_taller: 'equipamiento_taller',
  equipamiento_de_taller: 'equipamiento_taller',
  taller: 'equipamiento_taller',
  herramientas: 'equipamiento_taller',
  elevador: 'equipamiento_taller',
  compresora: 'equipamiento_taller',
  compra_software_gestion: 'compra_software_gestion',
  software: 'compra_software_gestion',
  licencia: 'compra_software_gestion',
  sistema: 'compra_software_gestion',
  app: 'compra_software_gestion',
  gestion: 'compra_software_gestion',
  muebles_enseres: 'muebles_enseres',
  muebles: 'muebles_enseres',
  enseres: 'muebles_enseres',
  escritorio: 'muebles_enseres',
  silla: 'muebles_enseres',
  mobiliario: 'muebles_enseres',
  equipamiento_oficina: 'equipamiento_oficina',
  equipamiento_oficinas: 'equipamiento_oficina',
  impresora: 'equipamiento_oficina',
  otros_especificar: 'otros_especificar',
  otros: 'otros_especificar',
  otros_especificar_inversion: 'otros_especificar',
};

function invNormKey(s: string): string {
  return normKey(s).replace(/\s+/g, '_');
}

export function isInversionSubtipoOficial(value: string): boolean {
  return OFFICIAL_SET.has(invNormKey(value));
}

/**
 * Normaliza a canónico oficial cuando hay alias conocido.
 * Valores legacy no oficiales (inmueble, inversion_general, etc.) → null.
 * Vacío / inversion_compra genérico → adquisicion_vehiculo (compatibilidad lectura).
 */
export function normalizeInversionSubtipo(raw: string): InversionSubtipoCanon | null {
  const trimmed = raw.trim();
  if (!trimmed) return 'adquisicion_vehiculo';
  const globalAlias = resolveLegacyAliasNormKey(trimmed);
  const nk = invNormKey(globalAlias ?? trimmed);
  if (subtipoDedupeKey(trimmed) === subtipoDedupeKey('otros_especificar')) {
    return 'otros_especificar';
  }
  if (OFFICIAL_SET.has(nk)) return nk as InversionSubtipoCanon;
  if (nk === 'inversion_compra') return 'adquisicion_vehiculo';
  const mapped = LEGACY_TO_CANON[nk];
  if (mapped) return mapped;
  return null;
}

/** true si el valor en BD es oficial o alias legacy válido de inversión (no sospechoso). */
export function isInversionSubtipoReconocido(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  return normalizeInversionSubtipo(t) != null;
}

export function getInversionSubtipoDedupeKey(raw: string): string {
  const canon = normalizeInversionSubtipo(raw);
  if (canon) return canon;
  return invNormKey(raw);
}

export function getInversionSubtipoLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '—';
  const norm = normalizeInversionSubtipo(trimmed);
  if (norm) return INVERSION_SUBTIPO_LABELS[norm];
  const nk = invNormKey(trimmed);
  const historic = HISTORIC_ONLY_LABELS[nk];
  if (historic) return historic;
  if (trimmed.toUpperCase() === trimmed && trimmed.length > 1) {
    return trimmed.charAt(0) + trimmed.slice(1).toLowerCase();
  }
  return trimmed;
}

export function getInversionSubtipoOptions(): Array<{ value: InversionSubtipoCanon; label: string }> {
  return INVERSION_SUBTIPO_OPTIONS.map(({ value, label }) => ({ value, label }));
}

export function getDefaultFactTipoSubtipoForInversionCanon(
  canon: InversionSubtipoCanon,
): { tipo: string; subTipo: string } {
  return FACT_DEFAULT_BY_INVERSION_CANON[canon];
}

/** Ningún subtipo de inversión exige N° unidad (adquisición puede ser parcial o sin asignar). */
export function inversionSubtipoRequiereVehiculo(_canon: InversionSubtipoCanon | string): boolean {
  return false;
}

/** Subtipos almacenados que se consideran inversión vehicular (excluir de «no vehicular»). */
export function isInversionSubtipoVehicularStored(sub: string): boolean {
  const t = sub.trim();
  if (!t || t === 'inversion_compra') return true;
  const norm = normalizeInversionSubtipo(t);
  if (norm === 'adquisicion_vehiculo') return true;
  const nk = invNormKey(t);
  return (
    nk === 'inversion_vehicular'
    || nk === 'compra_activo_vehiculo'
    || nk === 'vehiculo'
    || nk === 'vehículo'
    || t === 'VEHÍCULO'
    || t === 'Adquisición vehículo'
  );
}
