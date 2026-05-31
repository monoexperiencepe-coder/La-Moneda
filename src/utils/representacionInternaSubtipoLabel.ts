import {
  getOfficialSubtipoLabel,
  getOfficialSubtiposForCategoria,
} from '../constants/subtipos/officialSubtiposCatalog';
import { resolveLegacyAliasNormKey } from '../constants/subtipos/legacySubtipoAliases';
import { subtipoDedupeKey } from '../constants/subtipos/subtipoDedupeKey';

function normKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const OFFICIAL_ENTRIES = getOfficialSubtiposForCategoria('representacion_interna');

const DEDUPE_TO_OFFICIAL = new Map<string, string>();
for (const entry of OFFICIAL_ENTRIES) {
  const dk = subtipoDedupeKey(entry.value);
  if (!DEDUPE_TO_OFFICIAL.has(dk)) DEDUPE_TO_OFFICIAL.set(dk, entry.value);
}

/** Legacy snake_case / frases → valor oficial Excel. */
const ALIAS_TO_OFFICIAL: Record<string, string> = {
  almuerzo_socios: 'ALMUERZOS SOCIOS',
  almuerzos_socios: 'ALMUERZOS SOCIOS',
  regalos: 'REGALOS EMPRESARIALES',
  regalos_empresariales: 'REGALOS EMPRESARIALES',
  gasto_representacion: 'INVITACIONES A EVENTOS PARA CLIENTES',
  gasto_de_representacion: 'INVITACIONES A EVENTOS PARA CLIENTES',
  invitaciones_eventos_clientes: 'INVITACIONES A EVENTOS PARA CLIENTES',
  alojamientos: 'ALOJAMIENTOS',
  alojameintos: 'ALOJAMIENTOS',
  movilidad_socios: 'TRASLADO EJECUTIVOS',
  traslado_ejecutivos: 'TRASLADO EJECUTIVOS',
  reunion_socios: 'REUNIONES CORPORATIVOS INTERNOS',
  reuniones_corporativos_internos: 'REUNIONES CORPORATIVOS INTERNOS',
  reconocimientos: 'RECONOCIMIENTOS',
  capacitacion: 'CAPACITACION',
  mobiliario: 'MOBILIARIO',
  cena_familiar: 'INVITACIONES A EVENTOS PARA CLIENTES',
  otros_representacion_interna: 'INVITACIONES A EVENTOS PARA CLIENTES',
};

const LEGACY_PHRASE_TO_OFFICIAL: Record<string, string> = {
  'almuerzo socios': 'ALMUERZOS SOCIOS',
  'almuerzos socios': 'ALMUERZOS SOCIOS',
  'regalos empresariales': 'REGALOS EMPRESARIALES',
  'gasto de representación': 'INVITACIONES A EVENTOS PARA CLIENTES',
  'gasto de representacion': 'INVITACIONES A EVENTOS PARA CLIENTES',
  'invitaciones a eventos para clientes': 'INVITACIONES A EVENTOS PARA CLIENTES',
  'cena familiar': 'INVITACIONES A EVENTOS PARA CLIENTES',
  'reunion socios': 'REUNIONES CORPORATIVOS INTERNOS',
  'reunión socios': 'REUNIONES CORPORATIVOS INTERNOS',
  'reuniones corporativos internos': 'REUNIONES CORPORATIVOS INTERNOS',
  'traslado ejecutivos': 'TRASLADO EJECUTIVOS',
  'movilidad socios': 'TRASLADO EJECUTIVOS',
  reconocimientos: 'RECONOCIMIENTOS',
  capacitacion: 'CAPACITACION',
  mobiliario: 'MOBILIARIO',
};

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
    const kFlat = normKey(c).replace(/\s+/g, '_');
    const fromAlias = ALIAS_TO_OFFICIAL[kFlat];
    if (fromAlias) return fromAlias;
    const kSpaced = normKey(c);
    const fromPhrase = LEGACY_PHRASE_TO_OFFICIAL[kSpaced];
    if (fromPhrase) return fromPhrase;
  }

  return null;
}

/**
 * Normaliza `subtipo_gasto` de representación interna al valor oficial cuando hay alias conocido.
 * Valores históricos no mapeados se devuelven tal cual (sin borrar BD).
 */
export function normalizeRepresentacionInternaSubtipo(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const kFlat = normKey(s).replace(/\s+/g, '_');
  if (kFlat === 'representacion_interna') return '';
  const official = resolveToOfficialValue(s);
  if (official) return official;
  return s;
}

export function getRepresentacionInternaSubtipoLabel(subtipo: string | null | undefined): string {
  const t = (subtipo ?? '').trim();
  if (!t) return '—';
  const officialLabel = getOfficialSubtipoLabel('representacion_interna', t);
  if (officialLabel) return officialLabel;
  const canon = normalizeRepresentacionInternaSubtipo(t);
  if (canon) {
    const label = getOfficialSubtipoLabel('representacion_interna', canon);
    if (label) return label;
  }
  return t;
}
