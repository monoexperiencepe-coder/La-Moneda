import { normKey } from './normKey';
import { subtipoDedupeKey } from '../constants/subtipos/subtipoDedupeKey';
import { resolveLegacyAliasNormKey } from '../constants/subtipos/legacySubtipoAliases';
import {
  OFFICIAL_OPERATIVO_SUBTIPO_VALUES,
  getOfficialOperativoSubtipoEntries,
} from '../constants/subtipos/operativoOficialCatalog';
import { normalizeTramitesMovilidadSubtipo } from './tramitesMovilidadSubtipo';
import { isVerboseDebug } from '../config/verboseDebug';

export const OPERATIVO_SUBTIPO_OPTIONS = getOfficialOperativoSubtipoEntries();

const OFFICIAL_SET = new Set<string>(OFFICIAL_OPERATIVO_SUBTIPO_VALUES);

function devLogOperativoNormalize(input: string, norm: string, resolved: string | null): void {
  try {
    if (import.meta.env?.DEV && isVerboseDebug()) {
      console.log('[operativo:normalize]', { input, norm, resolved });
    }
  } catch {
    /* fuera de Vite (tests node) */
  }
}

const NORMALIZE_CACHE_MAX = 8_000;
const normalizeOperativoCache = new Map<string, string | null>();

/** Normalización con caché por string (filtros/historial masivo). */
export function normalizeOperativoSubtipoCached(raw: string | null | undefined): string | null {
  const s0 = (raw ?? '').trim();
  if (!s0) return null;
  if (normalizeOperativoCache.has(s0)) return normalizeOperativoCache.get(s0)!;
  const r = normalizeOperativoSubtipo(s0);
  if (normalizeOperativoCache.size >= NORMALIZE_CACHE_MAX) normalizeOperativoCache.clear();
  normalizeOperativoCache.set(s0, r);
  return r;
}
const OFFICIAL_DEDUPE = new Map(
  OFFICIAL_OPERATIVO_SUBTIPO_VALUES.map((v) => [subtipoDedupeKey(v), v]),
);

