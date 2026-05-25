/**
 * Subtipos canónicos para administrativo_empresa (snake_case en subtipo_gasto).
 */
import { normKey } from './normKey';
import {
  normalizeTramitesMovilidadSubtipo,
  TRAMITES_MOVILIDAD_LABELS,
  TRAMITES_MOVILIDAD_SUBTIPO_OPTIONS,
  type TramitesMovilidadSubtipoCanon,
} from './tramitesMovilidadSubtipo';

export type AdministrativoSubtipoCanon =
  | 'administrativo_general'
  | TramitesMovilidadSubtipoCanon;

export const ADMINISTRATIVO_SUBTIPO_OPTIONS: readonly {
  value: AdministrativoSubtipoCanon;
  label: string;
}[] = [
  { value: 'administrativo_general', label: 'Administrativo general' },
  ...TRAMITES_MOVILIDAD_SUBTIPO_OPTIONS,
];

const CANON_SET = new Set<string>(ADMINISTRATIVO_SUBTIPO_OPTIONS.map((o) => o.value));

const ALIAS_TO_CANON: Record<string, AdministrativoSubtipoCanon> = {
  administrativo_general: 'administrativo_general',
  administrativo: 'administrativo_general',
  tributario: 'administrativo_general',
  tributarios: 'administrativo_general',
  notarial: 'administrativo_general',
  oficina: 'administrativo_general',
};

export function normalizeAdministrativoSubtipo(
  raw: string | null | undefined,
): AdministrativoSubtipoCanon | null {
  const s0 = (raw ?? '').trim();
  if (!s0) return null;
  const nk = normKey(s0);
  if (CANON_SET.has(nk)) return nk as AdministrativoSubtipoCanon;

  const tram = normalizeTramitesMovilidadSubtipo(s0);
  if (tram) return tram;

  const alias = ALIAS_TO_CANON[nk];
  if (alias) return alias;

  if (nk.includes('administrativ') || nk.includes('tributari') || nk.includes('notarial')) {
    return 'administrativo_general';
  }

  return null;
}

export function resolveAdministrativoSubtipoGastoCanon(
  raw: string | null | undefined,
): AdministrativoSubtipoCanon | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  return normalizeAdministrativoSubtipo(t) ?? 'administrativo_general';
}

export function getAdministrativoSubtipoLabel(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return '—';
  const canon = normalizeAdministrativoSubtipo(v);
  if (canon === 'administrativo_general') return 'Administrativo general';
  if (canon && canon in TRAMITES_MOVILIDAD_LABELS) {
    return TRAMITES_MOVILIDAD_LABELS[canon as TramitesMovilidadSubtipoCanon];
  }
  const row = ADMINISTRATIVO_SUBTIPO_OPTIONS.find((o) => o.value === v);
  if (row) return row.label;
  return v;
}

export function getAdministrativoSubtipoOptions(): { value: AdministrativoSubtipoCanon; label: string }[] {
  return [...ADMINISTRATIVO_SUBTIPO_OPTIONS];
}

export function getAdministrativoSubtipoDedupeKey(raw: string): string {
  return normalizeAdministrativoSubtipo(raw) ?? normKey(raw);
}
