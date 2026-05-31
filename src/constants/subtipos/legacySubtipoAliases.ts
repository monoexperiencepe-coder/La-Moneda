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
  arreglo_linea_escape: 'FARO / ARREGLOS',
  linea_escape: 'FARO / ARREGLOS',
  tubo_escape: 'FARO / ARREGLOS',
  silenciador: 'FARO / ARREGLOS',
  mofle: 'FARO / ARREGLOS',
  autoparte: 'FARO / ARREGLOS',
  autopartes: 'FARO / ARREGLOS',
  repuesto: 'FARO / ARREGLOS',
  repuestos: 'FARO / ARREGLOS',
  movilidad: 'TAXI O DELIVERY',
  pasaje: 'TAXI O DELIVERY',
  pasajes: 'TAXI O DELIVERY',
  traslado: 'TAXI O DELIVERY',
  traslados: 'TAXI O DELIVERY',
  taxi: 'REVISIÓN TÉCNICA TAXI',
  'rt-taxi': 'REVISIÓN TÉCNICA TAXI',
  'rt taxi': 'REVISIÓN TÉCNICA TAXI',
  rttaxi: 'REVISIÓN TÉCNICA TAXI',
  'revision tecnica taxi': 'REVISIÓN TÉCNICA TAXI',
  revision_tecnica_taxi: 'REVISIÓN TÉCNICA TAXI',
  'rt-particular': 'REVISIÓN TÉCNICA PARTICULAR',
  'rt particular': 'REVISIÓN TÉCNICA PARTICULAR',
  rtparticular: 'REVISIÓN TÉCNICA PARTICULAR',
  'revision tecnica particular': 'REVISIÓN TÉCNICA PARTICULAR',
  revision_tecnica_particular: 'REVISIÓN TÉCNICA PARTICULAR',
  atu: 'ATU',
  'autorizacion atu': 'ATU',
  sat: 'SAT',
  sunarp: 'SUNARP',
  suanrp: 'SUNARP',
  sunat: 'SUNAT',
  sutran: 'SUTRAN',
  multas_callao: 'MULTA CALLE',
  multa_callao: 'MULTA CALLE',
  'multas callao': 'MULTA CALLE',
  mantenimiento_simple: 'MANTENIMIENTO SIMPLE',
  mantenimiento_completo: 'MANTENIMIENTO COMPLETO',
  motor_taller: 'MOTOR TALLER',
  gnv_taller: 'GNV TALLER',
  gps_equipos: 'GPS EQUIPOS',
  gps_recarga_chips: 'GPS RECARGA CHIPS',
  electricista: 'ELECTRICISTA',
  faro_arreglos: 'FARO / ARREGLOS',
  fundas_o_forros_auto: 'FUNDAS O FORROS AUTO',
  taxi_o_delivery: 'TAXI O DELIVERY',
  permisos_varios: 'PERMISOS VARIOS',
  tramites_notariales: 'TRÁMITES NOTARIALES',
  municipales: 'MUNICIPALES',
  afocat: 'AFOCAT',
  soat: 'SOAT',
  seguros: 'SEGUROS',
  accesorios: 'ACCESORIOS',
  aire_acondicionado: 'AIRE ACONDICIONADO',
  bateria: 'BATERÍA',
  combustible: 'COMBUSTIBLE',
  documentos: 'DOCUMENTOS',
  electricidad: 'ELECTRICISTA',
  frenos: 'FRENOS',
  gnv: 'GNV TALLER',
  gps_chips: 'GPS RECARGA CHIPS',
  llantas: 'LLANTAS',
  mantenimiento: 'MANTENIMIENTO SIMPLE',
  motor: 'MOTOR TALLER',
  multas_tramites: 'MULTA CALLE',
  planchado_pintura: 'PLANCHADO / PINTURA',
  suspension: 'SUSPENSIÓN',
  interior: 'FUNDAS O FORROS AUTO',
  otros_operativo: 'OTROS / ESPECIFICAR',
  impuesto_vehicular: 'IMPUESTO VEHICULAR',
  oficina_documentos: 'OFICINA',
  utiles_de_oficina: 'ÚTILES DE OFICINA',
  canasta_o_regalo: 'CANASTA O REGALO',
  devolucion_garantia: 'DEVOLUCIÓN GARANTÍA',
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
