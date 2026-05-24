/**
 * Limpieza visual de comentarios / observaciones con metadata de importación (Excel, ETL).
 * No modifica datos en BD.
 */

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeCompareKey(s: string): string {
  return normalizeSpaces(s).toLowerCase().replace(/_/g, ' ');
}

/** True si el fragmento/segmento completo es solo trazabilidad técnica. */
export function isTechnicalImportFragment(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  const n = t.toLowerCase();

  if (/^import\s+limpio$/i.test(t)) return true;
  if (/^importado\s+desde\b/i.test(t)) return true;
  if (/^migraci[oó]n\b/i.test(t)) return true;
  if (/^excel\s+(?:ingresos\s+|gastos\s+|gastos_caja\s+)?fila\s*\d+$/i.test(t)) return true;
  if (/^fila\s*\d+$/i.test(t)) return true;
  if (/^\[[^\]]*(?:placa|excel|fila|import|migraci|origen)/i.test(t)) return true;
  if (/^placa\s+[a-z0-9-]{3,12}$/i.test(t)) return true;
  if (/^\[[^\]]+\]\s*placa\b/i.test(t)) return true;
  if (/^[a-z]{1,4}-\d{1,4}[a-z0-9-]*$/i.test(t)) return true;
  if (/^origen\s+hist[oó]rico\b/i.test(t)) return true;
  if (/^origen\s+gastos_caja\s+id\s*=\s*\d+$/i.test(t)) return true;
  if (/^source:\s*\S+$/i.test(t)) return true;
  if (/^sheet:\s*\S+$/i.test(t)) return true;
  if (/^row:\s*\d+$/i.test(t)) return true;
  if (/^motivo\s+clasificaci[oó]n:\s*\S+$/i.test(t)) return true;
  if (/^revertido\s+desde\s+gastos\s+operativos\b/i.test(t)) return true;
  if (n === 'import limpio' || n === 'import') return true;

  return false;
}

function stripInlineTechnicalFragments(s: string): string {
  let out = s;

  out = out.replace(/\bimport\s+limpio\b/gi, ' ');
  out = out.replace(/\bimportado\s+desde\b(?:\s+excel)?[^.]*\.?/gi, ' ');
  out = out.replace(/\bexcel\s+(?:ingresos\s+|gastos\s+|gastos_caja\s+)?fila\s*\d+\b/gi, ' ');
  out = out.replace(/\bfila\s*\d+\b/gi, ' ');
  out = out.replace(/\bmigraci[oó]n(?:\s+hist[oó]rica|\s+gastos_caja\s+final)?\b/gi, ' ');
  out = out.replace(/\[\s*(?:origen|migraci[oó]n)[^\]]*\]/gi, ' ');
  out = out.replace(/\[\s*migraci[oó]n\s+gastos_caja\s+final\s*\]/gi, ' ');
  out = out.replace(/\borigen\s+hist[oó]rico(?:\s+gastos_caja\s+id\s*=\s*\d+)?\b/gi, ' ');
  out = out.replace(/\borigen\s+gastos_caja\s+id\s*=\s*\d+\b/gi, ' ');
  out = out.replace(/\bsource:\s*\S+/gi, ' ');
  out = out.replace(/\bsheet:\s*\S+/gi, ' ');
  out = out.replace(/\brow:\s*\d+/gi, ' ');
  out = out.replace(/\brevertido\s+desde\s+gastos\s+operativos\s*\([^)]*\)\s*\.?\s*/gi, ' ');
  out = out.replace(/\bmotivo\s+clasificaci[oó]n:\s*\S+\s*/gi, ' ');

  return normalizeSpaces(out);
}

function stripTechnicalSegments(s: string): string {
  const inline = stripInlineTechnicalFragments(s);
  const parts = inline.split(/\s*[—|·;]+\s*/);
  const kept = parts.map((p) => p.trim()).filter((p) => p && !isTechnicalImportFragment(p));
  return normalizeSpaces(kept.join(' · '));
}

/** Comentario útil para UI; null si solo quedaba metadata técnica. */
export function cleanOperationalCommentForUi(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null;
  const cleaned = stripTechnicalSegments(String(raw));
  return cleaned.length ? cleaned : null;
}

/** True si el texto completo no aporta contenido operativo tras limpiar. */
export function isOnlyTechnicalImportComment(raw: string | null | undefined): boolean {
  if (raw == null || !String(raw).trim()) return false;
  return cleanOperationalCommentForUi(raw) == null;
}

/** Texto crudo de auditoría si difiere del limpio (varios campos opcionales). */
export function operationalCommentAuditRaw(
  ...fields: (string | null | undefined)[]
): string | null {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    const raw = field?.trim() ?? '';
    if (!raw || seen.has(raw)) continue;
    const clean = cleanOperationalCommentForUi(raw);
    if (raw !== (clean ?? '')) {
      parts.push(raw);
      seen.add(raw);
    }
  }
  return parts.length ? parts.join('\n\n') : null;
}

/** Observación para listas; omite si repite categoría/motivo/subtipo ya visible. */
export function observacionParaLista(
  comentarios: string | null | undefined,
  evitarDuplicarCon: (string | null | undefined)[] = [],
): string | null {
  const cleaned = cleanOperationalCommentForUi(comentarios);
  if (!cleaned) return null;
  const key = normalizeCompareKey(cleaned);
  for (const other of evitarDuplicarCon) {
    const t = (other ?? '').trim();
    if (!t) continue;
    if (normalizeCompareKey(t) === key) return null;
  }
  return cleaned;
}

/** Observación útil para fila de gasto en historiales. */
export function gastoObservacionParaLista(g: {
  comentarios?: string | null;
  motivo?: string | null;
  subtipo_gasto?: string | null;
  subcategoria?: string | null;
  categoriaReal?: string | null;
  subTipo?: string | null;
  tipo_gasto?: string | null;
}): string | null {
  return observacionParaLista(g.comentarios, [
    g.motivo,
    g.subtipo_gasto,
    g.subcategoria,
    g.categoriaReal,
    g.subTipo,
    g.tipo_gasto,
  ]);
}
