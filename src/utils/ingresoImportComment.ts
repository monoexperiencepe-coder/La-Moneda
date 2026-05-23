/**
 * Comentarios / detalle de ingresos importados desde Excel suelen incluir trazabilidad
 * (fila, placa, «Import limpio»). En listados operativos se oculta; la BD conserva el texto crudo.
 */

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Segmento suelto que no aporta contexto de negocio (solo import/ETL). */
function isTechnicalSegment(segment: string): boolean {
  const t = segment.trim();
  if (!t) return true;
  const n = t.toLowerCase();

  if (/^import\s+limpio$/i.test(t)) return true;
  if (/^importado\s+desde\b/i.test(t)) return true;
  if (/^migraci[oó]n\b/i.test(t)) return true;
  if (/^excel\s+(?:ingresos\s+|gastos\s+|gastos_caja\s+)?fila\s*\d+$/i.test(t)) return true;
  if (/^\[[^\]]*(?:placa|excel|fila|import|migraci)/i.test(t)) return true;
  if (/^placa\s+[a-z0-9-]{3,12}$/i.test(t)) return true;
  if (/^\[[^\]]+\]\s*placa\b/i.test(t)) return true;
  if (/^[a-z]{1,4}-\d{1,4}[a-z0-9-]*$/i.test(t)) return true;
  if (/^origen\s+hist[oó]rico\b/i.test(t)) return true;
  if (/^source:\s*\S+$/i.test(t)) return true;
  if (/^sheet:\s*\S+$/i.test(t)) return true;
  if (/^row:\s*\d+$/i.test(t)) return true;
  if (n === 'import limpio' || n === 'import') return true;

  return false;
}

function stripInlineTechnicalFragments(s: string): string {
  let out = s;

  out = out.replace(/\bimport\s+limpio\b/gi, ' ');
  out = out.replace(/\bimportado\s+desde\b[^.]*\.?/gi, ' ');
  out = out.replace(/\bexcel\s+(?:ingresos\s+|gastos\s+|gastos_caja\s+)?fila\s*\d+\b/gi, ' ');
  out = out.replace(/\bmigraci[oó]n(?:\s+hist[oó]rica)?\b/gi, ' ');
  out = out.replace(/\[\s*(?:origen|migraci[oó]n)[^\]]*\]/gi, ' ');
  out = out.replace(/\borigen\s+hist[oó]rico\s+\S+/gi, ' ');
  out = out.replace(/\bsource:\s*\S+/gi, ' ');
  out = out.replace(/\bsheet:\s*\S+/gi, ' ');
  out = out.replace(/\brow:\s*\d+/gi, ' ');

  return normalizeSpaces(out);
}

function stripTechnicalSegments(s: string): string {
  const inline = stripInlineTechnicalFragments(s);
  const parts = inline.split(/\s*[—|·;]+\s*/);
  const kept = parts.map((p) => p.trim()).filter((p) => p && !isTechnicalSegment(p));
  return normalizeSpaces(kept.join(' — '));
}

/** True si el texto (tras limpiar) no deja contenido útil para el operador. */
export function isTechnicalImportComment(raw: string | null | undefined): boolean {
  if (raw == null || !String(raw).trim()) return false;
  return stripTechnicalSegments(String(raw)).length === 0;
}

/** Comentario listo para UI operativa; null si solo había metadata técnica. */
export function cleanIngresoComentarioParaUi(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null;
  const cleaned = stripTechnicalSegments(String(raw));
  return cleaned.length ? cleaned : null;
}

/** Mejor comentario visible para filas de ingreso (solo `comentarios`, no detalle_operativo). */
export function ingresoComentarioParaLista(raw: string | null | undefined): string | null {
  return cleanIngresoComentarioParaUi(raw);
}

/** Detalle operativo sin ruido ETL; null si no aporta más que vehículo/import. */
export function cleanIngresoDetalleOperativoParaUi(raw: string | null | undefined): string | null {
  return cleanIngresoComentarioParaUi(raw);
}

/** Texto crudo de auditoría si difiere del limpio (solo admin en detalle). */
export function ingresoComentarioAuditRaw(
  comentarios: string | null | undefined,
  detalleOperativo?: string | null,
): string | null {
  const parts: string[] = [];
  const cRaw = comentarios?.trim() ?? '';
  const cClean = cleanIngresoComentarioParaUi(comentarios);
  if (cRaw && cRaw !== (cClean ?? '')) parts.push(cRaw);

  const dRaw = detalleOperativo?.trim() ?? '';
  const dClean = cleanIngresoDetalleOperativoParaUi(detalleOperativo);
  if (dRaw && dRaw !== (dClean ?? '') && dRaw !== cRaw) parts.push(dRaw);

  if (parts.length === 0) return null;
  return parts.join('\n\n');
}
