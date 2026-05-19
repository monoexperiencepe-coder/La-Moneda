/** Patrones que representan “sin dato” en Excel/importación. */
const EMPTY_LITERALS = new Set(['', '-', '—', '–', 'null', 'undefined', 'n/a', 'na', 's/d', 'sin dato']);

/** Secuencias mojibake frecuentes (UTF-8 leído como Latin-1 / Windows-1252). */
const MOJIBAKE_SEQUENCES: [string, string][] = [
  ['\u00e2\u20ac\u2014', '\u2014'],
  ['\u00e2\u20ac\u2013', '\u2013'],
  ['\u00e2\u20ac\u201c', '\u201c'],
  ['\u00e2\u20ac\u201d', '\u201d'],
  ['\u00e2\u20ac\u02dc', '\u2018'],
  ['\u00e2\u20ac\u2122', '\u2019'],
  ['\u00e2\u20ac\u00a2', '\u2022'],
  ['\u00e2\u20ac\u00a6', '\u2026'],
  ['\u00c2\u00b7', '\u00b7'],
  ['\u00c2', ' '],
  ['â€"', '\u2014'],
  ['â€"', '\u2013'],
  ['â€œ', '\u201c'],
  ['â€\u009d', '\u201d'],
  ['â€˜', '\u2018'],
  ['â€™', '\u2019'],
  ['â€¦', '\u2026'],
  ['Â·', '\u00b7'],
];

const REPLACEMENTS: [RegExp, string][] = MOJIBAKE_SEQUENCES.map(([from, to]) => [
  new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
  to,
]);

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** ¿Es solo basura / guión / placeholder sin contenido real? */
export function isEmptyDisplayValue(value: string): boolean {
  const t = normalizeWhitespace(value);
  if (!t) return true;
  if (EMPTY_LITERALS.has(t.toLowerCase())) return true;
  if (/^[\u2013\u2014\-–—]+$/.test(t)) return true;
  if (/^â€[\s"'\u009d]*$/i.test(t)) return true;
  if (/^â[\s€"'\u009d–—-]*$/i.test(t)) return true;
  return false;
}

/**
 * Corrige texto con mojibake (UTF-8 leído como Latin-1) y normaliza vacíos.
 * @param emptyAs Si el valor queda vacío: '—' para UI, null/'' para formularios/guardado.
 */
export function cleanMojibakeText(
  value: unknown,
  options?: { emptyAs?: string | null },
): string {
  if (value == null) {
    const empty = options?.emptyAs;
    return empty === null || empty === undefined ? '' : empty;
  }

  let s = String(value);
  for (const [pattern, replacement] of REPLACEMENTS) {
    s = s.replace(pattern, replacement);
  }
  s = normalizeWhitespace(s);

  if (isEmptyDisplayValue(s)) {
    const empty = options?.emptyAs;
    if (empty === null || empty === undefined) return '';
    return empty;
  }

  return s;
}

/** Texto visible en tabla/UI; vacío → em dash. */
export function displayConductorField(value: unknown): string {
  return cleanMojibakeText(value, { emptyAs: '—' });
}

/** Valor para inputs de edición (sin em dash). */
export function conductorFieldForEdit(value: unknown): string {
  return cleanMojibakeText(value, { emptyAs: null });
}

/** Antes de guardar en Supabase: vacío/mojibake → null. */
export function sanitizeConductorFieldForSave(value: string): string | null {
  const cleaned = cleanMojibakeText(value, { emptyAs: null });
  if (!cleaned || isEmptyDisplayValue(cleaned)) return null;
  return cleaned;
}

/** Limpia strings de un conductor al leer de BD (solo frontend). */
export function cleanConductorRecord<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row };
  const stringKeys = [
    'nombres',
    'apellidos',
    'numeroDocumento',
    'celular',
    'domicilio',
    'cochera',
    'direccion',
    'numeroEmergencia',
    'comentarios',
    'statusOriginal',
    'tipoDocumento',
    'estadoContrato',
    'estado',
    'fechaVencimientoContrato',
  ] as const;

  for (const key of stringKeys) {
    if (key in out && out[key] != null) {
      const cleaned = cleanMojibakeText(out[key], { emptyAs: null });
      (out as Record<string, unknown>)[key] =
        cleaned || (key === 'nombres' || key === 'apellidos' || key === 'comentarios' ? '' : out[key]);
    }
  }

  if ('cochera' in out && (out.cochera === '' || out.cochera == null)) {
    (out as Record<string, unknown>).cochera = null;
  }
  if ('direccion' in out && (out.direccion === '' || out.direccion == null)) {
    (out as Record<string, unknown>).direccion = null;
  }
  if ('numeroEmergencia' in out && (out.numeroEmergencia === '' || out.numeroEmergencia == null)) {
    (out as Record<string, unknown>).numeroEmergencia = null;
  }
  if ('statusOriginal' in out && (out.statusOriginal === '' || out.statusOriginal == null)) {
    (out as Record<string, unknown>).statusOriginal = null;
  }

  return out;
}
