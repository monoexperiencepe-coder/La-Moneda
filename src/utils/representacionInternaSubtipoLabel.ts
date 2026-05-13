import { SUBTIPOS_REPRESENTACION_INTERNA } from '../data/representacionInterna';

function normKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const LABELS: Record<(typeof SUBTIPOS_REPRESENTACION_INTERNA)[number], string> = {
  movilidad_socios: 'Movilidad socios',
  almuerzo_socios: 'Almuerzo socios',
  reunion_socios: 'Reunión socios',
  gasto_representacion: 'Gasto de representación',
};

const CODE_SET = new Set<string>(SUBTIPOS_REPRESENTACION_INTERNA);

/** Legacy retirado del formulario; se muestra como gasto de representación. */
const LEGACY_OTROS_CODE = 'otros_representacion_interna';

/** Subtipo retirado (v4); filas históricas se agrupan en gasto de representación en UI. */
const LEGACY_CENA_CODE = 'cena_familiar';

/** Frases legacy del formulario anterior (texto legible guardado en `subtipo_gasto`). */
const LEGACY_PHRASE_TO_CODE: Record<string, string> = {
  'almuerzo socios': 'almuerzo_socios',
  'cena familiar': LEGACY_CENA_CODE,
  'reunion socios': 'reunion_socios',
  'reunión socios': 'reunion_socios',
  'gasto de representación': 'gasto_representacion',
  'gasto de representacion': 'gasto_representacion',
  'otros representación interna': LEGACY_OTROS_CODE,
  'otros representacion interna': LEGACY_OTROS_CODE,
};

/**
 * Normaliza cualquier valor guardado en `subtipo_gasto` para la pestaña representación interna.
 * Códigos legacy `otros_representacion_interna` y `cena_familiar` se tratan como `gasto_representacion` en UI/filtros.
 */
export function normalizeRepresentacionInternaSubtipo(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const kFlat = normKey(s).replace(/\s+/g, '_');
  if (kFlat === 'representacion_interna') return '';
  if (kFlat === LEGACY_OTROS_CODE || kFlat === LEGACY_CENA_CODE) return 'gasto_representacion';
  if (CODE_SET.has(kFlat)) return kFlat;

  const kSpaced = normKey(s);
  const fromPhrase = LEGACY_PHRASE_TO_CODE[kSpaced];
  if (fromPhrase === LEGACY_OTROS_CODE || fromPhrase === LEGACY_CENA_CODE) return 'gasto_representacion';
  if (fromPhrase && CODE_SET.has(fromPhrase)) return fromPhrase;

  if (kFlat === 'gasto_de_representacion' || kFlat === 'gasto_de_representación') return 'gasto_representacion';

  return '';
}

/**
 * Etiqueta amigable para códigos `subtipo_gasto` de representación interna (y valores legacy equivalentes).
 */
export function getRepresentacionInternaSubtipoLabel(subtipo: string | null | undefined): string {
  const code = normalizeRepresentacionInternaSubtipo(subtipo);
  if (code && code in LABELS) return LABELS[code as keyof typeof LABELS];
  const t = (subtipo ?? '').trim();
  if (!t) return '—';
  return t;
}
