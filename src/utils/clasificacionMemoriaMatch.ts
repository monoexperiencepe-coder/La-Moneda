import type { ClasificacionMemoriaRow } from '../modules/ai/clasificacionMemoriaTypes';
import {
  normalizeClasificacionMemoryText,
  tokenizeClasificacionMemoria,
} from './clasificacionMemoriaText';

export const MEMORIA_MATCH_MIN_SCORE = 0.42;
export const MEMORIA_MATCH_STRONG_SCORE = 0.65;
export const MEMORIA_MATCH_EXACT_SCORE = 0.85;

export type MemoriaMatchResult = {
  row: ClasificacionMemoriaRow;
  score: number;
};

export function scoreClasificacionMemoriaTexto(queryNorm: string, entryNorm: string): number {
  if (!queryNorm || !entryNorm) return 0;
  if (queryNorm === entryNorm) return 1;
  if (queryNorm.includes(entryNorm) || entryNorm.includes(queryNorm)) {
    const ratio = Math.min(queryNorm.length, entryNorm.length) / Math.max(queryNorm.length, entryNorm.length);
    return Math.max(MEMORIA_MATCH_EXACT_SCORE, ratio * 0.95);
  }

  const qt = tokenizeClasificacionMemoria(queryNorm);
  const et = tokenizeClasificacionMemoria(entryNorm);
  if (qt.length === 0 || et.length === 0) return 0;

  const qset = new Set(qt);
  const eset = new Set(et);
  let inter = 0;
  for (const t of qset) {
    if (eset.has(t)) inter += 1;
  }
  const union = new Set([...qset, ...eset]).size;
  const jaccard = union > 0 ? inter / union : 0;

  let containsBonus = 0;
  const qJoin = qt.join(' ');
  const eJoin = et.join(' ');
  if (qJoin.length >= 4 && eJoin.includes(qJoin)) containsBonus = 0.12;
  else if (eJoin.length >= 4 && qJoin.includes(eJoin)) containsBonus = 0.12;

  const sharedBonus = inter >= 2 ? 0.1 : inter === 1 ? 0.04 : 0;
  return Math.min(1, jaccard + containsBonus + sharedBonus);
}

export function findBestClasificacionMemoriaMatch(
  queryText: string,
  entries: ClasificacionMemoriaRow[],
): MemoriaMatchResult | null {
  const queryNorm = normalizeClasificacionMemoryText(queryText);
  if (!queryNorm || entries.length === 0) return null;

  let best: MemoriaMatchResult | null = null;
  for (const row of entries) {
    const score = scoreClasificacionMemoriaTexto(queryNorm, row.texto_normalizado);
    if (score < MEMORIA_MATCH_MIN_SCORE) continue;
    const weighted =
      score + Math.min(0.08, (row.veces_confirmado || 0) * 0.008) + Math.min(0.05, (row.veces_usado || 0) * 0.002);
    if (!best || weighted > best.score + Math.min(0.08, (best.row.veces_confirmado || 0) * 0.008)) {
      best = { row, score };
    }
  }
  return best;
}
