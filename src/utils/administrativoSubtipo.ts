/**
 * Subtipos oficiales administrativo_empresa + inferencia Tipo Fact (sin migrar BD).
 */
import {
  getOfficialSubtipoLabel,
  getOfficialSubtiposForCategoria,
} from '../constants/subtipos/officialSubtiposCatalog';
import { resolveLegacyAliasNormKey } from '../constants/subtipos/legacySubtipoAliases';
import { subtipoDedupeKey } from '../constants/subtipos/subtipoDedupeKey';
import { normKey } from './normKey';

export type AdministrativoSubtipoCanon = string;

const OFFICIAL_ENTRIES = getOfficialSubtiposForCategoria('administrativo_empresa');

const DEDUPE_TO_OFFICIAL = new Map<string, string>();
for (const entry of OFFICIAL_ENTRIES) {
  const dk = subtipoDedupeKey(entry.value);
  if (!DEDUPE_TO_OFFICIAL.has(dk)) DEDUPE_TO_OFFICIAL.set(dk, entry.value);
}

/**
 * Subtipo Fact según factSubtiposGastos.json (labels reales).
 * Clave = valor oficial en subtipo_gasto.
 */
export const FACT_DEFAULT_BY_ADMINISTRATIVO_SUBTIPO: Record<string, { tipo: string; subTipo: string }> = {
  administrativo_general: { tipo: 'OTROS GASTOS', subTipo: 'OTROS /ESPECIFICAR' },
  ALQUILERES: { tipo: 'GASTOS FIJOS', subTipo: 'ALQUILERES' },
  'SEGUROS VEHICULAR': { tipo: 'SEGUROS /DOCUMENTOS', subTipo: 'CIA DE SEGUROS' },
  DELIVERY: { tipo: 'OTROS GASTOS', subTipo: 'DELIVERY' },
  INMUEBLE: { tipo: 'COMPRA ACTIVO', subTipo: 'INMUEBLE' },
  INTERESES: { tipo: 'GASTOS FIJOS', subTipo: 'INTERESES' },
  MEMBRESIAS: { tipo: 'OTROS GASTOS', subTipo: 'MEMBRESÍAS' },
  MUNICIPALES: { tipo: 'TRIBUTARIOS / NOTARIALES', subTipo: 'MUNICIPALES' },
  OFICINA: { tipo: 'OTROS GASTOS', subTipo: 'ÚTILES DE OFICINS' },
  'OTROS / ESPECIFICAR': { tipo: 'OTROS GASTOS', subTipo: 'OTROS /ESPECIFICAR' },
  'PERMISOS VARIOS': { tipo: 'DOCUMENTOS', subTipo: 'PERMISOS VARIOS' },
  'REPRESENTACIÓN': { tipo: 'OTROS GASTOS', subTipo: 'REPRESENTACIÓN' },
  ATU: { tipo: 'SEGUROS /DOCUMENTOS', subTipo: 'AUTORIZACIÓN ATU' },
  SUNARP: { tipo: 'TRIBUTARIOS / NOTARIALES', subTipo: 'SUNARP' },
  sunarp: { tipo: 'TRIBUTARIOS / NOTARIALES', subTipo: 'SUNARP' },
  SUNAT: { tipo: 'TRIBUTARIOS / NOTARIALES', subTipo: 'SUNAT' },
  SUTRAN: { tipo: 'TRIBUTARIOS / NOTARIALES', subTipo: 'SUTRAN' },
  TAXI: { tipo: 'DOCUMENTOS', subTipo: 'RT-TAXI' },
  'TRABAJOS EVENTUALES': { tipo: 'GASTOS FIJOS', subTipo: 'TRABAJOS EVENTUALES' },
  'TRÁMITES NOTARIALES': { tipo: 'TRIBUTARIOS / NOTARIALES', subTipo: 'TRÁMITES NOTARIALES' },
  'VIGENCIA DE PODER': { tipo: 'DOCUMENTOS', subTipo: 'VIGENCIA DE PODER' },
  NOTARIALES: { tipo: 'TRIBUTARIOS / NOTARIALES', subTipo: 'TRÁMITES NOTARIALES' },
};

