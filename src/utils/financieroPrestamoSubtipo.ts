/**
 * Subtipos oficiales financiero_prestamo + inferencia Tipo Fact (sin migrar BD).
 */
import {
  getOfficialSubtipoLabel,
  getOfficialSubtiposForCategoria,
} from '../constants/subtipos/officialSubtiposCatalog';
import { resolveLegacyAliasNormKey } from '../constants/subtipos/legacySubtipoAliases';
import { subtipoDedupeKey } from '../constants/subtipos/subtipoDedupeKey';
import { normKey } from './normKey';

export type FinancieroPrestamoSubtipoOfficial =
  | 'ALQUILERES'
  | 'PRÉSTAMO'
  | 'CUOTA COMPRA DE ACTIVOS'
  | 'CUOTA DE MANTENIMIENTO'
  | 'INTERESES'
  | 'MEMBRESÍAS'
  | 'OTROS / ESPECIFICAR';

const OFFICIAL_ENTRIES = getOfficialSubtiposForCategoria('financiero_prestamo');

const DEDUPE_TO_OFFICIAL = new Map<string, FinancieroPrestamoSubtipoOfficial>();
for (const entry of OFFICIAL_ENTRIES) {
  const dk = subtipoDedupeKey(entry.value);
  if (!DEDUPE_TO_OFFICIAL.has(dk)) {
    DEDUPE_TO_OFFICIAL.set(dk, entry.value as FinancieroPrestamoSubtipoOfficial);
  }
}

/** Subtipo Fact real según `factSubtiposGastos.json` (typo NANTENIMIENTO conservado). */
export const FACT_DEFAULT_BY_FINANCIERO_SUBTIPO: Record<
  FinancieroPrestamoSubtipoOfficial,
  { tipo: string; subTipo: string }
> = {
  ALQUILERES: { tipo: 'GASTOS FIJOS', subTipo: 'ALQUILERES' },
  'PRÉSTAMO': { tipo: 'GASTOS FIJOS', subTipo: 'OTROS /ESPECIFICAR' },
  'CUOTA COMPRA DE ACTIVOS': { tipo: 'OTROS GASTOS', subTipo: 'CUOTA COMPRA DE ACTIVOS' },
  'CUOTA DE MANTENIMIENTO': { tipo: 'OTROS GASTOS', subTipo: 'CUOTA DE NANTENIMIENTO' },
  INTERESES: { tipo: 'GASTOS FIJOS', subTipo: 'INTERESES' },
  'MEMBRESÍAS': { tipo: 'OTROS GASTOS', subTipo: 'MEMBRESÍAS' },
  'OTROS / ESPECIFICAR': { tipo: 'OTROS GASTOS', subTipo: 'OTROS /ESPECIFICAR' },
};

const ALIAS_TO_OFFICIAL: Record<string, FinancieroPrestamoSubtipoOfficial> = {
  alquileres: 'ALQUILERES',
  alquiler: 'ALQUILERES',
  prestamo: 'PRÉSTAMO',
  prestamos: 'PRÉSTAMO',
  prestamo_interes_banca: 'OTROS / ESPECIFICAR',
  interes: 'INTERESES',
  intereses: 'INTERESES',
  membresias: 'MEMBRESÍAS',
  membresia: 'MEMBRESÍAS',
  cuota_compra_de_activos: 'CUOTA COMPRA DE ACTIVOS',
  cuota_compra_activos: 'CUOTA COMPRA DE ACTIVOS',
  cuota_de_mantenimiento: 'CUOTA DE MANTENIMIENTO',
  cuota_mantenimiento: 'CUOTA DE MANTENIMIENTO',
  otros_especificar: 'OTROS / ESPECIFICAR',
  otros: 'OTROS / ESPECIFICAR',
};

const PHRASE_TO_OFFICIAL: Record<string, FinancieroPrestamoSubtipoOfficial> = {
  'cuota compra de activos': 'CUOTA COMPRA DE ACTIVOS',
  'cuota compra activos': 'CUOTA COMPRA DE ACTIVOS',
  'cuota de mantenimiento': 'CUOTA DE MANTENIMIENTO',
  'cuota mantenimiento': 'CUOTA DE MANTENIMIENTO',
  'prestamo cuota interes': 'PRÉSTAMO',
  'cuota interes': 'PRÉSTAMO',
};