/** Tipo Fact + subtipo Fact por subtipo oficial (metadata / KPI). */
const FACT_DEFAULT_BY_OFFICIAL: Record<string, { tipo: string; subTipo: string }> = {
  AFOCAT: { tipo: 'DOCUMENTOS', subTipo: 'AFOCAT' },
  ATU: { tipo: 'SEGUROS /DOCUMENTOS', subTipo: 'AUTORIZACIÓN ATU' },
  'GARANTÍAS': { tipo: 'DOCUMENTOS', subTipo: 'PERMISOS VARIOS' },
  MUNICIPALES: { tipo: 'TRIBUTARIOS / NOTARIALES', subTipo: 'PAPELETAS /MULTAS' },
  OFICINA: { tipo: 'OTROS GASTOS', subTipo: 'OTROS /ESPECIFICAR' },
  'OTROS / ESPECIFICAR': { tipo: 'MECÁNICOS', subTipo: 'OTROS /ESPECIFICAR' },
  'PERMISOS VARIOS': { tipo: 'DOCUMENTOS', subTipo: 'PERMISOS VARIOS' },
  'FARO / ARREGLOS': { tipo: 'ACCESORIOS', subTipo: 'AUTOPARTE' },
  'REVISIÓN TÉCNICA PARTICULAR': { tipo: 'DOCUMENTOS', subTipo: 'REVISIÓN TÉCNICA PARTICULAR' },
  'REVISIÓN TÉCNICA TAXI': { tipo: 'DOCUMENTOS', subTipo: 'REVISIÓN TÉCNICA TAXI' },
  SAT: { tipo: 'TRIBUTARIOS / NOTARIALES', subTipo: 'SAT' },
  SEGUROS: { tipo: 'DOCUMENTOS', subTipo: 'CIA DE SEGUROS' },
  SOAT: { tipo: 'DOCUMENTOS', subTipo: 'SOAT' },
  SUNARP: { tipo: 'TRIBUTARIOS / NOTARIALES', subTipo: 'SUNARP' },
  SUNAT: { tipo: 'TRIBUTARIOS / NOTARIALES', subTipo: 'SUNAT' },
  SUTRAN: { tipo: 'TRIBUTARIOS / NOTARIALES', subTipo: 'SUTRAN' },
  'TAXI O DELIVERY': { tipo: 'OTROS GASTOS', subTipo: 'VIATICOS' },
  'TRABAJOS EVENTUALES': { tipo: 'GASTOS FIJOS', subTipo: 'TRABAJOS EVENTUALES' },
  'TRÁMITES NOTARIALES': { tipo: 'TRIBUTARIOS / NOTARIALES', subTipo: 'TRÁMITES NOTARIALES' },
  'ÚTILES DE OFICINA': { tipo: 'OTROS GASTOS', subTipo: 'OTROS /ESPECIFICAR' },
  ACCESORIOS: { tipo: 'ACCESORIOS', subTipo: 'OTROS /ESPECIFICAR' },
  'AIRE ACONDICIONADO': { tipo: 'MECÁNICOS', subTipo: 'AIRE CONDICIONADO' },
  BATERÍA: { tipo: 'MECÁNICOS', subTipo: 'Batería' },
  COMBUSTIBLE: { tipo: 'MECÁNICOS', subTipo: 'COMBUSTIBLE' },
  DOCUMENTOS: { tipo: 'DOCUMENTOS', subTipo: 'PERMISOS VARIOS' },
  ELECTRICISTA: { tipo: 'MECÁNICOS', subTipo: 'ARREGLO ELECTRINICO' },
  FRENOS: { tipo: 'MECÁNICOS', subTipo: 'FRENOS' },
  'GNV TALLER': { tipo: 'GNV', subTipo: 'MANTENIKIENTO' },
  'GPS EQUIPOS': { tipo: 'ACCESORIOS', subTipo: 'CHIPS TELEFONÍA' },
  'IMPUESTO VEHICULAR': { tipo: 'DOCUMENTOS', subTipo: 'PERMISOS VARIOS' },
  'FUNDAS O FORROS AUTO': { tipo: 'IMPLEMENTACIÓN', subTipo: 'FORROS Y FUNDAS' },
  'MANTENIMIENTO SIMPLE': { tipo: 'MECÁNICOS', subTipo: 'MANTENIMIENTO SIMPLE' },
  'MANTENIMIENTO COMPLETO': { tipo: 'MECÁNICOS', subTipo: 'MANTENIMIENTO COMPLETO' },
  'MOTOR TALLER': { tipo: 'MECÁNICOS', subTipo: 'ARREGLO MOTOR' },
  SUSPENSIÓN: { tipo: 'MECÁNICOS', subTipo: 'DIRECCIÓN Y SUSPENSIÓN' },
  LLANTAS: { tipo: 'ACCESORIOS', subTipo: 'LLANTAS' },
  'PLANCHADO / PINTURA': { tipo: 'MECÁNICOS', subTipo: 'OTROS /ESPECIFICAR' },
  'GPS RECARGA CHIPS': { tipo: 'ACCESORIOS', subTipo: 'CHIPS TELEFONÍA' },
  'CANASTA O REGALO': { tipo: 'ACCESORIOS', subTipo: 'OTROS /ESPECIFICAR' },
  'MULTA CALLE': { tipo: 'TRIBUTARIOS / NOTARIALES', subTipo: 'PAPELETAS /MULTAS' },
  'DEVOLUCIÓN GARANTÍA': { tipo: 'DOCUMENTOS', subTipo: 'PERMISOS VARIOS' },
};

