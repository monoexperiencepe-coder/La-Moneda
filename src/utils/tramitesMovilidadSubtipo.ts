/**
 * Subtipos compartidos de trámites, movilidad e impuestos (operativo + administrativo).
 * Valores canónicos en snake_case persistidos en subtipo_gasto.
 */
import { normKey } from './normKey';

export type TramitesMovilidadSubtipoCanon =
  | 'movilidad'
  | 'multas_callao'
  | 'atu'
  | 'sat'
  | 'sunarp'
  | 'sunat'
  | 'sutran'
  | 'taxi';

export const TRAMITES_MOVILIDAD_SUBTIPO_OPTIONS: readonly {
  value: TramitesMovilidadSubtipoCanon;
  label: string;
}[] = [
  { value: 'movilidad', label: 'Movilidad' },
  { value: 'multas_callao', label: 'Multas Callao' },
  { value: 'atu', label: 'ATU' },
  { value: 'sat', label: 'SAT' },
  { value: 'sunarp', label: 'SUNARP' },
  { value: 'sunat', label: 'SUNAT' },
  { value: 'sutran', label: 'SUTRAN' },
  { value: 'taxi', label: 'Taxi' },
];

export const TRAMITES_MOVILIDAD_LABELS: Record<TramitesMovilidadSubtipoCanon, string> = {
  movilidad: 'Movilidad',
  multas_callao: 'Multas Callao',
  atu: 'ATU',
  sat: 'SAT',
  sunarp: 'SUNARP',
  sunat: 'SUNAT',
  sutran: 'SUTRAN',
  taxi: 'Taxi',
};

const CANON_SET = new Set<string>(TRAMITES_MOVILIDAD_SUBTIPO_OPTIONS.map((o) => o.value));

/** Alias normKey → canónico (incluye typos legacy como suanrp). */
const ALIAS_TO_CANON: Record<string, TramitesMovilidadSubtipoCanon> = {
  movilidad: 'movilidad',
  pasaje: 'movilidad',
  pasajes: 'movilidad',
  traslado: 'movilidad',
  traslados: 'movilidad',
  multas_callao: 'multas_callao',
  multa_callao: 'multas_callao',
  'multas callao': 'multas_callao',
  atu: 'atu',
  autorizacion_atu: 'atu',
  'autorizacion atu': 'atu',
  permiso_atu: 'atu',
  sat: 'sat',
  sunarp: 'sunarp',
  suanrp: 'sunarp',
  sunat: 'sunat',
  sutran: 'sutran',
  taxi: 'taxi',
  rt_taxi: 'taxi',
  revision_tecnica_taxi: 'taxi',
  'revision tecnica taxi': 'taxi',
};

function squash(s: string): string {
  return normKey(s).replace(/[\s\-/]+/g, '_').replace(/_+/g, '_');
}

export function normalizeTramitesMovilidadSubtipo(
  raw: string | null | undefined,
): TramitesMovilidadSubtipoCanon | null {
  const s0 = (raw ?? '').trim();
  if (!s0) return null;
  const squ = squash(s0);
  if (CANON_SET.has(squ)) return squ as TramitesMovilidadSubtipoCanon;
  const nk = normKey(s0);
  const fromAlias = ALIAS_TO_CANON[nk] ?? ALIAS_TO_CANON[squ];
  if (fromAlias) return fromAlias;

  if (/\bmulta(s)?\s+callao\b/.test(nk) || nk.includes('multas callao')) return 'multas_callao';
  if (/\b(pasaje|traslado|movilidad)\b/.test(nk)) return 'movilidad';
  if (nk === 'atu' || nk.includes('autorizacion atu') || nk.includes('permiso atu')) return 'atu';
  if (nk === 'sat' || nk.startsWith('sat ') || nk.endsWith(' sat') || nk.includes(' sat ')) return 'sat';
  if (nk === 'sunarp' || nk === 'suanrp') return 'sunarp';
  if (nk.includes('sunat')) return 'sunat';
  if (nk.includes('sutran')) return 'sutran';
  if (nk === 'taxi' || nk.includes('rt taxi') || nk.includes('revision tecnica taxi')) return 'taxi';

  return null;
}

export function getTramitesMovilidadSubtipoLabel(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return '—';
  const canon = normalizeTramitesMovilidadSubtipo(v);
  if (canon) return TRAMITES_MOVILIDAD_LABELS[canon];
  return v;
}

export function getTramitesMovilidadSubtipoDedupeKey(raw: string): string {
  return normalizeTramitesMovilidadSubtipo(raw) ?? squash(raw);
}

export function isTramitesMovilidadCanon(value: string): boolean {
  return CANON_SET.has(squash(value));
}