/** Legacy sin mapeo automático seguro (solo auditoría / badge). */
const LEGACY_SUSPICIOUS_RAW = new Set(['tarjeta_banco', 'tarjeta banco']);

function aliasKeyVariants(raw: string): string[] {
  const nk = normKey(raw);
  const flat = nk.replace(/\s+/g, '_');
  const dk = subtipoDedupeKey(raw);
  return [nk, flat, dk];
}

function matchPhrase(raw: string): FinancieroPrestamoSubtipoOfficial | null {
  const nk = normKey(raw);
  const direct = PHRASE_TO_OFFICIAL[nk];
  if (direct) return direct;
  if (nk.includes('interes') || nk.includes('interés')) return 'INTERESES';
  if (nk.includes('alquiler')) return 'ALQUILERES';
  if (nk.includes('membres')) return 'MEMBRESÍAS';
  if (nk.includes('mantenimiento') && nk.includes('cuota')) return 'CUOTA DE MANTENIMIENTO';
  if (nk.includes('mantenimiento')) return 'CUOTA DE MANTENIMIENTO';
  if (
    nk.includes('cuota compra')
    || nk.includes('compra de activo')
    || nk.includes('compra activo')
    || (nk.includes('cuota') && (nk.includes('activo') || nk.includes('vehiculo') || nk.includes('vehículo')))
  ) {
    return 'CUOTA COMPRA DE ACTIVOS';
  }
  if (nk.includes('prestamo') || nk.includes('préstamo')) return 'PRÉSTAMO';
  if (nk === 'cuota' || nk === 'cuotas') return 'CUOTA COMPRA DE ACTIVOS';
  return null;
}

export function isFinancieroLegacySuspiciousSubtipo(raw: string | null | undefined): boolean {
  const k = normKey(raw ?? '').replace(/\s+/g, '_');
  return LEGACY_SUSPICIOUS_RAW.has(k);
}

export function normalizeFinancieroPrestamoSubtipo(
  raw: string | null | undefined,
): FinancieroPrestamoSubtipoOfficial | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  if (isFinancieroLegacySuspiciousSubtipo(trimmed)) return null;

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
    const fromPhrase = matchPhrase(c);
    if (fromPhrase) return fromPhrase;
  }

  return null;
}

export function resolveFinancieroPrestamoSubtipoGastoCanon(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  return normalizeFinancieroPrestamoSubtipo(t) ?? t;
}

export function getFinancieroPrestamoSubtipoLabel(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return '—';
  const official = getOfficialSubtipoLabel('financiero_prestamo', v);
  if (official) return official;
  const canon = normalizeFinancieroPrestamoSubtipo(v);
  if (canon) {
    const label = getOfficialSubtipoLabel('financiero_prestamo', canon);
    if (label) return label;
  }
  if (isFinancieroLegacySuspiciousSubtipo(v)) return `${v} (legacy)`;
  return v;
}

export function getFinancieroPrestamoSubtipoOptions(): { value: string; label: string }[] {
  return OFFICIAL_ENTRIES.map((e) => ({ value: e.value, label: e.label }));
}

export function getDefaultFactTipoSubtipoForFinancieroSubtipo(
  subtipo: string,
): { tipo: string; subTipo: string } {
  const canon = normalizeFinancieroPrestamoSubtipo(subtipo);
  if (canon && FACT_DEFAULT_BY_FINANCIERO_SUBTIPO[canon]) {
    return FACT_DEFAULT_BY_FINANCIERO_SUBTIPO[canon];
  }
  return FACT_DEFAULT_BY_FINANCIERO_SUBTIPO['OTROS / ESPECIFICAR'];
}

export function getFinancieroPrestamoSubtipoDedupeKey(raw: string): string {
  return subtipoDedupeKey(normalizeFinancieroPrestamoSubtipo(raw) ?? raw);
}