/** Códigos históricos snake_case / aliases → subtipo oficial dueño. */
const LEGACY_TO_OFFICIAL: Record<string, string> = {
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
  mantenimiento_simple: 'MANTENIMIENTO SIMPLE',
  mantenimiento_completo: 'MANTENIMIENTO COMPLETO',
  motor: 'MOTOR TALLER',
  motor_taller: 'MOTOR TALLER',
  multas_tramites: 'MULTA CALLE',
  multas_callao: 'MULTA CALLE',
  multa_calle: 'MULTA CALLE',
  multa_callao: 'MULTA CALLE',
  planchado_pintura: 'PLANCHADO / PINTURA',
  suspension: 'SUSPENSIÓN',
  interior: 'FUNDAS O FORROS AUTO',
  movilidad: 'TAXI O DELIVERY',
  autopartes: 'FARO / ARREGLOS',
  arreglo_linea_escape: 'FARO / ARREGLOS',
  otros_operativo: 'OTROS / ESPECIFICAR',
  impuesto_vehicular: 'IMPUESTO VEHICULAR',
  atu: 'ATU',
  sat: 'SAT',
  sunarp: 'SUNARP',
  suanrp: 'SUNARP',
  sunat: 'SUNAT',
  sutran: 'SUTRAN',
  revision_tecnica_taxi: 'REVISIÓN TÉCNICA TAXI',
  revision_tecnica_particular: 'REVISIÓN TÉCNICA PARTICULAR',
  taxi: 'REVISIÓN TÉCNICA TAXI',
  delivery: 'TAXI O DELIVERY',
  taxi_o_delivery: 'TAXI O DELIVERY',
  oficina: 'OFICINA',
  oficina_documentos: 'OFICINA',
  utiles_de_oficina: 'ÚTILES DE OFICINA',
  utilies_de_oficina: 'ÚTILES DE OFICINA',
  permisos: 'PERMISOS VARIOS',
  permisos_varios: 'PERMISOS VARIOS',
  seguro: 'SEGUROS',
  seguros: 'SEGUROS',
  garantia: 'GARANTÍAS',
  garantias: 'GARANTÍAS',
  faro: 'FARO / ARREGLOS',
  arreglo: 'FARO / ARREGLOS',
  arreglos: 'FARO / ARREGLOS',
  gps: 'GPS EQUIPOS',
  gps_equipos: 'GPS EQUIPOS',
  gps_equipo: 'GPS EQUIPOS',
  gps_recarga_chips: 'GPS RECARGA CHIPS',
  canasta: 'CANASTA O REGALO',
  regalo: 'CANASTA O REGALO',
  devolucion_garantia: 'DEVOLUCIÓN GARANTÍA',
  devolucion_de_garantia: 'DEVOLUCIÓN GARANTÍA',
  soat: 'SOAT',
  afocat: 'AFOCAT',
  municipal: 'MUNICIPALES',
  municipales: 'MUNICIPALES',
  tramites_notariales: 'TRÁMITES NOTARIALES',
  trabajos_eventuales: 'TRABAJOS EVENTUALES',
  tributario: 'MULTA CALLE',
  multas_permisos_tramites: 'MULTA CALLE',
};

const NORM_FACT_SUBTIPO_TO_OFFICIAL: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  const add = (factSub: string, official: string) => {
    m[normKey(factSub)] = official;
  };
  for (const [official, fact] of Object.entries(FACT_DEFAULT_BY_OFFICIAL)) {
    add(fact.subTipo, official);
    add(fact.tipo, official);
  }
  add('ARREGLO MOTOR', 'MOTOR TALLER');
  add('MOTOR', 'MOTOR TALLER');
  add('Batería', 'BATERÍA');
  add('CHIPS TELEFONÍA', 'GPS RECARGA CHIPS');
  add('GPS', 'GPS EQUIPOS');
  add('GASOLINA', 'COMBUSTIBLE');
  add('GLP', 'COMBUSTIBLE');
  add('GNV', 'GNV TALLER');
  add('AFOCAT', 'AFOCAT');
  add('RT-PARTICULAR', 'REVISIÓN TÉCNICA PARTICULAR');
  add('RT-TAXI', 'REVISIÓN TÉCNICA TAXI');
  add('MANTENIKIENTO', 'GNV TALLER');
  add('ALINEAMIENTO Y BALANCEO', 'MANTENIMIENTO SIMPLE');
  add('AUTOPARTE', 'FARO / ARREGLOS');
  add('AUTOPARTES', 'FARO / ARREGLOS');
  add('REPUESTOS', 'FARO / ARREGLOS');
  add('FORROS Y FUNDAS', 'FUNDAS O FORROS AUTO');
  add('VIATICOS', 'TAXI O DELIVERY');
  add('DELIVERY', 'TAXI O DELIVERY');
  add('CIA DE SEGUROS', 'SEGUROS');
  add('AUTORIZACIÓN ATU', 'ATU');
  add('PAPELETAS /MULTAS', 'MULTA CALLE');
  return m;
})();

/** Resuelve un texto (alias o label) a subtipo oficial sin recursión. */
function resolveOfficialFromAliasTarget(target: string): string | null {
  const t = target.trim();
  if (!t) return null;
  if (OFFICIAL_SET.has(t)) return t;
  const dk = subtipoDedupeKey(t);
  if (OFFICIAL_DEDUPE.has(dk)) return OFFICIAL_DEDUPE.get(dk)!;
  const nk = normKey(t);
  const legacy = LEGACY_TO_OFFICIAL[nk] ?? LEGACY_TO_OFFICIAL[nk.replace(/\s+/g, '_')];
  if (legacy && OFFICIAL_SET.has(legacy)) return legacy;
  return NORM_FACT_SUBTIPO_TO_OFFICIAL[nk] ?? null;
}

