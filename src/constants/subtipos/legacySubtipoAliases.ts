/**
 * Aliases históricos → valor canónico (solo mapa + normKey; sin imports de catálogo).
 */
import { normKey } from '../../utils/normKey';
import { subtipoDedupeKey } from './subtipoDedupeKey';
import { resolveCategoriaFinanzaParaSubtipos } from './subtipoCategoria';

const OPERATIVO_TIPOS = new Set(['operativo_vehiculo', 'operativo_flota_general']);

/** normKey → valor canónico global (fallback cuando no hay categoría). */
export const LEGACY_SUBTIPO_ALIASES_NORM_KEY: Record<string, string> = {
  alojameintos: 'alojamientos',
  equipameinto_de_taller: 'equipamiento_taller',
  equipameinto_oficina: 'equipamiento_oficina',
  prestamos: 'prestamo',
  intereses: 'interes',
  cuotas: 'cuota',
  adquisicion_auto: 'adquisicion_vehiculo',
  adquisicion_de_vehiculo: 'adquisicion_vehiculo',
  vehiculo: 'adquisicion_vehiculo',
  inversion_vehicular: 'adquisicion_vehiculo',
  compra_activo_vehiculo: 'adquisicion_vehiculo',
  compra_activo_vehiculos: 'adquisicion_vehiculo',
  compra_de_vehiculo: 'adquisicion_vehiculo',
  compra_vehiculo: 'adquisicion_vehiculo',
  compra_auto: 'adquisicion_vehiculo',
  inversion_terreno: 'compra_terreno',
  terreno: 'compra_terreno',
  laptops: 'laptops',
  computadoras: 'laptops',
  equipos_de_computo: 'laptops',
  arreglo_linea_escape: 'arreglo_linea_escape',
  linea_escape: 'arreglo_linea_escape',
  tubo_escape: 'arreglo_linea_escape',
  silenciador: 'arreglo_linea_escape',
  mofle: 'arreglo_linea_escape',
  autoparte: 'autopartes',
  autopartes: 'autopartes',
  repuesto: 'autopartes',
  repuestos: 'autopartes',
  movilidad: 'movilidad',
  pasaje: 'movilidad',
  pasajes: 'movilidad',
  traslado: 'movilidad',
  traslados: 'movilidad',
  multas_callao: 'multas_callao',
  multa_callao: 'multas_callao',
  'multas callao': 'multas_callao',
  atu: 'atu',
  'autorizacion atu': 'atu',
  sat: 'sat',
  sunarp: 'sunarp',
  suanrp: 'sunarp',
  sunat: 'sunat',
  sutran: 'sutran',
  taxi: 'revision_tecnica_taxi',
  'rt-taxi': 'revision_tecnica_taxi',
  'rt taxi': 'revision_tecnica_taxi',
  rttaxi: 'revision_tecnica_taxi',
  'revision tecnica taxi': 'revision_tecnica_taxi',
  revision_tecnica_taxi: 'revision_tecnica_taxi',
  'rt-particular': 'revision_tecnica_particular',
  'rt particular': 'revision_tecnica_particular',
  rtparticular: 'revision_tecnica_particular',
  'revision tecnica particular': 'revision_tecnica_particular',
  revision_tecnica_particular: 'revision_tecnica_particular',
  mantenimiento_simple: 'mantenimiento',
  mantenimiento_completo: 'mantenimiento',
  motor_taller: 'motor',
  gnv_taller: 'gnv',
  gps_equipos: 'gps_chips',
  gps_recarga_chips: 'gps_chips',
  electricista: 'electricidad',
  faro_arreglos: 'autopartes',
  fundas_o_forros_auto: 'interior',
  taxi_o_delivery: 'movilidad',
  permisos_varios: 'multas_tramites',
  tramites_notariales: 'multas_tramites',
  municipales: 'multas_tramites',
  afocat: 'documentos',
  soat: 'documentos',
  seguros: 'documentos',
  almuerzos_socios: 'almuerzo_socios',
  regalos_empresariales: 'regalos',
};

/** @deprecated Usar LEGACY_SUBTIPO_ALIASES_NORM_KEY */
export const SUBTIPO_ALIASES_NORM_KEY = LEGACY_SUBTIPO_ALIASES_NORM_KEY;

export function resolveLegacyAliasNormKey(raw: string): string | null {
  const nk = normKey(raw);
  const dk = subtipoDedupeKey(raw);
  return LEGACY_SUBTIPO_ALIASES_NORM_KEY[nk] ?? LEGACY_SUBTIPO_ALIASES_NORM_KEY[dk] ?? null;
}

/** Resolución ligera: solo aliases + reglas financieras básicas (sin normalizadores pesados). */
export function resolveCanonicalSubtipoValue(categoria: string, raw: string): string {
  let v = raw.trim();
  if (!v) return v;

  const alias = resolveLegacyAliasNormKey(v);
  if (alias) v = alias;

  const cat = resolveCategoriaFinanzaParaSubtipos(categoria);
  if (!cat) return v;

  if (cat === 'financiero_prestamo') {
    const k = normKey(v);
    if (k === 'intereses') return 'interes';
    if (k === 'prestamos') return 'prestamo';
    if (k === 'cuotas') return 'cuota';
  }

  if (OPERATIVO_TIPOS.has(cat)) {
    return v;
  }

  return v;
}

export function getCanonicalSubtipoDedupeKey(categoria: string, raw: string): string {
  return subtipoDedupeKey(resolveCanonicalSubtipoValue(categoria, raw));
}

export function legacyTextMatchesSubtipo(categoria: string, text: string, subtipoValue: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const targetKey = getCanonicalSubtipoDedupeKey(categoria, subtipoValue);
  if (getCanonicalSubtipoDedupeKey(categoria, t) === targetKey) return true;
  const alias = resolveLegacyAliasNormKey(t);
  if (alias && getCanonicalSubtipoDedupeKey(categoria, alias) === targetKey) return true;
  return subtipoDedupeKey(t) === targetKey;
}
