/**
 * Texto de `comentarios` en gastos_caja suele ser solo trazabilidad (Excel fila, revertidos),
 * no una nota humana. Para el listado mostramos solo lo que queda al quitar ese ruido.
 */
export function gastoCajaComentarioParaLista(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null;
  let s = String(raw);

  s = s.replace(/\s*Revertido desde gastos operativos\s*\([^)]*\)\s*\.\s*/gi, ' ');
  s = s.replace(/\s*Motivo clasificación:\s*\S+\s*/gi, ' ');
  s = s.replace(/\s*Origen histórico gastos_caja id=\d+\s*/gi, ' ');
  s = s.replace(/\s*Excel GASTOS fila\s*\d+\s*/gi, ' ');
  s = s.replace(/\s*\[\s*origen\s+gastos_caja\s+id\s*=\s*\d+\s*\]\s*/gi, ' ');

  s = s.replace(/\s+/g, ' ').trim();
  return s.length ? s : null;
}