const ALIAS_TO_OFFICIAL: Record<string, string> = {
  administrativo_general: 'administrativo_general',
  administrativo: 'administrativo_general',
  alquileres: 'ALQUILERES',
  alquiler: 'ALQUILERES',
  seguros_vehicular: 'SEGUROS VEHICULAR',
  seguro_vehicular: 'SEGUROS VEHICULAR',
  delivery: 'DELIVERY',
  inmueble: 'INMUEBLE',
  intereses: 'INTERESES',
  interes: 'INTERESES',
  membresias: 'MEMBRESIAS',
  membresia: 'MEMBRESIAS',
  municipales: 'MUNICIPALES',
  municipal: 'MUNICIPALES',
  oficina: 'OFICINA',
  oficina_documentos: 'OFICINA',
  oficina_documento: 'OFICINA',
  utiles_de_oficina: 'OFICINA',
  utilies_de_oficina: 'OFICINA',
  papeleria: 'OFICINA',
  papeletria: 'OFICINA',
  otros_especificar: 'OTROS / ESPECIFICAR',
  otros: 'OTROS / ESPECIFICAR',
  permisos_varios: 'PERMISOS VARIOS',
  representacion: 'REPRESENTACIÓN',
  atu: 'ATU',
  sunarp: 'SUNARP',
  suanrp: 'SUNARP',
  sunat: 'SUNAT',
  sutran: 'SUTRAN',
  taxi: 'TAXI',
  revision_tecnica_taxi: 'TAXI',
  trabajos_eventuales: 'TRABAJOS EVENTUALES',
  tramites_notariales: 'TRÁMITES NOTARIALES',
  tramite_notarial: 'TRÁMITES NOTARIALES',
  tramite_notariales: 'TRÁMITES NOTARIALES',
  notarial: 'NOTARIALES',
  notariales: 'NOTARIALES',
  vigencia_de_poder: 'VIGENCIA DE PODER',
  vigencia_poder: 'VIGENCIA DE PODER',
  tributario: 'administrativo_general',
  tributarios: 'administrativo_general',
};

function aliasKeyVariants(raw: string): string[] {
  const nk = normKey(raw);
  const flat = nk.replace(/\s+/g, '_');
  const dk = subtipoDedupeKey(raw);
  return [nk, flat, dk];
}

function resolveToOfficialValue(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  const globalAlias = resolveLegacyAliasNormKey(trimmed);
  if (globalAlias && globalAlias !== trimmed) candidates.push(globalAlias);

  for (const c of candidates) {
    const hit = DEDUPE_TO_OFFICIAL.get(subtipoDedupeKey(c));
    if (hit) return hit;
  }

  for (const c of candidates) {
    for (const key of aliasKeyVariants(c)) {
      const mapped = ALIAS_TO_OFFICIAL[key];
      if (mapped) return mapped;
    }
  }

  return null;
}

export function normalizeAdministrativoSubtipo(
  raw: string | null | undefined,
): AdministrativoSubtipoCanon | null {
  const s0 = (raw ?? '').trim();
  if (!s0) return null;
  return resolveToOfficialValue(s0);
}

export function resolveAdministrativoSubtipoGastoCanon(
  raw: string | null | undefined,
): AdministrativoSubtipoCanon | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  return normalizeAdministrativoSubtipo(t) ?? t;
}

/** true si el valor no mapea a un oficial (se muestra como legacy en selects). */
export function isAdministrativoSubtipoLegacyOnly(raw: string | null | undefined): boolean {
  const t = (raw ?? '').trim();
  if (!t) return false;
  return normalizeAdministrativoSubtipo(t) === null;
}

export function getAdministrativoSubtipoLabel(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return '—';
  const official = getOfficialSubtipoLabel('administrativo_empresa', v);
  if (official) return official;
  const canon = normalizeAdministrativoSubtipo(v);
  if (canon) {
    const label = getOfficialSubtipoLabel('administrativo_empresa', canon);
    if (label) return label;
  }
  return v;
}

export function getAdministrativoSubtipoOptions(): { value: AdministrativoSubtipoCanon; label: string }[] {
  return OFFICIAL_ENTRIES.map((e) => ({ value: e.value, label: e.label }));
}

export function getDefaultFactTipoSubtipoForAdministrativoSubtipo(
  subtipo: string,
): { tipo: string; subTipo: string } {
  const canon = normalizeAdministrativoSubtipo(subtipo) ?? subtipo.trim();
  return (
    FACT_DEFAULT_BY_ADMINISTRATIVO_SUBTIPO[canon]
    ?? FACT_DEFAULT_BY_ADMINISTRATIVO_SUBTIPO.administrativo_general
  );
}

export function getAdministrativoSubtipoDedupeKey(raw: string): string {
  return subtipoDedupeKey(normalizeAdministrativoSubtipo(raw) ?? raw);
}
