import { normKey } from './subtipoFinancieroLabel';

const STOPWORDS = new Set([
  'de',
  'la',
  'el',
  'los',
  'las',
  'y',
  'a',
  'en',
  'por',
  'con',
  'del',
  'al',
  'un',
  'una',
  'uno',
  'fila',
  'excel',
  'gastos',
  'gasto',
  'registro',
  'sheet',
  'hoja',
  'tab',
  'columna',
  'import',
  'importado',
  'lamoneda',
  'moneda',
  'sistema',
  'pendiente',
  'revision',
  'global',
  'completo',
  'total',
  'pago',
  'transferencia',
  'abono',
  'mod',
  'ref',
]);

/** Ruido operativo / IDs que no aportan al patrón de clasificación. */
const RUIDO_PATTERNS: RegExp[] = [
  /\bexcel\s+gastos?\b/g,
  /\bgastos?\s+excel\b/g,
  /\bfila\s+\d+\b/g,
  /\bregistro\s+#?\d+\b/g,
  /\b#?\d{4,}\b/g,
  /\b[a-f0-9]{8,}\b/g,
  /\buuid\s+[a-f0-9-]+\b/g,
  /\bvehiculo\s+\d+\b/g,
  /\bveh\s*\d+\b/g,
  /\bid\s*[:=]?\s*\d+\b/g,
];

/**
 * Normaliza texto para memoria de clasificación humana.
 * Más agresivo que normKey: quita ruido de importación e IDs.
 */
export function normalizeClasificacionMemoryText(raw: string | null | undefined): string {
  let t = normKey(raw ?? '');
  if (!t) return '';
  for (const re of RUIDO_PATTERNS) {
    t = t.replace(re, ' ');
  }
  t = t.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return t;
}

export function tokenizeClasificacionMemoria(norm: string): string[] {
  if (!norm) return [];
  return norm
    .split(/\s+/)
    .filter((tok) => {
      if (tok.length < 2) return false;
      if (STOPWORDS.has(tok)) return false;
      if (/^\d+$/.test(tok)) return false;
      if (/^[a-f0-9]{6,}$/.test(tok)) return false;
      return true;
    });
}

export function buildClasificacionMemoriaTextoOriginal(
  parts: Array<string | null | undefined>,
): string {
  return parts
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .join(' · ')
    .trim()
    .slice(0, 500);
}