function resolveOfficialByNormKey(nk: string, visited = new Set<string>()): string | null {
  if (visited.has(nk)) return null;
  visited.add(nk);

  if (OFFICIAL_DEDUPE.has(nk)) return OFFICIAL_DEDUPE.get(nk)!;
  const legacy = LEGACY_TO_OFFICIAL[nk] ?? LEGACY_TO_OFFICIAL[nk.replace(/\s+/g, '_')];
  if (legacy && OFFICIAL_SET.has(legacy)) return legacy;

  const globalAlias = resolveLegacyAliasNormKey(nk);
  if (globalAlias) {
    if (OFFICIAL_SET.has(globalAlias)) return globalAlias;
    const aliasNk = normKey(globalAlias);
    if (aliasNk === nk) {
      const dk = subtipoDedupeKey(globalAlias);
      if (OFFICIAL_DEDUPE.has(dk)) return OFFICIAL_DEDUPE.get(dk)!;
    }
    const resolved = resolveOfficialFromAliasTarget(globalAlias);
    if (resolved) return resolved;
    const chained =
      resolveOfficialByNormKey(aliasNk, visited)
      ?? resolveOfficialByNormKey(subtipoDedupeKey(globalAlias), visited);
    if (chained) return chained;
  }

  return NORM_FACT_SUBTIPO_TO_OFFICIAL[nk] ?? null;
}

function squash(s: string): string {
  return normKey(s).replace(/[\s\-_/]+/g, '_').replace(/_+/g, '_');
}

/**
 * Devuelve el subtipo oficial del dueño si hay mapping; si no, null (requiere revisión).
 */
export function normalizeOperativoSubtipo(raw: string | null | undefined): string | null {
  const s0 = (raw ?? '').trim();
  if (!s0) return null;

  if (OFFICIAL_SET.has(s0)) {
    devLogOperativoNormalize(s0, normKey(s0), s0);
    return s0;
  }
  const dk = subtipoDedupeKey(s0);
  if (OFFICIAL_DEDUPE.has(dk)) {
    const resolved = OFFICIAL_DEDUPE.get(dk)!;
    devLogOperativoNormalize(s0, normKey(s0), resolved);
    return resolved;
  }

  const squ = squash(s0);
  const fromSqu = resolveOfficialByNormKey(squ);
  if (fromSqu) {
    devLogOperativoNormalize(s0, squ, fromSqu);
    return fromSqu;
  }

  const nk = normKey(s0);
  const fromNk = resolveOfficialByNormKey(nk);
  if (fromNk) {
    devLogOperativoNormalize(s0, nk, fromNk);
    return fromNk;
  }

  const tram = normalizeTramitesMovilidadSubtipo(s0);
  if (tram === 'taxi') return 'REVISIÓN TÉCNICA TAXI';
  if (tram) {
    const mapped = LEGACY_TO_OFFICIAL[tram] ?? resolveOfficialByNormKey(normKey(tram));
    if (mapped) return mapped;
  }

  const nkSpaced = normKey(s0.replace(/_/g, ' '));
  if (nkSpaced.includes('revision tecnica taxi') || nkSpaced.includes('rt taxi') || nkSpaced === 'taxi') {
    return 'REVISIÓN TÉCNICA TAXI';
  }
  if (nkSpaced.includes('revision tecnica particular') || nkSpaced.includes('rt particular')) {
    return 'REVISIÓN TÉCNICA PARTICULAR';
  }
  if (nkSpaced.includes('bater')) return 'BATERÍA';
  if (nkSpaced.includes('chip') || (nkSpaced.includes('gps') && nkSpaced.includes('recarga'))) {
    return 'GPS RECARGA CHIPS';
  }
  if (nkSpaced.includes('gps')) return 'GPS EQUIPOS';
  if (nkSpaced.includes('combust') || nkSpaced.includes('gasolin') || nkSpaced.includes('diesel')) {
    return 'COMBUSTIBLE';
  }
  if (nkSpaced.includes('soat') || nkSpaced === 'afocat') return nkSpaced.includes('soat') ? 'SOAT' : 'AFOCAT';
  if (nkSpaced.includes('mantenimiento completo')) return 'MANTENIMIENTO COMPLETO';
  if (nkSpaced.includes('manten')) return 'MANTENIMIENTO SIMPLE';
  if (nkSpaced.includes('llant')) return 'LLANTAS';
  if (nkSpaced.includes('fren')) return 'FRENOS';
  if (nkSpaced.includes('suspens') || nkSpaced.includes('direccion')) return 'SUSPENSIÓN';
  if (nkSpaced.includes('electr')) return 'ELECTRICISTA';
  if (nkSpaced.includes('gnv')) return 'GNV TALLER';
  if (nkSpaced.includes('aire') && nkSpaced.includes('acond')) return 'AIRE ACONDICIONADO';
  if (nkSpaced.includes('motor')) return 'MOTOR TALLER';
  if (nkSpaced.includes('impuesto') && nkSpaced.includes('vehicular')) return 'IMPUESTO VEHICULAR';
  if (nkSpaced.includes('planchad') || nkSpaced.includes('pintur')) return 'PLANCHADO / PINTURA';
  if (nkSpaced.includes('faro') || nkSpaced.includes('autoparte') || nkSpaced.includes('repuesto')) {
    return 'FARO / ARREGLOS';
  }
  if (nkSpaced.includes('forro') || nkSpaced.includes('funda')) return 'FUNDAS O FORROS AUTO';
  if (nkSpaced.includes('accesor')) return 'ACCESORIOS';
  if (nkSpaced.includes('multa') || nkSpaced.includes('papeleta')) return 'MULTA CALLE';
  if (nkSpaced.includes('notarial') || nkSpaced.includes('tramite')) return 'TRÁMITES NOTARIALES';
  if (nkSpaced.includes('delivery') || nkSpaced.includes('viatico')) return 'TAXI O DELIVERY';
  if (nkSpaced.includes('sunat')) return 'SUNAT';
  if (nkSpaced.includes('sunarp') || nkSpaced.includes('suanrp')) return 'SUNARP';
  if (nkSpaced.includes('sutran')) return 'SUTRAN';
  if (nkSpaced.includes('seguro')) return 'SEGUROS';
  if (nkSpaced.includes('garant')) return 'GARANTÍAS';
  if (nkSpaced.includes('oficina') || nkSpaced.includes('papeler') || nkSpaced.includes('utiles')) {
    const resolved =
      nkSpaced.includes('utiles') || nkSpaced.includes('papeler') ? 'ÚTILES DE OFICINA' : 'OFICINA';
    devLogOperativoNormalize(s0, nkSpaced, resolved);
    return resolved;
  }

  devLogOperativoNormalize(s0, nk, null);
  return null;
}

export function isOperativoSubtipoOficialValue(value: string | null | undefined): boolean {
  const n = normalizeOperativoSubtipo(value);
  return n != null && n === (value ?? '').trim();
}

export function operativoSubtipoRequiresReview(raw: string | null | undefined): boolean {
  const t = (raw ?? '').trim();
  if (!t) return false;
  return normalizeOperativoSubtipo(t) === null;
}

/** Fallback al guardar cuando no hay match (no usar en selectores). */
export function resolveOperativoSubtipoGastoCanon(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  return normalizeOperativoSubtipoCached(t) ?? 'OTROS / ESPECIFICAR';
}

export function getOperativoSubtipoLabel(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return '—';
  const official = normalizeOperativoSubtipoCached(v);
  if (official) return official;
  return `${v} (requiere revisión)`;
}

export function getOperativoSubtipoOptions(): { value: string; label: string }[] {
  return [...OPERATIVO_SUBTIPO_OPTIONS];
}

export function getDefaultFactTipoSubtipoForOperativoCanon(canon: string): { tipo: string; subTipo: string } {
  return (
    FACT_DEFAULT_BY_OFFICIAL[canon]
    ?? FACT_DEFAULT_BY_OFFICIAL['OTROS / ESPECIFICAR']
  );
}

export function getOperativoCanonSet(): Set<string> {
  return new Set(OFFICIAL_SET);
}

export function getOfficialOperativoSubtipoValues(): readonly string[] {
  return OFFICIAL_OPERATIVO_SUBTIPO_VALUES;
}
